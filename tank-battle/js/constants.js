"use strict";
/* ============================================================
 * constants.js — 基础常量、工具函数与音效
 * ============================================================ */

/* 画布：26x26 个半格，坦克占 2x2 半格；调整 TILE 即可整体缩放游戏框 */
const TILE = 30, COLS = 26, ROWS = 26, W = COLS * TILE, H = ROWS * TILE;
const HALF = TILE / 2;        // 半格中心 / 移动吸附粒度

/* 地形类型 */
const T_EMPTY = 0, T_BRICK = 1, T_STEEL = 2, T_WATER = 3, T_TREE = 4, T_ICE = 5, T_BASE = 9;

/* 方向：上右下左 */
const DIRS = [{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}];

/* 难度参数：敌人速度 / 敌人子弹速度 / 每帧开火概率 / 出生间隔 */
const DIFF = [
  { name:"简单", espeed:1.0, ebullet:3.2, fire:0.006, spawn:200 },
  { name:"普通", espeed:1.3, ebullet:3.8, fire:0.012, spawn:160 },
  { name:"困难", espeed:1.6, ebullet:4.6, fire:0.022, spawn:120 },
];

/* 敌人坦克类型：普通 / 快速 / 强火力 / 装甲 */
const ENEMY_TYPES = [
  { score:100, speed:1.0, color:"#9aa0a6", hp:1 },
  { score:200, speed:1.7, color:"#6ec6ff", hp:1 },
  { score:300, speed:1.0, color:"#ff8a65", hp:1 },
  { score:400, speed:0.8, color:"#81c784", hp:4 },
];

/* 道具类型 */
const POWERUPS = {
  star:   { name:"星星", color:"#ffd54f" },  // 火力升级：1级快弹 / 2级双发 / 3级可穿钢墙
  tank:   { name:"坦克", color:"#81c784" },  // 增加 1 条生命
  helmet: { name:"头盔", color:"#4fc3f7" },  // 10 秒护盾
  bomb:   { name:"炸弹", color:"#ef5350" },  // 消灭场上全部敌人
  shovel: { name:"铁锹", color:"#ffb74d" },  // 基地砖墙变钢墙 15 秒
  timer:  { name:"时钟", color:"#ba68c8" },  // 冻结全部敌人 8 秒
};
const POWERUP_KINDS = Object.keys(POWERUPS);
const POWERUP_SCORE = 500;          // 拾取道具得分

/* 经典 35 关敌人配比表 [普通, 快速, 强火力, 装甲]，每关合计 20 辆，组序即出场序（数据来自 FC 原版逐关统计） */
const CLASSIC_ENEMIES = [
  [18,2,0,0],[14,4,0,2],[14,4,0,2],[ 2,5,10,3],[ 8,5,5,2],
  [ 9,2,7,2],[10,4,6,0],[ 7,4,7,2],[ 6,4,7,3],[12,2,4,2],
  [ 0,10,4,6],[0,6,8,6],[0,8,8,4],[0,4,10,6],[2,10,0,8],
  [16,2,0,2],[10,2,0,8],[2,8,6,4],[4,4,4,8],[2,8,2,8],
  [ 6,2,8,4],[6,8,2,4],[0,10,4,6],[10,4,4,2],[0,8,2,10],
  [ 4,6,4,6],[2,8,2,8],[15,2,2,1],[0,4,10,6],[4,8,4,4],
  [ 0,8,6,6],[6,4,2,8],[0,8,4,8],[0,10,4,6],[0,6,4,10],
];

/* 经典规则：每关第 4 / 11 / 18 辆出场的是道具携带车（红色闪烁） */
const CARRY_SLOTS = [3, 10, 17];
const SHOVEL_TIME   = 900;          // 铁锹持续帧数（15 秒）
const FREEZE_TIME   = 480;          // 冻结持续帧数（8 秒）
const HELMET_TIME   = 600;          // 头盔持续帧数（10 秒）

/* 经典规则：得分达到该值奖励 1 条生命（每局一次） */
const BONUS_LIFE_SCORE = 20000;

/* 开场幕布：合拢 / 停留 / 展开 帧数 */
const CURTAIN_CLOSE = 20, CURTAIN_HOLD = 70, CURTAIN_OPEN = 25;
const CURTAIN_TOTAL = CURTAIN_CLOSE + CURTAIN_HOLD + CURTAIN_OPEN;

/* 冰面惯性滑行帧数 */
const ICE_SLIDE = 16;

/* 配置与最高分的 localStorage 键名 */
const CFG_KEY = "tank-battle-config", HI_KEY = "tank-battle-hiscore";
const UNLOCK_KEY = "tank-battle-unlocked";   // 最高解锁关卡
const CUSTOM_KEY = "tank-battle-custom";     // 自定义关卡数据

/* ================= 背景音乐（WebAudio 合成 8-bit 循环旋律） ================= */
const Music = {
  timer: null, step: 0,
  // 主旋律（Hz，0 = 休止），每格约 170ms
  MEL: [
    659,0,659,0,587,659,0,494,  523,0,587,0,659,0,0,0,
    784,0,740,0,659,587,0,523,  494,0,523,0,587,0,0,0,
  ],
  // 低音（每 2 格触发一次）
  BAS: [165,0,165,0,131,0,131,0, 110,0,110,0,131,0,131,0],
  vol() { return [0, 0.045, 0.085, 0.14][(config && config.bgm) || 0]; },
  start() { if (!this.timer) this.timer = setInterval(() => this.tick(), 170); },
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } },
  tick() {
    const v = this.vol();
    if (!v || !Sfx.ctx) return;
    const f = this.MEL[this.step % this.MEL.length];
    if (f) Sfx.play(f, f, 0.16, "square", v);
    if (this.step % 2 === 0) {
      const b = this.BAS[(this.step / 2) % this.BAS.length];
      if (b) Sfx.play(b, b, 0.3, "triangle", v * 0.9);
    }
    this.step++;
  },
};

/* ================= 工具 ================= */
const el = id => document.getElementById(id);
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* ================= 音效（WebAudio 合成，无外部资源） ================= */
const Sfx = {
  ctx: null, enabled: true,
  init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){} } },
  play(f0, f1, dur, type, vol) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur);
  },
  shoot()  { this.play(900, 250, 0.07, "square", 0.10); },
  brick()  { this.play(500, 180, 0.05, "square", 0.10); },
  steel()  { this.play(220, 150, 0.06, "square", 0.08); },
  boom()   { this.play(240, 30, 0.35, "sawtooth", 0.22); },
  bigboom(){ this.play(180, 20, 0.7, "sawtooth", 0.30); },
  life()   { this.play(600, 900, 0.15, "square", 0.12); },
  pause()  { this.play(520, 260, 0.12, "square", 0.12); },
  clear()  { [523, 659, 784].forEach((f, i) => setTimeout(() => this.play(f, f, 0.12, "square", 0.12), i * 110)); },
  /* 履带行进引擎声：持续低频锯齿波，移动时开启 */
  engine(on) {
    const want = on && this.enabled && this.ctx && state === "running";
    if (want && !this.engOn) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = "sawtooth"; o.frequency.value = 48;
      g.gain.value = 0.028;
      o.connect(g); g.connect(this.ctx.destination); o.start();
      this.eng = { o, g }; this.engOn = true;
    } else if (!want && this.engOn) {
      try {
        this.eng.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
        this.eng.o.stop(this.ctx.currentTime + 0.12);
      } catch(e){}
      this.engOn = false;
    }
  },
};
