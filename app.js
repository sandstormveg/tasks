// Public tasks live in this same repo (readable with no auth — works anywhere,
// including embeds like Notion, since it never touches localStorage to read).
// Private tasks live in a separate repo and always need a token, to view or edit.
const PUBLIC_REPO = "sandstormveg/tasks";
const PRIVATE_REPO = "sandstormveg/tasks-data";
const apiBase = (repo) => `https://api.github.com/repos/${repo}/contents`;

const state = { tasks: [], history: [], pendingNoteEdit: null, newTaskVisibility: "public", selectedAssistKey: null, publicLoaded: false, privateLoaded: false };

const el = (sel) => document.querySelector(sel);
const tokenKey = "tasks_gh_token";
const getToken = () => localStorage.getItem(tokenKey) || "";

// ---------- data loading ----------
// Public data has two possible sources and they are NOT equally fresh:
// the files served by GitHub Pages lag a push by a minute or two (rebuild + CDN),
// while the API returns the repo's actual current state. Reading public from Pages
// while reading private from the API made moved tasks briefly vanish from the UI,
// so prefer the API whenever we have a token and keep Pages as the no-token path.
async function loadPublicData() {
  if (getToken()) {
    try {
      const [t, h] = await Promise.all([
        ghGetFile(PUBLIC_REPO, "data/tasks.json"),
        ghGetFile(PUBLIC_REPO, "data/history.json"),
      ]);
      return {
        tasks: JSON.parse(t.content).tasks || [],
        history: JSON.parse(h.content).entries || [],
        authoritative: true,
      };
    } catch (err) {
      console.warn("Public API read failed, falling back to published files:", err.message);
    }
  }
  const [t, h] = await Promise.all([
    fetch(`data/tasks.json?t=${Date.now()}`).then((r) => r.json()).catch(() => ({ tasks: [] })),
    fetch(`data/history.json?t=${Date.now()}`).then((r) => r.json()).catch(() => ({ entries: [] })),
  ]);
  return { tasks: t.tasks || [], history: h.entries || [], authoritative: false };
}

async function loadData() {
  const pub = await loadPublicData();
  let tasks = pub.tasks.map((t) => ({ ...t, _repo: "public" }));
  let history = pub.history.map((e) => ({ ...e, _repo: "public" }));
  state.publicLoaded = pub.authoritative;
  state.privateLoaded = false;

  if (getToken()) {
    try {
      const [privT, privH] = await Promise.all([
        ghGetFile(PRIVATE_REPO, "data/tasks.json"),
        ghGetFile(PRIVATE_REPO, "data/history.json"),
      ]);
      tasks = tasks.concat((JSON.parse(privT.content).tasks || []).map((t) => ({ ...t, _repo: "private" })));
      history = history.concat((JSON.parse(privH.content).entries || []).map((e) => ({ ...e, _repo: "private" })));
      state.privateLoaded = true;
    } catch (err) {
      console.warn("Couldn't load private tasks:", err.message);
    }
  }

  state.tasks = tasks;
  state.history = history;
  renderActive();
  renderTree();
  renderCategoryOptions();
  renderAssistList();
  renderAssistDetail();
  renderAssistTabCount();
}

function taskKey(task) {
  return `${task._repo}::${task.id}`;
}

// ---------- category combobox ----------
// A real dropdown rather than a native <datalist>: browsers render datalists
// inconsistently and most won't show the full list on focus, which is the whole
// point here — seeing which categories already exist before inventing a new one.
let comboActiveIndex = -1;

