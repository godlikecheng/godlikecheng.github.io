"use strict";
/* ============================================================
 * main.js — 键盘输入（双人）、UI（HUD / 覆盖层 / 按钮 / 配置）、
 *           配置持久化与最高分、主循环与启动
 * 依赖：以上全部模块
 * ============================================================ */

/* ================= 输入（P1：WASD+空格；P2：方向键+J） ================= */
const keys = [
  { dirs: [], fire: false },
  { dirs: [], fire: false },
];
const KEYMAP1 = { KeyW:0, KeyD:1, KeyS:2, KeyA:3 };
const KEYMAP2 = { ArrowUp:0, ArrowRight:1, ArrowDown:2, ArrowLeft:3 };
const FIRE_KEYS = { Space: 0, KeyJ: 1 };

window.addEventListener("keydown", e => {
  Sfx.init();
  if (e.code in KEYMAP1) {
    e.preventDefault();
    if (!keys[0].dirs.includes(KEYMAP1[e.code])) keys[0].dirs.unshift(KEYMAP1[e.code]);
  } else if (e.code in KEYMAP2) {
    e.preventDefault();
    if (!keys[1].dirs.includes(KEYMAP2[e.code])) keys[1].dirs.unshift(KEYMAP2[e.code]);
  } else if (e.code in FIRE_KEYS) {
    e.preventDefault(); keys[FIRE_KEYS[e.code]].fire = true;
  } else if (e.code === "KeyP") {
    togglePause();
  } else if (e.code === "Enter") {
    if (state === "idle" || state === "over") newGame();
    else if (state === "levelclear") goNextLevel(); // 结算画面按回车立即进入下一关
  }
});
window.addEventListener("keyup", e => {
  if (e.code in KEYMAP1) keys[0].dirs = keys[0].dirs.filter(d => d !== KEYMAP1[e.code]);
  else if (e.code in KEYMAP2) keys[1].dirs = keys[1].dirs.filter(d => d !== KEYMAP2[e.code]);
  else if (e.code in FIRE_KEYS) keys[FIRE_KEYS[e.code]].fire = false;
});

/* ================= 配置持久化 ================= */
/* 起始关卡可选上限：不超过已解锁数，也不超过关卡总数 */
function maxStartLevel() {
  return Math.min(Math.max(unlocked, 1), CLASSIC_LEVELS.length);
}
function readConfig() {
  return {
    mode: +el("cfg-mode").value,
    difficulty: +el("cfg-difficulty").value,
    lives: clamp(+el("cfg-lives").value || 2, 1, 9),
    enemies: clamp(+el("cfg-enemies").value || 20, 5, 40),
    maxField: +el("cfg-maxfield").value,
    bgm: +el("cfg-bgm").value,
    start: clamp(+el("cfg-start").value || 1, 1, maxStartLevel()),
    sound: el("cfg-sound").checked,
    grid: el("cfg-grid").checked,
    custom: el("cfg-custom").checked,
  };
}
function saveConfig() {
  try { localStorage.setItem(CFG_KEY, JSON.stringify(config)); } catch(e){}
}
function loadConfigToUI() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(CFG_KEY)); } catch(e){}
  if (!saved) return;
  const set = (id, val) => { const n = el(id); if (n && val !== undefined && val !== null) { if (n.type === "checkbox") n.checked = !!val; else n.value = val; } };
  set("cfg-mode", saved.mode); set("cfg-difficulty", saved.difficulty);
  set("cfg-lives", saved.lives); set("cfg-enemies", saved.enemies);
  set("cfg-maxfield", saved.maxField); set("cfg-bgm", saved.bgm);
  set("cfg-start", clamp(saved.start || 1, 1, maxStartLevel()));
  set("cfg-sound", saved.sound); set("cfg-grid", saved.grid);
  set("cfg-custom", saved.custom);
}
function loadHiscore() {
  try { hiscore = +localStorage.getItem(HI_KEY) || 0; } catch(e){ hiscore = 0; }
}
function loadUnlocked() {
  try { unlocked = +localStorage.getItem(UNLOCK_KEY) || 1; } catch(e){ unlocked = 1; }
}
/* 加载已保存的自定义关卡数据（用于「自定义关卡」开关） */
function loadCustomMapData() {
  try {
    const raw = JSON.parse(localStorage.getItem(CUSTOM_KEY));
    if (Array.isArray(raw) && raw.length === 13 &&
        raw.every(r => typeof r === "string" && r.length === 13)) customRows = raw;
  } catch(e){}
}
/* 起始关卡下拉框：按解锁进度填充选项 */
function refreshLevelOptions() {
  const sel = el("cfg-start");
  const cur = +sel.value || 1;
  const cap = maxStartLevel();
  sel.innerHTML = "";
  for (let i = 1; i <= cap; i++) {
    const o = document.createElement("option");
    o.value = i; o.textContent = `第 ${i} 关`;
    sel.appendChild(o);
  }
  sel.value = clamp(cur, 1, cap);
}

