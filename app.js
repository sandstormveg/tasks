// Public tasks live in this same repo (readable with no auth — works anywhere,
// including embeds like Notion, since it never touches localStorage to read).
// Private tasks live in a separate repo and always need a token, to view or edit.
const PUBLIC_REPO = "sandstormveg/tasks";
const PRIVATE_REPO = "sandstormveg/tasks-data";
const apiBase = (repo) => `https://api.github.com/repos/${repo}/contents`;

const state = { tasks: [], history: [], pendingCompletion: null, newTaskVisibility: "public", selectedAssistKey: null };

const el = (sel) => document.querySelector(sel);
const tokenKey = "tasks_gh_token";
const getToken = () => localStorage.getItem(tokenKey) || "";

// ---------- data loading ----------
async function loadData() {
  const publicTasks = fetch(`data/tasks.json?t=${Date.now()}`).then((r) => r.json()).catch(() => ({ tasks: [] }));
  const publicHistory = fetch(`data/history.json?t=${Date.now()}`).then((r) => r.json()).catch(() => ({ entries: [] }));

  const [pubT, pubH] = await Promise.all([publicTasks, publicHistory]);
  let tasks = (pubT.tasks || []).map((t) => ({ ...t, _repo: "public" }));
  let history = (pubH.entries || []).map((e) => ({ ...e, _repo: "public" }));

  if (getToken()) {
    try {
      const [privT, privH] = await Promise.all([
        ghGetFile(PRIVATE_REPO, "data/tasks.json"),
        ghGetFile(PRIVATE_REPO, "data/history.json"),
      ]);
      tasks = tasks.concat((JSON.parse(privT.content).tasks || []).map((t) => ({ ...t, _repo: "private" })));
      history = history.concat((JSON.parse(privH.content).entries || []).map((e) => ({ ...e, _repo: "private" })));
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
    <button class="vis-toggle" aria-label="Toggle public/private">${task._repo === "private" ? "🔒" : "🌐"}</button>
  `;
  card.querySelector(".check").addEventListener("click", (e) => openCompleteDialog(task, card, e));
  card.querySelector(".vis-toggle").addEventListener("click", (e) => toggleVisibility(task, e.currentTarget));
  return card;
}

const stripRepo = ({ _repo, ...rest }) => rest;

async function toggleVisibility(task, btnEl) {
  if (!requireToken()) return;
  const fromVisibility = task._repo;
  const toVisibility = fromVisibility === "private" ? "public" : "private";
  btnEl.disabled = true;
  btnEl.textContent = "…";
  try {
    const remainingInFrom = state.tasks.filter((t) => t._repo === fromVisibility && t.id !== task.id).map(stripRepo);
    const existingInTo = state.tasks.filter((t) => t._repo === toVisibility).map(stripRepo);
    const movedTask = stripRepo(task);

    await saveTasks(repoFor(fromVisibility), remainingInFrom, `Make private: ${task.title}`);
    await saveTasks(repoFor(toVisibility), [...existingInTo, movedTask], `Make ${toVisibility}: ${task.title}`);

    await loadData();
  } catch (err) {
    alert(`Couldn't move task: ${err.message}`);
    btnEl.disabled = false;
    btnEl.textContent = fromVisibility === "private" ? "🔒" : "🌐";
  }
}

// ---------- completing a task ----------
function openCompleteDialog(task, card, clickEvent) {
  if (!requireToken()) return;
  state.pendingCompletion = { task, card };
  el("#complete-note").value = "";
  el("#complete-image").value = "";
  el("#complete-dialog").showModal();
}

el("#complete-cancel").addEventListener("click", () => el("#complete-dialog").close());

el("#complete-form").addEventListener("submit", async (e) => {
  const { task, card } = state.pendingCompletion;
  const repo = task._repo === "private" ? PRIVATE_REPO : PUBLIC_REPO;
  const note = el("#complete-note").value.trim();
  const file = el("#complete-image").files[0];
  el("#complete-dialog").close();

  const checkBtn = card.querySelector(".check");
  checkBtn.classList.add("checked");
  burst(checkBtn);
  playPop();
  card.classList.add("completing");

  try {
    let imagePath = null;
    if (file) {
      const base64 = await fileToBase64(file);
      const safeCat = task.category.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      imagePath = `images/${safeCat}/${task.id}.png`;
      await ghPutImage(repo, imagePath, base64, `Add image for ${task.title}`);
    }

    const remainingInRepo = state.tasks.filter((t) => t._repo === task._repo && t.id !== task.id)
      .map(({ _repo, ...rest }) => rest);
    const entry = {
      id: task.id,
      title: task.title,
      category: task.category,
      completedDate: new Date().toISOString().slice(0, 10),
      note,
      images: imagePath ? [imagePath] : [],
    };
    const historyInRepo = state.history.filter((h) => h._repo === task._repo)
      .map(({ _repo, ...rest }) => rest)
      .concat(entry);

    await saveTasks(repo, remainingInRepo, `Complete task: ${task.title}`);
    await saveHistory(repo, historyInRepo, `Log history: ${task.title}`);

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
  } catch (err) {
    alert(`Couldn't save to GitHub: ${err.message}`);
    card.classList.remove("completing");
    checkBtn.classList.remove("checked");
  }
});

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
  if (state.tasks.length === 0) {
    container.innerHTML = `<div class="empty-state">No active tasks.</div>`;
    return;
  }
  const groups = groupBy(state.tasks, "category");
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
  const task = state.tasks.find((t) => taskKey(t) === state.selectedAssistKey);
  if (!task) {
    container.innerHTML = `<div class="empty-state">Pick a task on the left to see what Claude has worked out and to jot down your own thinking.</div>`;
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
