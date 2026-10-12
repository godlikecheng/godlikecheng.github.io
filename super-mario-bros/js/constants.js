"use strict";
/* ============================================================
 * constants.js — 基础常量、物理参数、工具函数、音效与主题音乐
 * 依赖：无
 * ============================================================ */

/* 画布：逻辑分辨率 256x240（与原版一致），内部按 SCALE=2 输出 */
const LOGIC_W = 256, LOGIC_H = 240, SCALE = 2;
const TILE = 16;             // 瓦片尺寸（16x16 逻辑像素）

/* 瓦片类型 */
const T_EMPTY   = 0;         // 空地
const T_GROUND  = 1;         // 地面砖（实心，不可破坏）
const T_BRICK   = 2;         // 砖块（顶可弹，跳跃可顶碎；受限于形态）
const T_QUESTION= 3;         // 问号砖（顶出道具/金币）
const T_USED    = 4;         // 已被顶过的问号砖
const T_PIPE    = 5;         // 管道（实心，分 4 向组合）
const T_BLOCK   = 6;         // 不可破坏石块（实心）
const T_COIN    = 7;         // 空中金币（可拾取）
const T_FLAG    = 8;         // 旗杆（过关触发）
const T_CASTLE  = 9;         // 城堡/装饰（实心装饰）
const T_QM      = 10;        // 问号：必出超级蘑菇
const T_QFIRE   = 11;        // 问号：必出火花（火力）
const T_QSTAR   = 12;        // 问号：必出无敌星
const T_Q1UP    = 13;        // 问号：必出 1UP
const T_WARP    = 14;        // 隐藏跳转触发（非实心）
const T_BRIDGE  = 15;        // 城堡桥面（实心，可被斧头劈断）
const T_AXE     = 16;        // 城堡斧头（实心，触发劈桥）
const T_HIDDEN  = 17;        // 隐藏砖（隐形，顶出金币后变 T_USED）

/* 可被顶的实心内容（碰撞 / 顶砖判定复用） */
const BUMPABLE = [T_BRICK, T_QUESTION, T_QM, T_QFIRE, T_QSTAR, T_Q1UP, T_BLOCK, T_PIPE, T_CASTLE, T_HIDDEN];

/* 玩家形态 */
const FORM_SMALL = 0, FORM_BIG = 1, FORM_FIRE = 2;

/* 敌人类型 */
const E_GOOMBA = 0, E_KOOPA = 1, E_HAMMER = 2, E_BULLET = 3, E_SPINY = 4,
      E_LAKITU = 5, E_BUZZY = 6, E_BLOOPER = 7, E_CHEEP = 8, E_PODOBOO = 9;

/* 游戏整体状态机 */
const ST = { IDLE:"idle", PLAY:"play", DYING:"dying", PAUSED:"paused",
             LEVELCLEAR:"levelclear", GAMEOVER:"gameover", WIN:"win" };

/* 身体尺寸（逻辑像素）[宽, 高]，随形态变化 */
const BODY_SIZE = { [FORM_SMALL]: [12, 14], [FORM_BIG]: [12, 30], [FORM_FIRE]: [12, 30] };

/* 击碎/计分等界面常量 */
const BONUS_LIFE_COINS = 100; // 满 100 金币奖励 1 生命
const BONUS_LIFE_SCORE = 20000; // 每达 2 万分奖励 1 生命（原版）
const START_TIME = 400;       // 关卡倒计时（帧折算为秒= /60，UI 显示秒）
const START_LIVES = 3;        // 初始生命

/* localStorage 键 */
const CFG_KEY = "smb-config", HI_KEY = "smb-hiscore";

/* ================= 工具 ================= */
const el = id => document.getElementById(id);
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
/* 逻辑坐标下的整数瓦片换算 */
const tileX = x => (x / TILE) | 0;
const tileY = y => (y / TILE) | 0;