function allCategories() {
  return [...new Set(state.tasks.map((t) => t.category).concat(state.history.map((h) => h.category)))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function renderCategoryOptions() {
  const input = el("#add-category");
  const menu = el("#category-menu");
  const typed = input.value.trim();
  const matches = allCategories().filter((c) => c.toLowerCase().includes(typed.toLowerCase()));
  const isNew = typed && !allCategories().some((c) => c.toLowerCase() === typed.toLowerCase());

  const options = matches.map((c) => ({ label: c, value: c, isNew: false }));
  if (isNew) options.push({ label: `Add new category “${typed}”`, value: typed, isNew: true });

  if (options.length === 0) {
    menu.innerHTML = `<div class="combo-option is-new">Type to create your first category</div>`;
    return;
  }
  if (comboActiveIndex >= options.length) comboActiveIndex = options.length - 1;

  menu.innerHTML = options
    .map((o, i) => `<div class="combo-option${o.isNew ? " is-new" : ""}${i === comboActiveIndex ? " active" : ""}" data-value="${o.value.replace(/"/g, "&quot;")}">${o.label}</div>`)
    .join("");

  menu.querySelectorAll(".combo-option[data-value]").forEach((optEl) => {
    optEl.addEventListener("mousedown", (e) => {
      e.preventDefault();
      input.value = optEl.dataset.value;
      closeCategoryMenu();
    });
  });
}

function openCategoryMenu() {
  comboActiveIndex = -1;
  renderCategoryOptions();
  el("#category-menu").classList.remove("hidden");
}

function closeCategoryMenu() {
  el("#category-menu").classList.add("hidden");
  comboActiveIndex = -1;
}

function setupCategoryCombo() {
  const input = el("#add-category");
  const menu = el("#category-menu");

  input.addEventListener("focus", openCategoryMenu);
  input.addEventListener("input", () => {
    comboActiveIndex = -1;
    renderCategoryOptions();
    menu.classList.remove("hidden");
  });
  input.addEventListener("blur", () => setTimeout(closeCategoryMenu, 120));

  input.addEventListener("keydown", (e) => {
    const options = [...menu.querySelectorAll(".combo-option[data-value]")];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (menu.classList.contains("hidden")) openCategoryMenu();
      if (options.length === 0) return;
      comboActiveIndex = e.key === "ArrowDown"
        ? (comboActiveIndex + 1) % options.length
        : (comboActiveIndex - 1 + options.length) % options.length;
      renderCategoryOptions();
    } else if (e.key === "Enter") {
      // Enter commits the category (picking the highlighted one, or keeping what
      // was typed as a brand-new category) instead of submitting the form outright,
      // so you never accidentally add a task while still choosing a category.
      if (!menu.classList.contains("hidden")) {
        e.preventDefault();
        const active = options[comboActiveIndex];
        if (active) input.value = active.dataset.value;
        closeCategoryMenu();
      }
    } else if (e.key === "Escape") {
      closeCategoryMenu();
    }
  });
}

// ---------- GitHub write-back ----------
async function ghGetFile(repo, path) {
  const res = await fetch(`${apiBase(repo)}/${path}`, {
    headers: { Authorization: `Bearer ${getToken()}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`Failed to read ${path}: ${res.status}`);
  const json = await res.json();
  const content = decodeURIComponent(escape(atob(json.content)));
  return { sha: json.sha, content };
}

async function ghPutFile(repo, path, contentObj, sha, message) {
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(contentObj, null, 2) + "\n"))),
    sha,
  };
  const res = await fetch(`${apiBase(repo)}/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed to write ${path}: ${res.status} ${await res.text()}`);
}

async function ghPutImage(repo, path, base64Data, message) {
  const res = await fetch(`${apiBase(repo)}/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, content: base64Data }),
  });
  if (!res.ok) throw new Error(`Failed to upload image: ${res.status} ${await res.text()}`);
}

async function saveTasks(repo, newTasks, message) {
  const current = await ghGetFile(repo, "data/tasks.json");
  await ghPutFile(repo, "data/tasks.json", { tasks: newTasks }, current.sha, message);
}

async function saveHistory(repo, newEntries, message) {
  const current = await ghGetFile(repo, "data/history.json");
  await ghPutFile(repo, "data/history.json", { entries: newEntries }, current.sha, message);
}

