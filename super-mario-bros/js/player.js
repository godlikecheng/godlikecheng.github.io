"use strict";
/* ============================================================
 * player.js — 角色（马力欧）：形态、移动/跳跃物理、瓦片碰撞、顶砖
 * 依赖：constants.js, map.js（顶砖等副作用在运行时回调 game）
 *
 * 位置/速度使用像素与像素每帧（1 帧 = 1/60s），数值为 MVP 手感参数，
 * 可在体验后对照原版复核微调（对应产品文档第 3 / 12 章）。
 * ============================================================ */

const P_ACC = 0.18, P_FRICTION = 0.22;   // 水平加速 / 松键摩擦
const P_WALK = 1.35, P_RUN = 2.35;        // 走 / 跑速度（px·frame^-1）
const P_G = 0.55, P_JV = 8.5;             // 重力 / 跳跃初速（满跳 ≈120px，可顶到第 4 行砖且不出屏）
const P_JG = 0.30;                        // 上升段重力（长按跳更久更高·更平滑）
const P_JVCUT = 4.5;                      // 松跳截断速度（短跳）
const P_FMAX = 4.0;                       // 最大下落速度
const P_WG = 0.14;                        // 水下重力
const P_STAR_FRAMES = 1800;               // 无敌星时长 ≈30s
const P_INVULN_FRAMES = 300;              // 受伤后无敌闪烁 ≈5s

const Player = {
  x: 0, y: 0, vx: 0, vy: 0,
  w: 0, h: 0,
  face: 1,                // 1=右, -1=左
  form: FORM_SMALL,       // 形态
  onGround: false,
  star: 0, invuln: 0,     // 无敌星 / 受伤无敌帧
  air: false,             // 空中
  underWater: false,
  canAct: true,

  /* 体型 */
  applyBody(){ const s = BODY_SIZE[this.form]; this.w = s[0]; this.h = s[1]; },

  reset(lv){
    this.form = FORM_SMALL; this.x = lv.respawnX * TILE + 2; this.y = (lv.ground[lv.respawnX]-1) * TILE - 1;
    this.vx = 0; this.vy = 0; this.face = 1; this.onGround = false;
    this.star = 0; this.invuln = 0; this.air = false; this.canAct = true;
    this.underWater = !!lv.water;
    this.applyBody();
  },

  /* ---- 逐轴碰撞移动 ---- */
  moveX(lv, dx){
    this.x += dx;
    if (dx > 0){ const r = this.x + this.w; const c = Math.floor(r / TILE);
      if (this.hitsColumn(lv, c)) { this.x = c * TILE - this.w; this.vx = 0; }
    } else if (dx < 0){ const c = Math.floor(this.x / TILE);
      if (this.hitsColumn(lv, c)) { this.x = (c+1) * TILE; this.vx = 0; }
    }
  },
  hitsColumn(lv, c){
    const yTop = Math.floor(this.y / TILE), yBot = Math.floor((this.y + this.h - 1) / TILE);
    for (let ry = yTop; ry <= yBot; ry++)
      if (isSolidPx(lv, c * TILE + Math.max(1, Math.min(TILE-2, TILE/2)), ry * TILE + 1)) return true;
    return false;
  },
  moveY(lv, dy){
    this.y += dy;
    if (dy > 0){
      const bottom = this.y + this.h;
      const r = Math.floor(bottom / TILE);
      const yTop = Math.floor((this.y+1) / TILE);
      for (let c = Math.floor(this.x / TILE); c <= Math.floor((this.x + this.w) / TILE); c++){
        if (c < 0 || c >= lv.cols) continue;
        if (r >= lv.ground[c]){ this.y = r * TILE - this.h; this.vy = 0; this.onGround = true; return; }
        if (r >= 0 && r < GRID_ROWS){
          const t = rowAt(lv, c, r);
          if (BUMPABLE.includes(t) || t === T_USED || t === T_BRIDGE || t === T_AXE){
            this.y = r * TILE - this.h; this.vy = 0; this.onGround = true; return;
          }
        }
      }
      if (this.onGround && this.y > this.yPrev){} // (no-op)
    } else if (dy < 0){
      // 头顶碰撞：只对「可顶」瓦片触发顶砖
      const tTop = Math.floor(this.y / TILE);
      for (let c = Math.floor(this.x / TILE); c <= Math.floor((this.x + this.w) / TILE); c++){
        if (c < 0 || c >= lv.cols) continue;
        if (tTop >= 0 && tTop < GRID_ROWS){
          const t = rowAt(lv, c, tTop);
          if (BUMPABLE.includes(t) || t === T_USED){
            Game.bumpTile(c, tTop); this.y = (tTop+1) * TILE; this.vy = 0; return;
          }
        }
      }
    }
  },

  step(lv, input){
    const water = this.underWater;
    this.yPrev = this.y;

    /* ---- 水平 ---- */
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0){
      this.face = dir;
      const target = (input.run ? P_RUN : P_WALK) * dir;
      this.vx += (target - this.vx) * P_ACC;
      // 惯性起步：从静止起跑会略滞后
    } else {
      this.vx += (0 - this.vx) * P_FRICTION;
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
    }
    this.moveX(lv, this.vx);

    /* ---- 垂直 ---- */
    const g = water ? P_WG : this.vy > 0 ? P_G : P_JG;
    if (input.jumpPressed && (this.onGround || water)){
      this.vy = -P_JV * (water ? 0.85 : 1);
      this.onGround = false; this.air = true;
    }
    if (this.vy < 0 && !input.jump && !water) this.vy = Math.max(this.vy, -P_JVCUT); // 松跳截断

    this.vy += g;
    if (this.vy > P_FMAX) this.vy = P_FMAX;
    if (water && input.jump) this.vy = Math.max(this.vy, -P_JV * 0.55); // 水下长按持续上浮

    this.moveY(lv, this.vy);

    /* 落地重置空中 */
    if (this.onGround){ this.air = false; }

    /* 计时 */
    if (this.star > 0) this.star--;
    if (this.invuln > 0) this.invuln--;

    return { x: this.x, y: this.y, w: this.w, h: this.h, form: this.form,
             star: this.star > 0, invuln: this.invuln > 0, onGround: this.onGround };
  },

  /* ---- 状态变化 ---- */
  grow(){ if (this.form === FORM_SMALL){ this.form = FORM_BIG; this.applyBody(); Sfx.powerup(); } },
  fireUp(){ this.form = FORM_FIRE; this.applyBody(); Sfx.powerup(); },
  starUp(){ this.star = P_STAR_FRAMES; Sfx.powerup(); },
  shrinkOrDie(){
    if (this.form !== FORM_SMALL){ this.form = FORM_SMALL; this.applyBody(); this.invuln = P_INVULN_FRAMES; Sfx.hurt(); return false; }
    return true; // 需要死亡
  },
};