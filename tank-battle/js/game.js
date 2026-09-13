"use strict";
/* ============================================================
 * game.js — 全局游戏状态、流程控制与每帧更新（含敌人 AI / 道具）
 * 依赖：constants.js, map.js, entities.js
 * 说明：config 在 main.js 启动时初始化
 * ============================================================ */

let state = "idle";           // idle | curtain | running | paused | levelclear | over
let map = [];                 // 地形二维数组
let score = 0, hiscore = 0, level = 1;
let lives = [2, 2];           // P1 / P2 生命数
let players = [];             // 玩家坦克数组（单人 1 个，双人 2 个）
let enemies = [], bullets = [], effects = [], powerups = [], floats = [];
let spawnQueue = [], spawnTimer = 0, spawnAnim = []; // 出生闪点
let spawnIndex = 0;                                  // 本关已出场的敌人序号（道具车判定用）
let baseAlive = true, frameCount = 0, lastTs = 0;
let freezeTimer = 0, shovelTimer = 0;                // 时钟冻结 / 铁锹加固
let unlocked = 1;                                    // 最高解锁关卡
let levelStats = null;                               // 本关统计数据
let levelClearTimer = null;
let config = null;
let curtainT = 0;                                    // 开场幕布计时
let goAnim = null, overMsg = "";                     // GAME OVER 升起动画
let bonusGiven = false;                              // 20000 分奖命（每局一次）
let customRows = null;                               // 自定义关卡数据（编辑器 / 分享码）

/* ================= 游戏流程 ================= */
function newGame() {
  config = readConfig();
  saveConfig();
  Sfx.enabled = config.sound;
  score = 0; level = clamp(config.start, 1, Math.max(unlocked, 1));
  lives = [config.lives, config.lives];
  players = [];
  bonusGiven = false;
  floats = [];
  startLevel();
  updateUI(); showOverlay(null);
  el("btn-pause").disabled = false; el("btn-pause").textContent = "暂停 (P)";
}

function startLevel() {
  if (config.custom && customRows) loadCustomMap();
  else if (level <= CLASSIC_LEVELS.length) loadClassic(level);
  else genMap();
  baseAlive = true;
  enemies = []; bullets = []; effects = []; powerups = []; floats = []; spawnAnim = [];
  spawnIndex = 0;
  freezeTimer = 0; shovelTimer = 0;
  goAnim = null;
  levelStats = { kills: [0,0,0,0], powerups: 0, shots: 0, hits: 0, scoreStart: score };
  // 重建玩家（跨关保留火力等级，阵亡才重置）
  const powers = players.map(p => p.power);
  players = [];
  for (let i = 0; i < config.mode; i++) {
    const [sx, sy] = PLAYER_SPAWNS[i];
    const p = makeTank(sx, sy, true, 0, i);
    p.power = powers[i] || 0;
    players.push(p);
  }
  spawnQueue = buildEnemyQueue(level);
  spawnTimer = 40;
  // 开场幕布
  Music.stop();
  state = "curtain";
  curtainT = 0;
}

function buildEnemyQueue(lv) {
  // 经典规则：默认 20 辆按 FC 原版逐关配比表出场（组序即出场序，如第 1 关快速坦克最后才出现）；
  // 关卡超过 35 后循环；自定义敌人总数时按该关配比等比缩放
  const table = CLASSIC_ENEMIES[(lv - 1) % CLASSIC_ENEMIES.length];
  const n = config.enemies;
  const cnt = table.map(c => Math.round(c * n / 20));
  let diff = n - cnt[0] - cnt[1] - cnt[2] - cnt[3]; // 缩放取整误差补到数量最多的类型
  while (diff > 0) { cnt[cnt.indexOf(Math.max(...cnt))]++; diff--; }
  while (diff < 0) { const i = cnt.indexOf(Math.max(...cnt)); if (cnt[i] <= 0) break; cnt[i]--; diff++; }
  const q = [];
  cnt.forEach((c, t) => { for (let i = 0; i < c; i++) q.push(t); });
  return q;
}

function trySpawnEnemy(dt) {
  spawnTimer -= dt;
  if (spawnTimer > 0 || spawnQueue.length === 0) return;
  if (enemies.filter(e => e.hp > 0).length >= config.maxField) return;
  for (const [sx, sy] of SPAWN_PTS) {
    const tmp = { x: sx, y: sy, w: 2 * TILE, h: 2 * TILE, dir: 2 };
    // includeSpawning=true：出生闪点中的坦克也视为占用，避免两辆坦克重叠出生后互相卡死
    if (!tankBlocked(tmp, sx, sy, true)) {
      const t = makeTank(sx, sy, false, spawnQueue.shift());
      t.carrying = CARRY_SLOTS.includes(spawnIndex); // 经典规则：第 4/11/18 辆为道具携带车
      spawnIndex++;
      enemies.push(t);
      spawnAnim.push({ x: sx, y: sy, t: 60 });
      spawnTimer = DIFF[config.difficulty].spawn - Math.min(level * 6, 60);
      return;
    }
  }
}