function repoFor(visibility) {
  return visibility === "private" ? PRIVATE_REPO : PUBLIC_REPO;
}

// Every write rebuilds a repo's whole task list from what's in memory, so writing a
// repo we failed to fully read would silently delete the tasks we never saw. Refuse.
function assertLoaded(visibility) {
  const ok = visibility === "private" ? state.privateLoaded : state.publicLoaded;
  if (!ok) {
    throw new Error(
      `Your ${visibility} tasks didn't load, so saving now could overwrite them. Reload the page and try again.`
    );
  }
}

function requireToken() {
  if (!getToken()) {
    alert("Add a GitHub token in Settings (⚙) first so changes can be saved to the repo.");
    return false;
  }
  return true;
}

// ---------- rendering: active tasks ----------
function groupBy(items, key) {
  return items.reduce((acc, item) => {
    (acc[item[key]] = acc[item[key]] || []).push(item);
    return acc;
  }, {});
}

function renderActive() {
  const container = el("#task-groups");
  container.innerHTML = "";
  if (state.tasks.length === 0) {
    container.innerHTML = `<div class="empty-state">Nothing on the list. Add something below.</div>`;
    return;
  }
  const groups = groupBy(state.tasks, "category");
  Object.keys(groups).sort().forEach((cat) => {
    const section = document.createElement("div");
    section.className = "category-group";
    section.innerHTML = `<h2>${cat}</h2>`;
    groups[cat].forEach((task) => section.appendChild(taskCard(task)));
    container.appendChild(section);
  });
}

function taskCard(task) {
  const card = document.createElement("div");
  card.className = "task-card";
  card.innerHTML = `
    <button class="check" aria-label="Complete task">
      <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
    </button>
    <div class="task-body">
      <div class="task-title">${esc(task.title)}</div>
      ${task.notes ? `<div class="task-meta">${esc(task.notes)}</div>` : ""}
    </div>
    <button class="assist-toggle ${task.assist ? "on" : "off"}" aria-label="Toggle Claude assistance">✦</button>
    <button class="vis-toggle" aria-label="Toggle public/private">${task._repo === "private" ? "🔒" : "🌐"}</button>
    <button class="delete-toggle" aria-label="Delete task">🗑</button>
  `;
  card.querySelector(".check").addEventListener("click", () => completeTask(task, card));
  card.querySelector(".vis-toggle").addEventListener("click", (e) => toggleVisibility(task, e.currentTarget));
  card.querySelector(".delete-toggle").addEventListener("click", () => deleteTask(task, card));
  const assistBtn = card.querySelector(".assist-toggle");
  assistBtn.title = task.assist
    ? "Claude is helping with this one — click to stop"
    : "Click to have Claude work on this task in the Assistance tab";
  assistBtn.addEventListener("click", (e) => toggleAssist(task, e.currentTarget));
  return card;
}

// Only tasks explicitly opted in show up in Assistance (and get worked on by the
// morning routine) — otherwise every passing errand would pull research effort.
function assistTasks() {
  return state.tasks.filter((t) => t.assist);
}

async function toggleAssist(task, btnEl) {
  if (!requireToken()) return;
  const next = !task.assist;
  btnEl.disabled = true;
  try {
    assertLoaded(task._repo);
    const repo = repoFor(task._repo);
    const updated = state.tasks
      .filter((t) => t._repo === task._repo)
      .map((t) => stripRepo(t.id === task.id ? { ...t, assist: next } : t));
    await saveTasks(repo, updated, `${next ? "Enable" : "Disable"} assistance: ${task.title}`);
    task.assist = next;
    if (!next && state.selectedAssistKey === taskKey(task)) state.selectedAssistKey = null;
    renderActive();
    renderAssistList();
    renderAssistDetail();
    renderAssistTabCount();
  } catch (err) {
    alert(`Couldn't update assistance setting: ${err.message}`);
    btnEl.disabled = false;
  }
}

