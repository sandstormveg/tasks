// Public tasks live in this same repo (readable with no auth — works anywhere,
// including embeds like Notion, since it never touches localStorage to read).
// Private tasks live in a separate repo and always need a token, to view or edit.
const PUBLIC_REPO = "sandstormveg/tasks";
const PRIVATE_REPO = "sandstormveg/tasks-data";
const apiBase = (repo) => `https://api.github.com/repos/${repo}/contents`;

const state = {
  tasks: [], history: [], categories: {}, pendingNoteEdit: null, newTaskVisibility: "public",
  selectedAssistKey: null, publicLoaded: false, privateLoaded: false,
  // Drive the Active tab's categories/tasks/detail drill-down columns. "__all__" is the
  // sentinel for the "All tasks" rail item (never a real category name).
  selectedCategory: "__all__", selectedActiveTaskKey: null,
  // The sha of tasks.json/history.json as last seen from the API, per repo — used to
  // detect a lost-update race (see saveTasks/saveHistory below): a fresh sha fetched
  // right before writing only stops GitHub rejecting the PUT, it does NOT mean the
  // content we're about to overwrite with (built from in-memory state) still matches
  // what's actually on GitHub. Comparing against the sha from our last load catches
  // "someone else committed since I loaded this page" instead of silently clobbering it.
  shas: { public: { tasks: null, history: null }, private: { tasks: null, history: null } },
};

const el = (sel) => document.querySelector(sel);
const tokenKey = "tasks_gh_token";
const getToken = () => localStorage.getItem(tokenKey) || "";

// A Set that persists to localStorage on every change — drop-in for the plain Sets
// that track collapsed/expanded UI state (categories, subtasks, note details), so
// tidying things up survives a page reload instead of resetting every time. Scoped
// to this browser/device on purpose (it's a display preference, not shared task
// data) — only .has/.add/.delete are implemented since that's all callers use.
function persistentSet(storageKey) {
  let items;
  try {
    items = new Set(JSON.parse(localStorage.getItem(storageKey) || "[]"));
  } catch {
    items = new Set();
  }
  const persist = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...items]));
    } catch {
      // localStorage unavailable/full — collapse state just won't survive reload.
    }
  };
  return {
    has: (v) => items.has(v),
    add: (v) => { items.add(v); persist(); },
    delete: (v) => { items.delete(v); persist(); },
  };
}

// ---------- data loading ----------
// Public data has two possible sources and they are NOT equally fresh:
// the files served by GitHub Pages lag a push by a minute or two (rebuild + CDN),
// while the API returns the repo's actual current state. Reading public from Pages
// while reading private from the API made moved tasks briefly vanish from the UI,
// so prefer the API whenever we have a token and keep Pages as the no-token path.
// Categories (and their parent/child nesting) live only in the public repo — which
// category a task sits in isn't sensitive even when the task itself is private, and
// keeping one shared hierarchy means a private task's category can still nest under a
// public one without needing to duplicate the structure across both repos.
async function loadPublicData() {
  if (getToken()) {
    try {
      const [t, h, c] = await Promise.all([
        ghGetFile(PUBLIC_REPO, "data/tasks.json"),
        ghGetFile(PUBLIC_REPO, "data/history.json"),
        ghGetFile(PUBLIC_REPO, "data/categories.json").catch(() => ({ content: '{"categories":{}}' })),
      ]);
      return {
        tasks: JSON.parse(t.content).tasks || [],
        history: JSON.parse(h.content).entries || [],
        categories: JSON.parse(c.content).categories || {},
        tasksSha: t.sha,
        historySha: h.sha,
        authoritative: true,
      };
    } catch (err) {
      console.warn("Public API read failed, falling back to published files:", err.message);
    }
  }
  const [t, h, c] = await Promise.all([
    fetch(`data/tasks.json?t=${Date.now()}`).then((r) => r.json()).catch(() => ({ tasks: [] })),
    fetch(`data/history.json?t=${Date.now()}`).then((r) => r.json()).catch(() => ({ entries: [] })),
    fetch(`data/categories.json?t=${Date.now()}`).then((r) => r.json()).catch(() => ({ categories: {} })),
  ]);
  return { tasks: t.tasks || [], history: h.entries || [], categories: c.categories || {}, authoritative: false };
}

