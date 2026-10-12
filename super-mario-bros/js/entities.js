"use strict";
/* ============================================================
 * entities.js — 敌人、龟壳、道具实体、火球、火棒
 * 依赖：constants.js, map.js
 * ============================================================ */

/* 各类敌人出厂参数：体型 / 速度 / 得分 / 特性 */
const ECFG = {
  [E_GOOMBA]:  { w:13, h:15, vx:0.70, score:100 },
  [E_KOOPA]:   { w:14, h:26, vx:0.60, score:100 },
  [E_HAMMER]:  { w:14, h:24, vx:0.80, score:1000 },
  [E_BULLET]:  { w:14, h:14, vx:-1.60, score:100, air:true, noStomp:true },
  [E_SPINY]:   { w:14, h:15, vx:0.65, score:100, noStomp:true },
  [E_LAKITU]:  { w:22, h:20, vx:0.35, score:500 },
  [E_BUZZY]:   { w:14, h:15, vx:0.55, score:100, shellable:true },
  [E_BLOOPER]: { w:14, h:16, vx:-1.0, score:200, noStomp:true, air:true },
  [E_CHEEP]:   { w:14, h:12, vx:-0.9, score:200 },
  [E_PODOBOO]: { w:12, h:12, vx:0,    score:0,  noStomp:true, air:true },
};