function renderAssistTabCount() {
  const tabBtn = document.querySelector('.tab-btn[data-tab="assist"]');
  if (!tabBtn) return;
  const n = assistTasks().length;
  tabBtn.textContent = n ? `Assistance (${n})` : "Assistance";
}

const stripRepo = ({ _repo, ...rest }) => rest;

async function toggleVisibility(task, btnEl) {
  if (!requireToken()) return;
  const fromVisibility = task._repo;
  const toVisibility = fromVisibility === "private" ? "public" : "private";
  btnEl.disabled = true;
  btnEl.textContent = "…";
  let addedToDestination = false;
  try {
    assertLoaded(fromVisibility);
    assertLoaded(toVisibility);

    const remainingInFrom = state.tasks.filter((t) => t._repo === fromVisibility && t.id !== task.id).map(stripRepo);
    const existingInTo = state.tasks.filter((t) => t._repo === toVisibility).map(stripRepo);
    const movedTask = stripRepo(task);

    // Add to the destination BEFORE removing from the source. There's no way to make
    // two repo writes atomic, so pick the failure that's recoverable: a task briefly in
    // both places is visible and fixable, a task deleted before it landed is just gone.
    await saveTasks(repoFor(toVisibility), [...existingInTo, movedTask], `Make ${toVisibility}: ${task.title}`);
    addedToDestination = true;
    await saveTasks(repoFor(fromVisibility), remainingInFrom, `Remove from ${fromVisibility}: ${task.title}`);

    await loadData();
  } catch (err) {
    alert(
      addedToDestination
        ? `Half-finished move: "${task.title}" was copied to ${toVisibility} but couldn't be removed from ${fromVisibility}, so it now appears twice. Reload and toggle it again to clean up.\n\n${err.message}`
        : `Couldn't move task: ${err.message}`
    );
    btnEl.disabled = false;
    btnEl.textContent = fromVisibility === "private" ? "🔒" : "🌐";
    if (addedToDestination) await loadData();
  }
}

// ---------- completing a task ----------
// Ticking a box completes it immediately — no modal in the way. A note/photo is
// optional and offered afterward via the toast, so adding one is a choice, not a toll.
async function completeTask(task, card) {
  if (!requireToken()) return;
  const repo = repoFor(task._repo);
  const checkBtn = card.querySelector(".check");
  checkBtn.classList.add("checked");
  burst(checkBtn);
  playPop();
  card.classList.add("completing");

  try {
    assertLoaded(task._repo);
    const remainingInRepo = state.tasks.filter((t) => t._repo === task._repo && t.id !== task.id).map(stripRepo);
    const entry = {
      id: task.id,
      title: task.title,
      category: task.category,
      completedDate: new Date().toISOString().slice(0, 10),
      note: "",
      images: [],
    };
    const historyInRepo = state.history.filter((h) => h._repo === task._repo).map(stripRepo).concat(entry);

    // History first, then removal — if the second write fails the task is still on the
    // list and can be ticked again, rather than erased with no record of completion.
    await saveHistory(repo, historyInRepo, `Log history: ${task.title}`);
    await saveTasks(repo, remainingInRepo, `Complete task: ${task.title}`);

    state.tasks = state.tasks.filter((t) => t.id !== task.id || t._repo !== task._repo);
    state.history = state.history.filter((h) => h._repo !== task._repo).concat(
      historyInRepo.map((h) => ({ ...h, _repo: task._repo }))
    );
    if (state.selectedAssistKey === taskKey(task)) state.selectedAssistKey = null;
    setTimeout(() => renderActive(), 350);
    renderTree();
    renderCategoryOptions();
    renderAssistList();
    renderAssistDetail();
    renderAssistTabCount();

    showToast({
      message: `✓ Completed "${task.title}"`,
      actionLabel: "Add note",
      onAction: () => openNoteDialog({ ...entry, _repo: task._repo }),
      duration: 7000,
    });
  } catch (err) {
    alert(`Couldn't save to GitHub: ${err.message}`);
    card.classList.remove("completing");
    checkBtn.classList.remove("checked");
  }
}