async function loadData() {
  const pub = await loadPublicData();
  let tasks = pub.tasks.map((t) => ({ ...t, _repo: "public" }));
  let history = pub.history.map((e) => ({ ...e, _repo: "public" }));
  state.categories = pub.categories;
  state.publicLoaded = pub.authoritative;
  state.privateLoaded = false;
  state.shas.public.tasks = pub.tasksSha || null;
  state.shas.public.history = pub.historySha || null;

  if (getToken()) {
    try {
      const [privT, privH] = await Promise.all([
        ghGetFile(PRIVATE_REPO, "data/tasks.json"),
        ghGetFile(PRIVATE_REPO, "data/history.json"),
      ]);
      tasks = tasks.concat((JSON.parse(privT.content).tasks || []).map((t) => ({ ...t, _repo: "private" })));
      history = history.concat((JSON.parse(privH.content).entries || []).map((e) => ({ ...e, _repo: "private" })));
      state.privateLoaded = true;
      state.shas.private.tasks = privT.sha;
      state.shas.private.history = privH.sha;
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

// ---------- public/private visual language ----------
// Bracket-tag terminal labels instead of the 🌐/🔒 emoji, color-coded the same way
// public/positive (accent-2, teal) vs private/alert (accent, pink) are used elsewhere.
function visClass(repo) {
  return repo === "private" ? "private" : "public";
}
function visShortLabel(repo) {
  return repo === "private" ? "[PRIV]" : "[PUB]";
}
function visLabel(repo) {
  return repo === "private" ? "[PRIVATE]" : "[PUBLIC]";
}
function visTitle(repo) {
  return repo === "private" ? "Private — click to make public" : "Public — click to make private";
}
function visToggleButtonHtml(repo) {
  return `<button class="vis-toggle ${visClass(repo)}" aria-label="Toggle public/private" title="${visTitle(repo)}">${visShortLabel(repo)}</button>`;
}
function visTagHtml(repo) {
  return `<span class="vis-tag ${visClass(repo)}">${visLabel(repo)}</span>`;
}
function visDotHtml(repo) {
  return `<span class="vis-dot ${visClass(repo)}" title="${repo === "private" ? "Private" : "Public"}"></span>`;
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
  const json = await res.json();
  return json.content.sha;
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

function visibilityForRepo(repo) {
  return repo === PRIVATE_REPO ? "private" : "public";
}

// Refetching the sha right before a write only stops GitHub *rejecting* the PUT — it
// does nothing to stop us *overwriting* someone else's change, since the content we
// send is built from in-memory state, not from what's actually on GitHub right now.
// Comparing the freshly-fetched sha against the sha from our last load catches that:
// if they differ, someone else committed since we loaded, so refuse instead of
// silently clobbering it. This is why every save function reads through this check —
// callers get the error via their existing try/catch + alert, no call-site changes needed.
function assertNoConcurrentChange(visibility, file, knownSha, currentSha) {
  if (knownSha && currentSha !== knownSha) {
    throw new Error(
      `Someone else changed ${file} since you loaded this page — reload to see the latest, then redo this change. (Nothing was overwritten.)`
    );
  }
}

async function saveTasks(repo, newTasks, message) {
  const visibility = visibilityForRepo(repo);
  const current = await ghGetFile(repo, "data/tasks.json");
  assertNoConcurrentChange(visibility, "the tasks list", state.shas[visibility].tasks, current.sha);
  const newSha = await ghPutFile(repo, "data/tasks.json", { tasks: newTasks }, current.sha, message);
  state.shas[visibility].tasks = newSha;
}

async function saveHistory(repo, newEntries, message) {
  const visibility = visibilityForRepo(repo);
  const current = await ghGetFile(repo, "data/history.json");
  assertNoConcurrentChange(visibility, "the history", state.shas[visibility].history, current.sha);
  const newSha = await ghPutFile(repo, "data/history.json", { entries: newEntries }, current.sha, message);
  state.shas[visibility].history = newSha;
}

// categories.json only exists once someone nests a category, so its absence isn't an
// error — treat a failed read as "no hierarchy yet" rather than surfacing a 404.
async function saveCategories(newMap, message) {
  let sha;
  try {
    sha = (await ghGetFile(PUBLIC_REPO, "data/categories.json")).sha;
  } catch (err) {
    sha = undefined; // file doesn't exist yet — PUT without a sha creates it
  }
  await ghPutFile(PUBLIC_REPO, "data/categories.json", { categories: newMap }, sha, message);
}

// ---------- category hierarchy ----------
// state.categories maps a category name to its parent's name (root categories are
// simply absent from the map, not present with a null value — keeps the file empty
// until someone actually nests something).
function categoryParent(name) {
  return state.categories[name] || null;
}

function categoryChildren(name) {
  return Object.keys(state.categories)
    .filter((c) => state.categories[c] === name)
    .sort((a, b) => a.localeCompare(b));
}

// Would nesting `name` under `underName` create a cycle — i.e. is `underName` already
// inside `name`'s own subtree? Walking up from `underName` and hitting `name` means yes.
function isDescendantOf(underName, name) {
  let cur = categoryParent(underName);
  while (cur) {
    if (cur === name) return true;
    cur = categoryParent(cur);
  }
  return false;
}

function rootCategories(namesInUse) {
  const all = new Set(namesInUse);
  Object.keys(state.categories).forEach((k) => all.add(k));
  Object.values(state.categories).forEach((v) => v && all.add(v));
  return [...all].filter((c) => !categoryParent(c)).sort((a, b) => a.localeCompare(b));
}

async function nestCategory(child, parent) {
  if (!requireToken()) return;
  if (child === parent) return;
  if (isDescendantOf(parent, child)) {
    alert(`Can't move "${parent}" under "${child}" — "${child}" is already nested inside "${parent}".`);
    return;
  }
  const newMap = { ...state.categories, [child]: parent };
  try {
    await saveCategories(newMap, `Nest "${child}" under "${parent}"`);
    state.categories = newMap;
    renderActive();
    renderTree();
  } catch (err) {
    alert(`Couldn't update categories: ${err.message}`);
  }
}

async function unnestCategory(child) {
  if (!requireToken()) return;
  const newMap = { ...state.categories };
  delete newMap[child];
  try {
    await saveCategories(newMap, `Un-nest "${child}"`);
    state.categories = newMap;
    renderActive();
    renderTree();
  } catch (err) {
    alert(`Couldn't update categories: ${err.message}`);
  }
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

// The Active tab is a book-like drill-down: categories on the left, that category's
// tasks in the middle, and the selected task's full detail on the right (mobile: the
// categories rail becomes a slide-down sheet and the detail becomes a full-screen page —
// see the CSS media query). renderActive() is still the single entry point every mutation
// calls afterward, so nothing elsewhere in this file needed to change.
function isMobile() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function renderActive() {
  // If the previously-open task got completed/deleted/moved out from under us, drop
  // back to the empty-detail state instead of rendering stale content for it.
  if (state.selectedActiveTaskKey && !state.tasks.some((t) => taskKey(t) === state.selectedActiveTaskKey)) {
    state.selectedActiveTaskKey = null;
  }
  renderCategoriesRail();
  renderActiveTasksColumn();
  const selectedTask = state.tasks.find((t) => taskKey(t) === state.selectedActiveTaskKey);
  const detailCol = el("#active-col-detail");
  if (selectedTask) {
    renderActiveDetail(selectedTask);
    detailCol.classList.add("showing");
  } else {
    el("#active-detail-body").innerHTML = `<div class="col-empty-hint">Select a task to see its details here.</div>`;
    detailCol.classList.remove("showing");
    detailCol.classList.remove("fullscreen");
  }
}

function renderCategoriesRail() {
  const container = el("#active-category-list");
  container.innerHTML = "";
  const groups = groupBy(state.tasks, "category");
  const allCount = state.tasks.filter((t) => !isSubtask(t)).length;
  container.appendChild(categoryRailRow("__all__", "All tasks", allCount, 0, false));
  rootCategories(Object.keys(groups)).forEach((name) => appendCategoryRailBranch(container, name, groups, 0));
}

// Recurses through the category hierarchy so a parent category's row is followed
// immediately by its children's rows, indented — drag one category onto another to
// nest it (see the drag handlers below). A purely organizational category (no tasks
// of its own, just grouping subcategories) still gets a row so it stays draggable and
// visible, rather than disappearing until you happen to nest something under it.
function appendCategoryRailBranch(container, name, groups, depth) {
  const children = categoryChildren(name);
  // Subtasks render nested under their parent task (wherever that parent's category
  // puts it), not as their own row here — so a category whose only task just became
  // somebody's subtask can legitimately have nothing left to show.
  const tasks = (groups[name] || []).filter((t) => !isSubtask(t));
  if (tasks.length === 0 && children.length === 0) return;
  container.appendChild(categoryRailRow(name, name, tasks.length, depth, true));
  children.forEach((childName) => appendCategoryRailBranch(container, childName, groups, depth + 1));
}

function categoryRailRow(name, label, count, depth, nestable) {
  const row = document.createElement("div");
  row.className = "cat-item" + (state.selectedCategory === name ? " active" : "");
  if (depth > 0) row.style.marginLeft = `${depth * 14}px`;
  const parent = nestable ? categoryParent(name) : null;
  row.innerHTML = `
    <span class="cat-item-label">${esc(label)}</span>
    <span class="cat-item-right">
      <span class="cat-count">${count}</span>
      ${nestable ? `<button type="button" class="category-move-btn" title="Move this category under another one">⇅</button>` : ""}
      ${parent ? `<button type="button" class="category-detach" title="Remove from &quot;${esc(parent)}&quot;">✕</button>` : ""}
    </span>
  `;
  row.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    selectCategory(name);
  });
  if (nestable) {
    row.style.position = "relative";
    row.draggable = true;
    row.dataset.category = name;
    row.title = "Click to view. Drag onto another category to nest this one under it.";
    row.addEventListener("dragstart", onCategoryDragStart);
    row.addEventListener("dragover", onCategoryDragOver);
    row.addEventListener("dragleave", onCategoryDragLeave);
    row.addEventListener("drop", onCategoryDrop);
    row.addEventListener("dragend", onCategoryDragEnd);
    row.querySelector(".category-move-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      openCategoryMoveMenu(name, row);
    });
    const detachBtn = row.querySelector(".category-detach");
    if (detachBtn) detachBtn.addEventListener("click", (e) => { e.stopPropagation(); unnestCategory(name); });
  }
  return row;
}

function tasksForSelectedCategory() {
  const topLevel = state.tasks.filter((t) => !isSubtask(t));
  return state.selectedCategory === "__all__" ? topLevel : topLevel.filter((t) => t.category === state.selectedCategory);
}

function renderActiveTasksColumn() {
  el("#active-tasks-title").textContent = state.selectedCategory === "__all__" ? "All tasks" : state.selectedCategory;
  const container = el("#active-task-list");
  container.innerHTML = "";
  const tasks = tasksForSelectedCategory();
  if (state.tasks.length === 0) {
    container.innerHTML = `<div class="col-empty-hint">Nothing on the list. Add something below.</div>`;
  } else if (tasks.length === 0) {
    container.innerHTML = `<div class="col-empty-hint">Nothing in this category yet.</div>`;
  } else {
    tasks.forEach((task) => appendTaskWithSubtasks(container, task, 0));
  }
}

// ---------- Active tab: category rail + task selection ----------
function selectCategory(name) {
  state.selectedCategory = name;
  state.selectedActiveTaskKey = null;
  renderActive();
  if (isMobile()) closeCategoriesSheet();
}

function selectActiveTask(task) {
  state.selectedActiveTaskKey = taskKey(task);
  renderActive();
}

function closeActiveDetail() {
  state.selectedActiveTaskKey = null;
  el("#active-col-detail").classList.remove("fullscreen");
  renderActive();
}

// Expands the detail column to cover the whole Active tab, like the mobile
// full-screen detail page, but toggleable on desktop instead of automatic.
function toggleDetailFullscreen() {
  const detailCol = el("#active-col-detail");
  const isFullscreen = detailCol.classList.toggle("fullscreen");
  const btn = detailCol.querySelector(".expand-toggle");
  if (btn) {
    btn.classList.toggle("expanded", isFullscreen);
    btn.title = isFullscreen ? "Exit full page" : "Open as full page";
    btn.setAttribute("aria-label", btn.title);
  }
}

function openCategoriesSheet() {
  el("#active-col-categories").classList.add("mobile-open");
  el("#active-backdrop").classList.add("showing");
}
function closeCategoriesSheet() {
  el("#active-col-categories").classList.remove("mobile-open");
  el("#active-backdrop").classList.remove("showing");
}

// The detail column reuses the Assistance tab's header markup/CSS (.assist-head etc.)
// so a task looks and behaves the same whether you opened it here or from Assistance —
// same icon buttons, same rename-by-double-click title. taskDetailHtml/
// wireTaskDetailInteractivity (defined further down) already render+wire the editable
// notes/suggestions section generically for any container, so this just adds the header.
function renderActiveDetail(task) {
  const body = el("#active-detail-body");
  const isFullscreen = el("#active-col-detail").classList.contains("fullscreen");
  body.innerHTML = `
    <div class="assist-head">
      <div class="assist-head-row">
        <div class="assist-head-top">
          <button class="check" aria-label="Complete task">
            <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
          </button>
          <h2 class="assist-title" title="Double-click to rename">${esc(task.title)}</h2>
        </div>
        <div class="assist-head-icons">
          <button class="subtask-btn" aria-label="Nest or move this task" title="Nest under another task, or move to a different category">↳</button>
          <button class="assist-toggle ${task.assist ? "on" : "off"}" aria-label="Toggle AI assistance">✦</button>
          ${visToggleButtonHtml(task._repo)}
          <button class="expand-toggle${isFullscreen ? " expanded" : ""}" aria-label="${isFullscreen ? "Exit full page" : "Open as full page"}" title="${isFullscreen ? "Exit full page" : "Open as full page"}">⤢</button>
          <button class="delete-toggle" aria-label="Delete task">🗑</button>
        </div>
      </div>
      <div class="assist-meta">${esc(task.category)} · ${visTagHtml(task._repo)} · added ${esc(task.created || "—")}</div>
    </div>
    ${taskDetailHtml(task)}
  `;
  body.querySelector(".check").addEventListener("click", () => completeTask(task));
  body.querySelector(".vis-toggle").addEventListener("click", (e) => toggleVisibility(task, e.currentTarget));
  body.querySelector(".delete-toggle").addEventListener("click", () => deleteTask(task));
  body.querySelector(".expand-toggle").addEventListener("click", () => toggleDetailFullscreen());
  const subtaskBtn = body.querySelector(".subtask-btn");
  subtaskBtn.addEventListener("click", (e) => openSubtaskMenu(task, subtaskBtn));
  const assistBtn = body.querySelector(".assist-toggle");
  assistBtn.title = task.assist
    ? "An AI assistant is helping with this one — click to stop"
    : "Click to have an AI assistant work on this task in the Assistance tab";
  assistBtn.addEventListener("click", (e) => toggleAssist(task, e.currentTarget));
  const titleEl = body.querySelector(".assist-title");
  titleEl.addEventListener("dblclick", () => {
    renameTaskInline(task, titleEl, {
      inputClassName: "assist-title-edit",
      onDone: () => renderActive(),
    });
  });
  wireTaskDetailInteractivity(task, body);
}

// A task is a subtask if its parentId points at another task that actually exists
// in the same repo — a dangling parentId (parent deleted/completed) falls back to
// showing it at top level rather than silently disappearing.
function isSubtask(t) {
  return !!t.parentId && state.tasks.some((x) => x._repo === t._repo && x.id === t.parentId);
}

function subtasksOf(task) {
  return state.tasks.filter((t) => t._repo === task._repo && t.parentId === task.id);
}

// Tasks whose subtasks are collapsed, keyed like taskKey() — a list-tidying toggle,
// independent of which task (if any) currently has its detail open in the right column.
const collapsedSubtaskParents = persistentSet("tasks_collapsed_subtasks");

function appendTaskWithSubtasks(container, task, depth) {
  const kids = subtasksOf(task);
  container.appendChild(taskCard(task, depth, kids.length));
  if (kids.length && collapsedSubtaskParents.has(taskKey(task))) return;
  kids.forEach((child) => appendTaskWithSubtasks(container, child, depth + 1));
}

function openCategoryMoveMenu(name, anchorEl) {
  closeCategoryMoveMenu();
  const menu = document.createElement("div");
  menu.className = "category-move-menu";
  menu.id = "category-move-menu";

  const allNames = new Set([
    ...state.tasks.map((t) => t.category),
    ...state.history.map((h) => h.category),
    ...Object.keys(state.categories),
    ...Object.values(state.categories).filter(Boolean),
  ]);

  const options = [];
  if (categoryParent(name)) options.push({ label: "↑ Move to top level", value: null });
  [...allNames].sort((a, b) => a.localeCompare(b)).forEach((n) => {
    if (n === name || n === categoryParent(name)) return;
    if (isDescendantOf(n, name)) return; // would create a cycle
    options.push({ label: n, value: n });
  });

  menu.innerHTML = options.length
    ? options
        .map((o, i) => `<div class="combo-option" data-i="${i}">${esc(o.label)}</div>`)
        .join("")
    : `<div class="combo-option is-new">No other categories to move under yet</div>`;

  menu.querySelectorAll(".combo-option[data-i]").forEach((optEl) => {
    optEl.addEventListener("click", () => {
      const opt = options[Number(optEl.dataset.i)];
      closeCategoryMoveMenu();
      if (opt.value === null) unnestCategory(name);
      else nestCategory(name, opt.value);
    });
  });

  anchorEl.appendChild(menu);
  setTimeout(() => document.addEventListener("click", onDocClickCloseMoveMenu, { capture: true }), 0);
}

function closeCategoryMoveMenu() {
  const existing = document.getElementById("category-move-menu");
  if (existing) existing.remove();
  document.removeEventListener("click", onDocClickCloseMoveMenu, { capture: true });
}

function onDocClickCloseMoveMenu(e) {
  const menu = document.getElementById("category-move-menu");
  if (menu && !menu.contains(e.target)) closeCategoryMoveMenu();
}

// ---------- subtasks ----------
// Nesting is menu-driven rather than drag-driven, on purpose: the drag gesture on a
// task card already means "reorder this among its siblings" (see task drag-and-drop
// below), and overloading the same drag with "drop onto a card to nest under it"
// needs fiddly drop-zone geometry (top/bottom edge = reorder, middle = nest) that
// doesn't even help on touch devices. A menu is one code path that works everywhere,
// same tradeoff already made for category nesting above.
function taskDescendantIds(task) {
  const ids = [];
  const stack = [task.id];
  while (stack.length) {
    const cur = stack.pop();
    subtasksOf({ id: cur, _repo: task._repo }).forEach((t) => {
      ids.push(t.id);
      stack.push(t.id);
    });
  }
  return ids;
}

async function setTaskParent(task, parentId) {
  if (!requireToken()) return;
  try {
    assertLoaded(task._repo);
    const repo = repoFor(task._repo);
    const updated = state.tasks
      .filter((t) => t._repo === task._repo)
      .map((t) => stripRepo(t.id === task.id ? { ...t, parentId: parentId || undefined } : t));
    await saveTasks(repo, updated, parentId ? `Make subtask: ${task.title}` : `Un-nest: ${task.title}`);
    task.parentId = parentId || undefined;
    renderActive();
  } catch (err) {
    alert(`Couldn't update: ${err.message}`);
  }
}

async function setTaskCategory(task, category) {
  if (!requireToken()) return;
  try {
    assertLoaded(task._repo);
    const repo = repoFor(task._repo);
    const updated = state.tasks
      .filter((t) => t._repo === task._repo)
      .map((t) => stripRepo(t.id === task.id ? { ...t, category } : t));
    await saveTasks(repo, updated, `Move to category "${category}": ${task.title}`);
    task.category = category;
    renderActive();
    renderCategoryOptions();
  } catch (err) {
    alert(`Couldn't update: ${err.message}`);
  }
}

// One menu covers both jobs that used to want separate drag gestures: nesting a
// task under another, and moving it to a different category. Keeping both here
// (rather than adding drag-to-change-category) avoids a single drop meaning three
// different things at once — reorder, nest, or recategorize.
function openSubtaskMenu(task, anchorEl) {
  closeSubtaskMenu();
  const menu = document.createElement("div");
  menu.className = "category-move-menu";
  menu.id = "subtask-menu";

  const repoTasks = state.tasks.filter((t) => t._repo === task._repo);
  const blocked = new Set([task.id, ...taskDescendantIds(task)]);
  // Nest candidates are limited to the task's own category — keeps the list short
  // and matches how nesting is actually used (a subtask of something in the same
  // area of the list), rather than scrolling through every task in the tracker.
  const nestCandidates = repoTasks
    .filter((t) => !blocked.has(t.id) && t.category === task.category)
    .sort((a, b) => a.title.localeCompare(b.title));
  const otherCategories = allCategories().filter((c) => c !== task.category);

  const options = [];
  if (task.parentId) options.push({ kind: "unnest", label: "↑ Remove as subtask" });
  nestCandidates.forEach((t) => options.push({ kind: "nest", label: t.title, value: t.id }));
  if (otherCategories.length) {
    options.push({ kind: "header", label: "Move to category" });
    otherCategories.forEach((c) => options.push({ kind: "category", label: c, value: c }));
  }

  menu.innerHTML = options.length
    ? options
        .map((o, i) =>
          o.kind === "header"
            ? `<div class="combo-option-header">${esc(o.label)}</div>`
            : `<div class="combo-option" data-i="${i}">${esc(o.label)}</div>`
        )
        .join("")
    : `<div class="combo-option is-new">No other tasks or categories yet</div>`;

  menu.querySelectorAll(".combo-option[data-i]").forEach((optEl) => {
    optEl.addEventListener("click", () => {
      const opt = options[Number(optEl.dataset.i)];
      closeSubtaskMenu();
      if (opt.kind === "unnest") setTaskParent(task, null);
      else if (opt.kind === "nest") setTaskParent(task, opt.value);
      else if (opt.kind === "category") setTaskCategory(task, opt.value);
    });
  });

  anchorEl.style.position = "relative";
  anchorEl.appendChild(menu);
  setTimeout(() => document.addEventListener("click", onDocClickCloseSubtaskMenu, { capture: true }), 0);
}

function closeSubtaskMenu() {
  const existing = document.getElementById("subtask-menu");
  if (existing) existing.remove();
  document.removeEventListener("click", onDocClickCloseSubtaskMenu, { capture: true });
}

function onDocClickCloseSubtaskMenu(e) {
  const menu = document.getElementById("subtask-menu");
  if (menu && !menu.contains(e.target)) closeSubtaskMenu();
}

// ---------- category drag-and-drop ----------
let draggedCategory = null;

function onCategoryDragStart(e) {
  draggedCategory = e.currentTarget.dataset.category;
  e.currentTarget.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", draggedCategory);
}

function onCategoryDragOver(e) {
  if (!draggedCategory || draggedCategory === e.currentTarget.dataset.category) return;
  e.preventDefault();
  e.currentTarget.classList.add("drag-over");
}

function onCategoryDragLeave(e) {
  e.currentTarget.classList.remove("drag-over");
}

function onCategoryDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
  const target = e.currentTarget.dataset.category;
  if (draggedCategory && draggedCategory !== target) nestCategory(draggedCategory, target);
  draggedCategory = null;
}

function onCategoryDragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  document.querySelectorAll(".cat-item.drag-over").forEach((el) => el.classList.remove("drag-over"));
  draggedCategory = null;
}