/* ================= UI ================= */
function showOverlay(title, sub) {
  const ov = el("overlay");
  if (title === null) { ov.classList.add("hidden"); return; }
  ov.classList.remove("hidden");
  el("ov-title").textContent = title;
  el("ov-sub").innerHTML = sub || "";
}

/* 剩余敌人图标列（经典 HUD 样式：小坦克图标逐个熄灭） */
let lastEnemyIcons = -1;
function updateEnemyIcons() {
  const cnt = spawnQueue.length;
  if (cnt === lastEnemyIcons) return;
  lastEnemyIcons = cnt;
  const box = el("enemy-icons");
  box.innerHTML = "";
  for (let i = 0; i < cnt; i++) {
    const d = document.createElement("i");
    d.className = "eicon";
    box.appendChild(d);
  }
}

function updateUI() {
  el("hud-score").textContent = score;
  el("hud-hi").textContent = Math.max(hiscore, score);
  el("hud-level").textContent = level;
  el("hud-lives").textContent = Math.max(lives[0], 0);
  const duo = config && config.mode === 2;
  el("hud-lives2-k").style.display = duo ? "" : "none";
  el("hud-lives2").style.display = duo ? "" : "none";
  if (duo) el("hud-lives2").textContent = Math.max(lives[1], 0);
  el("hud-enemy").textContent = spawnQueue.length;
  el("hud-field").textContent = enemies.filter(e => e.hp > 0).length;
  updateEnemyIcons();
}

function togglePause() {
  if (state === "running") {
    state = "paused";
    Music.stop();
    Sfx.engine(false);
    Sfx.pause();
    showOverlay("已暂停", "按 P 或点击「继续」返回战场");
    el("btn-pause").textContent = "继续 (P)";
  } else if (state === "paused") {
    state = "running";
    Music.start();
    Sfx.pause();
    showOverlay(null);
    el("btn-pause").textContent = "暂停 (P)";
  }
}

el("btn-start").addEventListener("click", () => { Sfx.init(); newGame(); });
el("btn-restart").addEventListener("click", () => { Sfx.init(); newGame(); });
el("btn-pause").addEventListener("click", togglePause);
// 点击按钮后移除键盘焦点：否则游戏中按 Enter / 空格会触发聚焦按钮的默认点击（如误触「开始游戏」导致回到第一关）
document.querySelectorAll("button").forEach(b => b.addEventListener("click", () => b.blur()));
el("cfg-sound").addEventListener("change", e => { Sfx.enabled = e.target.checked; });
el("cfg-grid").addEventListener("change", e => { config.grid = e.target.checked; });
el("cfg-bgm").addEventListener("change", e => { config.bgm = +e.target.value; saveConfig(); });

/* ================= 主循环与启动 ================= */
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min((ts - lastTs) / 16.667 || 1, 3);
  lastTs = ts;
  if (state === "curtain") {                 // 开场幕布结束后正式开战
    curtainT += dt;
    if (curtainT >= CURTAIN_TOTAL) { state = "running"; Music.start(); }
  }
  if (state === "running") { update(dt); if (state === "running") updateUI(); }
  else Sfx.engine(false);                    // 非运行状态关掉引擎声
  if (state === "over" && goAnim) {          // GAME OVER 升起完毕后弹出结算
    goAnim.t += dt / 110;
    if (goAnim.t >= 1) { goAnim = null; showOverlay("游戏结束", overMsg); }
  }
  if (map.length) render();
}

loadUnlocked();
refreshLevelOptions();
loadConfigToUI();
config = readConfig();
Sfx.enabled = config.sound;
loadHiscore();
loadCustomMapData();
genMap();
updateUI();
requestAnimationFrame(loop);