// Editing a note on an already-completed task, reached only from the toast above —
// this dialog is opt-in follow-up, never a gate on completing the task itself.
function openNoteDialog(entry) {
  state.pendingNoteEdit = entry;
  el("#complete-note").value = entry.note || "";
  el("#complete-image").value = "";
  el("#complete-dialog").showModal();
}

el("#complete-cancel").addEventListener("click", () => el("#complete-dialog").close());

el("#complete-form").addEventListener("submit", async (e) => {
  const entry = state.pendingNoteEdit;
  if (!entry) return;
  const repo = repoFor(entry._repo);
  const note = el("#complete-note").value.trim();
  const file = el("#complete-image").files[0];
  el("#complete-dialog").close();

  try {
    assertLoaded(entry._repo);
    let images = entry.images || [];
    if (file) {
      const base64 = await fileToBase64(file);
      const safeCat = entry.category.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const imagePath = `images/${safeCat}/${entry.id}.png`;
      await ghPutImage(repo, imagePath, base64, `Add image for ${entry.title}`);
      images = [imagePath];
    }
    const updatedHistory = state.history
      .filter((h) => h._repo === entry._repo)
      .map(stripRepo)
      .map((h) => (h.id === entry.id ? { ...h, note, images } : h));
    await saveHistory(repo, updatedHistory, `Update note: ${entry.title}`);
    state.history = state.history.map((h) =>
      h.id === entry.id && h._repo === entry._repo ? { ...h, note, images } : h
    );
    renderTree();
  } catch (err) {
    alert(`Couldn't save note: ${err.message}`);
  }
});

// ---------- deleting a task ----------
// No confirm dialog — delete happens immediately and can be undone from the toast for
// a few seconds, which is faster for the common case (no popup) without making a
// mis-tap unrecoverable. The actual GitHub write is deferred until the undo window
// closes, so hitting Undo never needs a second network round trip to "un-delete".
const DELETE_UNDO_MS = 6000;

async function deleteTask(task, card) {
  if (!requireToken()) return;
  try {
    assertLoaded(task._repo);
  } catch (err) {
    alert(err.message);
    return;
  }

  const prevTasks = state.tasks;
  card.classList.add("completing");
  state.tasks = state.tasks.filter((t) => !(t.id === task.id && t._repo === task._repo));
  renderCategoryOptions();
  renderAssistList();
  renderAssistTabCount();
  if (state.selectedAssistKey === taskKey(task)) {
    state.selectedAssistKey = null;
    renderAssistDetail();
  }
  setTimeout(() => card.remove(), 300);

  let undone = false;
  showToast({
    message: `Deleted "${task.title}"`,
    actionLabel: "Undo",
    duration: DELETE_UNDO_MS,
    onAction: () => {
      undone = true;
      state.tasks = prevTasks;
      renderActive();
      renderCategoryOptions();
      renderAssistList();
      renderAssistTabCount();
    },
  });

  setTimeout(async () => {
    if (undone) return;
    try {
      const repo = repoFor(task._repo);
      const remaining = prevTasks.filter((t) => !(t.id === task.id && t._repo === task._repo)).map(stripRepo);
      await saveTasks(repo, remaining, `Delete task: ${task.title}`);
    } catch (err) {
      state.tasks = prevTasks;
      renderActive();
      renderCategoryOptions();
      renderAssistList();
      renderAssistTabCount();
      alert(`Couldn't delete "${task.title}": ${err.message}. It's back on your list.`);
    }
  }, DELETE_UNDO_MS + 300);
}