// Meta line shown under a task's title in the tasks column — a quick-glance summary
// of what's waiting on it, echoing what you'd find if you opened it (subtasks,
// suggestions, notes). A task's own free-text `notes` field (legacy, rare) always
// wins if set, since that was explicitly written to be seen at a glance.
function taskCardMeta(task, subtaskCount) {
  if (task.notes) return esc(task.notes);
  const parts = [];
  if (subtaskCount) parts.push(`${subtaskCount} subtask${subtaskCount > 1 ? "s" : ""}`);
  const sugg = (task.suggestions || []).length;
  if (sugg) parts.push(`${sugg} suggestion${sugg > 1 ? "s" : ""}`);
  const notesN = noteItems(task).length;
  if (notesN) parts.push(`${notesN} note${notesN > 1 ? "s" : ""}`);
  return parts.length ? parts.join(" · ") : "No notes yet";
}

function taskCard(task, depth = 0, subtaskCount = 0) {
  const card = document.createElement("div");
  card.className = "task-card" + (depth > 0 ? " subtask" : "");
  if (depth > 0) card.style.marginLeft = `${depth * 22}px`;
  card.draggable = true;
  card.dataset.taskKey = taskKey(task);
  card.title = "Click to open. Double-click (or press and hold) the title to rename. Drag to reorder.";

  const key = taskKey(task);
  if (state.selectedActiveTaskKey === key) card.classList.add("selected");
  const subtasksCollapsed = subtaskCount > 0 && collapsedSubtaskParents.has(key);

  card.innerHTML = `
    <div class="task-card-header">
      <div class="task-card-top">
        <button class="check" aria-label="Complete task">
          <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
        </button>
        <div class="task-body">
          <div class="task-title-row">
            <div class="task-title">${esc(task.title)}</div>
            ${subtaskCount > 0 ? `<button class="subtask-collapse-toggle" title="${subtasksCollapsed ? "Show" : "Hide"} subtasks">${subtasksCollapsed ? "▸" : "▾"} ${subtaskCount}</button>` : ""}
          </div>
          <div class="task-meta">${taskCardMeta(task, subtaskCount)}</div>
        </div>
      </div>
      <div class="task-card-icons">
        <button class="subtask-btn" aria-label="Nest or move this task" title="Nest under another task, or move to a different category">↳</button>
        <button class="assist-toggle ${task.assist ? "on" : "off"}" aria-label="Toggle AI assistance">✦</button>
        ${visToggleButtonHtml(task._repo)}
        <button class="delete-toggle" aria-label="Delete task">🗑</button>
        <span class="chev">›</span>
      </div>
    </div>
  `;
  card.addEventListener("click", (e) => {
    if (card.classList.contains("editing")) return;
    if (e.target.closest("button") || e.target.closest("input")) return;
    selectActiveTask(task);
  });
  if (subtaskCount > 0) {
    card.querySelector(".subtask-collapse-toggle").addEventListener("click", (e) => {
      e.stopPropagation();
      if (subtasksCollapsed) collapsedSubtaskParents.delete(key);
      else collapsedSubtaskParents.add(key);
      renderActive();
    });
  }
  card.querySelector(".check").addEventListener("click", () => completeTask(task, card));
  card.querySelector(".vis-toggle").addEventListener("click", (e) => toggleVisibility(task, e.currentTarget));
  card.querySelector(".delete-toggle").addEventListener("click", () => deleteTask(task, card));
  const subtaskBtn = card.querySelector(".subtask-btn");
  subtaskBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openSubtaskMenu(task, subtaskBtn);
  });
  const assistBtn = card.querySelector(".assist-toggle");
  assistBtn.title = task.assist
    ? "An AI assistant is helping with this one — click to stop"
    : "Click to have an AI assistant work on this task in the Assistance tab";
  assistBtn.addEventListener("click", (e) => toggleAssist(task, e.currentTarget));

  setupTaskTitleEditing(task, card);

  card.addEventListener("dragstart", onTaskDragStart);
  card.addEventListener("dragover", onTaskDragOver);
  card.addEventListener("dragleave", onTaskDragLeave);
  card.addEventListener("drop", onTaskDrop);
  card.addEventListener("dragend", onTaskDragEnd);
  return card;
}

