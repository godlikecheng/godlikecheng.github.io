"use strict";
/* ============================================================
 * render.js — 像素绘制：瓦片、精灵、背景、顶部 HUD
 * 依赖：constants.js, map.js, game.js（经全局 Game / Player）
 *
 * 渲染在逻辑分辨率 256x240 上进行，调用时已由 main 放大 2x。
 * ============================================================ */

const Renderer = {
  cv: null, ctx: null,
  init(cv){
    this.cv = cv; this.ctx = cv.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.scale(SCALE, SCALE);          // 逻辑坐标 256x240 → 输出 512x480
  },

  draw(){
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, LOGIC_W, LOGIC_H);

    /* 天空背景 */
    const sky = Game.lv && Game.lv.water ? "#6d79a8"
             : Game.lv && Game.lv.castle ? "#4a4454" : "#7ba6d8";
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, LOGIC_W, LOGIC_H);

    if (Game.lv){
      const lv = Game.lv;
      const camX = this.camX(lv);
      this.drawTiles(ctx, lv, camX);
      this.drawCastleWindow(ctx, lv, camX);
      this.drawItems(ctx, camX);
      this.drawPlants(ctx, camX);
      this.drawEnemies(ctx, camX);
      this.drawFirebars(ctx, camX);
      this.drawBoss(ctx, camX);
      this.drawFireballs(ctx, camX);
      this.drawPlayer(ctx, camX);
    }
    this.drawFloaters(ctx);
    this.drawTransition(ctx);
    this.drawCelebration(ctx);
    this.drawHUD(ctx);
  },

  camX(lv){
    const max = Math.max(0, lv.cols * TILE - LOGIC_W);
    return clamp(Player.x - LOGIC_W / 2, 0, max);
  },

  drawTiles(ctx, lv, camX){
    const c0 = Math.floor(camX / TILE), c1 = Math.floor((camX + LOGIC_W) / TILE);
    for (let c = Math.max(0, c0); c <= Math.min(lv.cols-1, c1); c++){
      const sx = c * TILE - camX;
      /* 地面块 */
      if (lv.ground[c] < GRID_ROWS){
        ctx.fillStyle = "#a05a18";
        ctx.fillRect(sx, lv.ground[c] * TILE, TILE, LOGIC_H - lv.ground[c] * TILE);
        if (!lv.castle){                            // 城堡地面无草缘
          ctx.fillStyle = "#70b13f";                // 顶部草缘
          ctx.fillRect(sx, lv.ground[c] * TILE, TILE, 3);
        }
      } else if (lv.castle && lv.ground[c] >= GRID_ROWS){
        /* 城堡岩浆坑：橙红底部 + 波光 */
        ctx.fillStyle = "#b32615";
        ctx.fillRect(sx, LOGIC_H - 48, TILE, 48);
        ctx.fillStyle = "#e8442c";
        ctx.fillRect(sx, LOGIC_H - 44, TILE, 38);
        const wave = Math.sin(c * 0.9 + Game.t * 0.05) * 3;
        ctx.fillStyle = "#f7b91a";
        ctx.fillRect(sx + 1, LOGIC_H - 44 + wave / 1, TILE - 2, 2);
      }
      /* 悬空内容 */
      for (let r = 0; r < Math.min(GRID_ROWS, lv.ground[c]); r++){
        const t = rowAt(lv, c, r);
        if (t) this.drawTile(ctx, t, sx, r * TILE);
        /* 桥面顶行悬空处：铁链（城堡） */
        if (lv.castle && t === T_BRIDGE && (r <= 0 || rowAt(lv, c, r - 1) !== T_BRIDGE)){
          ctx.fillStyle = "#8a8a8a";
          for (let yy = 0; yy < r * TILE; yy += 4) ctx.fillRect(sx + 8, yy, 1, 3);
        }
      }
    }
  },

  /* 单个内容瓦片 */
  drawTile(ctx, t, x, y){
    switch (t){
      case T_BRICK:
        ctx.fillStyle = "#c1571a"; ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = "#7a3510"; ctx.lineWidth = 1;
        ctx.strokeRect(x, y, TILE, TILE);
        ctx.fillStyle = "#e38a3a"; ctx.fillRect(x+2, y+2, 4, 4); ctx.fillRect(x+10, y+9, 4, 4);
        break;
      case T_QUESTION:
      case T_QM:
      case T_QFIRE:
      case T_QSTAR:
      case T_Q1UP:{
        const accent = t===T_QM ? "#c0392b" : t===T_QFIRE ? "#e67e22" : t===T_QSTAR ? "#f1c40f" : t===T_Q1UP ? "#27ae60" : "#8a5a10";
        ctx.fillStyle = "#e5a229"; ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = "#8a5a10"; ctx.lineWidth = 1; ctx.strokeRect(x+0.5, y+0.5, TILE-1, TILE-1);
        ctx.fillStyle = "#fff"; ctx.fillRect(x+5, y+3, 6, 9);
        ctx.fillStyle = accent; ctx.fillRect(x+8, y+8, 4, 4);
        break;
      }
      case T_USED:
        ctx.fillStyle = "#8a6a3a"; ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = "#5e4522"; ctx.lineWidth = 1; ctx.strokeRect(x+0.5, y+0.5, TILE-1, TILE-1);
        break;
      case T_BLOCK:
        ctx.fillStyle = "#b9b1a6"; ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = "#7a7266"; ctx.lineWidth = 1; ctx.strokeRect(x+0.5, y+0.5, TILE-1, TILE-1);
        ctx.fillStyle = "#6e4a2a"; ctx.fillRect(x+5, y+7, 6, 2);
        break;
      case T_PIPE:
        ctx.fillStyle = "#1fae3c"; ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = "#0c6a1f"; ctx.lineWidth = 1; ctx.strokeRect(x+0.5, y+0.5, TILE-1, TILE-1);
        break;
      case T_COIN:
        ctx.fillStyle = "#f7d200"; ctx.beginPath();
        ctx.arc(x+8, y+8, 5, 0, 7); ctx.fill();
        ctx.strokeStyle = "#b8860b"; ctx.lineWidth = 1.5; ctx.stroke();
        break;
      case T_BRIDGE:
        ctx.fillStyle = "#7a5a2a"; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = "#a0713d"; ctx.fillRect(x, y, TILE, 4);
        break;
      case T_AXE:
        ctx.fillStyle = "#9e9e9e"; ctx.fillRect(x+3, y+1, 10, 3);   // 斧柄
        ctx.fillStyle = "#b03a2e"; ctx.fillRect(x+1, y+5, 12, 4);    // 斧刃
        break;
      case T_WARP:
        ctx.fillStyle = "rgba(170,130,220,0.4)"; ctx.fillRect(x, y, TILE, TILE);
        break;
      case T_CASTLE:
        ctx.fillStyle = "#8d6e5a"; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = "#5e4838";
        ctx.fillRect(x, y, TILE, 3); ctx.fillRect(x, y+TILE-3, TILE, 3);
        break;
      case T_FLAG:
        ctx.fillStyle = "#f2b705"; ctx.fillRect(x+10, y, 2, 11);   // 旗面固定于列
        ctx.fillStyle = "#6d9e2f"; ctx.fillRect(x+7, y, 3, 11);
        break;
    }
  },

  /* 计分漂浮数字与金币泡泡 */
  drawFloaters(ctx){
    for (const f of Game.floaters){
      const x = f.x - this.camX(Game.lv), y = f.y;
      if (x < -12 || x > LOGIC_W + 12) continue;
      const a = f.t < 40 ? 1 : Math.max(0, (50 - f.t) / 10);
      ctx.globalAlpha = a;
      ctx.fillStyle = "#fff"; ctx.font = "bold 5px monospace"; ctx.textAlign = "center";
      ctx.fillText(f.text, x, y);
      ctx.globalAlpha = 1;
    }
  },

  /* 关卡转场大字卡：WORLD X-X */
  drawTransition(ctx){
    const tr = Game.transition;
    if (!tr || tr.t > 70) return;
    const a = Math.max(0, Math.min(1, (70 - tr.t) / 50));
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 90, LOGIC_W, 60);
    ctx.fillStyle = "#fff"; ctx.textAlign = "center";
    ctx.font = "bold 12px monospace";
    ctx.fillText("WORLD " + Game.worldLabel(), LOGIC_W/2, LOGIC_H/2 + 2);
    ctx.font = "bold 6px monospace";
    ctx.fillText("SUPER MARIO BROS.", LOGIC_W/2, LOGIC_H/2 - 20);
    ctx.globalAlpha = 1;
  },

  /* 过关烟花演出：火箭上升 → 开花爆裂成彩点（屏幕坐标） */
  drawCelebration(ctx){
    for (const fw of Game.fireworks){
      if (fw.phase === "watch") continue;                      // 尚未发射
      const x = fw.x, y = fw.y;
      if (fw.phase === "rise"){
        ctx.fillStyle = "#e8e8e8"; ctx.fillRect(x - 1, y - 4, 2, 5);     // 火箭壳
        ctx.fillStyle = "#f7b91a"; ctx.fillRect(x - 1, y + 1, 2, 3);     // 尾焰
      } else {
        for (const s of fw.sparks){
          const a = s.t < 34 ? 1 : Math.max(0, 1 - (s.t - 34) / 12);
          ctx.globalAlpha = a; ctx.fillStyle = s.col;
          ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
        }
        ctx.globalAlpha = 1;
      }
    }
  },

  /* 城堡门（无功能，仅视觉，绘制在城堡列） */
  drawCastleWindow(){ /* 占位；城堡纯装饰 */ },

  drawItems(ctx, camX){
    for (const it of Entities.items){
      const x = it.x - camX, y = it.y + (it.pop ? -((18 - it.born) * 0.4) : 0);
      switch (it.kind){
        case "mushroom":
          ctx.fillStyle = "#c0392b"; ctx.fillRect(x+1, y+5, 12, 6);
          ctx.fillStyle = "#e8c79a"; ctx.fillRect(x+1, y+7, 12, 3);
          ctx.fillStyle = "#fff"; ctx.fillRect(x+3, y+1, 2, 4); ctx.fillRect(x+9, y+1, 2, 4);
          ctx.fillStyle = "#c0392b"; ctx.fillRect(x+3, y+5, 2, 2); ctx.fillRect(x+9, y+5, 2, 2);
          break;
        case "fire":
          ctx.fillStyle = "#c0392b"; ctx.fillRect(x+3, y+4, 8, 8);
          ctx.fillStyle = "#f5b041"; ctx.fillRect(x+5, y+2, 4, 6);
          ctx.fillStyle = "#fff"; ctx.fillRect(x+6, y+6, 2, 2);
          break;
        case "star":
          ctx.fillStyle = "#f7d200"; this.starPath(ctx, x+8, y+8, 6); ctx.fill();
          break;
        case "1up":
          ctx.fillStyle = "#27ae60"; ctx.fillRect(x, y, 14, 14);
          ctx.fillStyle = "#fff"; ctx.font = "bold 9px monospace";
          ctx.fillText("1", x+2, y+12);
          break;
        case "coin":
          ctx.fillStyle = "#f7d200"; ctx.beginPath();
          ctx.arc(x+6, y+7, 5, 0, 7); ctx.fill();
          ctx.strokeStyle = "#b8860b"; ctx.lineWidth = 1.5; ctx.stroke();
          break;
      }
    }
  },

  starPath(ctx, cx, cy, r){
    ctx.beginPath();
    for (let i = 0; i < 5; i++){
      const a = -Math.PI/2 + i*2*Math.PI/5;
      const a2 = a + 2*Math.PI/10;
      ctx.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
      ctx.lineTo(cx + Math.cos(a2)*r*0.45, cy + Math.sin(a2)*r*0.45);
    }
    ctx.closePath();
  },

  drawPlants(ctx, camX){
    for (const p of Entities.plants){
      const h = p.ext;
      if (h < 2) continue;                                   // 基本缩回不绘制
      const x = p.c * TILE - camX;
      const topY = p.baseBottom - h;
      ctx.fillStyle = "#1fae3c"; ctx.fillRect(x + 3, topY + h - 9, 10, 9);   // 茎
      ctx.strokeStyle = "#0c6a1f"; ctx.lineWidth = 1;
      ctx.strokeRect(x + 3.5, topY + h - 9.5, 9, 9);
      ctx.fillStyle = "#e8442c";                          // 花头
      ctx.beginPath(); ctx.ellipse(x + 8, topY + 4, 7, 6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#b32615";
      ctx.fillRect(x + 4, topY + 1, 3, 2); ctx.fillRect(x + 11, topY + 2, 2, 2);
      ctx.fillStyle = "#fff";                             // 眼
      ctx.fillRect(x + 5, topY + 5, 2, 2); ctx.fillRect(x + 10, topY + 5, 2, 2);
      ctx.fillStyle = "#fff";                             // 白牙/口
      ctx.fillRect(x + 4, topY + 8, 3, 2); ctx.fillRect(x + 8, topY + 8, 3, 2);
      ctx.fillRect(x + 3, topY + 9, 2, 2); ctx.fillRect(x + 11, topY + 9, 2, 2);
    }
  },

  drawEnemies(ctx, camX){
    for (const e of Entities.enemies){
      if (e.dead) continue;                                  // 已标记死亡不再绘制
      const x = e.x - camX, y = e.y;
      /* 锤子兄弟 */
      if (e.type === E_HAMMER){
        ctx.fillStyle = "#1fae3c"; ctx.fillRect(x+3, y+3, 9, 14);
        ctx.fillStyle = "#0c6a1f"; ctx.fillRect(x+3, y+3, 9, 4);
        ctx.fillStyle = "#e8c79a"; ctx.fillRect(x+1, y+16, 5, 6);
        ctx.fillStyle = "#1fae3c"; ctx.fillRect(x+1, y+15, 5, 3);
        ctx.fillStyle = "#0c6a1f"; ctx.fillRect(x+1, y+21, 3, 3); ctx.fillRect(x+10, y+21, 3, 3);
        ctx.fillStyle = "#e8c79a"; ctx.fillRect(x+8, y+0, 4, 5);   // 头
        ctx.fillStyle = "#5e3316"; ctx.fillRect(x+8, y+0, 4, 2);    // 盔/发
        ctx.fillStyle = "#d02b1e"; ctx.fillRect(x + (e.face>0?12:0), y+5, 2, 6); // 手臂/锤
        const swing = Math.sin(e.anim*0.3)*2|0;
        ctx.fillStyle = "#9e9e9e"; ctx.fillRect(x + (e.face>0?13: -2), y+6+swing, 3, 1);
      }
      /* 板栗 */
      else if (e.type === E_GOOMBA){
        ctx.fillStyle = "#7a4a25";
        ctx.beginPath(); ctx.ellipse(x+6.5, y+8, 6.5, 8, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.fillRect(x+3, y+4, 2, 3); ctx.fillRect(x+9, y+4, 2, 3);
        ctx.fillStyle = "#2c1608"; ctx.fillRect(x+4, y+4, 1, 1); ctx.fillRect(x+10, y+4, 1, 1);
        ctx.fillStyle = "#5e3316"; ctx.fillRect(x+1, y+13, 5, 2); ctx.fillRect(x+8, y+13, 5, 2);
      }
      /* 慢慢龟（绿）与硬壳龟（红）共用龟壳/造型 */
      else if (e.type === E_KOOPA || e.type === E_BUZZY){
        const shellCol = e.type === E_BUZZY ? "#c0392b" : "#1fae3c";
        const ringCol  = e.type === E_BUZZY ? "#8e2417" : "#0c6a1f";
        this.drawShellBody(ctx, e, x, y, shellCol, ringCol);
      }
      /* 刺猬（砸扁的球 + 背刺，踩踏会受伤） */
      else if (e.type === E_SPINY){
        ctx.fillStyle = "#f1c40f"; ctx.beginPath(); ctx.ellipse(x+7, y+8, 7, 7, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#e67e22";
        for (let i = 0; i < 6; i++){                       // 背上尖刺
          const a = i * (6.2832/6); ctx.fillRect(x+7+Math.cos(a)*6-1, y+8+Math.sin(a)*6-3, 2, 3);
        }
        ctx.fillStyle = "#fff"; ctx.fillRect(x+5, y+5, 2, 2); ctx.fillRect(x+9, y+5, 2, 2);
        ctx.fillStyle = "#000"; ctx.fillRect(x+6, y+5, 1, 1); ctx.fillRect(x+10, y+5, 1, 1);
        ctx.fillStyle = "#d02b1e"; ctx.fillRect(x+5, y+11, 4, 2);
      }
      /* 炮弹刺客（旋转火球） */
      else if (e.type === E_BULLET){
        const fl = Math.floor(e.anim*0.15)%2 === 0;
        ctx.fillStyle = fl ? "#f5b041" : "#e67e22";
        ctx.beginPath(); ctx.arc(x+7, y+7, 7, 0, 7); ctx.fill();
        ctx.fillStyle = fl ? "#fff" : "#f1c40f";
        ctx.beginPath(); ctx.arc(x+5, y+5, 2.5, 0, 7); ctx.fill();
        ctx.fillRect(x+7, y+3, 3, 9); ctx.fillRect(x+4, y+6, 8, 3);   // 旋转箭头
      }
      /* 云里花（云朵 + 眼 + 墨镜） */
      else if (e.type === E_LAKITU){
        ctx.fillStyle = "#f4f6ff";
        ctx.beginPath(); ctx.ellipse(x+11, y+9, 8, 5, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x+6, y+12, 4, 3, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x+16, y+12, 4, 3, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#222"; ctx.fillRect(x+7, y+7, 5, 3); ctx.fillRect(x+14, y+7, 3, 3);   // 墨镜
        ctx.fillStyle = "#fff"; ctx.fillRect(x+8, y+2, 3, 2); ctx.fillRect(x+13, y+3, 2, 3);    // 头顶
      }
      /* 乌贼（水下，触手摆动） */
      else if (e.type === E_BLOOPER){
        const flap = Math.sin(e.t*0.2) > 0 ? -1 : 1;
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.ellipse(x+7, y+6, 7, 8, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = "#999"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x+7, y+6, 4, 5, 0, 0, 7); ctx.stroke();
        ctx.fillStyle = "#555"; ctx.fillRect(x+4, y+14, 2, 2*fl); ctx.fillRect(x+8, y+14, 2, 2*fl);
        ctx.fillRect(x+11, y+13, 2, 2*fl);
        ctx.fillStyle = "#000"; ctx.fillRect(x+4, y+3, 2, 2); ctx.fillRect(x+9, y+3, 2, 2);
      }
      /* 飞鱼（红鱼，空中老跳） */
      else if (e.type === E_CHEEP){
        ctx.fillStyle = "#e8442c";
        ctx.beginPath(); ctx.ellipse(x+7, y+6, 7, 5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#c0392b"; ctx.fillRect(x+12, y+6, 3, 3);   // 尾鳍
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x+3, y+7); ctx.lineTo(x+11, y+6); ctx.stroke();
        ctx.fillStyle = "#000"; ctx.fillRect(x+5, y+4, 2, 2); ctx.fillRect(x+9, y+4, 2, 2);
      }
      /* 熔岩蹦床（火团） */
      else if (e.type === E_PODOBOO){
        if (!e.active) continue;                              // 沉入岩浆不绘制
        ctx.fillStyle = "#e8442c"; ctx.beginPath(); ctx.arc(x+6, y+6, 6, 0, 7); ctx.fill();
        ctx.fillStyle = "#f7b91a"; ctx.beginPath(); ctx.arc(x+5, y+5, 3, 0, 7); ctx.fill();
      }
    }
  },

  /* 龟壳敌人通用绘制：站姿行走或壳（KOOPA/BUZZY） */
  drawShellBody(ctx, e, x, y, shellCol, ringCol){
    if (e.shell){
      ctx.fillStyle = shellCol; ctx.beginPath();
      ctx.ellipse(x+7, y+7, 7, 7, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = ringCol; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x+7, y+7, 4, 4, 0, 0, 7); ctx.stroke();
      return;
    }
    ctx.fillStyle = shellCol; ctx.fillRect(x+3, y+3, 9, 12);
    ctx.fillStyle = ringCol;  ctx.fillRect(x+3, y+3, 9, 3);
    ctx.fillStyle = "#e8c79a"; ctx.fillRect(x+1, y+16, 4, 6);
    ctx.fillStyle = shellCol; ctx.fillRect(x+1, y+15, 4, 3);
    ctx.fillStyle = ringCol;  ctx.fillRect(x+1, y+22, 3, 4); ctx.fillRect(x+10, y+22, 3, 4);
  },

  /* 火棒：绕轴旋转的火焰链 */
  drawFirebars(ctx, camX){
    for (const f of Entities.firebars){
      const spots = Entities.firebarSpots(f);
      const base = [f.x - camX, f.y];
      ctx.fillStyle = "#222"; ctx.fillRect(base[0]-1, base[1]-1, 3, 3);   // 轴承
      for (let i = 0; i < spots.length; i++){
        const sx = spots[i][0] - camX, sy = spots[i][1];
        const cool = (f.t/6 | 0) % 2 === 0;
        ctx.fillStyle = cool ? "#e8442c" : "#f7b91a";
        ctx.beginPath(); ctx.arc(sx, sy, 2.6, 0, 7); ctx.fill();
      }
    }
  },

  /* 库巴 BOSS */
  drawBoss(ctx, camX){
    const b = Entities.boss;
    if (!b) return;
    const x = b.x - camX, y = b.y;
    if (b.dead && b.deadT < 30) return;                        // 瞬间坠桥阶段暂不绘制（已坠下）
    if (b.flash > 0 && (b.anim & 3) < 2) return;               // 受击闪烁
    ctx.fillStyle = "#3fae2f"; ctx.beginPath(); ctx.ellipse(x + 15, y + 9, 15, 11, 0, 0, 7); ctx.fill();   // 身
    ctx.fillStyle = "#2e7d22"; ctx.beginPath(); ctx.ellipse(x + 15, y + 9, 9, 8, 0, 0, 7); ctx.fill();      // 壳纹
    ctx.fillStyle = "#f1d27a"; ctx.fillRect(b.face > 0 ? x + 24 : x - 4, y + 2, 9, 8);    // 头
    ctx.fillStyle = "#000"; ctx.fillRect(b.face > 0 ? x + 27 : x + 0, y + 3, 2, 2);
    ctx.fillRect(b.face > 0 ? x + 30 : x - 2, y + 3, 2, 2);      // 眼
    ctx.fillStyle = "#d02b1e"; ctx.fillRect(x + 3, y + 19, 5, 4); ctx.fillRect(x + 22, y + 19, 5, 4);  // 脚
    ctx.fillStyle = "#f6e07f"; ctx.fillRect(x + 7, y + 12, 3, 3); ctx.fillRect(x + 21, y + 12, 3, 3); // 棘
  },

  drawFireballs(ctx, camX){
    ctx.fillStyle = "#f5b041";
    for (const b of Entities.balls){
      ctx.beginPath(); ctx.arc(b.x - camX, b.y, 4, 0, 7); ctx.fill();
    }
    /* 锤子兄弟的抛锤/库巴火球 */
    for (const h of Entities.hammers){
      const x = h.x - camX, y = h.y;
      if (h.flame){
        ctx.fillStyle = "#e8442c"; ctx.beginPath(); ctx.arc(x + 5, y + 5, 5, 0, 7); ctx.fill();
        ctx.fillStyle = "#f7b91a"; ctx.beginPath(); ctx.arc(x + 4, y + 4, 2.5, 0, 7); ctx.fill();
        continue;
      }
      ctx.save(); ctx.translate(x + 5, y + 5); ctx.rotate(h.rot);
      ctx.fillStyle = "#9e9e9e"; ctx.fillRect(-6, -1, 5, 2);   // 柄
      ctx.fillStyle = "#b03a2e"; ctx.fillRect(-2, -4, 8, 4);   // 锤头
      ctx.fillStyle = "#d7745a"; ctx.fillRect(-2, -4, 3, 4);
      ctx.restore();
    }
  },

  drawPlayer(ctx, camX){
    if (Game.state === ST.GAMEOVER) return;
    // 受伤无敌闪烁
    if (Player.invuln > 0 && Math.floor(Game.t/4) % 2 === 0) return;
    const x = Player.x - camX, y = Player.y;
    ctx.save();
    ctx.translate(x, y + Player.h/2);
    ctx.scale(Player.face === -1 ? -1 : 1, 1);
    ctx.translate(-Player.w/2, -Player.h/2);

    const big = Player.form !== FORM_SMALL;
    // 裤子 + 身体
    ctx.fillStyle = "#3a3af0";
    ctx.fillRect(0, big ? 16 : 8, 12, big ? 14 : 6);
    ctx.fillStyle = "#f5c26b";   // 脸
    ctx.fillRect(2, big ? 8 : 5, 8, big ? 10 : 5);
    // 帽子 + 头发
    ctx.fillStyle = "#d02b1e";
    ctx.fillRect(0, big ? 2 : 1, 12, big ? 7 : 5);
    ctx.fillStyle = "#5e3316";
    ctx.fillRect(9, big ? 2 : 1, 3, big ? 3 : 2);
    // 眼睛
    ctx.fillStyle = "#000";
    ctx.fillRect(9, big ? 9 : 6, 2, 2);
    // 鞋子
    ctx.fillStyle = "#d02b1e"; ctx.fillRect(0, big ? 26 : 11, 5, big ? 4 : 3);
    ctx.fillRect(7, big ? 26 : 11, 5, big ? 4 : 3);

    ctx.restore();
  },

  /* 顶部 HUD（与原版同构：MARIO/分数·金币·WORLD·TIME·生命） */
  drawHUD(ctx){
    const barH = 15;
    ctx.fillStyle = "rgba(10,10,20,0.78)";
    ctx.fillRect(0, 0, LOGIC_W, barH);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 6px monospace";
    const pad = 6;
    ctx.textAlign = "left";
    ctx.fillText(this.pad(Game.score, 6), pad, 11);
    ctx.fillStyle = "#f7d200"; ctx.fillText("●", pad+34, 11);
    ctx.fillStyle = "#fff"; ctx.fillText(String(Game.coins).padStart(2,"0"), pad+42, 11);
    ctx.fillText("WORLD", pad+76, 11);
    ctx.fillText(Game.worldLabel(), pad+96, 11);
    ctx.fillText("TIME", pad+150, 11);
    ctx.fillText(String(Game.timeSeconds()).padStart(3,"0"), pad+172, 11);
    ctx.fillText("1UP "+Game.lives, pad+206, 11);

    /* 顶部小标签（MARIO） */
    ctx.fillStyle = "#d02b1e";
    ctx.font = "bold 6px monospace";
    ctx.fillText("MARIO", pad, 4);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 5px monospace";
    ctx.fillText("COIN · WORLD · TIME · 1UP", pad, 14);
  },

  pad(n, w){ return String(n).padStart(w, "0"); },
};