// ---------- toasts ----------
function showToast({ message, actionLabel, onAction, duration = 5000 }) {
  const container = el("#toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  const msg = document.createElement("span");
  msg.className = "toast-msg";
  msg.textContent = message;
  toast.appendChild(msg);

  const remove = () => {
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 200);
  };

  if (actionLabel && onAction) {
    const btn = document.createElement("button");
    btn.className = "toast-action";
    btn.type = "button";
    btn.textContent = actionLabel;
    btn.addEventListener("click", () => {
      onAction();
      remove();
    });
    toast.appendChild(btn);
  }

  const closeBtn = document.createElement("button");
  closeBtn.className = "toast-close";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Dismiss");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", remove);
  toast.appendChild(closeBtn);

  container.appendChild(toast);
  setTimeout(remove, duration);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- adding a task ----------
el("#add-visibility").addEventListener("click", () => {
  state.newTaskVisibility = state.newTaskVisibility === "public" ? "private" : "public";
  renderVisibilityToggle();
});
function renderVisibilityToggle() {
  const isPublic = state.newTaskVisibility === "public";
  el("#add-visibility").textContent = isPublic ? "🌐" : "🔒";
  el("#add-visibility").title = isPublic
    ? "New task will be public — click to make it private"
    : "New task will be private — click to make it public";
}
renderVisibilityToggle();
setupCategoryCombo();

el("#add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!requireToken()) return;
  const title = el("#add-title").value.trim();
  const category = el("#add-category").value.trim();
  if (!title || !category) return;

  const visibility = state.newTaskVisibility;
  const repo = repoFor(visibility);
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now().toString(36);
  const task = { id, title, category, created: new Date().toISOString().slice(0, 10), notes: "" };
  const existingInRepo = state.tasks.filter((t) => t._repo === visibility).map(({ _repo, ...rest }) => rest);
  const newTasksInRepo = [...existingInRepo, task];

  try {
    assertLoaded(visibility);
    await saveTasks(repo, newTasksInRepo, `Add task: ${title}`);
    state.tasks = [...state.tasks, { ...task, _repo: visibility }];
    renderActive();
    renderCategoryOptions();
    renderAssistList();
    el("#add-form").reset();
  } catch (err) {
    alert(`Couldn't save to GitHub: ${err.message}`);
  }
});

// ---------- rendering: level-up tree ----------
function renderTree() {
  const container = el("#tree-groups");
  container.innerHTML = "";
  if (state.history.length === 0) {
    container.innerHTML = `<div class="empty-state">Complete a task to start growing your tree.</div>`;
    return;
  }
  const groups = groupBy(state.history, "category");
  Object.keys(groups).sort().forEach((cat) => {
    const entries = groups[cat].slice().sort((a, b) => a.completedDate.localeCompare(b.completedDate));
    const level = Math.floor(entries.length / 3) + 1;
    const branch = document.createElement("div");
    branch.className = "tree-branch";
    branch.innerHTML = `<h2>${cat} <span class="level-badge">Level ${level} · ${entries.length} done</span></h2>`;
    entries.slice().reverse().forEach((entry) => {
      const node = document.createElement("div");
      node.className = "tree-node";
      const visIcon = entry._repo === "private" ? "🔒" : "🌐";
      node.innerHTML = `
        <span class="node-title">${visIcon} ${esc(entry.title)}</span>
        <span class="node-date">${esc(entry.completedDate)}</span>
        ${entry.note ? `<div class="node-note">${linkify(entry.note)}</div>` : ""}
        ${(entry.images || []).map((img) => `<img src="${esc(img)}" alt="">`).join("")}
      `;
      branch.appendChild(node);
    });
    container.appendChild(branch);
  });
}

