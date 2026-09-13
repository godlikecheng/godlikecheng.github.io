"use strict";
/* ============================================================
 * editor.js — 关卡编辑器（13x13 网格绘制 / 试玩 / 保存 / 分享码）
 * 依赖：constants.js, map.js, game.js, main.js
 * 说明：对应 FC 原版的 CONSTRUCTION 模式；基地与出生点自动布置
 * ============================================================ */

const ED_TERRAINS = [
  { ch: ".", name: "空地", color: "#000000" },
  { ch: "#", name: "砖墙", color: "#b34700" },
  { ch: "@", name: "钢墙", color: "#9e9e9e" },
  { ch: "~", name: "水面", color: "#1c5bd8" },
  { ch: "%", name: "草丛", color: "#1d6b1f" },
  { ch: "i", name: "冰面", color: "#cfe8ff" },
];
const ED_CELL = 30;                       // 编辑器单元格像素（13 格 → 390px）
let edGrid = null, edSel = 1, edPainting = false, edErase = false;

function edInit() {
  if (edGrid) return;
  // 以经典第 1 关作为底稿
  edGrid = CLASSIC_LEVELS[0].map(r => r.split(""));
  // 调色板
  const pal = el("palette");
  ED_TERRAINS.forEach((t, i) => {
    const b = document.createElement("button");
    b.className = "pal" + (i === edSel ? " on" : "");
    b.textContent = t.name;
    b.style.borderBottom = `3px solid ${t.color}`;
    b.addEventListener("click", () => {
      edSel = i;
      pal.querySelectorAll(".pal").forEach((n, j) => n.classList.toggle("on", j === i));
    });
    pal.appendChild(b);
  });
  // 绘制事件：左键画 / 右键擦，按住拖动连刷
  const cv = el("ecv");
  cv.addEventListener("contextmenu", e => e.preventDefault());
  cv.addEventListener("mousedown", e => { e.preventDefault(); edErase = e.button === 2; edPainting = true; edPaint(e); });
  cv.addEventListener("mousemove", e => { if (edPainting) edPaint(e); });
  window.addEventListener("mouseup", () => { edPainting = false; });
  edDraw();
}

function edCell(e) {
  const r = el("ecv").getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / (r.width / 13));
  const y = Math.floor((e.clientY - r.top) / (r.height / 13));
  return (x < 0 || x > 12 || y < 0 || y > 12) ? null : [x, y];
}

function edPaint(e) {
  const c = edCell(e);
  if (!c) return;
  const t = ED_TERRAINS[edErase ? 0 : edSel].ch;
  if (edGrid[c[1]][c[0]] !== t) { edGrid[c[1]][c[0]] = t; edDraw(); }
}

function edDraw() {
  const c = el("ecv").getContext("2d");
  for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
    const t = ED_TERRAINS.find(t => t.ch === edGrid[y][x]) || ED_TERRAINS[0];
    c.fillStyle = t.color;
    c.fillRect(x * ED_CELL, y * ED_CELL, ED_CELL, ED_CELL);
  }
  // 网格线
  c.strokeStyle = "rgba(255,255,255,.08)";
  for (let i = 0; i <= 13; i++) {
    c.beginPath(); c.moveTo(i * ED_CELL, 0); c.lineTo(i * ED_CELL, 13 * ED_CELL); c.stroke();
    c.beginPath(); c.moveTo(0, i * ED_CELL); c.lineTo(13 * ED_CELL, i * ED_CELL); c.stroke();
  }
  // 基地（金框）与出生点标记：敌方红框（顶）/ 玩家绿框（底）
  c.strokeStyle = "#f6c945";
  c.strokeRect(6 * ED_CELL + 2, 12 * ED_CELL + 2, ED_CELL - 4, ED_CELL - 4);
  c.strokeStyle = "rgba(255,90,90,.75)";
  [[0, 0], [6, 0], [12, 0]].forEach(([x, y]) =>
    c.strokeRect(x * ED_CELL + 3, y * ED_CELL + 3, ED_CELL - 6, ED_CELL - 6));
  c.strokeStyle = "rgba(120,255,120,.75)";
  [[4, 12], [7, 12]].forEach(([x, y]) =>
    c.strokeRect(x * ED_CELL + 3, y * ED_CELL + 3, ED_CELL - 6, ED_CELL - 6));
}

function edToRows() { return edGrid.map(r => r.join("")); }

function edSave() {
  customRows = edToRows();
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customRows)); } catch(e){}
  el("cfg-custom").checked = true;
}

/* ================= 按钮事件 ================= */
el("btn-editor").addEventListener("click", () => {
  if (state === "running") togglePause();   // 运行中先暂停
  edInit();
  el("editor-modal").classList.remove("hidden");
});
el("ed-clear").addEventListener("click", () => {
  edGrid = edGrid.map(r => r.map(() => "."));
  edDraw();
});
el("ed-save").addEventListener("click", () => {
  edSave();
  el("ed-code").value = "已保存并勾选「自定义关卡」，点击开始游戏即生效";
});
el("ed-play").addEventListener("click", () => {
  edSave();
  el("editor-modal").classList.add("hidden");
  Sfx.init();
  newGame();                                 // 直接以当前敌人配置试玩
});
el("ed-export").addEventListener("click", () => {
  el("ed-code").value = btoa(edToRows().join("\n"));
});
el("ed-import").addEventListener("click", () => {
  try {
    const rows = atob(el("ed-code").value.trim()).split("\n");
    const ok = rows.length === 13 && rows.every(r =>
      r.length === 13 && [...r].every(ch => ED_TERRAINS.some(t => t.ch === ch)));
    if (!ok) throw new Error("invalid");
    edGrid = rows.map(r => r.split(""));
    customRows = rows;
    edDraw();
    el("ed-code").value = "导入成功，点「保存」后长期生效";
  } catch(e) { el("ed-code").value = "分享码无效"; }
});
el("ed-close").addEventListener("click", () => el("editor-modal").classList.add("hidden"));
