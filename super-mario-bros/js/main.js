"use strict";
/* ============================================================
 * main.js — 输入、UI（覆盖层 / 按钮 / 侧边 HUD）、主循环与启动
 * 依赖：以上全部模块
 * ============================================================ */

const cv = el("cv");
Renderer.init(cv);
Input.bind();

function showOverlay(title, sub){ el("ov-title").textContent = title; el("ov-sub").innerHTML = sub || ""; el("overlay").classList.remove("hidden"); }
function hideOverlay(){ el("overlay").classList.add("hidden"); }

function updateHud(){
  el("hud-world").textContent = Game.worldLabel();
  el("hud-score").textContent = String(Game.score).padStart(6, "0");
  el("hud-lives").textContent = Game.lives;
  el("hud-coins").textContent = Game.coins;
}

function setPauseBtn(mode){                  // "off"=不可用 | "play"=可点暂停 | "paused"=可点继续
  const btn = el("btn-pause");
  if (mode === "off"){ btn.disabled = true; btn.textContent = "暂停 (P)"; return; }
  btn.disabled = false;
  btn.textContent = mode === "paused" ? "继续 (P)" : "暂停 (P)";
}

function togglePause(){
  if (Game.state === ST.PLAY){
    Game.state = ST.PAUSED;
    Music.stop();                              // 暂停时音乐一并停止
    showOverlay("已暂停", "按 P 或回车继续");
    setPauseBtn("paused");
  } else if (Game.state === ST.PAUSED){
    Game.state = ST.PLAY;
    Game.playTheme(Game.theme || "land");      // 恢复关卡主题音乐
    hideOverlay(); setPauseBtn("play");
  }
}

function newGame(){
  Game.startGame();
  updateHud();
  hideOverlay();
  setPauseBtn("play");
}

function continueGame(){
  Game.gotoNext();
  if (Game.state !== ST.WIN){ hideOverlay(); updateHud(); setPauseBtn("play"); }
}

/* 检测进入过关/结束态，反馈到 UI */
let prevUI = null;
function syncUI(){
  if (Game.state === prevUI) return;
  const s0 = prevUI; prevUI = Game.state;
  if (Game.state === ST.LEVELCLEAR && s0 !== ST.LEVELCLEAR){
    showOverlay(`关卡 ${Game.worldLabel()} 完成`,
      `时间奖励 +${Game.lastBonus||0} 分<br>按【回车】进入下一关`);
  } else if (Game.state === ST.GAMEOVER && s0 !== ST.GAMEOVER){
    showOverlay("GAME OVER", "得分 " + String(Game.score).padStart(6,"0") + " · 最高分 " + String(Game.hiscore).padStart(6,"0") + "<br>按【回车】重新开始");
    setPauseBtn("off");
  } else if (Game.state === ST.WIN){
    showOverlay("扬眉吐气！", "你救出了公主！🎉<br>按【回车】回到第一关再来一遍");
    setPauseBtn("off");
  }
  updateHud();
}

/* ---------- 键盘全局控制 ---------- */
window.addEventListener("keydown", e => {
  Sfx.init();
  /* World Select：开场可选任意世界（D 类，1…8 选关） */
  const worldKey = /^Digit([1-8])$/.exec(e.code);
  if (worldKey && (Game.state === ST.IDLE || Game.state === ST.GAMEOVER)){
    Game.startWorld = +worldKey[1];
    Sfx.select();
    renderStartSub();
    return;
  }
  if (e.code === "Enter"){
    if (Game.state === ST.IDLE || Game.state === ST.GAMEOVER || Game.state === ST.WIN) newGame();
    else if (Game.state === ST.LEVELCLEAR) continueGame();
    else if (Game.state === ST.PAUSED) togglePause();
  } else if (e.code === "KeyP"){
    if (Game.state === ST.PLAY || Game.state === ST.PAUSED) togglePause();
  }
});

/* 按钮（点击后移除焦点，避免误触） */
el("btn-start").addEventListener("click", () => { Sfx.init(); newGame(); });
el("btn-restart").addEventListener("click", () => { Sfx.init(); newGame(); });
el("btn-pause").addEventListener("click", togglePause);
document.querySelectorAll("button").forEach(b => b.addEventListener("click", () => b.blur()));

/* ---------- 主循环 ---------- */
let lastTs = 0, acc = 0;
const STEP_MS = 1000 / 60;                 // 固定逻辑步长（1/60s），与帧率解耦
function loop(ts){
  requestAnimationFrame(loop);
  if (!lastTs) lastTs = ts;
  let delta = ts - lastTs;
  lastTs = ts;
  if (delta > 100) delta = 100;            // 后台切回防大跳
  acc += delta;

  // 捕获一帧的输入（跳跃边缘即刻清理）
  const frame = {
    left: Input.left, right: Input.right,
    up: Input.up, down: Input.down,
    run: Input.run, jump: Input.jump,
    jumpPressed: Input.jumpPressed,
  };
  Input.consumeJump();

  if (Game.state === ST.PLAY || Game.state === ST.LEVELCLEAR || Game.state === ST.DYING){
    let steps = 0;
    while (acc >= STEP_MS && steps < 4){
      acc -= STEP_MS; steps++;
      // 跳跃边缘只在第一个逻辑步生效，避免单帧多步重复触发
      const inp = steps === 1 ? frame : Object.assign({}, frame, { jumpPressed: false });
      if (Game.state === ST.DYING) Game.update(1);
      else Game.update(1, inp);
    }
    if (acc > STEP_MS * 4) acc = 0;        // 追不上时丢弃积压，防螺旋卡死
  } else {
    acc = 0;
    if (Game.state === ST.IDLE && !Music.playing) Music.start();
  }

  syncUI();
  Renderer.draw();
  if (Game.state === ST.PLAY || Game.state === ST.LEVELCLEAR) updateHud();
}

/* ---------- 启动 ---------- */
/* 开场选关提示（D 类：按 1…8 选世界，起点从 1-1 出发） */
function renderStartSub(){
  const bar = Array.from({length: 8}, (_, w) => w + 1)
    .map(w => w === Game.startWorld ? `<b>${w}</b>` : w).join(" ");
  showOverlay("SUPER MARIO BROS.", [
    "经典 1985 复刻版 · 方向键 / WASD 移动",
    "Z / K 跳跃（长按跳更高）· X / J 加速跑",
    "开场选关 WORLD "+Game.startWorld+"（按 1…8）",
    bar,
    "按【回车】或点击「开始游戏」出发",
    "挑战可达最高分 "+String(Game.hiscore).padStart(6,"0"),
  ].join("<br>"));
}

Game.getHi();
renderStartSub();
setPauseBtn("off");
Music.start();
requestAnimationFrame(loop);