// ---------- task drag-and-drop (reordering) ----------
// Mirrors the category header drag pattern above. Order only has meaning within a
// single repo's tasks.json (that's what gets written back), so dragging a task onto
// one from the other repo (public vs private) is a no-op rather than a silent merge.
let draggedTaskKey = null;

function onTaskDragStart(e) {
  draggedTaskKey = e.currentTarget.dataset.taskKey;
  e.currentTarget.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", draggedTaskKey);
}

function onTaskDragOver(e) {
  if (!draggedTaskKey || draggedTaskKey === e.currentTarget.dataset.taskKey) return;
  e.preventDefault();
  e.currentTarget.classList.add("drag-over");
}

function onTaskDragLeave(e) {
  e.currentTarget.classList.remove("drag-over");
}

async function onTaskDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
  const targetKey = e.currentTarget.dataset.taskKey;
  const sourceKey = draggedTaskKey;
  draggedTaskKey = null;
  if (!sourceKey || sourceKey === targetKey) return;

  const draggedTask = state.tasks.find((t) => taskKey(t) === sourceKey);
  const targetTask = state.tasks.find((t) => taskKey(t) === targetKey);
  if (!draggedTask || !targetTask) return;
  if (draggedTask._repo !== targetTask._repo) {
    alert("Can't reorder between public and private tasks — only within the same list.");
    return;
  }
  await reorderTask(draggedTask, targetTask);
}

function onTaskDragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  document.querySelectorAll(".task-card.drag-over").forEach((c) => c.classList.remove("drag-over"));
  draggedTaskKey = null;
}

async function reorderTask(draggedTask, targetTask) {
  if (!requireToken()) return;
  try {
    assertLoaded(draggedTask._repo);
  } catch (err) {
    alert(err.message);
    return;
  }
  const otherRepoTasks = state.tasks.filter((t) => t._repo !== draggedTask._repo);
  const repoTasks = state.tasks.filter((t) => t._repo === draggedTask._repo && t.id !== draggedTask.id);
  const targetIndex = repoTasks.findIndex((t) => t.id === targetTask.id);
  repoTasks.splice(targetIndex, 0, draggedTask);

  try {
    await saveTasks(repoFor(draggedTask._repo), repoTasks.map(stripRepo), `Reorder: ${draggedTask.title}`);
    state.tasks = [...otherRepoTasks, ...repoTasks];
    renderActive();
  } catch (err) {
    alert(`Couldn't save new order: ${err.message}`);
  }
}

// ---------- task title editing (double-click, or press-and-hold on touch) ----------
function setupTaskTitleEditing(task, card) {
  const titleEl = card.querySelector(".task-title");
  titleEl.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    enterTaskTitleEditMode(task, card);
  });

  // Double-click doesn't fire reliably on touch, so a long-press does the same thing.
  // Guarded against drags: any real pointer movement cancels the hold timer.
  let holdTimer = null;
  let moved = false;
  titleEl.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    moved = false;
    holdTimer = setTimeout(() => {
      if (!moved) enterTaskTitleEditMode(task, card);
    }, 550);
  });
  titleEl.addEventListener("pointermove", () => { moved = true; });
  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) =>
    titleEl.addEventListener(ev, () => clearTimeout(holdTimer))
  );
}

// Both places a title can be renamed from (an Active-tab card, or the Assistance
// detail header) share this — only the DOM cleanup around the swap differs.
function renameTaskInline(task, titleEl, { onBeforeEdit, onDone, inputClassName = "task-title-edit" } = {}) {
  if (onBeforeEdit) onBeforeEdit();

  const input = document.createElement("input");
  input.type = "text";
  input.className = inputClassName;
  input.value = task.title;
  titleEl.replaceWith(input);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  let settled = false;
  const finish = async (commit) => {
    if (settled) return;
    settled = true;
    const newTitle = input.value.trim();
    if (!commit || !newTitle || newTitle === task.title) {
      onDone();
      return;
    }
    if (!requireToken()) {
      onDone();
      return;
    }
    try {
      assertLoaded(task._repo);
      const repo = repoFor(task._repo);
      const updated = state.tasks
        .filter((t) => t._repo === task._repo)
        .map((t) => stripRepo(t.id === task.id ? { ...t, title: newTitle } : t));
      await saveTasks(repo, updated, `Rename task: ${task.title} → ${newTitle}`);
      task.title = newTitle;
      onDone();
    } catch (err) {
      alert(`Couldn't save: ${err.message}`);
      onDone();
    }
  };

  input.addEventListener("blur", () => finish(true));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    if (e.key === "Escape") { e.preventDefault(); finish(false); }
  });
}

function enterTaskTitleEditMode(task, card) {
  if (card.classList.contains("editing")) return;
  const titleEl = card.querySelector(".task-title");
  renameTaskInline(task, titleEl, {
    onBeforeEdit: () => {
      card.classList.add("editing");
      card.draggable = false;
    },
    onDone: () => {
      renderActive();
      renderAssistList();
      renderAssistDetail();
    },
  });
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
  tabBtn.title = n ? `Assistance (${n})` : "Assistance";
  tabBtn.innerHTML = `<span class="assist-tab-star">✦</span>${n ? `<span class="assist-tab-count">${n}</span>` : ""}`;
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
    btnEl.textContent = visShortLabel(fromVisibility);
    btnEl.classList.remove("public", "private");
    btnEl.classList.add(visClass(fromVisibility));
    if (addedToDestination) await loadData();
  }
}