// ---------- assistance tab: suggestions + scratchpad per task ----------
function renderAssistList() {
  const container = el("#assist-list");
  container.innerHTML = "";
  const tasks = assistTasks();
  if (tasks.length === 0) {
    container.innerHTML = `<div class="empty-state">No tasks opted in yet. Tap the ✦ on any task in the Active tab to have Claude work on it.</div>`;
    return;
  }
  const groups = groupBy(tasks, "category");
  Object.keys(groups).sort().forEach((cat) => {
    const catEl = document.createElement("div");
    catEl.className = "assist-cat";
    catEl.textContent = cat;
    container.appendChild(catEl);
    groups[cat].forEach((task) => {
      const btn = document.createElement("button");
      btn.className = "assist-item" + (taskKey(task) === state.selectedAssistKey ? " selected" : "");
      // Badges make it obvious at a glance where there's already work to pick up:
      // ✦ = Claude left suggestions, ✎ = you've written notes.
      const badges = [];
      if ((task.suggestions || []).length) badges.push(`<span class="badge badge-sug" title="${task.suggestions.length} suggestion(s) from Claude">✦ ${task.suggestions.length}</span>`);
      if ((task.scratchpad || "").trim()) badges.push(`<span class="badge badge-note" title="You have notes on this task">✎</span>`);
      btn.innerHTML = `
        <span class="assist-item-icon">${task._repo === "private" ? "🔒" : "🌐"}</span>
        <span class="assist-item-title">${esc(task.title)}</span>
        ${badges.join("")}
      `;
      btn.addEventListener("click", () => selectAssistTask(task));
      container.appendChild(btn);
    });
  });
}

function selectAssistTask(task) {
  if (assistDirty && !confirm("You have unsaved notes on the current task. Discard them?")) return;
  assistDirty = false;
  state.selectedAssistKey = taskKey(task);
  renderAssistList();
  renderAssistDetail();
}

let assistDirty = false;

function renderAssistDetail() {
  const container = el("#assist-detail");
  const task = assistTasks().find((t) => taskKey(t) === state.selectedAssistKey);
  if (!task) {
    container.innerHTML = assistTasks().length
      ? `<div class="empty-state">Pick a task on the left to see what Claude has worked out and to jot down your own thinking.</div>`
      : `<div class="empty-state">Nothing here yet. Go to the Active tab and tap ✦ on a task you want help with — it'll show up here with Claude's findings.</div>`;
    return;
  }
  const suggestions = task.suggestions || [];
  const savedAt = task.scratchpadUpdated
    ? `Last saved ${formatWhen(task.scratchpadUpdated)}`
    : "Not saved yet";

  container.innerHTML = `
    <div class="assist-head">
      <h2>${esc(task.title)}</h2>
      <div class="assist-meta">${esc(task.category)} · ${task._repo === "private" ? "🔒 Private" : "🌐 Public"} · added ${esc(task.created || "—")}</div>
    </div>

    <div class="assist-section">
      <h3>✦ Suggestions from Claude${suggestions.length ? ` <span class="count">${suggestions.length}</span>` : ""}</h3>
      ${suggestions.length
        ? `<ul class="suggestion-list">${suggestions.map((s, i) => `
            <li>
              <div class="suggestion-text">${linkify(s)}</div>
              <button class="suggestion-add" data-i="${i}" type="button" title="Copy this into your notes">→ notes</button>
            </li>`).join("")}</ul>`
        : `<div class="assist-hint">Nothing yet. Mention this task to Claude in a chat and it can leave findings, next steps or subtasks here for you to come back to.</div>`}
    </div>

    <div class="assist-section">
      <h3>✎ Your notes &amp; thinking</h3>
      <textarea id="assist-scratchpad" placeholder="Ideas, plans, links, references — anything you (or Claude) should remember about this task.">${esc(task.scratchpad || "")}</textarea>
      <div class="assist-save-row">
        <span class="assist-status" id="assist-status">${savedAt}</span>
        <button id="assist-save-btn" class="assist-save-btn" type="button" disabled>Saved</button>
      </div>
    </div>
  `;

  const textarea = el("#assist-scratchpad");
  const btn = el("#assist-save-btn");

  const markDirty = () => {
    assistDirty = true;
    btn.disabled = false;
    btn.textContent = "Save notes";
    btn.classList.remove("is-saved");
    setAssistStatus("Unsaved changes", "warn");
  };

  textarea.addEventListener("input", markDirty);
  // Autosave when you click away — the most common way notes got lost was
  // typing something and navigating off without noticing the Save button.
  textarea.addEventListener("blur", () => { if (assistDirty) saveScratchpad(task); });
  textarea.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveScratchpad(task);
    }
  });
  btn.addEventListener("click", () => saveScratchpad(task));

  container.querySelectorAll(".suggestion-add").forEach((addBtn) => {
    addBtn.addEventListener("click", () => {
      const text = suggestions[Number(addBtn.dataset.i)];
      const existing = textarea.value.trim();
      textarea.value = (existing ? existing + "\n\n" : "") + "- " + text;
      markDirty();
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  });
}

function setAssistStatus(text, kind) {
  const statusEl = el("#assist-status");
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = "assist-status" + (kind ? ` ${kind}` : "");
}

function formatWhen(iso) {
  const then = new Date(iso);
  if (isNaN(then)) return iso;
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

async function saveScratchpad(task) {
  if (!requireToken()) return;
  const btn = el("#assist-save-btn");
  const textarea = el("#assist-scratchpad");
  if (!btn || !textarea) return;
  const value = textarea.value;

  btn.disabled = true;
  btn.textContent = "Saving…";
  setAssistStatus("Saving…", "");
  try {
    assertLoaded(task._repo);
    const repo = repoFor(task._repo);
    const savedAt = new Date().toISOString();
    const updated = state.tasks
      .filter((t) => t._repo === task._repo)
      .map((t) => stripRepo(t.id === task.id ? { ...t, scratchpad: value, scratchpadUpdated: savedAt } : t));
    await saveTasks(repo, updated, `Update notes: ${task.title}`);
    task.scratchpad = value;
    task.scratchpadUpdated = savedAt;
    assistDirty = false;
    btn.textContent = "Saved ✓";
    btn.classList.add("is-saved");
    setAssistStatus(`Last saved ${formatWhen(savedAt)}`, "ok");
    renderAssistList();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Retry save";
    setAssistStatus(`Couldn't save: ${err.message}`, "error");
  }
}

// ---------- small helpers ----------
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function linkify(str) {
  return esc(str).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

// ---------- tabs ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    el("#active-view").classList.toggle("hidden", tab !== "active");
    el("#tree-view").classList.toggle("hidden", tab !== "tree");
    el("#assist-view").classList.toggle("hidden", tab !== "assist");
    if (tab === "assist") {
      renderAssistList();
      renderAssistDetail();
    }
  });
});