const Entities = {
  enemies: [],
  items: [],
  balls: [],
  plants: [],
  hammers: [],
  firebars: [],
  boss: null,
  drop: [],                 // 更新中途产生的敌人（Lakitu 掉刺猬等）

  clear(){ this.enemies.length = 0; this.items.length = 0; this.balls.length = 0;
    this.plants.length = 0; this.hammers.length = 0; this.firebars.length = 0;
    this.boss = null; this.drop.length = 0; },

  spawnEnemy(type, x, y){
    const s = ECFG[type] || ECFG[E_GOOMBA];
    this.enemies.push({ type, x, y, w: s.w, h: s.h, vx: type===E_BULLET ? -1.6 : s.vx,
      face: -1, anim: 0, dead: false, shell: false, kick: 0,
      scoring: s.score, air: !!s.air, noStomp: !!s.noStomp, shellable: !!s.shellable,
      vy: 0, t: 0, jumpC: 40, throwC: 60,
      baseY: (type === E_LAKITU || type === E_BLOOPER) ? y : 0,
      active: type === E_PODOBOO ? false : true, timer: 90, kickGrace: 0 });
  },
  spawnFirebar(x, y, count, r, speed){ this.firebars.push({ x, y, count, r, speed, ang: 0, t: 0 }); },
  addDrop(e){ this.drop.push(e); },
  spawnItem(kind, x, y){
    const meta = { mushroom:{w:14,h:14}, fire:{w:14,h:14}, star:{w:14,h:14}, '1up':{w:14,h:14}, coin:{w:12,h:16} }[kind];
    this.items.push({ kind, x, y, ...meta, vy: -2.0, born: 0, pop: true });
  },
  spawnBall(x, y, dir){
    this.balls.push({ x, y, vx: 3.1 * dir, vy: -1.2, w: 8, h: 8, life: 160 });
  },
  /* 食人花：出生于管道口，从管内伸出/缩回 */
  spawnPlant(c, topRow){
    this.plants.push({
      c, topRow,
      baseBottom: topRow * TILE,          // 管道顶所在 y（植物底部贴合于此）
      x: c * TILE + 2, w: 12, h: 20,
      ext: 0, maxOut: 13, target: 0,
      timer: 60, keep: 0, t: 0,
      dead: false, sinkDone: false,
    });
  },
  actualPlantBox(p){
    return { x: p.x, y: p.baseBottom - p.ext, w: p.w, h: Math.max(0, p.ext) };
  },

  /* 食人花统一更新：近身探出/远走循环伸缩，死亡下沉 */
  updatePlants(){
    const old = this.plants;
    this.plants = [];
    for (const p of old){
      if (p.sinkDone) continue;
      if (p.dead){
        p.ext = Math.max(0, p.ext - 0.3);
        if (p.ext <= 0){ continue; }      // 完全缩入管中即移除
        this.plants.push(p); continue;
      }

      /* 近身判定：水平相距管道 3~6 格（原版：靠近则探出并保持） */
      const near = (Player.x + Player.w > (p.c - 3) * TILE) && (Player.x < (p.c + 6) * TILE);
      if (near) p.keep = 40;
      else if (p.keep > 0) p.keep--;

      if (near || p.keep > 0){
        p.target = p.maxOut;                       // 保持完全探出
      } else {
        p.timer--;
        if (p.ext <= 0 && p.timer <= 0){ p.timer = 40 + ((p.t*17|0) % 40); p.target = p.maxOut * 0.55; }
        else if (p.ext >= p.target * 0.98) p.target = 0;
      }

      const sp = 0.32;
      if (p.ext < p.target) p.ext = Math.min(p.target, p.ext + sp);
      else if (p.ext > p.target) p.ext = Math.max(p.target, p.ext - sp);
      p.t++;
      this.plants.push(p);
    }
  },

  /* 敌人统一更新 */
  updateEnemies(lv){
    const kept = [];
    for (const e of this.enemies){
      e.anim++; e.t = (e.t || 0) + 1;
      if (e.beingCarried){ kept.push(e); continue; }         // 被玩家携带着：位置由 handleCarry 控制
      switch (e.type){
        case E_HAMMER:  this.updateHammer(lv, e); break;
        case E_BULLET:  this.updateBullet(lv, e); break;
        case E_LAKITU:  this.updateLakitu(lv, e); break;
        case E_BLOOPER: this.updateBlooper(lv, e); break;
        case E_CHEEP:   this.updateCheep(lv, e); break;
        case E_PODOBOO: this.updatePodoboo(lv, e); break;
        default:        this.updateWalker(lv, e); break;   // 板栗/刺猬/慢慢龟/硬壳龟
      }
      if (!e.dead) kept.push(e);
    }
    for (const d of this.drop){ kept.push(d); }
    this.drop.length = 0;
    this.enemies = kept;
  },
  updateWalker(lv, e){
    if (e.hold > 0){ e.hold--; this.applyEnemyGravity(lv, e); return; }  // 冒头顿挫：先落地待命再走
    if (e.shell){
      if (e.kick > 0){
        e.kick--;
        e.x += e.vx;
        /* 撞墙/边界反弹 */
        const frontC = Math.floor((e.vx > 0 ? e.x + e.w : e.x) / TILE);
        const midY = e.y + e.h / 2;
        if (frontC < 0 || frontC >= lv.cols ||
            (isSolidPx(lv, frontC * TILE + TILE/2, midY) && !isSolidPx(lv, frontC * TILE + TILE/2, e.y + e.h + 2))){
          e.vx *= -1; e.x += e.vx; Sfx.bump();
        }
        /* 滑行撞杀其他敌人 */
        for (const o of this.enemies){
          if (o === e || o.dead || o.beingCarried) continue;
          if (overlap(e.x, e.y, e.w, e.h, o.x, o.y, o.w, o.h)){
            o.dead = true; Sfx.kick();
            Game.addScore(400); Game.floatText(o.x + o.w/2, o.y - 4, "+400");
          }
        }
        if (e.x < -20 || e.x > lv.cols * TILE + 20) e.dead = true;   // 出界消失
      }
      this.applyEnemyGravity(lv, e); return;
    }
    // 悬崖/障碍转身
    e.x += e.vx; e.face = e.vx > 0 ? 1 : -1;
    if (this.blockedAhead(lv, e)){ e.vx *= -1; e.x += e.vx; }
    this.applyEnemyGravity(lv, e);
  },
  /* 炮弹刺客：直线飞行，不落地（反方向撞玩家） */
  updateBullet(lv, e){
    e.x += e.vx; e.face = e.vx > 0 ? 1 : -1;
    if (e.x < -30 || e.x > lv.cols * TILE + 30) e.dead = true;
  },
  /* 云里花：高空漂移 + 周期性丢刺猬 */
  updateLakitu(lv, e){
    e.y = e.baseY + Math.sin(e.t * 0.07) * 4;
    e.x += e.vx;
    if (e.x < 14 || e.x > lv.cols * TILE - 60) e.vx *= -1;
    e.throwC = (e.throwC === undefined ? 60 : e.throwC) - 1;
    if (e.throwC <= 0 && this.inView(e.x)){
      e.throwC = 200;
      this.dropSpiny(lv, e);
      Sfx.stomp();
    }
  },
  dropSpiny(lv, e){
    const x = e.x + 6;
    const g = lv.ground[clamp(Math.floor(x / TILE), 0, lv.cols - 1)];
    this.addDrop({ type: E_SPINY, x, y: e.baseY + 30, w: 14, h: 15, vx: 0.65, face: -1,
      anim: 0, dead: false, shell: false, kick: 0, scoring: 100, air: true, noStomp: true,
      shellable: false, vy: -1, t: 0, jumpC: 40, throwC: 60, baseY: 0, active: true, timer: 90 });
  },
  /* 乌贼（水下）：正弦上下 + 朝玩家游 */
  updateBlooper(lv, e){
    e.vx = (Player.x + Player.w / 2) < (e.x + e.w / 2) ? -0.8 : 0.8;   // 缓速逼近玩家
    e.x += e.vx;
    e.y = e.baseY + Math.sin(e.t * 0.06) * 24;
    if (e.x < -24 || e.x > lv.cols * TILE + 24) e.dead = true;
  },
  /* 飞鱼：周期性起跳抛物线 */
  updateCheep(lv, e){
    e.x += e.vx * (e.air ? 1 : 0.5);
    e.vy = (e.vy || 0) + 0.42;
    e.y += e.vy;
    const col = Math.floor((e.x + e.w / 2) / TILE);
    const floorY = this.floorBelow(lv, col, e);
    if (e.y + e.h >= floorY){ e.y = floorY - e.h; e.vy = 0; e.air = false; }
    if (!e.air){
      e.hopC = (e.hopC === undefined ? 30 : e.hopC) - 1;
      if (e.hopC <= 0){ e.vy = -5.5; e.air = true; e.hopC = 50 + ((e.t * 7) | 0) % 30; }
    }
    if (e.y + e.h > LOGIC_H + 30) e.dead = true;
  },
  /* 熔岩蹦床（城堡）：隔时从岩浆跃起再落回 */
  updatePodoboo(lv, e){
    if (!e.active){
      e.timer = (e.timer === undefined ? 70 : e.timer) - 1;
      if (e.timer <= 0 && this.inView(e.x)){ e.active = true; e.timer = 100; e.vy = -10; e.y = LOGIC_H + 2; }
      return;
    }
    e.vy = (e.vy || 0) + 0.5; e.y += e.vy;
    if (e.y > LOGIC_H + 8){ e.active = false; }
  },
  /* 火棒：绕轴旋转 */
  updateFirebars(lv){
    for (const f of this.firebars){ f.t++; f.ang = (f.ang + f.speed) % 6.2832; }
  },
  firebarSpots(f){
    const out = [];
    for (let i = 0; i < f.count; i++){
      const a = f.ang + i * (6.2832 / f.count);
      out.push([f.x + Math.cos(a) * f.r, f.y + Math.sin(a) * f.r]);
    }
    return out;
  },
  /* 脚下向下第一块实心＝站立平台顶；坠坑则超过屏幕即死 */
  floorBelow(lv, col, e){
    if (col < 0 || col >= lv.cols) col = Math.max(0, Math.min(lv.cols - 1, col));
    const feetR = Math.floor((e.y + e.h) / TILE);
    for (let rr = feetR; rr < GRID_ROWS; rr++){
      const t = rowAt(lv, col, rr);
      if (t && (BUMPABLE.includes(t) || t === T_USED || t === T_BRIDGE || t === T_AXE)) return rr * TILE;
    }
    return lv.ground[col] * TILE;
  },
  applyEnemyGravity(lv, e){
    const col = Math.floor((e.x + e.w / 2) / TILE);
    const standY = this.floorBelow(lv, col, e);
    e.vy = (e.vy || 0) + 0.45; e.y += e.vy;
    if (e.y + e.h >= standY){ e.y = standY - e.h; e.vy = 0; }
    if (e.y + e.h > LOGIC_H + 30) e.dead = true;          // 坠坑即死
  },

  /* 锤子兄弟：左右行进 + 定时起跳 + 朝玩家抛锤 */
  updateHammer(lv, e){
    /* 左右走，尽头转身 */
    e.x += e.vx;
    e.face = e.vx > 0 ? 1 : -1;
    if (this.blockedAhead(lv, e)){ e.vx *= -1; e.x += e.vx; }

    /* 垂直：重力 + 落地 + 定时起跳 */
    e.vy = (e.vy || 0) + 0.42;
    e.y += e.vy;
    const col = Math.floor((e.x + e.w / 2) / TILE);
    const floorY = (col >= 0 && col < lv.cols) ? lv.ground[col] : DEFAULT_GROUND;
    const floorPx = floorY * TILE;
    if (e.y + e.h >= floorPx){ e.y = floorPx - e.h; e.vy = 0; e.air = false; }
    if (!e.air && e.t > 20){
      e.jumpC = (e.jumpC === undefined ? 0 : e.jumpC) - 1;
      if (e.jumpC <= 0){ e.vy = -8.5; e.air = true; e.jumpC = 90 + ((e.t * 13) | 0) % 60; }
    }

    /* 抛锤：仅当玩家在镜头内且距管组较近 */
    if (this.inView(e.x)){
      e.throwC = (e.throwC === undefined ? 40 : e.throwC) - 1;
      if (e.throwC <= 0){ this.throwHammer(e); e.throwC = 80 + ((e.t * 11) | 0) % 50; }
    }
    if (e.y + e.h > LOGIC_H + 30) e.dead = true;              // 锤子兄弟坠坑即死
  },
  /* 当前逻辑视口内（世界坐标范围） */
  inView(x){
    const max = Math.max(0, Game.lv.cols * TILE - LOGIC_W);
    const camX = clamp(Player.x - LOGIC_W / 2, 0, max);
    return x + 24 > camX && x - 24 < camX + LOGIC_W;
  },
  throwHammer(e){
    const dir = (Player.x + Player.w / 2) < (e.x + e.w / 2) ? -1 : 1;
    this.hammers.push({ x: e.x + e.w / 2, y: e.y + 2, vx: 2.5 * dir, vy: -2.4, w: 10, h: 10, life: 220, rot: 0 });
    Sfx.bump();
  },
  updateHammers(lv){
    const old = this.hammers;
    this.hammers = [];
    for (const h of old){
      h.life--; h.vy += 0.22; h.rot += 0.35;
      h.x += h.vx; h.y += h.vy;
      if (h.life <= 0) continue;
      /* 命中实心瓦片（含地面）即销毁；火焰例外（在空中划过） */
      if (!h.flame && (isSolidPx(lv, h.x, h.y) || isSolidPx(lv, h.x + h.w, h.y + h.h))) continue;
      this.hammers.push(h);
    }
  },

  /* ---------------- 库巴 BOSS ---------------- */
  spawnBoss(x, y){
    this.boss = { x, y, w: 30, h: 32, vx: 1.0, face: 1,
      hp: 5, g: 0, fireC: 40, t: 0, anim: 0,
      flash: 0, dead: false, deadT: 0 };
  },
  updateBoss(lv){
    const b = this.boss;
    if (!b) return;
    if (b.dead){ b.deadT++; b.y += 1.6; return; }     // 坠入岩浆
    b.t++; b.anim++;
    if (b.flash > 0) b.flash--;

    /* 水平行走 + 尽头转身 */
    b.x += b.vx; b.face = b.vx > 0 ? 1 : -1;
    if (this.blockedAhead(lv, b)){ b.vx *= -1; }

    /* 垂直：重力 + 落地（桥上则站立于桥面），定时小跳 */
    b.g = (b.g || 0) + 0.5; b.y += b.g;
    const col = Math.floor((b.x + b.w / 2) / TILE);
    const standY = this.floorBelow(lv, col, b);
    if (b.y + b.h >= standY){ b.y = standY - b.h; b.g = 0; b.air = false; }
    if (!b.air){
      b.jumpC = (b.jumpC === undefined ? 30 : b.jumpC) - 1;
      if (b.jumpC <= 0){ b.g = -6.5; b.air = true; b.jumpC = 70 + ((b.t * 7) | 0) % 50; }
    }

    /* 喷火：朝玩家方向抛火球 */
    b.throwC = (b.throwC === undefined ? 30 : b.throwC) - 1;
    if (b.throwC <= 0 && this.inView(b.x)){ this.bossFire(b); b.throwC = 60 + ((b.t * 9) | 0) % 50; }
  },
  bossFire(b){
    const dir = (Player.x + Player.w / 2) < (b.x + b.w / 2) ? -1 : 1;
    this.hammers.push({ x: b.x + b.w / 2, y: b.y + 6, vx: dir * 2.4, vy: -1.6, w: 10, h: 10, life: 200, rot: 0, flame: true });
    Sfx.fireball();
  },
  /* 前方 1px 是否为地形（墙或悬崖） */
  blockedAhead(lv, e){
    const front = e.vx > 0 ? e.x + e.w + 1 : e.x - 1;
    const frontCol = Math.floor(front / TILE);
    const midY = e.y + e.h / 2;
    const ty = Math.floor(midY / TILE);
    if (frontCol < 0 || frontCol >= lv.cols) return true;
    if (isSolidPx(lv, frontCol * TILE + TILE/2, midY)) return true;     // 撞墙
    // 悬崖：脚下前方无地面
    const ground = lv.ground[frontCol];
    const feetY = e.y + e.h + 2;
    return feetY >= ground * TILE;
  },

  updateItems(lv){
    for (const it of this.items){
      it.born++;
      if (it.pop && it.born < 18) continue;      // 顶出弹出动画
      it.pop = false;
      // 水平移动到砖边
      it.x += it.vx || 0.8;
      const c = Math.floor((it.x + (it.vx>0?1:0)*it.w) / TILE);
      if (isSolidPx(lv, c*TILE + TILE/2, it.y + it.h/2)) it.vx = (it.vx||0.8) * -1;
      if (isSolidPx(lv, it.x + it.w/2, it.y + it.h - 1)){ // 底面碰撞
        // 落下
      }
      it.vy = Math.min(it.vy + 0.5, 4);
      const below = it.y + it.h;
      const r = Math.floor(below / TILE);
      const c0 = Math.floor(it.x / TILE), c1 = Math.floor((it.x + it.w) / TILE);
      let landed = false;
      for (let cc=c0; cc<=c1; cc++){
        if (cc<0||cc>=lv.cols) continue;
        if (r >= lv.ground[cc]){ it.y = r*TILE - it.h; landed = true; break; }
        if (r>=0 && r<GRID_ROWS){ const t = rowAt(lv,cc,r); if(t===T_BRICK||t===T_QUESTION||t===T_USED||t===T_BLOCK||t===T_PIPE||t===T_CASTLE){ it.y=r*TILE-it.h; landed=true; break; } }
      }
      it.y += it.vy;
      if (landed){ it.vy = 0.6; }
    }
  },

  updateBalls(lv){
    for (const b of this.balls){
      b.life--;
      b.vy += 0.45;
      const below = b.y + b.h, r = Math.floor(below / TILE), c = Math.floor((b.x + b.w/2) / TILE);
      if (c>=0 && c<lv.cols && r >= lv.ground[c]){ b.y = r*TILE - b.h; b.vy = -1.5; }  // 弹跳
      if (b.vy > 2.5) b.vy = 2.5;
      b.x += b.vx; b.y += b.vy;
      const cc = Math.floor(b.x / TILE), ccc = Math.floor((b.x+b.w)/TILE);
      for(let ccx=cc;ccx<=ccc;ccx++) if (ccx>=0&&ccx<lv.cols && isSolidPx(lv, ccx*TILE+TILE/2, b.y)) { this.destroyBall(b); break; }
    }
  },

  destroyBall(b){ const i = this.balls.indexOf(b); if(i>=0) this.balls.splice(i,1); },
};