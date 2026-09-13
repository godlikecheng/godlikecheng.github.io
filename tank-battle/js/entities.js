"use strict";
/* ============================================================
 * entities.js — 实体工厂（坦克 / 子弹 / 特效）与碰撞检测
 * 依赖：constants.js, map.js；运行时引用 game.js 的全局状态
 * ============================================================ */

/* 玩家出生半格坐标（P1 左 / P2 右，避开基地） */
const PLAYER_SPAWNS = [[8 * TILE, 24 * TILE], [15 * TILE, 24 * TILE]];

function makeTank(x, y, isPlayer, typeIdx, playerIdx) {
  const type = ENEMY_TYPES[typeIdx || 0];
  return {
    x, y, w: 2 * TILE, h: 2 * TILE, dir: isPlayer ? 0 : 2,
    isPlayer, typeIdx: typeIdx || 0, playerIdx: playerIdx || 0,
    speed: isPlayer ? 2.2 : type.speed * DIFF[config.difficulty].espeed,
    hp: isPlayer ? 1 : type.hp, maxHp: type.hp,
    cooldown: 0, thinkTimer: 0, spawnShield: isPlayer ? 180 : 120,
    spawning: !isPlayer ? 60 : 0, blocked: false, fireCd: 0,
    power: 0, carrying: false,   // 玩家火力等级 / 敌人道具携带标记
  };
}

function makeBullet(owner, power) {
  const d = DIRS[owner.dir];
  const cx = owner.x + owner.w / 2, cy = owner.y + owner.h / 2;
  const off = TILE - 2; // 炮口伸出坦克边缘 2px
  Sfx[owner.isPlayer ? "shoot" : "steel"]();
  return {
    x: cx - 4 + d.x * off, y: cy - 4 + d.y * off, w: 8, h: 8,
    dx: d.x, dy: d.y, speed: owner.isPlayer ? 6 : DIFF[config.difficulty].ebullet,
    fromPlayer: owner.isPlayer, owner, power: power || 1, dead: false,
  };
}

function addEffect(x, y, size) { effects.push({ x, y, size, t: 0 }); }

/* ================= 碰撞检测 ================= */
function rectTiles(r, fn) {
  const x0 = Math.floor(r.x / TILE), y0 = Math.floor(r.y / TILE);
  const x1 = Math.floor((r.x + r.w - 1) / TILE), y1 = Math.floor((r.y + r.h - 1) / TILE);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++)
    if (y >= 0 && y < ROWS && x >= 0 && x < COLS) fn(x, y, map[y][x]);
}

function tankBlocked(t, nx, ny, includeSpawning) {
  const r = { x: nx, y: ny, w: t.w, h: t.h };
  if (r.x < 0 || r.y < 0 || r.x + r.w > W || r.y + r.h > H) return true;
  let hit = false;
  rectTiles(r, (x, y, v) => { if (isSolidTank(v)) hit = true; });
  if (hit) return true;
  const all = t.isPlayer ? players.concat(enemies) : enemies.concat(players);
  for (const o of all) {
    if (o === t || o.hp <= 0) continue;
    if (!includeSpawning && o.spawning > 0) continue;
    const cur = overlapArea(t, o), next = overlapArea(r, o);
    if (cur > 0) { if (next > cur) return true; } // 已重叠（卡死解救）：仅允许向分离方向移动
    else if (next > 0) return true;
  }
  return false;
}

/* 两矩形重叠面积（用于已重叠坦克的分离判定） */
function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return (w > 0 && h > 0) ? w * h : 0;
}

function tryMove(t, dist) {
  const d = DIRS[t.dir];
  let moved = 0, step = 2;
  while (dist > 0) {
    const s = Math.min(step, dist);
    const nx = t.x + d.x * s, ny = t.y + d.y * s;
    if (tankBlocked(t, nx, ny)) break;
    t.x = nx; t.y = ny; moved += s; dist -= s;
  }
  return moved;
}

/* 转向时吸附半格网格，方便通过通道 */
function setDir(t, dir) {
  const wasPerp = (t.dir % 2) !== (dir % 2);
  t.dir = dir;
  if (wasPerp) {
    if (dir % 2 === 0) t.x = clamp(Math.round(t.x / HALF) * HALF, 0, W - t.w);
    else t.y = clamp(Math.round(t.y / HALF) * HALF, 0, H - t.h);
  }
}