function playerDown(t) {
  addEffect(t.x + t.w / 2, t.y + t.h / 2, TILE * 2);
  Sfx.bigboom();
  lives[t.playerIdx]--;
  updateUI();
  const idx = players.indexOf(t);
  if (lives[t.playerIdx] > 0) {
    const [sx, sy] = PLAYER_SPAWNS[t.playerIdx];
    const np = makeTank(sx, sy, true, 0, t.playerIdx);
    np.power = 0; // 经典规则：阵亡后火力重置
    if (idx >= 0) players[idx] = np;
  } else {
    if (idx >= 0) players.splice(idx, 1);
    if (players.length === 0) gameOver("所有玩家坦克被消灭");
  }
}

function gameOver(reason) {
  state = "over";
  Music.stop();
  el("btn-pause").disabled = true;
  let msg = `${reason}<br>最终得分：${score} · 关卡：${level}<br><br>按 回车 重新开始`;
  if (score > hiscore) {
    hiscore = score;
    try { localStorage.setItem(HI_KEY, String(hiscore)); } catch(e){}
    msg = `🏆 新纪录！<br><br>` + msg;
  }
  overMsg = msg;
  goAnim = { t: 0 };   // 先播放 GAME OVER 升起动画，结束后再弹结算层
  updateUI();
}

function destroyBase() {
  if (!baseAlive) return;
  baseAlive = false;
  addEffect(13 * TILE, 25 * TILE, TILE * 3);
  Sfx.bigboom();
  gameOver("基地被摧毁！");
}

/* 解锁进度：到达第 n 关即解锁 */
function unlockProgress(n) {
  if (n > unlocked) {
    unlocked = n;
    try { localStorage.setItem(UNLOCK_KEY, String(unlocked)); } catch(e){}
    refreshLevelOptions();
  }
}

function levelClear() {
  if (state !== "running") return;
  state = "levelclear";
  Music.stop();
  Sfx.clear();
  unlockProgress(level + 1);
  // 结算画面
  const s = levelStats, acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0;
  const names = ["普通", "快速", "强火力", "装甲"];
  const rows = names.map((n, i) => `<tr><td>${n}坦克</td><td>× ${s.kills[i]}</td></tr>`).join("");
  showOverlay(`第 ${level} 关 完成！`, `
    <table class="stats">
      ${rows}
      <tr><td>道具拾取</td><td>× ${s.powerups}</td></tr>
      <tr><td>开炮 / 命中</td><td>${s.shots} / ${s.hits}（${acc}%）</td></tr>
      <tr><td>本关得分</td><td>${score - s.scoreStart}</td></tr>
    </table>
    即将进入第 ${level + 1} 关…（按 回车 立即继续）`);
  levelClearTimer = setTimeout(goNextLevel, 4500);
}

function goNextLevel() {
  if (state !== "levelclear") return;
  if (levelClearTimer) { clearTimeout(levelClearTimer); levelClearTimer = null; }
  // 自定义地图只作为起始关：通关后自动取消勾选，从经典关卡继续推进
  if (config.custom) { config.custom = false; el("cfg-custom").checked = false; }
  level++;
  startLevel();       // 进入幕布过场
  showOverlay(null); updateUI();
}

function checkLevelClear() {
  if (spawnQueue.length === 0 && enemies.every(e => e.hp <= 0)) levelClear();
}

/* ================= 得分与奖励 ================= */
function addScore(n, playerIdx) {
  score += n;
  // 经典规则：得分达到 20000 奖励 1 条生命（每局一次）
  if (!bonusGiven && score >= BONUS_LIFE_SCORE) {
    bonusGiven = true;
    const i = playerIdx || 0;
    lives[i]++;
    Sfx.life();
    const t = players.find(p => p.playerIdx === i) || players[0];
    if (t) floats.push({ x: t.x + t.w / 2, y: t.y, txt: "1UP", t: 0 });
  }
  updateUI();
}

/* ================= 道具系统 ================= */
function dropPowerup() {
  // 经典规则：场上同时只存在 1 个道具
  powerups = [];
  for (let tries = 0; tries < 60; tries++) {
    const x = Math.floor(Math.random() * (COLS - 4)) * TILE + TILE;
    const y = Math.floor(Math.random() * (ROWS - 8)) * TILE + TILE;
    const r = { x, y, w: 2 * TILE, h: 2 * TILE };
    let onSolid = false;
    rectTiles(r, (tx, ty, v) => { if (isSolidTank(v)) onSolid = true; });
    if (onSolid) continue;
    const kind = POWERUP_KINDS[Math.floor(Math.random() * POWERUP_KINDS.length)];
    powerups.push({ x, y, kind, t: 0 });
    return;
  }
}

