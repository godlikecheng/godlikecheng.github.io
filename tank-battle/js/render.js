"use strict";
/* ============================================================
 * render.js — Canvas 渲染（地形 / 基地 / 坦克 / 子弹 / 特效）
 * 依赖：constants.js, map.js；运行时引用 game.js 的全局状态
 * ============================================================ */

const cv = document.getElementById("cv"), ctx = cv.getContext("2d");

function drawTank(t) {
  if (t.hp <= 0) return;
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.scale(t.w / 32, t.h / 32); // 车体按 32x32 逻辑坐标绘制，自动适配 TILE
  if (t.spawning > 0) { // 出生闪点
    const a = Math.floor(t.spawning / 6) % 2;
    ctx.fillStyle = a ? "#fff" : "#f60";
    ctx.translate(16, 16);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-10, -10, 20, 20);
    ctx.restore(); return;
  }
  let color = t.isPlayer
    ? (t.playerIdx === 0 ? "#f6c945" : "#7fd97f") // P1 黄 / P2 绿
    : ENEMY_TYPES[t.typeIdx].color;
  if (!t.isPlayer && t.typeIdx === 3) { // 装甲坦克随血量变色
    color = ["#81c784", "#66bb6a", "#4caf50", "#2e7d32"][t.hp - 1];
  }
  if (!t.isPlayer && t.carrying && Math.floor(frameCount / 8) % 2) color = "#ff5252"; // 携带者红色闪烁
  // 履带
  ctx.fillStyle = "#333";
  const vert = t.dir % 2 === 0;
  if (vert) { ctx.fillRect(0, 0, 7, 32); ctx.fillRect(25, 0, 7, 32); }
  else { ctx.fillRect(0, 0, 32, 7); ctx.fillRect(0, 25, 32, 7); }
  // 车身
  ctx.fillStyle = color;
  ctx.fillRect(6, 6, 20, 20);
  ctx.fillStyle = "rgba(0,0,0,.25)";
  if (vert) ctx.fillRect(6, t.dir === 0 ? 6 : 18, 20, 8);
  else ctx.fillRect(t.dir === 3 ? 6 : 18, 6, 8, 20);
  // 炮管
  ctx.fillStyle = "#1c1c1c";
  const d = DIRS[t.dir];
  ctx.fillRect(14 + d.x * 8, 14 + d.y * 8, d.x ? 16 : 4, d.y ? 16 : 4);
  // 护盾
  if (t.spawnShield > 0 && Math.floor(t.spawnShield / 5) % 2 === 0) {
    ctx.strokeStyle = "#7fdfff"; ctx.lineWidth = 2;
    ctx.strokeRect(-2, -2, 36, 36);
  }
  ctx.restore();
}

function drawTerrain(x, y, v) {
  ctx.save();
  ctx.translate(x * TILE, y * TILE);
  ctx.scale(TILE / 16, TILE / 16); // 纹理按 16x16 逻辑坐标绘制
  if (v === T_BRICK) {
    ctx.fillStyle = "#b34700"; ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = "#7a2e00";
    ctx.fillRect(0, 7, 16, 2); ctx.fillRect(7, 0, 2, 7); ctx.fillRect(3, 9, 2, 7);
  } else if (v === T_STEEL) {
    ctx.fillStyle = "#9e9e9e"; ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = "#e0e0e0"; ctx.fillRect(3, 3, 10, 10);
    ctx.fillStyle = "#6d6d6d"; ctx.fillRect(5, 5, 6, 6);
  } else if (v === T_WATER) {
    const ph = Math.floor(frameCount / 20) % 2;
    ctx.fillStyle = ph ? "#1c5bd8" : "#2a6be8"; ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = "#7fb0ff";
    ctx.fillRect(2, ph ? 3 : 9, 6, 2); ctx.fillRect(9, ph ? 10 : 4, 5, 2);
  } else if (v === T_ICE) {
    ctx.fillStyle = "#cfe8ff"; ctx.fillRect(0, 0, 16, 16);
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, 15, 15);
  }
  ctx.restore();
}

