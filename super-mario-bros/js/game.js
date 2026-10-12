"use strict";
/* ============================================================
 * game.js — 游戏状态机与核心逻辑（世界推进、计分、碰撞、死亡、过关）
 * 依赖：constants.js, map.js, player.js, entities.js
 * ============================================================ */

const Game = {
  state: ST.IDLE,
  world: 1, level: 1,
  score: 0, hiscore: 0, lives: START_LIVES, coins: 0,
  lv: null,
  timeF: START_TIME * 60, t: 0,
  dying: false, dyingT: 0,
  clearAnim: 0,
  lastRun: false,
  fireCooldown: 0,
  hitFlash: 0,
  stompCombo: 0,          // 单次跳跃连踩计数（连踩递增加分）
  nextLifeAt: BONUS_LIFE_SCORE, // 每达 2 万分奖励 1 生命
  carry: null,            // 正携带的龟壳
  flag: null,             // 旗杆过关动画进度 {flagC, mode, t}
  startWorld: 1,          // 开场选关

  floaters: [],           // 计分漂浮数字 [{x,y,text,t}]
  fireworks: [],          // 过关烟花
  party: [],              // 结算时城堡烟花
  transition: null,       // 关卡转场大字卡 {t}
  clearing: null,         // 结算滚动 {totalSec, added, secs}
  subLV: null,            // 当前子关卡（管道进入后）
  mainLV: null,           // 主关卡（子关退出后恢复）
  returnX: 0,             // 子关出口回到主关的玩家 x
  pipeAnim: null,         // 管道进出动画 {t, mode, dir}
  bonusSeq: null,         // 结算烟火子弹

  /* ---------- 初始与流程 ---------- */
  startGame(){
    this.world = this.startWorld; this.level = 1;
    this.score = 0; this.lives = START_LIVES; this.coins = 0;
    this.nextLifeAt = BONUS_LIFE_SCORE;
    this.enterLevel();
  },
  resume(){},

  enterLevel(){
    this.lv = loadLevel(this.world, this.level);
    Player.reset(this.lv);
    Entities.clear();
    for (const s of (this.lv.plantsSpawn || [])) Entities.spawnPlant(s.c, s.topRow);
    for (const fb of (this.lv.firebars || [])) Entities.spawnFirebar(fb.x, fb.y, fb.count, fb.r, fb.speed);
    for (const p of (this.lv.podoboos || [])) Entities.spawnEnemy(E_PODOBOO, p.col * TILE + 2, LOGIC_H + 2);
    if (this.lv.boss && this.lv.bossSpawn) Entities.spawnBoss(this.lv.bossSpawn.x, this.lv.bossSpawn.y);
    this.timeF = (this.world === 8 && this.level === 4) ? 400 * 60 : START_TIME * 60;
    this.t = 0; this.dying = false; this.clearAnim = 0; this.fireCooldown = 0;
    this.stompCombo = 0; this.carry = null; this.flag = null;
    this.spawnLog = [];
    /* 新增演出状态复位 */
    this.floaters.length = 0; this.fireworks.length = 0; this.party.length = 0;
    this.subLV = null; this.mainLV = null; this.returnX = 0; this.pipeAnim = null;
    this.clearing = null; this.transition = { t: 0 };         // 关末结算 / 转场大字卡
    this._sec = 0; this._rollRemain = 0; this._entSave = null; // 结算滚动 / 子关实体快照
    this._secAcc = 0;                                          // 倒计时秒累加器
    this.state = ST.PLAY;
    /* 关内主题音乐（陆/水/城堡） */
    const kind = this.lv.castle ? "castle" : this.lv.water ? "water" : "land";
    this.theme = kind;
    this.playTheme(kind);
  },

  /* 统一换主题音乐（避免 Music.start 的 playing 单次守卫） */
  playTheme(kind){
    if (Music.playing) Music.stop();
    Music.start(kind);
  },

  gotoNext(){
    // 结算已在触旗时完成，此处仅推进
    if (this.level === 4){
      if (this.world === TOTAL_WORLDS){ this.state = ST.WIN; Music.stop(); this.saveHi(); return; }
      this.world++; this.level = 1;
    } else this.level++;
    this.enterLevel();
  },

  /* ---------- 主更新（由 main 每帧调用） ---------- */
  update(dt, input){
    this.t += dt;
    if (this.state === ST.LEVELCLEAR){ this.updateCelebration(); return; }   // 过关庆祝（烟花）
    if (this.state === ST.DYING){ this.updateDying(dt); return; }
    if (this.state !== ST.PLAY) return;
    if (this.clearing){ this.updateClearing(); return; }    // 关末时间奖励滚动
    if (this.pipeAnim){ this.updatePipeAnim(); return; }    // 管道进出动画

    /* 倒计时（累加器精确按 60 逻辑步 = 1 游戏秒：timeF 为帧单位，每秒扣 60 帧） */
    this._secAcc += dt;
    while (this._secAcc >= 60){
      this._secAcc -= 60;
      if (this.timeF > 0){
        this.timeF = Math.max(0, this.timeF - 60);
        if (this.timeF === 0){ this.timeOut(); return; }
      }
    }

    /* 玩家 */
    Player.step(this.lv, input);
    this.clearComboOnLand();                                    // 落地清空连踩
    if (Player.y > LOGIC_H + 20){ this.dieByPit(); return; }       // 坠坑
    this.spawnEnemies();
    this.checkFlag();                                           // 触旗 → 进入滑杆动画
    if (this.flag){ this.updateFlag(); return; }                // 滑杆/走进城堡中
    this.handleCarry(input);                                    // 携带龟壳跟随 / 踢出

    /* 敌人与道具 */
    Entities.updateEnemies(this.lv);
    Entities.updateItems(this.lv);
    Entities.updateBalls(this.lv);
    Entities.updateHammers(this.lv);
    Entities.updateFirebars(this.lv);
    this.collideFireballs();

    /* 火球发射（火力形态按 X/J 边沿） */
    this.fireCooldown = Math.max(0, this.fireCooldown - 1);
    if (Player.form === FORM_FIRE && input.run && !this.lastRun && this.fireCooldown <= 0){
      Entities.spawnBall(Player.x + Player.w/2, Player.y + Player.h/2 - 6, Player.face);
      this.fireCooldown = 12; Sfx.fireball();
    }
    this.lastRun = input.run;

    /* 食人花 */
    Entities.updatePlants();
    this.collidePlants();

    /* 库巴 BOSS */
    Entities.updateBoss(this.lv);
    this.collideBoss();
    this.checkAxe();

    this.collideItems();
    this.collideEnemies();
    this.collideFirebars();
    this.collideHammers();
    this.collideCoins();
    this.checkWarp(input);
    this.checkBonusPipe(input);
    this.updateFloaters();
  },

  /* ---------- 隐藏跳转（脚下 T_WARP 按住 ↓） ---------- */
  checkWarp(input){
    if (!input.down) return;
    const lv = this.lv;
    if (!lv.warpTarget) return;
    const r0 = Math.max(0, Math.floor(Player.y / TILE)),
          r1 = Math.min(GRID_ROWS - 1, Math.floor((Player.y + Player.h - 1) / TILE));
    for (let c = Math.floor(Player.x / TILE); c <= Math.floor((Player.x + Player.w) / TILE); c++){
      if (c < 0 || c >= lv.cols) continue;
      for (let r = r0; r <= r1; r++)
        if (rowAt(lv, c, r) === T_WARP){
          this.world = lv.warpTarget; this.level = 1;
          Sfx.pipe(); this.enterLevel();
          return;
        }
    }
  },

  /* ---------- 库巴碰撞 ---------- */
  collideBoss(){
    const b = Entities.boss;
    if (!b || b.dead) return;
    /* 火球命中：5 发击倒 */
    for (const bl of Entities.balls){
      if (overlap(bl.x, bl.y, bl.w, bl.h, b.x, b.y, b.w, b.h)){ Entities.destroyBall(bl); this.hitBoss(); break; }
    }
    /* 接触一律受伤（不可踩踏） */
    if (!overlap(Player.x, Player.y, Player.w, Player.h, b.x, b.y, b.w, b.h)) return;
    if (Player.star > 0){ this.hitBoss(); return; }
    if (Player.invuln > 0) return;
    this.damage();
  },
  hitBoss(){
    const b = Entities.boss;
    if (!b || b.dead) return;
    Sfx.stomp(); b.flash = 8; b.hp--;
    if (b.hp <= 0){ b.dead = true; b.deadT = 0; this.addScore(5000); }
  },

  /* ---------- 斧头：劈桥过关 ---------- */
  checkAxe(){
    const lv = this.lv;
    if (!lv.castle) return;
    let ax = -1, ar = -1;
    for (let c = 0; c < lv.cols; c++) for (let r = 0; r < GRID_ROWS; r++) if (rowAt(lv, c, r) === T_AXE){ ax = c; ar = r; break; }
    if (ax < 0) return;
    /* 触发盒外扩 2px：玩家贴面/齐平站上斧头块时 AABB 严格判定为 0 重叠，无法触发 */
    if (overlap(Player.x, Player.y, Player.w, Player.h, ax * TILE - 2, ar * TILE - 2, TILE + 4, TILE + 4)) this.cutAxe();
  },
  cutAxe(){
    const lv = this.lv;
    /* 劈断桥面（库巴脚下悬空即坠落） */
    for (let c = 0; c < lv.cols; c++) for (let r = 0; r < GRID_ROWS; r++){
      if (rowAt(lv, c, r) === T_BRIDGE) setRow(lv, c, r, T_EMPTY);
      if (rowAt(lv, c, r) === T_AXE)    setRow(lv, c, r, T_EMPTY);
    }
    const b = Entities.boss;
    if (b && !b.dead){ b.dead = true; b.deadT = 0; this.addScore(5000); }
    Sfx.clearFlag(); Music.stop();
    this.lastBonus = 0;
    this.state = ST.LEVELCLEAR;
    this.clearAnim = 0;
  },

  /* ---------- 锤子碰撞（被抛锤砸中） ---------- */
  collideHammers(){
    for (const h of Entities.hammers){
      if (!overlap(Player.x, Player.y, Player.w, Player.h, h.x, h.y, h.w, h.h)) continue;
      if (Player.star > 0){ const i = Entities.hammers.indexOf(h); if (i >= 0) Entities.hammers.splice(i, 1); continue; }
      if (Player.invuln > 0) continue;
      if (this.damage()) return;
    }
  },

  /* ---------- 食人花碰撞 ---------- */
  collidePlants(){
    for (const p of Entities.plants){
      if (p.dead) continue;
      const b = Entities.actualPlantBox(p);
      if (b.h < 2) continue;                                   // 基本缩回，不可命中
      if (!overlap(Player.x, Player.y, Player.w, Player.h, b.x, b.y, b.w, b.h)) continue;

      // 无敌星直接消灭
      if (Player.star > 0){ this.killPlant(p, 200); continue; }
      if (Player.invuln > 0) continue;

      // 踩踏判定：下落且脚部落于探出部分上半 → 可踩
      const feetOnTop = Player.vy > 0 && (Player.y + Player.h - b.y) <= b.h * 0.5;
      if (feetOnTop){
        if (p.target >= p.maxOut - 0.5){ this.killPlant(p, 200); }   // 完全探出→直接踩死
        else {                                                       // 伸缩中→仅缩回
          Sfx.stomp(); p.target = 0; this.addScore(100);
          Player.vy = -P_JV * 0.5; Player.onGround = false; Player.air = true;
        }
      } else if (this.damage()){ return; }
    }
    /* 火球命中食人花 */
    for (const b of Entities.balls){
      for (const p of Entities.plants){
        if (p.dead) continue;
        const pb = Entities.actualPlantBox(p);
        if (pb.h < 2) continue;
        if (overlap(b.x, b.y, b.w, b.h, pb.x, pb.y, pb.w, pb.h)){ Entities.destroyBall(b); this.killPlant(p, 200); break; }
      }
    }
  },
  killPlant(p, pts){
    p.dead = true; this.addScore(pts); Sfx.stomp();
  },

  /* ---------- 各类碰撞 ---------- */
  collideItems(){
    for (let i = 0; i < Entities.items.length; i++){
      const it = Entities.items[i];
      if (it.pop) continue;
      if (overlap(Player.x, Player.y, Player.w, Player.h, it.x, it.y, it.w, it.h)){
        this.pickItem(it, i);
      }
    }
  },
  pickItem(it, i){
    Entities.items.splice(i, 1);
    switch (it.kind){
      case "coin":  this.addCoin(); break;
      case "mushroom":
        if (Player.form === FORM_SMALL) Player.grow();
        else this.addScore(1000);
        break;
      case "fire":  Player.fireUp(); break;
      case "star":  Player.starUp(); this.addScore(1000); break;
      case "1up":   this.lives++; Sfx.oneup(); break;
    }
  },

  collideEnemies(){
    for (let i = 0; i < Entities.enemies.length; i++){
      const e = Entities.enemies[i];
      if (e.dead) continue;
      if (!overlap(Player.x, Player.y, Player.w, Player.h, e.x, e.y, e.w, e.h)) continue;

      // 无敌星：直接消灭
      if (Player.star > 0){ this.killEnemy(e); continue; }
      // 无敌帧忽略
      if (Player.invuln > 0) continue;

      // 龟壳
      if (e.shell){
        if (this.carry === e) continue;                        // 正在携带的壳不处理
        if (e.kick > 0){                                       // 滑行壳（踢出后有短暂无伤豁免）
          if (e.kickGrace > 0){ e.kickGrace--; continue; }
          if (this.damage()) return;
        }
        else if (this.carry){                                   // 已携带一壳 → 踢开此静止壳
          e.kick = 120; e.vx = Player.x + Player.w/2 < e.x + e.w/2 ? 3 : -3;
          e.kickGrace = 10;
          Sfx.kick(); this.addScore(400);
        } else {                                                // 空手 → 捡起携带（D 类）
          this.carry = e; e.beingCarried = true; e.vx = 0;
        }
        continue;
      }

      // 踩踏判定：正在下落且脚部落在敌上半（noStomp 敌人一律视为伤害）
      if (!e.noStomp && Player.vy > 0 && (Player.y + Player.h - e.y) <= e.h * 0.55){
        this.stomp(e);
      } else {
        if (this.damage()) return;
      }
    }
  },

  stomp(e){
    // 龟壳类敌人（慢慢龟/硬壳龟）→ 缩成壳；否则击杀
    this.stompCombo++;                                  // 连踩：同一次跳跃连踩加分（B 类）
    const comboPts = (this.stompCombo - 1) * 100;
    if (comboPts > 0) this.addScore(comboPts);
    if (e.shellable && !e.shell){
      const nh = e.type === E_KOOPA ? 14 : 15;
      e.y += e.h - nh; e.h = nh; e.shell = true;
      Sfx.stomp();
    } else {
      this.killEnemy(e);
    }
    Player.vy = -P_JV * 0.62; Player.onGround = false; Player.air = true;
    Sfx.stomp();
  },

  /* 落地即清空连踩计数 */
  clearComboOnLand(){ if (Player.onGround) this.stompCombo = 0; },

  /* 携带龟壳：跟到身前，按跳踢出（D 类） */
  handleCarry(input){
    const c = this.carry;
    if (!c) return;
    c.x = Player.x + (Player.face > 0 ? Player.w : -c.w);
    c.y = Player.y - 2;
    if (input.jumpPressed){                                  // 踢出
      c.beingCarried = false; c.kick = 120; c.vx = Player.face * 3.2;
      c.kickGrace = 10;
      this.carry = null; Sfx.kick(); this.addScore(400);
    }
  },
  dropCarry(){                                                // 死亡/换关时丢弃
    if (this.carry){ this.carry.beingCarried = false; this.carry = null; }
  },

  /* 火球命中敌人：击杀并 +200（B 类计分） */
  collideFireballs(){
    if (!Entities.balls.length || !Entities.enemies.length) return;
    for (const b of Entities.balls){
      for (const e of Entities.enemies){
        if (e.dead || e.shell || e.type === E_BULLET) continue;   // 龟壳/炮弹免疫
        if (overlap(b.x, b.y, b.w, b.h, e.x, e.y, e.w, e.h)){
          Entities.destroyBall(b); this.killEnemy(e, 200); break;
        }
      }
    }
  },

  /* 火棒碰撞：触及火焰链受伤 */
  collideFirebars(){
    if (Player.star > 0 || Player.invuln > 0) return;
    for (const f of Entities.firebars){
      for (const [sx, sy] of Entities.firebarSpots(f)){
        if (overlap(Player.x, Player.y, Player.w, Player.h, sx-3, sy-3, 6, 6)){
          this.damage(); return;
        }
      }
    }
  },

  killEnemy(e, score){
    e.dead = true;                          // 仅标记，由 updateEnemies 统一移除（避免遍历中 splice 跳帧）
    const pts = score || e.scoring || 100;
    this.addScore(pts);
    this.floatText(e.x + e.w/2, e.y - 4, "+" + pts);
  },

  /* 空中金币拾取：扫描角色所在列的悬浮金币 */
  collideCoins(){
    const lv = this.lv;
    const c0 = Math.floor(Player.x / TILE), c1 = Math.floor((Player.x + Player.w) / TILE);
    const r0 = Math.floor(Player.y / TILE), r1 = Math.floor((Player.y + Player.h - 1) / TILE);
    for (let c = c0; c <= c1; c++){
      if (c < 0 || c >= lv.cols) continue;
      for (let r = r0; r <= r1; r++){
        if (r < 0 || r >= GRID_ROWS) continue;
        if (rowAt(lv, c, r) === T_COIN){ setRow(lv, c, r, T_EMPTY); this.addCoin(); }
      }
    }
  }, 

  /* 旗杆过关：滑杆 → 走入城堡 → 结算（产品文档第 9 / 11 章） */
  checkFlag(){
    const lv = this.lv;
    const flagC = this.flagCol();
    if (flagC < 0 || this.flag) return;                        // 已滑杆中则忽略
    if (Player.x + Player.w >= flagC * TILE){
      Sfx.clearFlag();
      /* 高度分：抓杆越高奖励越高 */
      const baseRow = clamp(lv.ground[flagC], 0, GRID_ROWS);
      const hangRow = clamp(Math.floor(Player.y / TILE), 0, GRID_ROWS - 1);
      const tiles = clamp(baseRow - hangRow, 1, 7);            // 距地面几格（顶部=大）
      const BONUS = [100, 200, 400, 800, 2000, 4000, 5000];    // 抓得越高奖励越高
      const heightBonus = BONUS[tiles - 1];
      this.addScore(heightBonus);
      this.lastBonus = heightBonus;

      this.flag = { c: flagC, mode: "slide", t: 0 };
      Player.canAct = false;
      Player.vx = 0; Player.vy = 0;
    }
  },

  updateFlag(){
    const f = this.flag, lv = this.lv;
    f.t++;
    const baseRow = clamp(lv.ground[f.c], 0, GRID_ROWS);
    const baseY = baseRow * TILE;
    Player.x = f.c * TILE + 5 - Player.w / 2;                  // 吸附到旗杆中线

    if (f.mode === "slide"){
      Player.y = Math.min(baseY - Player.h, Player.y + 1.4);   // 沿杆滑落
      if (Player.y >= baseY - Player.h){
        Player.y = baseY - Player.h; f.mode = "walk"; f.t = 0;
      }
      return;
    }
    /* 走入城堡 */
    Player.y = baseY - Player.h;
    Player.x += 0.9;
    Player.face = 1;
    if (Player.x > lv.cols * TILE - 6 || f.t > 300) this.finishFlag();
  },

  finishFlag(){
    this.flag = null; Player.canAct = false;
    /* 时间奖励滚动结算（戴氏原版：计时器逐秒 ↓、分数逐 50 涨） */
    const sec = Math.ceil(this.timeF / 60);
    this._sec = sec;
    const extra = (sec % 10 === 1 || sec % 10 === 3 || sec % 10 === 6) ? 500 : 0; // 末位彩蛋：+500 & 烟花
    this._rollRemain = sec * 50 + extra;
    this.lastBonus = this._rollRemain;
    this.clearing = { sec, step: 0, added: 0 };
    Music.stop();
  },

  /* 结算：逐秒扣游戏秒、+50 分（每帧 1 秒，约 6~7 秒滚完；音效/漂浮字降频防刷屏） */
  updateClearing(){
    const c = this.clearing; c.step++;
    if (c.sec > 0){
      c.sec--; c.added += 50;
      this.timeF = Math.max(0, this.timeF - 60);
      this.addScore(50);
      if (c.step % 10 === 0){
        const max = Math.max(0, this.lv.cols * TILE - LOGIC_W);
        const camX = clamp(Player.x - LOGIC_W / 2, 0, max);
        this.floatText(camX + 200, 40, "+50");
        Sfx.coin();
      }
    }
    if (c.sec <= 0){
      const left = this._rollRemain - c.added;              // 补末位彩蛋差额
      if (left > 0){ this.addScore(left); }
      this.clearing = null; Player.canAct = true;
      this.finishClear();
    }
  },

  /* 结算完成 → 离场音乐停 → 进入庆祝（烟花） */
  finishClear(){
    this.state = ST.LEVELCLEAR;
    this.clearAnim = 0;
    this.startFireworks();
  },

  /* 过关烟花：计时器末位 1/3/6 各引爆 1/2/3 发（原版彩蛋） */
  startFireworks(){
    this.fireworks.length = 0;
    const d = this._sec % 10;
    const n = (d === 1) ? 1 : (d === 3) ? 2 : (d === 6) ? 3 : 0;
    for (let i = 0; i < n; i++) this.fireworks.push({
      x: 46 + Math.random() * 150, y: LOGIC_H - 30,        // 屏幕坐标（结算时相机静止）
      vy: -(2.0 + i * 0.25), delay: 10 + i * 42, phase: "watch", sparks: [],
    });
  },
  updateCelebration(){
    this.updateFloaters();
    for (const fw of this.fireworks){
      if (fw.phase === "watch"){ if (fw.delay > 0){ fw.delay--; continue; } fw.phase = "rise"; }
      if (fw.phase === "rise"){
        fw.y += fw.vy;
        if (fw.y <= 38){ fw.phase = "burst"; fw.sparks = this.makeSparks(fw.x, fw.y); Sfx.fireball(); }
        continue;
      }
      for (const s of fw.sparks){ s.x += s.vx; s.y += s.vy; s.vy += 0.055; s.t++; }
    }
  },
  makeSparks(x, y){
    const cols = ["#f7d200", "#f5b041", "#e8442c", "#fff", "#6dedff", "#a06bff"];
    const out = [];
    for (let i = 0; i < 30; i++){
      const a = i * 1.05 + Math.random() * 0.6;
      const sp = 1.0 + Math.random() * 1.2;
      out.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6, t: 0, col: cols[i % cols.length] });
    }
    return out;
  },

  /* ---------- 管道进入 → 地下金币子关（f8，最难） ---------- */
  checkBonusPipe(input){
    if (!input.down || this.pipeAnim || this.clearing) return;
    const lv = this.lv;
    const bp = this.subLV ? (lv.exitPipe || null) : (lv.bonusPipe || null);
    if (!bp) return;
    if (Math.floor((Player.x + Player.w / 2) / TILE) !== bp.col) return;   // 需正对管口
    const topY = bp.topRow * TILE;
    if (Player.y + Player.h >= topY - 3 && Player.y + Player.h <= topY + 7){   // 站在管顶
      if (this.subLV) this.exitBonusPipe(); else this.enterBonusPipe();
    }
  },
  enterBonusPipe(){
    Sfx.pipe();
    const bp = this.lv.bonusPipe;
    Player.x = bp.col * TILE + TILE / 2 - Player.w / 2;
    Player.canAct = false;
    this.pipeAnim = { t: 0, mode: "enter" };
  },
  exitBonusPipe(){
    Sfx.pipe();
    Player.canAct = false;
    this.pipeAnim = { t: 0, mode: "exit" };
  },
  updatePipeAnim(){
    this.pipeAnim.t++;
    Player.y += 1.3;                                      // 下潜进管
    if (this.pipeAnim.t >= 26){
      const mode = this.pipeAnim.mode;
      this.pipeAnim = null;
      if (mode === "enter") this.enterBonus(); else this.exitBonus();
    }
  },
  enterBonus(){
    this.dropCarry();                                          // 携带中的壳不能跨关卡（防幽灵壳）
    /* 快照主关敌人/道具与形态，切到地下金币房 */
    this._entSave = JSON.parse(JSON.stringify({
      enemies: Entities.enemies, items: Entities.items,
      form: Player.form, star: Player.star, invuln: Player.invuln,
    }));
    Entities.clear();
    this.mainLV = this.lv;               // 记住主关，退出子关后恢复
    this.subLV = build_bonus_room();
    this.lv = this.subLV;
    Player.reset(this.lv);
    Player.canAct = true;
    this.playTheme("under");
  },
  exitBonus(){
    this.lv = this.mainLV; this.mainLV = null; this.subLV = null;
    Entities.clear();
    if (this._entSave){
      Entities.enemies = this._entSave.enemies;
      Entities.items = this._entSave.items;
      Player.form = this._entSave.form; Player.applyBody();
      Player.star = this._entSave.star; Player.invuln = this._entSave.invuln;
    }
    Player.canAct = true;
    const bp = this.lv.bonusPipe;
    Player.x = bp.col * TILE + TILE / 2 - Player.w / 2;   // 从管顶探头回到主关
    Player.y = bp.topRow * TILE - Player.h - 1;
    Player.onGround = false; Player.vy = 0;
    this._entSave = null;
    this.playTheme(this.lv.castle ? "castle" : this.lv.water ? "water" : "land");
    Sfx.pipe();
  },

  /* 按进度在生成点产出敌人（一次性，防止重复刷怪） */
  spawnEnemies(){
    const lv = this.lv;
    const px = Player.x;
    for (let i = 0; i < lv.enemiesSpawn.length; i++){
      const s = lv.enemiesSpawn[i];
      if (s.spawned) continue;
      if (px + 160 >= s.col * TILE){
        s.spawned = true;
        let sy = (lv.ground[Math.min(s.col, lv.cols-1)] - 1) * TILE - 16;   // 常规：贴地
        if (s.type === E_LAKITU) sy = 3 * TILE + 4;                          // 云里花：高空
        else if (s.type === E_BULLET) sy = 8 * TILE;                        // 炮弹刺客：中空飞行
        Entities.spawnEnemy(s.type, Math.max(16, s.col * TILE), sy);
      }
    }
  },

  /* 找旗杆所在列 */
  flagCol(){
    const lv = this.lv;
    for (let c = 0; c < lv.cols; c++)
      for (let r = 0; r < GRID_ROWS; r++)
        if (rowAt(lv, c, r) === T_FLAG) return c;
    return -1;
  },

  /* ---------- 顶砖副作用 ---------- */
  bumpTile(col, ry){
    const lv = this.lv;
    const t = rowAt(lv, col, ry);
    const KIND = { [T_QM]:"mushroom", [T_QFIRE]:"fire", [T_QSTAR]:"star", [T_Q1UP]:"1up" };
    const bx = col * TILE + 6, by = ry * TILE - 4;
    if (t === T_HIDDEN){                                         // 隐藏砖：顶出金币后现身
      setRow(lv, col, ry, T_USED);
      Sfx.coin(); this.addCoin();
      this.floatText(bx, by, "+200");
    } else if (t === T_QUESTION){
      setRow(lv, col, ry, T_USED);
      Sfx.coin();
      const roll = (col * 7 + ry * 13) % 5;          // 提高道具概率（约 1/5 出头蘑菇）
      if (roll === 0 && lv.cols){ Entities.spawnItem("mushroom", col * TILE, ry * TILE - 16); }
      else { this.addCoin(); this.floatText(bx, by, "+200"); }
    } else if (KIND[t]){
      setRow(lv, col, ry, T_USED);
      Entities.spawnItem(KIND[t], col * TILE, ry * TILE - 16);
      if (t === T_Q1UP){ Sfx.oneup(); this.floatText(bx, by, "1UP!"); } else Sfx.coin();
    } else if (t === T_BRICK){
      if (Player.form === FORM_SMALL){ Sfx.bump(); }
      else {
        setRow(lv, col, ry, T_EMPTY);
        Sfx.breakBrick();
      }
    } else if (t === T_USED){ Sfx.bump(); }
  },

  /* ---------- 计分 / 金币 / 生命 ---------- */
  /* 计分漂浮数字（B 级演出） */
  floatText(x, y, text){
    this.floaters.push({ x, y, text: "" + text, t: 0 });
    if (this.floaters.length > 24) this.floaters.shift();
  },
  updateFloaters(){
    for (const f of this.floaters){ f.t++; f.y -= 0.45; }
    this.floaters = this.floaters.filter(f => f.t < 50);
    if (this.transition) this.transition.t++;
  },
  addScore(n){
    this.score += n;
    if (this.score > this.hiscore) this.hiscore = this.score;
    if (this.score >= this.nextLifeAt){                 // 每 2 万分 +1 命（B 类）
      this.nextLifeAt += BONUS_LIFE_SCORE;
      this.lives++; Sfx.oneup();
    }
  },
  addCoin(){
    this.coins++;
    this.addScore(200);
    Sfx.coin();
    if (this.coins >= BONUS_LIFE_COINS){ this.coins = 0; this.lives++; Sfx.oneup(); }
  },

  /* ---------- 受伤 / 死亡 ---------- */
  damage(){
    const died = Player.shrinkOrDie();
    if (died){ this.die(); }
    return died;
  },
  dieByPit(){ this.die(); Player.y = LOGIC_H; },
  timeOut(){ this.die(); },

  die(){
    this.state = ST.DYING;
    this.dying = true; this.dyingT = 0;
    Player.canAct = false;
    Sfx.die();
    Music.stop();
  },
  updateDying(dt){
    this.dyingT += dt;
    const t = this.dyingT;
    // 上抛 → 下落 → 结束
    if (t < 45) Player.y -= 1.6;
    else if (t < 70) Player.y += 1.2;
    if (t >= 90){
      this.dying = false;
      this.lives--;
      if (this.lives < 0) this.lives = 0;
      if (this.lives <= 0){ this.state = ST.GAMEOVER; this.saveHi(); }
      else this.enterLevel();
    }
  },

  saveHi(){
    if (this.score > this.hiscore){ this.hiscore = this.score; }
    try { localStorage.setItem(HI_KEY, String(this.hiscore)); } catch(e){}
  },
  getHi(){
    try { this.hiscore = +localStorage.getItem(HI_KEY) || 0; } catch(e){ this.hiscore = 0; }
    return this.hiscore;
  },

  /* 关卡显示标签 */
  worldLabel(){ return `${this.world}-${this.level}`; },
  timeSeconds(){ return Math.max(0, Math.ceil(this.timeF / 60)); },
};

/* 简单 AABB 重叠 */
function overlap(ax, ay, aw, ah, bx, by, bw, bh){
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}