// ---------- completing a task ----------
// Ticking a box completes it immediately — no modal in the way. A note/photo is
// optional and offered afterward via the toast, so adding one is a choice, not a toll.
async function completeTask(task, card) {
  if (!requireToken()) return;
  const repo = repoFor(task._repo);
  const checkBtn = card ? card.querySelector(".check") : null;
  if (checkBtn) {
    checkBtn.classList.add("checked");
    burst(checkBtn);
    playPop();
    card.classList.add("completing");
  }

  try {
    assertLoaded(task._repo);
    const remainingInRepo = state.tasks.filter((t) => t._repo === task._repo && t.id !== task.id).map(stripRepo);
    // Carry the task's own notes and the agent's suggestions into history — otherwise
    // completing a task silently threw away everything that had been built up on it.
    const carriedNotes = noteItems(task);
    const carriedClaudeNotes = claudeNoteItems(task);
    const entry = {
      id: task.id,
      title: task.title,
      category: task.category,
      completedDate: new Date().toISOString().slice(0, 10),
      note: "",
      images: [],
      ...(carriedNotes.length ? { noteItems: carriedNotes } : {}),
      ...(carriedClaudeNotes.length ? { claudeNotes: carriedClaudeNotes } : {}),
      ...((task.suggestions || []).length ? { suggestions: task.suggestions } : {}),
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
    if (card) setTimeout(() => renderActive(), 350);
    else renderActive();
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
    if (card) card.classList.remove("completing");
    if (checkBtn) checkBtn.classList.remove("checked");
  }
}

// Editing a note on an already-completed task, reached only from the toast above —
// this dialog is opt-in follow-up, never a gate on completing the task itself.
function openNoteDialog(entry) {
  state.pendingNoteEdit = entry;
  el("#complete-note").value = entry.note || "";
  el("#complete-image").value = "";
  el("#complete-dialog-error").textContent = "";
  const saveBtn = el("#complete-confirm");
  saveBtn.disabled = false;
  saveBtn.textContent = "Save note";
  el("#complete-cancel").disabled = false;
  el("#complete-dialog").showModal();
}

el("#complete-cancel").addEventListener("click", () => el("#complete-dialog").close());

function setDialogError(msg) {
  const box = el("#complete-dialog-error");
  if (box) box.textContent = msg || "";
}

el("#complete-form").addEventListener("submit", async (e) => {
  // No method="dialog" on this form anymore, and preventDefault here, on purpose: that
  // markup used to close the dialog the instant you hit submit, before any async save
  // ran — so a failed save (e.g. an oversized image) still lost the note you'd just
  // typed, because the textarea was already gone. Now the dialog only closes once we
  // actually know the note saved.
  e.preventDefault();
  const entry = state.pendingNoteEdit;
  if (!entry) return;
  const repo = repoFor(entry._repo);
  const note = el("#complete-note").value.trim();
  const file = el("#complete-image").files[0];
  const saveBtn = el("#complete-confirm");
  const cancelBtn = el("#complete-cancel");

  setDialogError("");
  saveBtn.disabled = true;
  cancelBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  try {
    assertLoaded(entry._repo);

    // Save the note text first and independently of any image — a failed photo upload
    // should never be able to cost you the words you already wrote.
    let images = entry.images || [];
    const updatedHistory = state.history
      .filter((h) => h._repo === entry._repo)
      .map(stripRepo)
      .map((h) => (h.id === entry.id ? { ...h, note, images } : h));
    await saveHistory(repo, updatedHistory, `Update note: ${entry.title}`);
    state.history = state.history.map((h) =>
      h.id === entry.id && h._repo === entry._repo ? { ...h, note, images } : h
    );
    renderTree();
    el("#complete-dialog").close();

    if (file) {
      try {
        const compressed = await compressImage(file);
        const base64 = await blobToBase64(compressed);
        const safeCat = entry.category.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const imagePath = `images/${safeCat}/${entry.id}.jpg`;
        await ghPutImage(repo, imagePath, base64, `Add image for ${entry.title}`);
        images = [imagePath];
        const withImage = state.history
          .filter((h) => h._repo === entry._repo)
          .map(stripRepo)
          .map((h) => (h.id === entry.id ? { ...h, images } : h));
        await saveHistory(repo, withImage, `Add image: ${entry.title}`);
        state.history = state.history.map((h) =>
          h.id === entry.id && h._repo === entry._repo ? { ...h, images } : h
        );
        renderTree();
      } catch (imgErr) {
        alert(`Your note saved, but the photo didn't upload: ${imgErr.message}\n\nThe note itself is safe — you can try attaching the photo again from the History tab later.`);
      }
    }
  } catch (err) {
    saveBtn.disabled = false;
    cancelBtn.disabled = false;
    saveBtn.textContent = "Save note";
    setDialogError(`Couldn't save: ${err.message}`);
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
  if (card) card.classList.add("completing");
  state.tasks = state.tasks.filter((t) => !(t.id === task.id && t._repo === task._repo));
  renderCategoryOptions();
  renderAssistList();
  renderAssistTabCount();
  if (state.selectedAssistKey === taskKey(task)) {
    state.selectedAssistKey = null;
    renderAssistDetail();
  }
  if (card) setTimeout(() => card.remove(), 300);
  else renderActive();

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

// Phone screenshots routinely land at 1-5MB, well past GitHub's practical ~1MB limit for
// a single Contents-API PUT — that mismatch is what silently failed uploads before. Scale
// down and re-encode as JPEG so a typical screenshot comes in well under the limit.
function compressImage(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not process image"))), "image/jpeg", quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };
    img.src = url;
  });
}

// Lets a screenshot (Ctrl+V, or right-click "Copy Image") land straight in the note's
// file input via a synthetic DataTransfer — the submit handler then treats it exactly
// like a picked file, no separate code path needed. Bound to the text input rather
// than the whole form since that's where focus naturally is when you go to paste.
function setupPasteImage(textInput, fileInput, statusEl) {
  textInput.addEventListener("paste", (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (!file) continue;
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event("change"));
        if (statusEl) statusEl.textContent = "Image pasted — will attach when you add the note.";
        e.preventDefault();
        break;
      }
    }
  });
}

// Replaces the native file input's cramped "No file chosen" text with a proper
// preview (thumbnail for images, filename for anything else) plus a clear button —
// this is what was overflowing/looking broken in the screenshot that prompted it.
function setupAttachmentPreview(fileInput, previewEl) {
  const clear = () => {
    fileInput.value = "";
    previewEl.classList.remove("showing");
    previewEl.innerHTML = "";
  };
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) { clear(); return; }
    const isImage = file.type.startsWith("image/");
    previewEl.innerHTML = `
      ${isImage ? `<img alt="">` : "📄"}
      <span class="attachment-name">${esc(file.name)}</span>
      <button type="button" class="attachment-clear" aria-label="Remove attachment" title="Remove">✕</button>
    `;
    previewEl.classList.add("showing");
    if (isImage) previewEl.querySelector("img").src = URL.createObjectURL(file);
    previewEl.querySelector(".attachment-clear").addEventListener("click", (e) => {
      e.preventDefault();
      clear();
    });
  });
}

// Images get compressed/re-encoded as before; anything else (PDFs, etc.) uploads
// as-is. Returns the fields to merge into the note item — `image` for images (as
// already used everywhere images render) or `file` for other attachment types.
async function uploadNoteAttachment(task, noteId, file) {
  const repo = repoFor(task._repo);
  const safeCat = task.category.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (file.type.startsWith("image/")) {
    const compressed = await compressImage(file);
    const base64 = await blobToBase64(compressed);
    const imagePath = `images/${safeCat}/${task.id}-${noteId}.jpg`;
    await ghPutImage(repo, imagePath, base64, `Add image for note: ${task.title}`);
    return { image: imagePath };
  }
  const ext = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
  const base64 = await blobToBase64(file);
  const filePath = `images/${safeCat}/${task.id}-${noteId}.${ext}`;
  await ghPutImage(repo, filePath, base64, `Add attachment for note: ${task.title}`);
  return { file: { path: filePath, name: file.name } };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ---------- adding a task ----------
el("#add-visibility").addEventListener("click", () => {
  state.newTaskVisibility = state.newTaskVisibility === "public" ? "private" : "public";
  renderVisibilityToggle();
});
function renderVisibilityToggle() {
  const isPublic = state.newTaskVisibility === "public";
  const btn = el("#add-visibility");
  btn.textContent = isPublic ? "[PUB]" : "[PRI]";
  btn.classList.toggle("public", isPublic);
  btn.classList.toggle("private", !isPublic);
  btn.title = isPublic
    ? "New task will be public — click to make it private"
    : "New task will be private — click to make it public";
}
renderVisibilityToggle();
setupCategoryCombo();
setupColumnResize();
setupAddTitleAutoGrow();

// Grows #add-title as its wrapped text takes more lines (capped by its CSS
// max-height, which then scrolls), and submits on Enter like a normal text
// input would — Shift+Enter still inserts a real line break.
function setupAddTitleAutoGrow() {
  const textarea = el("#add-title");
  const grow = () => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  textarea.addEventListener("input", grow);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      el("#add-form").requestSubmit();
    }
  });
  grow();
}

// ---------- drag-to-resize columns (desktop only — hidden on mobile via CSS) ----------
function setupColumnResize() {
  const MIN_WIDTH = 160;
  const MAX_WIDTH = 900;

  function makeResizable(handle, col, storageKey) {
    if (!handle || !col) return;
    const saved = parseInt(localStorage.getItem(storageKey), 10);
    if (saved >= MIN_WIDTH && saved <= MAX_WIDTH) col.style.width = `${saved}px`;

    let startX = 0;
    let startWidth = 0;

    function onMove(e) {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (clientX - startX)));
      col.style.width = `${width}px`;
    }
    function onEnd() {
      handle.classList.remove("dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onEnd);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      localStorage.setItem(storageKey, parseInt(col.style.width, 10));
    }
    function onStart(e) {
      e.preventDefault();
      startX = e.touches ? e.touches[0].clientX : e.clientX;
      startWidth = col.getBoundingClientRect().width;
      handle.classList.add("dragging");
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onEnd);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onEnd);
    }
    handle.addEventListener("mousedown", onStart);
    handle.addEventListener("touchstart", onStart, { passive: false });
  }

  makeResizable(el("#categories-resize-handle"), el("#active-col-categories"), "tasks_col_categories_width");
  makeResizable(el("#tasks-resize-handle"), el("#active-col-tasks"), "tasks_col_tasks_width");
  makeResizable(el("#detail-resize-handle"), el("#active-col-detail"), "tasks_col_detail_width");
}

el("#add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!requireToken()) return;
  const title = el("#add-title").value.trim();
  const category = el("#add-category").value.trim();
  if (!title) return;
  if (!category) {
    el("#add-category").focus();
    openCategoryMenu();
    return;
  }

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
    el("#add-title").style.height = "auto";
  } catch (err) {
    alert(`Couldn't save to GitHub: ${err.message}`);
  }
});

// ---------- rendering: level-up tree ----------
// A fixed palette, hashed by category name, gives each category a consistent color
// across the app's lifetime without having to store a color choice anywhere — same
// category always lands on the same color. Reuses the confetti palette for a
// consistent visual language with the rest of the app.
const CATEGORY_PALETTE = ["#5fe3a1", "#7c9bff", "#ffb86b", "#ff6b9d", "#ffe66b", "#b388ff", "#4dd0e1"];
function categoryColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
}

// One chronological spine across every category, instead of a separate branch per
// category — each entry's dot is colored by its category (see categoryColor), so
// the timeline reads like a simple git-log graph: one line, colored "lanes" by
// category, without the layout complexity of dots actually diverging/merging.
function renderTree() {
  const container = el("#tree-groups");
  container.innerHTML = "";
  if (state.history.length === 0) {
    container.innerHTML = `<div class="empty-state">Complete a task to start building your history.</div>`;
    return;
  }
  const rail = document.createElement("div");
  rail.className = "tree-rail";
  let lastDate = null;
  state.history
    .slice()
    .sort((a, b) => b.completedDate.localeCompare(a.completedDate))
    .forEach((entry) => {
      if (entry.completedDate !== lastDate) {
        lastDate = entry.completedDate;
        rail.appendChild(dayDividerEl(entry.completedDate));
      }
      rail.appendChild(historyNodeEl(entry));
    });
  container.appendChild(rail);
}

