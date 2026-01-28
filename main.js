/**
 * Minesweeper (Vanilla JS)
 * - Left click: open
 * - Right click: toggle flag -> question -> none
 * - Double click on opened numbered cell: chord open neighbors if flags match number
 * - First click is always safe (mines are placed after first click)
 */

const boardEl = document.getElementById("board");
const presetEl = document.getElementById("preset");
const wEl = document.getElementById("w");
const hEl = document.getElementById("h");
const mEl = document.getElementById("m");
const newBtn = document.getElementById("newGame");

const timerEl = document.getElementById("timer");
const flagsEl = document.getElementById("flags");
const minesEl = document.getElementById("mines");
const messageEl = document.getElementById("message");

const hintBtn = document.getElementById("hintBtn");
const bestEl = document.getElementById("best");

const modalEl = document.getElementById("modal");
const showScoresBtn = document.getElementById("showScores");
const closeModalBtn = document.getElementById("closeModal");
const closeModalBtn2 = document.getElementById("closeModal2");
const clearScoresBtn = document.getElementById("clearScores");
const lbEl = document.getElementById("leaderboard");
const lbMetaEl = document.getElementById("lbMeta");

const toastEl = document.getElementById("toast");


const PRESETS = {
  easy:   { w: 9,  h: 9,  m: 10 },
  medium: { w: 16, h: 16, m: 40 },
  hard:   { w: 30, h: 16, m: 99 },
};

let state = null;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function setMessage(text, kind = "info") {
  messageEl.textContent = text || "";
  messageEl.style.borderColor =
    kind === "win" ? "rgba(76,217,100,0.35)"
  : kind === "lose" ? "rgba(255,107,107,0.35)"
  : "rgba(255,255,255,0.10)";
  messageEl.style.background =
    kind === "win" ? "rgba(76,217,100,0.12)"
  : kind === "lose" ? "rgba(255,107,107,0.12)"
  : "rgba(255,255,255,0.06)";
messageEl.classList.remove("winGlow", "loseGlow");
if (kind === "win") messageEl.classList.add("winGlow");
if (kind === "lose") messageEl.classList.add("loseGlow");

}

function initGame(cfg) {
  const w = clamp(cfg.w, 5, 60);
  const h = clamp(cfg.h, 5, 40);
  const maxMines = w * h - 1; // keep at least 1 safe cell
  const m = clamp(cfg.m, 1, maxMines);

  state = {
    w, h, m,
    grid: [],            // cells
    started: false,      // mines placed?
    over: false,
    won: false,
    openedCount: 0,
    flags: 0,
    startTime: 0,
    timerId: null,
    hintsUsed: 0,
    hintMax: 3,
  };

  // build cell model
  state.grid = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => ({
      x, y,
      mine: false,
      open: false,
      flag: 0,      // 0 none, 1 flag, 2 question
      num: 0,       // adjacent mines
      el: null,
    }))
  );

  // render
  renderBoard();
  updateStatus();
  stopTimer();
  timerEl.textContent = "0";
  setMessage("첫 클릭은 안전해요. 시작해보자!", "info");
    updateHintUI();
}

function renderBoard() {
  boardEl.innerHTML = "";
  boardEl.style.gridTemplateColumns = `repeat(${state.w}, var(--cell))`;

  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < state.w; x++) {
      const cell = state.grid[y][x];
      const div = document.createElement("div");
      div.className = "cell";
      div.setAttribute("role", "button");
      div.setAttribute("aria-label", `cell ${x + 1}, ${y + 1}`);
      div.dataset.x = String(x);
      div.dataset.y = String(y);

      // events
      div.addEventListener("click", (e) => {
        e.preventDefault();
        onLeftClick(x, y);
      });

      div.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        onRightClick(x, y);
      });

      div.addEventListener("dblclick", (e) => {
        e.preventDefault();
        onChord(x, y);
      });

      cell.el = div;
      boardEl.appendChild(div);
      paintCell(cell);
    }
  }
}

function updateStatus() {
  flagsEl.textContent = String(state.flags);
  minesEl.textContent = String(state.m);
}

function startTimerIfNeeded() {
  if (state.timerId) return;
  state.startTime = Date.now();
  state.timerId = setInterval(() => {
    const sec = Math.floor((Date.now() - state.startTime) / 1000);
    timerEl.textContent = String(sec);
  }, 250);
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function neighbors(x, y) {
  const res = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < state.w && ny >= 0 && ny < state.h) {
        res.push(state.grid[ny][nx]);
      }
    }
  }
  return res;
}