function drawTree(x, y) {
  ctx.save();
  ctx.translate(x * TILE, y * TILE);
  ctx.scale(TILE / 16, TILE / 16);
  ctx.fillStyle = "#1d6b1f"; ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = "#2e9e30";
  ctx.fillRect(1, 1, 6, 6); ctx.fillRect(9, 5, 6, 6); ctx.fillRect(4, 9, 6, 6);
  ctx.restore();
}

function drawBase() {
  ctx.save();
  ctx.translate(12 * TILE, 24 * TILE);
  ctx.scale(TILE / 16, TILE / 16); // 鹰徽按 32x32 逻辑坐标绘制
  ctx.fillStyle = baseAlive ? "#3a2a00" : "#222";
  ctx.fillRect(0, 0, 32, 32);
  if (baseAlive) {
    // 简易鹰徽
    ctx.fillStyle = "#ffcc00";
    ctx.beginPath();
    ctx.moveTo(16, 4); ctx.lineTo(26, 14); ctx.lineTo(22, 14);
    ctx.lineTo(28, 22); ctx.lineTo(18, 22); ctx.lineTo(16, 27);
    ctx.lineTo(14, 22); ctx.lineTo(4, 22); ctx.lineTo(10, 14);
    ctx.lineTo(6, 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#7a5500"; ctx.fillRect(14, 14, 4, 6);
  } else {
    ctx.fillStyle = "#555"; ctx.fillRect(4, 8, 8, 8); ctx.fillRect(18, 14, 8, 10);
  }
  ctx.restore();
}

/* 道具：金底方牌 + 类型图形，闪烁显示 */
function drawPowerup(p) {
  if (Math.floor(frameCount / 8) % 2) return; // 闪烁
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(TILE / 16, TILE / 16); // 按 32x32 逻辑坐标绘制
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = "#e8b420"; ctx.fillRect(2, 2, 28, 28);
  ctx.strokeStyle = "#7a5500"; ctx.lineWidth = 2; ctx.strokeRect(3, 3, 26, 26);
  ctx.fillStyle = "#1c1c1c";
  if (p.kind === "star") { // 五角星
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
      const a2 = a + Math.PI / 5;
      ctx.lineTo(16 + Math.cos(a) * 9, 16 + Math.sin(a) * 9);
      ctx.lineTo(16 + Math.cos(a2) * 4, 16 + Math.sin(a2) * 4);
    }
    ctx.closePath(); ctx.fill();
  } else if (p.kind === "tank") { // 小坦克
    ctx.fillRect(5, 7, 4, 18); ctx.fillRect(23, 7, 4, 18);
    ctx.fillRect(10, 11, 12, 12); ctx.fillRect(14, 2, 4, 9);
  } else if (p.kind === "helmet") { // 头盔
    ctx.beginPath(); ctx.arc(16, 18, 10, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillRect(4, 16, 24, 4);
  } else if (p.kind === "bomb") { // 炸弹
    ctx.beginPath(); ctx.arc(16, 20, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(15, 6, 3, 6);
  } else if (p.kind === "shovel") { // 铁锹
    ctx.fillRect(14, 4, 4, 12);
    ctx.beginPath(); ctx.moveTo(10, 16); ctx.lineTo(22, 16); ctx.lineTo(22, 24); ctx.lineTo(16, 28); ctx.lineTo(10, 24); ctx.closePath(); ctx.fill();
  } else if (p.kind === "timer") { // 时钟
    ctx.beginPath(); ctx.arc(16, 16, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#e8b420"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(16, 16); ctx.lineTo(16, 9); ctx.moveTo(16, 16); ctx.lineTo(21, 18); ctx.stroke();
  }
  ctx.restore();
}

/* 多帧像素爆炸：外圈火星 + 内圈火苗 + 起爆白闪 */
function drawEffects() {
  for (const f of effects) {
    const r = f.size * 0.5 * (0.25 + 0.75 * f.t);
    const a = 1 - f.t;
    const px = Math.max(4, f.size * 0.12);
    ctx.fillStyle = `rgba(255,120,30,${a})`;
    for (let i = 0; i < 8; i++) {
      const ang = i * Math.PI / 4 + f.t * 1.2;
      ctx.fillRect(f.x + Math.cos(ang) * r - px / 2, f.y + Math.sin(ang) * r - px / 2, px, px);
    }
    ctx.fillStyle = `rgba(255,220,90,${a})`;
    const r2 = r * 0.55;
    for (let i = 0; i < 4; i++) {
      const ang = i * Math.PI / 2 - f.t * 0.8;
      ctx.fillRect(f.x + Math.cos(ang) * r2 - px / 2, f.y + Math.sin(ang) * r2 - px / 2, px, px);
    }
    if (f.t < 0.25) {
      ctx.fillStyle = `rgba(255,255,255,${1 - f.t * 4})`;
      ctx.fillRect(f.x - r / 3, f.y - r / 3, r * 0.66, r * 0.66);
    }
  }
}

/* 得分飘字（100/200/300/400、1UP） */
function drawFloats() {
  ctx.font = "bold 15px 'Courier New', monospace";
  ctx.textAlign = "center";
  for (const f of floats) {
    ctx.fillStyle = `rgba(255,213,79,${1 - f.t})`;
    ctx.fillText(f.txt, f.x, f.y - f.t * 28);
  }
  ctx.textAlign = "left";
}

/* GAME OVER 红字从底部升起 */
function drawGameOver() {
  const t = Math.min(goAnim.t, 1);
  const y = H + 50 - (H / 2 + 50) * t;
  ctx.fillStyle = "#e53935";
  ctx.font = "bold 44px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("GAME OVER", W / 2, y);
  ctx.textAlign = "left";
}

/* 开场幕布：上下灰幕合拢 → 显示关名 → 展开 */
function drawCurtain() {
  const t = curtainT;
  let cover = 1;
  if (t < CURTAIN_CLOSE) cover = t / CURTAIN_CLOSE;
  else if (t > CURTAIN_TOTAL - CURTAIN_OPEN) cover = (CURTAIN_TOTAL - t) / CURTAIN_OPEN;
  const h = (H / 2) * clamp(cover, 0, 1);
  ctx.fillStyle = "#6b6b6b";
  ctx.fillRect(0, 0, W, h);
  ctx.fillRect(0, H - h, W, h);
  if (cover >= 1) {
    const label = config.custom && customRows ? "自定义关卡" : `第 ${level} 关`;
    ctx.fillStyle = "#d32f2f";
    ctx.font = "bold 34px 'Courier New', monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, W / 2, H / 2);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }
}

function render() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  if (config.grid) {
    ctx.strokeStyle = "rgba(255,255,255,.06)"; ctx.lineWidth = 1;
    for (let i = 0; i <= COLS; i += 2) { ctx.beginPath(); ctx.moveTo(i*TILE, 0); ctx.lineTo(i*TILE, H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i*TILE); ctx.lineTo(W, i*TILE); ctx.stroke(); }
  }
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const v = map[y][x];
    if (v !== T_EMPTY && v !== T_TREE) drawTerrain(x, y, v);
  }
  drawBase();
  for (const p of players) drawTank(p);
  for (const e of enemies) drawTank(e);
  ctx.fillStyle = "#fff";
  for (const b of bullets) ctx.fillRect(b.x, b.y, b.w, b.h);
  // 道具（闪烁显示在坦克之上、草丛之下）
  for (const p of powerups) drawPowerup(p);
  // 特效与得分飘字
  drawEffects();
  drawFloats();
  // 草丛盖在坦克上
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++)
    if (map[y][x] === T_TREE) drawTree(x, y);
  // GAME OVER 升起动画
  if (goAnim) drawGameOver();
  // 开场幕布（最上层）
  if (state === "curtain") drawCurtain();
}