// A day only needs to be labelled once — every entry under it already carries no
// date of its own (see historyNodeEl), which is also what fixed the mobile layout
// where date + badges + delete used to fight the title for space on one line.
function dayDividerEl(dateStr) {
  const div = document.createElement("div");
  div.className = "tree-day-divider";
  const d = new Date(dateStr + "T00:00:00");
  div.textContent = isNaN(d)
    ? dateStr
    : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return div;
}

// Which history entries are expanded, keyed like taskKey() — a plain Set survives
// re-renders (triggered by e.g. deleting a sibling entry) so toggling stays put.
const expandedHistoryNodes = persistentSet("tasks_expanded_history_nodes");
const historyNodeKey = (entry) => `${entry._repo}::${entry.id}`;

function historyNodeEl(entry) {
  const key = historyNodeKey(entry);
  const expanded = expandedHistoryNodes.has(key);
  const visIcon = visDotHtml(entry._repo);
  const items = entry.noteItems || [];
  const claudeNotes = entry.claudeNotes || [];
  const suggestions = entry.suggestions || [];
  const images = entry.images || [];

  const badges = [];
  if (entry.note) badges.push(`<span class="badge badge-note" title="Completion note">📝</span>`);
  if (images.length) badges.push(`<span class="badge badge-note" title="${images.length} photo(s)">🖼 ${images.length}</span>`);
  if (items.length) badges.push(`<span class="badge badge-note" title="${items.length} note(s)">✎ ${items.length}</span>`);
  if (claudeNotes.length) badges.push(`<span class="badge badge-note" title="${claudeNotes.length} agent note(s)">🤖 ${claudeNotes.length}</span>`);
  if (suggestions.length) badges.push(`<span class="badge badge-sug" title="${suggestions.length} suggestion(s)">✦ ${suggestions.length}</span>`);
  const hasDetail = badges.length > 0;

  const color = categoryColor(entry.category);
  const node = document.createElement("div");
  node.className = "tree-node";
  node.dataset.key = key;
  node.style.setProperty("--lane-color", color);
  node.innerHTML = `
    <div class="node-row${hasDetail ? " node-row-toggle" : ""}">
      ${hasDetail ? `<button class="node-toggle" aria-label="${expanded ? "Collapse" : "Expand"}">${expanded ? "▾" : "▸"}</button>` : `<span class="node-toggle-spacer"></span>`}
      <span class="node-title">${visIcon} ${esc(entry.title)}</span>
    </div>
    <div class="node-meta-row">
      <span class="history-cat-badge" style="color: ${color}; border-color: ${color};">${esc(entry.category)}</span>
      ${badges.join("")}
      <button class="node-edit-note" aria-label="Add or edit note and photo" title="Add or edit note and photo">✎ Note</button>
      <button class="node-delete" aria-label="Delete from history">🗑</button>
    </div>
    ${expanded ? historyNodeDetailHtml(entry) : ""}
  `;

  node.querySelector(".node-edit-note").addEventListener("click", (e) => {
    e.stopPropagation();
    openNoteDialog(entry);
  });
  node.querySelector(".node-delete").addEventListener("click", (e) => {
    e.stopPropagation();
    deleteHistoryEntry(entry, node);
  });
  if (hasDetail) {
    node.querySelector(".node-row-toggle").addEventListener("click", () => {
      if (expandedHistoryNodes.has(key)) expandedHistoryNodes.delete(key);
      else expandedHistoryNodes.add(key);
      renderTree();
    });
  }
  return node;
}

// Images render inline; anything else (PDFs, etc.) renders as a download link since
// browsers can't inline-preview arbitrary file types.
function noteAttachmentHtml(n) {
  if (n.image) return `<img src="${esc(n.image)}" class="note-image" alt="">`;
  if (n.file) return `<a href="${esc(n.file.path)}" target="_blank" rel="noopener noreferrer" class="note-file-link">📄 ${esc(n.file.name)}</a>`;
  return "";
}

// Shared by the History detail panel and the Active-tab task detail panel below —
// same read-only rendering either way (editing happens via double-click for the
// title and the Assistance tab for notes, never here).
function staticNoteListHtml(items) {
  return `<ul class="note-list note-list-static">${items.map((n) => `
    <li class="note-item${n.done ? " done" : ""}">
      <span class="note-check-static">${n.done ? "✓" : ""}</span>
      <div class="note-body">
        <div class="note-text">${linkify(n.text)}</div>
        ${noteAttachmentHtml(n)}
        <div class="note-time">${formatExact(n.updated || n.created)}${n.author ? ` · ${esc(n.author)}` : ""}</div>
      </div>
    </li>`).join("")}</ul>`;
}

// Static (History) context uses an absolute date+time rather than formatWhen's
// relative-then-decaying text — a history entry might be read months later, when
// "2h ago" would be meaningless anyway.
function formatExact(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Suggestions are historically plain strings ("a finding written by Claude"). To let
// entries carry which agent/model produced them without a breaking migration across
// two repos' worth of existing data, a suggestion may now ALSO be an object
// {text, author} — these two helpers read either shape transparently. Old plain-string
// suggestions keep working forever; only new ones written with a known author show a tag.
function suggestionText(s) {
  return typeof s === "string" ? s : s.text;
}
function suggestionAuthor(s) {
  return typeof s === "string" ? null : s.author || null;
}
function authorTagHtml(author) {
  return author ? `<span class="author-tag">${esc(author)}</span>` : "";
}

function suggestionsSectionHtml(suggestions) {
  return suggestions.length
    ? `<div class="node-detail-section">
        <h4>✦ Agent suggestions</h4>
        <ul class="suggestion-list">${suggestions.map((s) => `<li><div class="suggestion-main"><div class="suggestion-text">${linkify(suggestionText(s))}</div>${authorTagHtml(suggestionAuthor(s))}</div></li>`).join("")}</ul>
      </div>`
    : "";
}

function claudeNotesSectionHtml(claudeNotes) {
  return claudeNotes.length
    ? `<div class="node-detail-section">
        <h4>🤖 Agent notes</h4>
        ${staticNoteListHtml(claudeNotes)}
      </div>`
    : "";
}

function notesSectionHtml(items) {
  return items.length
    ? `<div class="node-detail-section">
        <h4>✎ Notes</h4>
        ${staticNoteListHtml(items)}
      </div>`
    : "";
}

function historyNodeDetailHtml(entry) {
  const items = entry.noteItems || [];
  const claudeNotes = entry.claudeNotes || [];
  const suggestions = entry.suggestions || [];
  const images = entry.images || [];
  return `
    <div class="node-detail">
      ${entry.note ? `<div class="node-note">${linkify(entry.note)}</div>` : ""}
      ${images.map((img) => `<img src="${esc(img)}" alt="">`).join("")}
      ${suggestionsSectionHtml(suggestions)}
      ${claudeNotesSectionHtml(claudeNotes)}
      ${notesSectionHtml(items)}
    </div>
  `;
}

// Active-tab equivalent of the Assistance detail panel — same editable notes (add,
// check off, edit, delete, attach a photo) so jotting a note never requires opting
// a task into assist first. Suggestions and Claude's notes stay read-only here
// (research/editing those happens via the Assistance tab or Claude itself); scoped
// with classes rather than the Assistance tab's global ids, since several of these
// can be expanded across different task cards at once.
function taskDetailHtml(task) {
  const items = noteItems(task);
  const claudeNotes = claudeNoteItems(task);
  const suggestions = task.suggestions || [];
  return `
    <div class="node-detail">
      ${suggestionsSectionHtml(suggestions)}
      ${claudeNotes.length ? `
        <div class="node-detail-section">
          <h4>🤖 Agent notes</h4>
          <ul class="note-list task-claude-note-list">${claudeNotes.map(claudeNoteItemHtml).join("")}</ul>
        </div>` : ""}
      <div class="node-detail-section">
        <h4>✎ Notes${items.length ? ` <span class="count">${items.length}</span>` : ""}</h4>
        ${items.length ? `<ul class="note-list task-note-list">${items.map(noteItemHtml).join("")}</ul>` : ""}
        <form class="add-note-form task-add-note-form">
          <input type="text" class="task-add-note-input" placeholder="Add a note… (paste an image too)" autocomplete="off" />
          <input type="file" accept="image/*,application/pdf" class="task-add-note-image" title="Attach a photo or PDF (optional) — or just paste an image into the text field" />
          <span class="add-note-attachment-preview task-add-note-preview"></span>
          <button type="submit">Add</button>
        </form>
        <span class="assist-status task-note-status"></span>
      </div>
    </div>
  `;
}

// All handlers scoped to `card` (a specific task's DOM), not document-wide ids —
// several task cards can have their notes expanded and being edited at once.
function wireTaskDetailInteractivity(task, card) {
  const claudeNoteList = card.querySelector(".task-claude-note-list");
  if (claudeNoteList) {
    claudeNoteList.addEventListener("click", (e) => {
      const li = e.target.closest(".note-item");
      if (!li) return;
      const id = li.dataset.id;
      if (e.target.closest(".note-check")) toggleClaudeNoteDone(task, id);
      else if (e.target.closest(".note-delete")) deleteClaudeNoteItem(task, id, li);
    });
  }

  const noteList = card.querySelector(".task-note-list");
  if (noteList) {
    noteList.addEventListener("click", (e) => {
      const li = e.target.closest(".note-item");
      if (!li) return;
      const id = li.dataset.id;
      const note = noteItems(task).find((n) => n.id === id);
      if (!note) return;
      if (e.target.closest(".note-check")) toggleNoteDone(task, id);
      else if (e.target.closest(".note-edit")) enterNoteEditMode(task, li, note);
      else if (e.target.closest(".note-delete")) deleteNoteItem(task, id, li);
    });
  }

  const form = card.querySelector(".task-add-note-form");
  const statusEl = card.querySelector(".task-note-status");
  const imageInputEl = card.querySelector(".task-add-note-image");
  setupPasteImage(card.querySelector(".task-add-note-input"), imageInputEl, statusEl);
  setupAttachmentPreview(imageInputEl, card.querySelector(".task-add-note-preview"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = card.querySelector(".task-add-note-input");
    const imageInput = card.querySelector(".task-add-note-image");
    const text = input.value.trim();
    const file = imageInput.files[0];
    if (!text || !requireToken()) return;
    const now = new Date().toISOString();
    const noteId = newNoteId();
    const newItems = [...noteItems(task), { id: noteId, text, done: false, created: now, updated: now }];
    statusEl.textContent = "Saving…";
    statusEl.className = "assist-status task-note-status";
    try {
      await saveNoteItems(task, newItems, `Add note: ${task.title}`);
      renderAssistList();
      renderAssistDetail();
      renderActive();

      if (file) {
        try {
          const attachment = await uploadNoteAttachment(task, noteId, file);
          const withAttachment = noteItems(task).map((n) => (n.id === noteId ? { ...n, ...attachment } : n));
          await saveNoteItems(task, withAttachment, `Add attachment for note: ${task.title}`);
          renderAssistList();
          renderAssistDetail();
          renderActive();
        } catch (imgErr) {
          alert(`Your note saved, but the attachment didn't upload: ${imgErr.message}\n\nThe note itself is safe.`);
        }
      }
    } catch (err) {
      statusEl.textContent = `Couldn't save: ${err.message}`;
      statusEl.className = "assist-status task-note-status error";
    }
  });
}

// Same instant + undo pattern as deleting an active task (see deleteTask) — no confirm
// dialog, the write is deferred behind the undo window.
async function deleteHistoryEntry(entry, nodeEl) {
  if (!requireToken()) return;
  try {
    assertLoaded(entry._repo);
  } catch (err) {
    alert(err.message);
    return;
  }

  const prevHistory = state.history;
  nodeEl.classList.add("completing");
  state.history = state.history.filter((h) => !(h.id === entry.id && h._repo === entry._repo));
  setTimeout(() => nodeEl.remove(), 300);

  let undone = false;
  showToast({
    message: `Deleted "${entry.title}" from history`,
    actionLabel: "Undo",
    duration: DELETE_UNDO_MS,
    onAction: () => {
      undone = true;
      state.history = prevHistory;
      renderTree();
    },
  });

  setTimeout(async () => {
    if (undone) return;
    try {
      const repo = repoFor(entry._repo);
      const remaining = prevHistory.filter((h) => h._repo === entry._repo && h.id !== entry.id).map(stripRepo);
      await saveHistory(repo, remaining, `Delete history entry: ${entry.title}`);
    } catch (err) {
      state.history = prevHistory;
      renderTree();
      alert(`Couldn't delete "${entry.title}" from history: ${err.message}. It's back.`);
    }
  }, DELETE_UNDO_MS + 300);
}

// ---------- assistance tab: suggestions + scratchpad per task ----------
function renderAssistList() {
  const container = el("#assist-list");
  container.innerHTML = "";
  const tasks = assistTasks();
  if (tasks.length === 0) {
    container.innerHTML = `<div class="empty-state">No tasks opted in yet. Tap the ✦ on any task in the Active tab to have an AI assistant work on it.</div>`;
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
      // ✦ = an agent left suggestions, 🤖 = an agent actually did something, ✎ = you've written notes.
      const badges = [];
      if ((task.suggestions || []).length) badges.push(`<span class="badge badge-sug" title="${task.suggestions.length} suggestion(s)">✦ ${task.suggestions.length}</span>`);
      if (claudeNoteItems(task).some((n) => !n.done)) badges.push(`<span class="badge badge-note" title="An agent did something here you haven't checked off yet">🤖</span>`);
      if (noteItems(task).length) badges.push(`<span class="badge badge-note" title="${noteItems(task).length} note(s)">✎ ${noteItems(task).length}</span>`);
      btn.innerHTML = `
        <span class="assist-item-icon">${visDotHtml(task._repo)}</span>
        <span class="assist-item-title">${esc(task.title)}</span>
        ${badges.join("")}
      `;
      btn.addEventListener("click", () => selectAssistTask(task));
      container.appendChild(btn);
    });
  });
}

