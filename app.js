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

function renderCategoryOptions() {
  const cats = [...new Set(state.tasks.map((t) => t.category))].sort();
  el("#category-options").innerHTML = cats.map((c) => `<option value="${c}"></option>`).join("");
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
      <div class="task-title">${task.title}</div>
      ${task.notes ? `<div class="task-meta">${task.notes}</div>` : ""}
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
  el("#add-visibility").textContent = isPublic ? "🌐 Public" : "🔒 Private";
  el("#add-visibility").title = isPublic
    ? "Visible to anyone who finds the site — click to make this task private"
    : "Stored in your private repo, needs your token to view — click to make it public";
}
renderVisibilityToggle();

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
        <span class="node-title">${visIcon} ${entry.title}</span>
        <span class="node-date">${entry.completedDate}</span>
        ${entry.note ? `<div class="node-note">${entry.note}</div>` : ""}
        ${(entry.images || []).map((img) => `<img src="${img}" alt="">`).join("")}
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
      btn.textContent = `${task._repo === "private" ? "🔒" : "🌐"} ${task.title}`;
      btn.addEventListener("click", () => {
        state.selectedAssistKey = taskKey(task);
        renderAssistList();
        renderAssistDetail();
      });
      container.appendChild(btn);
    });
  });
}

function renderAssistDetail() {
  const container = el("#assist-detail");
  const task = state.tasks.find((t) => taskKey(t) === state.selectedAssistKey);
  if (!task) {
    container.innerHTML = `<div class="empty-state">Select a task on the left to see suggestions and jot down notes.</div>`;
    return;
  }
  const suggestions = task.suggestions || [];
  container.innerHTML = `
    <h2>${task.title}</h2>
    <div class="assist-meta">${task.category} · ${task._repo === "private" ? "🔒 Private" : "🌐 Public"}</div>
    <div class="assist-section">
      <h3>Suggested actions</h3>
      ${suggestions.length
        ? `<ul class="suggestion-list">${suggestions.map((s) => `<li>${s}</li>`).join("")}</ul>`
        : `<div class="empty-state" style="padding:16px 0;">Ask Claude about this task — it can leave suggested next steps or subtasks here.</div>`}
    </div>
    <div class="assist-section">
      <h3>Notes &amp; thinking</h3>
      <textarea id="assist-scratchpad" placeholder="Ideas, plans, links, references — anything you (or Claude) want to remember about this task.">${task.scratchpad || ""}</textarea>
      <div class="assist-save-row">
        <span class="assist-saved-hint" id="assist-saved-hint">Saved</span>
        <button id="assist-save-btn" type="button">Save notes</button>
      </div>
    </div>
  `;
  el("#assist-save-btn").addEventListener("click", () => saveScratchpad(task));
}

async function saveScratchpad(task) {
  if (!requireToken()) return;
  const btn = el("#assist-save-btn");
  const hint = el("#assist-saved-hint");
  const value = el("#assist-scratchpad").value;
  btn.disabled = true;
  try {
    const repo = repoFor(task._repo);
    const updated = state.tasks
      .filter((t) => t._repo === task._repo)
      .map((t) => stripRepo(t.id === task.id ? { ...t, scratchpad: value } : t));
    await saveTasks(repo, updated, `Update notes: ${task.title}`);
    task.scratchpad = value;
    hint.classList.add("show");
    setTimeout(() => hint.classList.remove("show"), 1500);
  } catch (err) {
    alert(`Couldn't save notes: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
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