function placeMinesAvoiding(safeX, safeY) {
  // Avoid: first clicked cell AND its neighbors (classic feel)
  const forbidden = new Set();
  forbidden.add(`${safeX},${safeY}`);
  for (const nb of neighbors(safeX, safeY)) {
    forbidden.add(`${nb.x},${nb.y}`);
  }

  const candidates = [];
  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < state.w; x++) {
      const key = `${x},${y}`;
      if (!forbidden.has(key)) candidates.push({ x, y });
    }
  }

  // If board too small, fallback to only avoid first cell
  if (candidates.length < state.m) {
    candidates.length = 0;
    for (let y = 0; y < state.h; y++) {
      for (let x = 0; x < state.w; x++) {
        if (x === safeX && y === safeY) continue;
        candidates.push({ x, y });
      }
    }
  }

  shuffle(candidates);

  for (let i = 0; i < state.m; i++) {
    const { x, y } = candidates[i];
    state.grid[y][x].mine = true;
  }

  // compute numbers
  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < state.w; x++) {
      const cell = state.grid[y][x];
      if (cell.mine) {
        cell.num = 0;
        continue;
      }
      const n = neighbors(x, y).reduce((acc, c) => acc + (c.mine ? 1 : 0), 0);
      cell.num = n;
    }
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function boardKey() {
  return `ms_lb_${state.w}x${state.h}_${state.m}`;
}

function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(boardKey());
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveLeaderboard(entries) {
  localStorage.setItem(boardKey(), JSON.stringify(entries));
}