function selectAssistTask(task) {
  state.selectedAssistKey = taskKey(task);
  renderAssistList();
  renderAssistDetail();
}

// Notes used to be one big scratchpad string. They're now a list of individually
// addable/editable/completable items, like the suggestions list next to them —
// this reads any task, migrated or not, so old data keeps working until it's touched.
function noteItems(task) {
  if (task.noteItems) return task.noteItems;
  if (task.scratchpad && task.scratchpad.trim()) {
    return [{
      id: "legacy", text: task.scratchpad, done: false,
      created: task.scratchpadUpdated || task.created, updated: task.scratchpadUpdated || task.created,
    }];
  }
  return [];
}

function newNoteId() {
  return "n-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Every note write also drops the legacy scratchpad fields, so a task migrates to the
// new shape the first time anyone touches its notes — no separate migration step needed.
async function saveNoteItems(task, newItems, message) {
  assertLoaded(task._repo);
  const repo = repoFor(task._repo);
  const updated = state.tasks
    .filter((t) => t._repo === task._repo)
    .map((t) => {
      const stripped = stripRepo(t);
      if (t.id !== task.id) return stripped;
      const { scratchpad, scratchpadUpdated, ...rest } = stripped;
      return { ...rest, noteItems: newItems };
    });
  await saveTasks(repo, updated, message);
  task.noteItems = newItems;
  delete task.scratchpad;
  delete task.scratchpadUpdated;
}

function renderAssistDetail() {
  const container = el("#assist-detail");
  const task = assistTasks().find((t) => taskKey(t) === state.selectedAssistKey);
  if (!task) {
    container.innerHTML = assistTasks().length
      ? `<div class="empty-state">Pick a task on the left to see what an AI assistant has worked out and to jot down your own thinking.</div>`
      : `<div class="empty-state">Nothing here yet. Go to the Active tab and tap ✦ on a task you want help with — it'll show up here with the agent's findings.</div>`;
    return;
  }
  const suggestions = task.suggestions || [];
  const items = noteItems(task);
  const cNotes = claudeNoteItems(task);

  container.innerHTML = `
    <div class="assist-head">
      <div class="assist-head-row">
        <div class="assist-head-top">
          <button class="check" aria-label="Complete task">
            <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
          </button>
          <h2 class="assist-title" title="Double-click to rename">${esc(task.title)}</h2>
        </div>
        <div class="assist-head-icons">
          ${visToggleButtonHtml(task._repo)}
          <button class="delete-toggle" aria-label="Delete task">🗑</button>
        </div>
      </div>
      <div class="assist-meta">
        ${esc(task.category)} · ${visTagHtml(task._repo)} · added ${esc(task.created || "—")}
        <button class="assist-stop-btn" type="button">Stop assistance</button>
      </div>
    </div>

    <div class="assist-section">
      <h3>✦ Agent suggestions${suggestions.length ? ` <span class="count">${suggestions.length}</span>` : ""}</h3>
      ${suggestions.length
        ? `<ul class="suggestion-list">${suggestions.map((s, i) => `
            <li>
              <div class="suggestion-main">
                <div class="suggestion-text">${linkify(suggestionText(s))}</div>
                ${authorTagHtml(suggestionAuthor(s))}
              </div>
              <button class="suggestion-add" data-i="${i}" type="button" title="Copy this into your notes as its own item">→ notes</button>
            </li>`).join("")}</ul>`
        : `<div class="assist-hint">Nothing yet. Mention this task to an AI assistant in a chat and it can leave findings, next steps or subtasks here for you to come back to.</div>`}
    </div>

    <div class="assist-section">
      <h3>🤖 Agent notes${cNotes.length ? ` <span class="count">${cNotes.length}</span>` : ""}</h3>
      ${cNotes.length
        ? `<ul class="note-list" id="claude-note-list">${cNotes.map(claudeNoteItemHtml).join("")}</ul>`
        : `<div class="assist-hint">Nothing here yet. When an AI assistant actually does something on this task (not just research), it records it here — tick the box once you've seen it.</div>`}
    </div>

    <div class="assist-section">
      <h3>✎ Your notes${items.length ? ` <span class="count">${items.length}</span>` : ""}</h3>
      ${items.length ? `<ul class="note-list" id="note-list">${items.map(noteItemHtml).join("")}</ul>` : ""}
      ${items.length === 0 ? `<div class="assist-hint">No notes yet — add one below. Ideas, plans, links, anything you want to remember about this task.</div>` : ""}
      <form id="add-note-form" class="add-note-form">
        <input id="add-note-input" type="text" placeholder="Add a note… (paste an image too)" autocomplete="off" />
        <input id="add-note-image" type="file" accept="image/*,application/pdf" title="Attach a photo or PDF (optional) — or just paste an image into the text field" />
        <span class="add-note-attachment-preview" id="add-note-preview"></span>
        <button type="submit">Add</button>
      </form>
      <span class="assist-status" id="assist-status"></span>
    </div>
  `;

  setupPasteImage(el("#add-note-input"), el("#add-note-image"), el("#assist-status"));
  setupAttachmentPreview(el("#add-note-image"), el("#add-note-preview"));

  container.querySelector(".check").addEventListener("click", () => completeTask(task));
  container.querySelector(".vis-toggle").addEventListener("click", (e) => toggleVisibility(task, e.currentTarget));
  container.querySelector(".delete-toggle").addEventListener("click", () => deleteTask(task));
  container.querySelector(".assist-stop-btn").addEventListener("click", (e) => toggleAssist(task, e.currentTarget));
  const assistTitleEl = container.querySelector(".assist-title");
  assistTitleEl.addEventListener("dblclick", () => {
    renameTaskInline(task, assistTitleEl, {
      inputClassName: "assist-title-edit",
      onDone: () => {
        renderAssistList();
        renderAssistDetail();
        renderActive();
      },
    });
  });

  const noteList = el("#note-list");
  if (noteList) {
    noteList.addEventListener("click", (e) => {
      const li = e.target.closest(".note-item");
      if (!li) return;
      const id = li.dataset.id;
      const note = noteItems(task).find((n) => n.id === id);
      if (!note) return;
      if (e.target.closest(".note-check")) toggleNoteDone(task, id);
      else if (e.target.closest(".note-edit")) enterNoteEditMode(task, li, note);
      else if (e.target.closest(".note-delete")) deleteNoteItem(task, id, li);
    });
  }

  const claudeNoteList = el("#claude-note-list");
  if (claudeNoteList) {
    claudeNoteList.addEventListener("click", (e) => {
      const li = e.target.closest(".note-item");
      if (!li) return;
      const id = li.dataset.id;
      if (e.target.closest(".note-check")) toggleClaudeNoteDone(task, id);
      else if (e.target.closest(".note-delete")) deleteClaudeNoteItem(task, id, li);
    });
  }

  el("#add-note-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = el("#add-note-input");
    const imageInput = el("#add-note-image");
    const text = input.value.trim();
    const file = imageInput.files[0];
    if (!text || !requireToken()) return;
    const now = new Date().toISOString();
    const noteId = newNoteId();
    const newItems = [...noteItems(task), { id: noteId, text, done: false, created: now, updated: now }];
    setAssistStatus("Saving…", "");
    try {
      // Note text saves independently of the photo — a failed image upload should
      // never be able to cost you the words you already wrote (same reasoning as
      // the completion-note dialog's image handling).
      await saveNoteItems(task, newItems, `Add note: ${task.title}`);
      input.value = "";
      renderAssistList();
      renderAssistDetail();

      if (file) {
        try {
          const attachment = await uploadNoteAttachment(task, noteId, file);
          const withAttachment = noteItems(task).map((n) => (n.id === noteId ? { ...n, ...attachment } : n));
          await saveNoteItems(task, withAttachment, `Add attachment for note: ${task.title}`);
          renderAssistList();
          renderAssistDetail();
        } catch (imgErr) {
          alert(`Your note saved, but the attachment didn't upload: ${imgErr.message}\n\nThe note itself is safe.`);
        }
      }
    } catch (err) {
      setAssistStatus(`Couldn't save: ${err.message}`, "error");
    }
  });

  container.querySelectorAll(".suggestion-add").forEach((addBtn) => {
    addBtn.addEventListener("click", async () => {
      if (!requireToken()) return;
      const text = suggestionText(suggestions[Number(addBtn.dataset.i)]);
      const now = new Date().toISOString();
      const newItems = [...noteItems(task), { id: newNoteId(), text, done: false, created: now, updated: now }];
      try {
        await saveNoteItems(task, newItems, `Add note from suggestion: ${task.title}`);
        renderAssistList();
        renderAssistDetail();
      } catch (err) {
        alert(`Couldn't save note: ${err.message}`);
      }
    });
  });
}

