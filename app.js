const REPO = "sandstormveg/tasks";
const API = `https://api.github.com/repos/${REPO}/contents`;

const state = { tasks: [], history: [], pendingCompletion: null };

const el = (sel) => document.querySelector(sel);
const tokenKey = "tasks_gh_token";
const getToken = () => localStorage.getItem(tokenKey) || "";

// ---------- data loading ----------
async function loadData() {
  const [tasksRes, historyRes] = await Promise.all([
    fetch(`data/tasks.json?t=${Date.now()}`),
    fetch(`data/history.json?t=${Date.now()}`),
  ]);
  state.tasks = (await tasksRes.json()).tasks || [];
  state.history = (await historyRes.json()).entries || [];
  renderActive();
  renderTree();
}

// ---------- GitHub write-back ----------
async function ghGetFile(path) {
  const res = await fetch(`${API}/${path}`, {
    headers: { Authorization: `Bearer ${getToken()}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`Failed to read ${path}: ${res.status}`);
  const json = await res.json();
  const content = decodeURIComponent(escape(atob(json.content)));
  return { sha: json.sha, content };
}

async function ghPutFile(path, contentObj, sha, message) {
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(contentObj, null, 2) + "\n"))),
    sha,
  };
  const res = await fetch(`${API}/${path}`, {
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

async function ghPutImage(path, base64Data, message) {
  const res = await fetch(`${API}/${path}`, {
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

async function saveTasks(newTasks, message) {
  const current = await ghGetFile("data/tasks.json");
  await ghPutFile("data/tasks.json", { tasks: newTasks }, current.sha, message);
}

async function saveHistory(newEntries, message) {
  const current = await ghGetFile("data/history.json");
  await ghPutFile("data/history.json", { entries: newEntries }, current.sha, message);
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
    <div>
      <div class="task-title">${task.title}</div>
      ${task.notes ? `<div class="task-meta">${task.notes}</div>` : ""}
    </div>
  `;
  const btn = card.querySelector(".check");
  btn.addEventListener("click", (e) => openCompleteDialog(task, card, e));
  return card;
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
      await ghPutImage(imagePath, base64, `Add image for ${task.title}`);
    }

    const newTasks = state.tasks.filter((t) => t.id !== task.id);
    const entry = {
      id: task.id,
      title: task.title,
      category: task.category,
      completedDate: new Date().toISOString().slice(0, 10),
      note,
      images: imagePath ? [imagePath] : [],
    };
    const newHistory = [...state.history, entry];

    await saveTasks(newTasks, `Complete task: ${task.title}`);
    await saveHistory(newHistory, `Log history: ${task.title}`);

    state.tasks = newTasks;
    state.history = newHistory;
    setTimeout(() => renderActive(), 350);
    renderTree();
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
el("#add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!requireToken()) return;
  const title = el("#add-title").value.trim();
  const category = el("#add-category").value.trim();
  if (!title || !category) return;

  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now().toString(36);
  const task = { id, title, category, created: new Date().toISOString().slice(0, 10), notes: "" };
  const newTasks = [...state.tasks, task];

  try {
    await saveTasks(newTasks, `Add task: ${title}`);
    state.tasks = newTasks;
    renderActive();
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
      node.innerHTML = `
        <span class="node-title">${entry.title}</span>
        <span class="node-date">${entry.completedDate}</span>
        ${entry.note ? `<div class="node-note">${entry.note}</div>` : ""}
        ${(entry.images || []).map((img) => `<img src="${img}" alt="">`).join("")}
      `;
      branch.appendChild(node);
    });
    container.appendChild(branch);
  });
}

// ---------- tabs ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    el("#active-view").classList.toggle("hidden", btn.dataset.tab !== "active");
    el("#tree-view").classList.toggle("hidden", btn.dataset.tab !== "tree");
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