function renderLeaderboard() {
  const list = loadLeaderboard();
  lbMetaEl.textContent = `${state.w}×${state.h}, 💣 ${state.m} (상위 10개 저장)`;

  lbEl.innerHTML = "";
  if (list.length === 0) {
    const li = document.createElement("li");
    li.textContent = "아직 기록이 없어요. 승리해서 1등 해봐!";
    li.style.justifyContent = "center";
    lbEl.appendChild(li);
    bestEl.textContent = "--";
    return;
  }

  // Best 표시
  bestEl.textContent = `${list[0].time}s (${list[0].name})`;

  // 목록 표시
  const stats = loadStats();

  for (const e of list) {
    const li = document.createElement("li");
    const left = document.createElement("div");
    const right = document.createElement("div");

    const winCount = stats[e.name] || 0;

    // ✅ 닉네임 | 성공기록(누적성공 + 타임) 나란히
    left.innerHTML = `
      <div class="lb-name">${escapeHtml(e.name)} <span style="opacity:.8; font-weight:700;">| 성공 ${winCount}회</span></div>
      <div class="lb-date">${new Date(e.ts).toLocaleString()}</div>
    `;

    right.innerHTML = `<div class="lb-time">SUCCESS · ${e.time}s</div>`;

    li.appendChild(left);
    li.appendChild(right);
    lbEl.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function addWinRecord(seconds) {
  const name = prompt("승리! 기록에 남길 이름을 입력해줘 (예: Soyeon)", "Player") || "Player";
  const cleanName = name.trim().slice(0, 20) || "Player";

  // 누적 승리 횟수 업데이트
  const winCount = bumpWinCount(cleanName);

  // TOP10 (최고기록) 저장
  const entry = { name: cleanName, time: seconds, ts: Date.now() };

  const list = loadLeaderboard();
  list.push(entry);
  list.sort((a, b) => a.time - b.time || a.ts - b.ts);
  const top10 = list.slice(0, 10);
  saveLeaderboard(top10);

  renderLeaderboard();
  toast(`🏆 ${cleanName} 누적 성공 ${winCount}회! (+${seconds}s)`);
}


function paintCell(cell) {
  const el = cell.el;
  el.className = "cell";
  el.textContent = "";

  if (cell.open) el.classList.add("open");
  if (cell.mine) el.classList.add("mine");
  if (cell.flag === 1) el.classList.add("flag");
  if (cell.flag === 2) el.classList.add("qmark");

  if (cell.open) {
    if (cell.mine) {
      el.textContent = "💣";
    } else if (cell.num > 0) {
      el.textContent = String(cell.num);
      el.classList.add(`num-${cell.num}`);
    }
  }
}

function openCell(x, y) {
  const cell = state.grid[y][x];
  if (cell.open || cell.flag === 1) return;

  // ✅ 물음표는 열릴 때 자동 해제
  if (cell.flag === 2) {
    cell.flag = 0;
  }

  cell.open = true;
  state.openedCount++;
  paintCell(cell);

  if (cell.mine) return;

  // flood fill for 0
  if (cell.num === 0) {
    const q = [cell];
    const seen = new Set([`${cell.x},${cell.y}`]);

    while (q.length) {
      const cur = q.shift();
      for (const nb of neighbors(cur.x, cur.y)) {
        const key = `${nb.x},${nb.y}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (nb.open || nb.flag === 1) continue;

        // ✅ flood-fill 중에도 물음표 제거
        if (nb.flag === 2) nb.flag = 0;

        nb.open = true;
        state.openedCount++;
        paintCell(nb);

        if (!nb.mine && nb.num === 0) q.push(nb);
      }
    }
  }
}


function revealAllMines() {
  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < state.w; x++) {
      const c = state.grid[y][x];
      if (c.mine) {
        c.open = true;
        paintCell(c);
      }
    }
  }
}

function checkWin() {
  const totalSafe = state.w * state.h - state.m;
  if (state.openedCount >= totalSafe && !state.over) {
    state.over = true;
    state.won = true;
    stopTimer();

    const sec = Math.floor((Date.now() - state.startTime) / 1000);
    timerEl.textContent = String(sec);

    setMessage("🎉 승리! 지뢰를 모두 피했어!", "win");
    confettiPop();

    addWinRecord(sec);
    updateHintUI();
  }
}

function onLeftClick(x, y) {
  if (state.over) return;
  const cell = state.grid[y][x];

  // first click: place mines
  if (!state.started) {
    state.started = true;
    placeMinesAvoiding(x, y);
    startTimerIfNeeded();
    // repaint all (numbers/mines computed)
    forEachCell(paintCell);

    setMessage("😊 잘하고 있어요. 힘내서 완주해봅시다!", "info");
  }

  if (cell.flag === 1) return;

  openCell(x, y);

  if (cell.mine) {
    state.over = true;
    state.won = false;
    stopTimer();
    revealAllMines();
    setMessage("💥 게임 오버! 지뢰를 밟았어.", "lose");
    return;
  }

  checkWin();
}

function onRightClick(x, y) {
  if (state.over) return;
  const cell = state.grid[y][x];
  if (cell.open) return;

  // cycle: none -> flag -> question -> none
  if (cell.flag === 0) {
    cell.flag = 1;
    state.flags++;
  } else if (cell.flag === 1) {
    cell.flag = 2;
    state.flags--;
  } else {
    cell.flag = 0;
  }

  updateStatus();
  paintCell(cell);
}

function onChord(x, y) {
  if (state.over || !state.started) return;
  const cell = state.grid[y][x];
  if (!cell.open || cell.mine || cell.num === 0) return;

  const nbs = neighbors(x, y);
  const flagCount = nbs.reduce((acc, c) => acc + (c.flag === 1 ? 1 : 0), 0);

  if (flagCount !== cell.num) return;

  // open all non-flag neighbors
  for (const nb of nbs) {
    if (nb.flag === 1 || nb.open) continue;
    openCell(nb.x, nb.y);
    if (nb.mine) {
      state.over = true;
      stopTimer();
      revealAllMines();
      setMessage("💥 게임 오버! (코드 열기 중 지뢰)", "lose");
      
      return;
    }
  }

  checkWin();
}

function forEachCell(fn) {
  for (let y = 0; y < state.h; y++) {
    for (let x = 0; x < state.w; x++) fn(state.grid[y][x]);
  }
}

function applyPresetUI() {
  const val = presetEl.value;
  const isCustom = val === "custom";
  document.querySelectorAll(".custom").forEach(el => {
    el.style.display = isCustom ? "inline-flex" : "none";
  });

  if (!isCustom) {
    wEl.value = PRESETS[val].w;
    hEl.value = PRESETS[val].h;
    mEl.value = PRESETS[val].m;
  }
}

function readConfigFromUI() {
  return {
    w: parseInt(wEl.value, 10),
    h: parseInt(hEl.value, 10),
    m: parseInt(mEl.value, 10),
  };
}

// UI bindings
presetEl.addEventListener("change", () => {
  applyPresetUI();
});

newBtn.addEventListener("click", () => {
  const cfg = readConfigFromUI();
  initGame(cfg);
});

// start
applyPresetUI();
initGame(readConfigFromUI());
hintBtn.addEventListener("click", () => {
  giveHint();
});

showScoresBtn.addEventListener("click", () => {
  renderLeaderboard();
  openModal();
});

closeModalBtn.addEventListener("click", closeModal);
closeModalBtn2.addEventListener("click", closeModal);

// 모달 바깥 클릭 시 닫기
modalEl.addEventListener("click", (e) => {
  if (e.target === modalEl) closeModal();
});

// ESC로 닫기
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

clearScoresBtn.addEventListener("click", () => {
  localStorage.removeItem(boardKey());
  localStorage.removeItem(statsKey());
  renderLeaderboard();
  toast("🧹 이 난이도 기록을 초기화했어!");
});


function confettiPop(count = 28) {
  const wrap = document.createElement("div");
  wrap.className = "confetti";
  for (let i = 0; i < count; i++) {
    const p = document.createElement("i");
    p.style.left = `${Math.random() * 100}%`;
    p.style.animationDuration = `${900 + Math.random() * 900}ms`;
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    // 색상 지정 금지 규칙은 "차트"에만 해당이라 여기선 괜찮지만, 원하면 랜덤 제거 가능
    const hue = Math.floor(Math.random() * 360);
    p.style.background = `hsl(${hue} 85% 65%)`;
    wrap.appendChild(p);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 1400);
}


function giveHint() {
  if (!state || state.over) return;

  if (state.hintsUsed >= state.hintMax) {
    toast("💡 힌트는 최대 3번까지야!");
    updateHintUI();
    return;
  }

  // 시작 전이면 랜덤 첫 클릭 유도(첫 클릭 안전 규칙 유지)
  if (!state.started) {
    state.hintsUsed++;
    updateHintUI();

    const x = Math.floor(Math.random() * state.w);
    const y = Math.floor(Math.random() * state.h);
    onLeftClick(x, y);
    toast("💡 힌트로 시작! (첫 클릭 안전)");
    return;
  }

  // 1) ❓(물음표) 안전칸 우선
const qmarkSafe = [];
const safe = [];

for (let y = 0; y < state.h; y++) {
  for (let x = 0; x < state.w; x++) {
    const c = state.grid[y][x];
    if (c.open) continue;
    if (c.flag === 1) continue;   // 🚩는 제외
    if (c.mine) continue;         // 힌트는 안전칸만

    if (c.flag === 2) qmarkSafe.push(c); // ❓ 우선
    else safe.push(c);
  }
}

// 우선순위: ❓ -> 일반 안전칸
const candidates = qmarkSafe.length ? qmarkSafe : safe;

if (candidates.length === 0) return;


  state.hintsUsed++;
  updateHintUI();

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  openCell(pick.x, pick.y);

  // 힌트 플래시 효과
  pick.el.classList.add("hintFlash");
  setTimeout(() => pick.el.classList.remove("hintFlash"), 500);

  checkWin();
  toast(`💡 안전한 칸 1개 오픈! (남은 힌트 ${state.hintMax - state.hintsUsed})`);
}



function toast(msg, ms = 1100) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.add("hidden"), ms);
}

function openModal() {
  modalEl.classList.remove("hidden");
  modalEl.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modalEl.classList.add("hidden");
  modalEl.setAttribute("aria-hidden", "true");
}

function updateHintUI() {
  if (!state) return;
  const remain = state.hintMax - state.hintsUsed;
  hintBtn.textContent = `Hint (${remain})`;
  hintBtn.disabled = state.over || remain <= 0;
  hintBtn.style.opacity = hintBtn.disabled ? "0.55" : "1";
  hintBtn.style.cursor = hintBtn.disabled ? "not-allowed" : "pointer";
}

function statsKey() {
  return `ms_stats_${state.w}x${state.h}_${state.m}`;
}

function loadStats() {
  try {
    const raw = localStorage.getItem(statsKey());
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function saveStats(stats) {
  localStorage.setItem(statsKey(), JSON.stringify(stats));
}

function bumpWinCount(name) {
  const stats = loadStats();
  const key = name.trim().slice(0, 20) || "Player";
  stats[key] = (stats[key] || 0) + 1;
  saveStats(stats);
  return stats[key];
}