// Claude's own record of what it actually did on a task (as opposed to research
// findings in `suggestions`, or the user's own thinking in `noteItems`) — a separate
// checkable list so ticking "seen this" never gets mixed up with the user's own
// to-do checkboxes. Claude only ever adds here; the user is the only one who ticks.
function claudeNoteItems(task) {
  return task.claudeNotes || [];
}

async function saveClaudeNotes(task, newItems, message) {
  assertLoaded(task._repo);
  const repo = repoFor(task._repo);
  const updated = state.tasks
    .filter((t) => t._repo === task._repo)
    .map((t) => (t.id === task.id ? { ...stripRepo(t), claudeNotes: newItems } : stripRepo(t)));
  await saveTasks(repo, updated, message);
  task.claudeNotes = newItems;
}

function claudeNoteItemHtml(n) {
  return `
    <li class="note-item${n.done ? " done" : ""}" data-id="${esc(n.id)}">
      <button class="note-check" aria-label="${n.done ? "Mark not seen" : "Mark seen"}" title="${n.done ? "Mark not seen" : "Mark seen"}">${n.done ? "✓" : ""}</button>
      <div class="note-body">
        <div class="note-text">${linkify(n.text)}</div>
        ${noteAttachmentHtml(n)}
        <div class="note-time">${formatWhen(n.updated || n.created)}${n.author ? ` · ${esc(n.author)}` : ""}</div>
      </div>
      <div class="note-actions">
        <button class="note-delete" aria-label="Delete note" title="Delete">🗑</button>
      </div>
    </li>`;
}

async function toggleClaudeNoteDone(task, id) {
  if (!requireToken()) return;
  const now = new Date().toISOString();
  const items = claudeNoteItems(task).map((n) => (n.id === id ? { ...n, done: !n.done, updated: now } : n));
  try {
    await saveClaudeNotes(task, items, `Check off Claude's note: ${task.title}`);
    renderAssistDetail();
    renderActive();
  } catch (err) {
    alert(`Couldn't update note: ${err.message}`);
  }
}

async function deleteClaudeNoteItem(task, id, liEl) {
  if (!requireToken()) return;
  try {
    assertLoaded(task._repo);
  } catch (err) {
    alert(err.message);
    return;
  }
  const prevItems = claudeNoteItems(task);
  liEl.classList.add("completing");
  const optimistic = prevItems.filter((n) => n.id !== id);
  task.claudeNotes = optimistic;
  renderActive();
  setTimeout(() => liEl.remove(), 300);

  let undone = false;
  showToast({
    message: "Deleted agent note",
    actionLabel: "Undo",
    duration: DELETE_UNDO_MS,
    onAction: () => {
      undone = true;
      task.claudeNotes = prevItems;
      renderAssistDetail();
      renderActive();
    },
  });

  setTimeout(async () => {
    if (undone) return;
    try {
      await saveClaudeNotes(task, optimistic, `Delete Claude's note: ${task.title}`);
    } catch (err) {
      task.claudeNotes = prevItems;
      renderAssistDetail();
      renderActive();
      alert(`Couldn't delete note: ${err.message}. It's back.`);
    }
  }, DELETE_UNDO_MS + 300);
}

function noteItemHtml(n) {
  return `
    <li class="note-item${n.done ? " done" : ""}" data-id="${esc(n.id)}">
      <button class="note-check" aria-label="${n.done ? "Mark not done" : "Mark done"}" title="${n.done ? "Mark not done" : "Mark done"}">${n.done ? "✓" : ""}</button>
      <div class="note-body">
        <div class="note-text">${linkify(n.text)}</div>
        ${noteAttachmentHtml(n)}
        <div class="note-time">${formatWhen(n.updated || n.created)}</div>
      </div>
      <div class="note-actions">
        <button class="note-edit" aria-label="Edit note" title="Edit">✎</button>
        <button class="note-delete" aria-label="Delete note" title="Delete">🗑</button>
      </div>
    </li>`;
}

function enterNoteEditMode(task, li, note) {
  li.innerHTML = `
    <div class="note-edit-row">
      <textarea class="note-edit-input">${esc(note.text)}</textarea>
      <div class="note-edit-actions">
        <button type="button" class="note-cancel">Cancel</button>
        <button type="button" class="note-save">Save</button>
      </div>
    </div>
  `;
  const textarea = li.querySelector(".note-edit-input");
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  const save = () => editNoteItem(task, note.id, textarea.value);
  const cancel = () => { renderAssistDetail(); renderActive(); };
  li.querySelector(".note-cancel").addEventListener("click", cancel);
  li.querySelector(".note-save").addEventListener("click", save);
  textarea.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
  });
}

async function editNoteItem(task, id, newText) {
  if (!requireToken()) return;
  const trimmed = newText.trim();
  if (!trimmed) return;
  const now = new Date().toISOString();
  const items = noteItems(task).map((n) => (n.id === id ? { ...n, text: trimmed, updated: now } : n));
  try {
    await saveNoteItems(task, items, `Edit note: ${task.title}`);
    renderAssistList();
    renderAssistDetail();
    renderActive();
  } catch (err) {
    alert(`Couldn't save note: ${err.message}`);
    renderAssistDetail();
    renderActive();
  }
}

async function toggleNoteDone(task, id) {
  if (!requireToken()) return;
  const now = new Date().toISOString();
  const items = noteItems(task).map((n) => (n.id === id ? { ...n, done: !n.done, updated: now } : n));
  try {
    await saveNoteItems(task, items, `Update note: ${task.title}`);
    renderAssistDetail();
    renderActive();
  } catch (err) {
    alert(`Couldn't update note: ${err.message}`);
  }
}

// Same instant + undo pattern as everywhere else deletion happens in this app.
async function deleteNoteItem(task, id, liEl) {
  if (!requireToken()) return;
  try {
    assertLoaded(task._repo);
  } catch (err) {
    alert(err.message);
    return;
  }
  const prevItems = noteItems(task);
  liEl.classList.add("completing");
  const optimistic = prevItems.filter((n) => n.id !== id);
  task.noteItems = optimistic;
  renderAssistList();
  renderActive();
  setTimeout(() => liEl.remove(), 300);

  let undone = false;
  showToast({
    message: "Deleted note",
    actionLabel: "Undo",
    duration: DELETE_UNDO_MS,
    onAction: () => {
      undone = true;
      task.noteItems = prevItems;
      renderAssistList();
      renderAssistDetail();
      renderActive();
    },
  });

  setTimeout(async () => {
    if (undone) return;
    try {
      await saveNoteItems(task, optimistic, `Delete note: ${task.title}`);
    } catch (err) {
      task.noteItems = prevItems;
      renderAssistList();
      renderAssistDetail();
      renderActive();
      alert(`Couldn't delete note: ${err.message}. It's back.`);
    }
  }, DELETE_UNDO_MS + 300);
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
    el("#categories-menu-btn").classList.toggle("hidden", tab !== "active");
    if (tab !== "active") closeCategoriesSheet();
    if (tab === "assist") {
      renderAssistList();
      renderAssistDetail();
    }
  });
});

// ---------- Active tab: hamburger sheet + detail back button ----------
el("#categories-menu-btn").addEventListener("click", openCategoriesSheet);
el("#active-backdrop").addEventListener("click", closeCategoriesSheet);
el("#active-detail-back").addEventListener("click", closeActiveDetail);

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