/* ================= 输入 ================= */
const Input = {
  left:false, right:false, up:false, down:false,
  jump:false, run:false, jumpPressed:false,  // jumpPressed: 本次跳指令的边缘（防止连跳）
  bind(){
    const kd = e => {
      switch(e.code){
        case "ArrowLeft": case "KeyA": this.left = true; e.preventDefault(); break;
        case "ArrowRight": case "KeyD": this.right = true; e.preventDefault(); break;
        case "ArrowUp": case "KeyW": this.up = true; e.preventDefault(); break;
        case "ArrowDown": case "KeyS": this.down = true; e.preventDefault(); break;
        case "KeyZ": case "KeyK": if(!this.jump){ this.jump = true; this.jumpPressed = true; } e.preventDefault(); break;
        case "KeyX": case "KeyJ": this.run = true; e.preventDefault(); break;
      }
    };
    const ku = e => {
      switch(e.code){
        case "ArrowLeft": case "KeyA": this.left = false; break;
        case "ArrowRight": case "KeyD": this.right = false; break;
        case "ArrowUp": case "KeyW": this.up = false; break;
        case "ArrowDown": case "KeyS": this.down = false; break;
        case "KeyZ": case "KeyK": this.jump = false; break;
        case "KeyX": case "KeyJ": this.run = false; break;
      }
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    // 每次帧末清边缘跳标记
  },
  consumeJump(){ const p = this.jumpPressed; this.jumpPressed = false; return p; },
};

/* ================= 音效（WebAudio 合成，无外部资源） ================= */
const Sfx = {
  ctx: null, enabled: true,
  init(){ if(!this.ctx){ try{ this.ctx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } },
  tone(f0, f1, dur, type, vol){
    if(!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(vol || 0.09, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur);
  },
  seq(notes, step){                                            // notes: [[freq,dur]] 依次
    (notes||[]).forEach((n,i)=> setTimeout(()=>this.tone(n[0],n[0],n[1],"square",0.10), i*step));
  },
  jump(){ this.tone(240, 620, 0.18, "square", 0.10); },
  coin(){ this.tone(988, 1319, 0.12, "square", 0.10); this.tone(1319,1319,0.14,"square",0.10); },
  bump(){ this.tone(180, 90, 0.08, "square", 0.10); },
  breakBrick(){ this.seq([[400,0.05],[300,0.05],[200,0.05]], 22); },
  stomp(){ this.tone(420, 120, 0.16, "square", 0.10); },
  pipe(){ this.seq([[440,0.06],[587,0.06],[659,0.10]], 40); },
  powerup(){ this.seq([[523,0.08],[659,0.08],[784,0.08],[1047,0.16]], 90); },
  fireball(){ this.tone(1200, 500, 0.16, "sawtooth", 0.07); },
  hurt(){ this.seq([[320,0.10],[240,0.10],[160,0.14]], 95); },
  kick(){ this.tone(700, 300, 0.10, "square", 0.10); },
  oneup(){ this.seq([[659,0.10],[523,0.10],[659,0.10],[1319,0.10],[784,0.10],[523,0.10],[784,0.10],[1319,0.16]], 85); },
  timeWarn(){ this.seq([[988,0.08],[988,0.08],[988,0.08]], 140); },
  clearFlag(){ this.seq([[988,0.12],[784,0.12],[659,0.12],[523,0.24]], 130); },
  die(){ this.seq([[523,0.16],[392,0.16],[262,0.22],[196,0.34]], 140); },
  select(){ this.tone(880, 880, 0.07, "square", 0.10); },
};

/* ================= 主题音乐（WebAudio 简易循环，8-bit 风格） ================= */
const Music = {
  timer:null, step:0, playing:false, stepMs:150, kind:"title",
  MEL: [],   // 由 setTheme 装载
  TITLE: [ 392,0,392,0,523,392,0,349, 330,0,262,0,294,0,330,0,
           392,0,392,0,523,392,0,349, 330,0,392,0,330,0,294,0 ],
  LAND:  [ 392,0,392,0,523,392,0,349, 330,0,262,0,294,0,330,0,   // 陆地主题
           392,0,392,0,523,392,0,349, 330,0,392,0,330,0,294,0,
           523,0,523,0,659,523,0,440, 392,0,294,0,330,0,392,0,
           392,0,392,0,523,392,0,349, 330,0,392,0,330,0,294,0 ],
  UNDER:[ 196,0,196,0,235,196,0,196, 262,0,235,0,196,0,0,0,      // 地下主题
          196,0,196,0,235,196,0,196, 262,0,262,0,196,0,0,0 ],
  WATER:[ 262,0,330,349,330,262,220,262, 330,294,262,0,0,0,0,0,  // 水下主题
          220,0,233,247,262,247,233,220, 196,0,233,220,196,0,0,0 ],
  CASTLE:[ 110,0,110,0,110,0,110,131, 0,0,110,0,110,0,110,131,   // 城堡主题
           110,0,110,0,110,0,110,131, 147,131,123,131,110,0,0,0 ],
  setTheme(kind){
    this.kind = kind;
    this.MEL = kind==="land" ? this.LAND : kind==="under" ? this.UNDER
             : kind==="water" ? this.WATER : kind==="castle" ? this.CASTLE : this.TITLE;
  },
  start(kind){
    this.setTheme(kind || "title");
    if(this.playing) return;
    this.playing = true; this.step = 0;
    this.stepMs = (this.kind==="castle") ? 200 : (this.kind==="water"||this.kind==="under") ? 230 : 140;
    this.timer = setInterval(()=>this.tick(), this.stepMs);
  },
  stop(){ if(this.timer){ clearInterval(this.timer); this.timer=null; } this.playing=false; },
  tick(){
    if(!Sfx.ctx) return;
    const f = this.MEL[this.step % Math.max(1, this.MEL.length)];
    if(f) Sfx.tone(f, f, this.stepMs/1000, "square", 0.045);
    this.step++;
  },
};