function applyPowerup(t, kind) {
  Sfx.life();
  addScore(POWERUP_SCORE, t.playerIdx);
  levelStats.powerups++;
  if (kind === "star") t.power = Math.min(3, t.power + 1);
  else if (kind === "tank") lives[t.playerIdx]++;
  else if (kind === "helmet") t.spawnShield = HELMET_TIME;
  else if (kind === "shovel") { shovelTimer = SHOVEL_TIME; setBaseWall(true); }
  else if (kind === "timer") freezeTimer = FREEZE_TIME;
  else if (kind === "bomb") {
    for (const e of enemies) {
      if (e.hp > 0 && e.spawning <= 0) {
        e.hp = 0;
        addEffect(e.x + e.w / 2, e.y + e.h / 2, TILE * 2);
      }
    }
    Sfx.boom();
    checkLevelClear();
  }
  updateUI();
}

/* ================= 每帧更新 ================= */
function update(dt) {
  frameCount += dt;
  trySpawnEnemy(dt);

  // 状态计时器
  if (freezeTimer > 0) freezeTimer -= dt;
  if (shovelTimer > 0) {
    shovelTimer -= dt;
    if (shovelTimer <= 0) setBaseWall(false); // 到期恢复砖墙
  }

  // 玩家
  let anyMoving = false;
  for (const pl of players) {
    if (pl.hp <= 0) continue;
    if (pl.spawnShield > 0) pl.spawnShield -= dt;
    if (pl.fireCd > 0) pl.fireCd -= dt;
    const inp = keys[pl.playerIdx];
    // 冰面惯性：车体中心处于冰面时，松开方向键后继续滑行一小段
    const cx = Math.floor((pl.x + pl.w / 2) / TILE), cy = Math.floor((pl.y + pl.h / 2) / TILE);
    const onIce = map[cy] && map[cy][cx] === T_ICE;
    if (inp && inp.dirs.length) {
      setDir(pl, inp.dirs[0]);
      tryMove(pl, pl.speed * dt);
      pl.slide = onIce ? ICE_SLIDE : 0;
    } else if (pl.slide > 0) {
      pl.slide -= dt;
      tryMove(pl, pl.speed * dt);
    }
    if ((inp && inp.dirs.length) || pl.slide > 0) anyMoving = true;
    const maxBullets = pl.power >= 2 ? 2 : 1; // 经典规则：2 星双发，3 星可穿钢墙
    if (inp && inp.fire && pl.fireCd <= 0 && bullets.filter(b => b.owner === pl && !b.dead).length < maxBullets) {
      bullets.push(makeBullet(pl, pl.power));
      pl.fireCd = pl.power >= 1 ? 11 : 14;
      levelStats.shots++;
    }
    // 拾取道具
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      if (pl.x < p.x + 2 * TILE && pl.x + pl.w > p.x && pl.y < p.y + 2 * TILE && pl.y + pl.h > p.y) {
        powerups.splice(i, 1);
        applyPowerup(pl, p.kind);
      }
    }
  }
  Sfx.engine(anyMoving);

  // 敌人 AI（冻结时静止）
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    if (e.spawning > 0) { e.spawning -= dt; continue; }
    if (freezeTimer > 0) continue;
    if (e.spawnShield > 0) e.spawnShield -= dt;
    if (e.fireCd > 0) e.fireCd -= dt;
    e.thinkTimer -= dt;
    const moved = tryMove(e, e.speed * dt);
    if (moved < e.speed * dt * 0.5) e.blocked = true; else e.blocked = false;
    if (e.thinkTimer <= 0 || e.blocked) {
      e.thinkTimer = 20 + Math.random() * 40;
      // 简单寻路：偏向向下 / 靠近基地方向
      const r = Math.random();
      let nd;
      if (r < 0.4) nd = 2;
      else if (r < 0.6) nd = e.x > 13 * TILE ? 3 : 1;
      else if (r < 0.9) nd = Math.floor(Math.random() * 4);
      else nd = 0;
      setDir(e, nd);
    }
    // 射击
    const fireP = DIFF[config.difficulty].fire * dt;
    if (e.fireCd <= 0 && Math.random() < fireP && bullets.filter(b => !b.fromPlayer && !b.dead && b.owner === e).length < 1) {
      bullets.push(makeBullet(e, 1));
      e.fireCd = 50 + Math.random() * 60;
    }
  }
  enemies = enemies.filter(e => e.hp > 0 || e.spawning > 0);

  // 子弹
  for (const b of bullets) {
    if (b.dead) continue;
    let steps = Math.ceil(b.speed * dt / 3);
    for (let s = 0; s < steps && !b.dead; s++) {
      b.x += b.dx * b.speed * dt / steps;
      b.y += b.dy * b.speed * dt / steps;
      if (b.x < 0 || b.y < 0 || b.x + b.w > W || b.y + b.h > H) { b.dead = true; addEffect(b.x + b.w/2, b.y + b.h/2, 10); break; }
      // 地形碰撞（经典规则）：每次命中固定摧毁垂直于弹道、以子弹横轴为中心的 2 格宽 × 1 格深，
      // 不按子弹矩形销毁，避免子弹像素对齐差异导致打掉的砖墙范围时大时小
      {
        const horiz = b.dx !== 0;
        const crossC = horiz ? b.y + b.h / 2 : b.x + b.w / 2; // 横轴中心
        const crossG = Math.floor(crossC / TILE);             // 子弹中心所在横轴格
        const g = Math.floor((horiz
          ? (b.dx > 0 ? b.x + b.w - 1 : b.x)
          : (b.dy > 0 ? b.y + b.h - 1 : b.y)) / TILE);        // 弹头前沿所在格
        const c0 = Math.round(crossC / TILE) - 1;             // 摧毁条带横轴起始格
        const strip = [];
        for (let i = 0; i < 2; i++) {
          const cc = c0 + i, n = horiz ? ROWS : COLS;
          if (cc < 0 || cc >= n) continue;
          const tx = horiz ? g : cc, ty = horiz ? cc : g;
          if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) continue;
          strip.push([tx, ty, map[ty][tx]]);
        }
        let hitBrick = false, hitSteel = false;
        for (const [, , v] of strip) { if (v === T_BRICK) hitBrick = true; else if (v === T_STEEL) hitSteel = true; }
        const primary = horiz ? map[crossG][g] : map[g][crossG]; // 弹头正面的格子
        if (primary === T_BASE && baseAlive) { b.dead = true; destroyBase(); }
        else if (hitBrick || hitSteel) {
          b.dead = true;
          for (const [tx, ty, v] of strip) {
            if (v === T_BRICK) { map[ty][tx] = T_EMPTY; Sfx.brick(); addEffect(tx * TILE + HALF, ty * TILE + HALF, 12); }
            else if (v === T_STEEL) {
              if (b.power >= 3) { map[ty][tx] = T_EMPTY; addEffect(tx * TILE + HALF, ty * TILE + HALF, 10); }
              Sfx.steel();
            }
          }
        }
      }
      if (b.dead) break;
      // 坦克命中
      const hitList = b.fromPlayer ? enemies : players.slice();
      for (const t of hitList) {
        if (t.hp <= 0 || t.spawning > 0) continue;
        if (b.x < t.x + t.w && b.x + b.w > t.x && b.y < t.y + t.h && b.y + b.h > t.y) {
          b.dead = true;
          if (t.spawnShield > 0) { addEffect(b.x, b.y, 10); break; }
          t.hp--;
          if (t.hp <= 0) {
            addEffect(t.x + t.w / 2, t.y + t.h / 2, TILE * 2);
            Sfx.boom();
            if (t.isPlayer) playerDown(t);
            else {
              const pts = ENEMY_TYPES[t.typeIdx].score;
              addScore(pts, b.owner.playerIdx);
              floats.push({ x: t.x + t.w / 2, y: t.y + t.h / 2, txt: String(pts), t: 0 });
              levelStats.kills[t.typeIdx]++;
              levelStats.hits++;
              if (t.carrying) dropPowerup(); // 携带者掉落道具
              checkLevelClear();
            }
          } else { addEffect(b.x, b.y, 12); Sfx.brick(); updateUI(); }
          break;
        }
      }
      if (b.dead) break;
      // 子弹互消
      for (const o of bullets) {
        if (o === b || o.dead || o.fromPlayer === b.fromPlayer) continue;
        if (b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y) {
          b.dead = true; o.dead = true; addEffect(b.x, b.y, 12); break;
        }
      }
    }
  }
  bullets = bullets.filter(b => !b.dead);

  // 道具寿命（约 12 秒后消失）
  for (const p of powerups) p.t += dt;
  powerups = powerups.filter(p => p.t < 720);

  // 出生闪点
  spawnAnim.forEach(s => s.t -= dt);
  spawnAnim = spawnAnim.filter(s => s.t > 0);
  // 特效（大爆炸较慢，小火花较快）
  effects.forEach(f => f.t += dt * (f.size >= 40 ? 0.05 : 0.12));
  effects = effects.filter(f => f.t < 1);
  // 得分飘字
  floats.forEach(f => f.t += dt * 0.02);
  floats = floats.filter(f => f.t < 1);
}