// ---------- settings ----------
el("#settings-btn").addEventListener("click", () => {
  el("#settings-token").value = getToken();
  el("#settings-dialog").showModal();
});
el("#settings-clear").addEventListener("click", () => {
  localStorage.removeItem(tokenKey);
  el("#settings-token").value = "";
});
el("#settings-form").addEventListener("submit", () => {
  localStorage.setItem(tokenKey, el("#settings-token").value.trim());
  loadData();
});

// ---------- satisfying fx: confetti burst + pop sound ----------
const canvas = el("#fx-canvas");
const ctx = canvas.getContext("2d");
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

let particles = [];
function burst(originEl) {
  const rect = originEl.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const colors = ["#5fe3a1", "#7c9bff", "#ffb86b", "#ff6b9d", "#ffe66b"];
  for (let i = 0; i < 22; i++) {
    const angle = (Math.PI * 2 * i) / 22 + Math.random() * 0.3;
    const speed = 2 + Math.random() * 3.5;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      life: 1,
      size: 3 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
  if (!animating) requestAnimationFrame(tick);
}

let animating = false;
function tick() {
  animating = true;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.12;
    p.life -= 0.018;
  });
  particles = particles.filter((p) => p.life > 0);
  particles.forEach((p) => {
    ctx.globalAlpha = Math.max(p.life, 0);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  if (particles.length > 0) {
    requestAnimationFrame(tick);
  } else {
    animating = false;
  }
}

function playPop() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.22);
  } catch (e) { /* audio not available, no big deal */ }
}

loadData();
