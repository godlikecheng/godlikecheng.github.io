"use strict";
/* ============================================================
 * map.js — 关卡数据模型与构建
 * 依赖：constants.js
 *
 * 设计：地面用「每列地面顶高」数组表达（支持缺口/台阶），
 *       地面以上的悬空内容（砖/问号/管道/金币/旗杆）用 12 行瓦片矩阵。
 * 依赖模块通过 loadLevel(world, level) 获取 Level 对象。
 * ============================================================ */

const GRID_ROWS = 12;           // 地面以上内容行（瓦片 y=0..11）
const DEFAULT_GROUND = 12;      // 默认地面顶高（y=12 的地面顶部，即行12）

/* 瓦片矩阵行索引辅助：把相对地面(从顶向下第 n 格内容) 转为 row */
const rowFromTop = n => n;      // 0 表示画面最顶行

function makeLevel(cols){
  return {
    cols,
    rows: new Uint8Array(GRID_ROWS * cols),     // 悬空内容瓦片
    ground: new Uint8Array(cols).fill(DEFAULT_GROUND), // 每列地面顶(y=0..15)，填满=无地面
    water:false, castle:false, boss:false,
    respawnX: 16,
    enemiesSpawn: [],                           // 敌人生成点 {col, type}
    plantsSpawn: [],                            // 食人花生成点 {c, topRow}
  };
}
/* 读/写悬空瓦片 */
function rowAt(lv, col, row){ return lv.rows[row * lv.cols + col]; }
function setRow(lv, col, row, t){ lv.rows[row * lv.cols + col] = t; }
/* 单位瓦片判定：某逻辑坐标是否实心（含地面与悬空内容） */
function isSolidPx(lv, px, py){
  const c = Math.floor(px / TILE), ry = Math.floor(py / TILE);
  if (c < 0 || c >= lv.cols) return true;                 // 越界视为实心（关卡边界）
  if (ry >= lv.ground[c]) return true;                    // 进入该列地面以下
  if (ry < 0 || ry >= GRID_ROWS) return false;
  const t = rowAt(lv, c, ry);
  return BUMPABLE.includes(t) || t === T_USED || t === T_BRIDGE || t === T_AXE;
}
/* 取某格瓦片类型（供渲染/顶砖等） */
function tileAt(lv, col, ry){
  if (col < 0 || col >= lv.cols) return T_BLOCK;
  if (ry >= lv.ground[col]) return T_GROUND;
  if (ry >= 0 && ry < GRID_ROWS) return rowAt(lv, col, ry);
  return T_EMPTY;
}

/* ================= 便捷搭建 ================= */
function groundTo(lv, c0, c1, top){ for(let c=c0;c<=c1;c++) lv.ground[c] = top; }
function addRowSpan(lv, c0, c1, ry, t){ for(let c=c0;c<=c1;c++) setRow(lv, c, ry, t); }
function addColumn(lv, c, ry0, ry1, t){ for(let ry=ry0;ry<=ry1;ry++) setRow(lv, c, ry, t); }
/* 从地面起往上的竖管：帽顶一格 + 身往下，宽1格 */
function addPipe(lv, c, height){
  for(let i=0;i<height;i++){
    const ry = DEFAULT_GROUND - 1 - i;
    setRow(lv, c, ry, T_PIPE);
  }
}
/* 悬空砖/金币带 */
function addBricks(lv, c0, c1, ry, countType){ addRowSpan(lv, c0, c1, ry, countType); }
/* 敌人生成点 */
function addEnemies(lv, col, type, n){
  for (let i = 0; i < n; i++) lv.enemiesSpawn.push({ col, type });
}
/* 在指定管道列安置食人花（height 与 addPipe 的管道高度一致，由此推出管道顶行） */
function addPlant(lv, c, height){
  lv.plantsSpawn.push({ c, topRow: DEFAULT_GROUND - height });
}

/* ================= 世界 1 第 1 关（经典 1-1 近似） ================= */
function build_1_1(){
  const lv = makeLevel(224);

  /* 起手小缓坡 + 第一组问号/砖（相对原版 1-1 布局） */
  addRowSpan(lv, 16, 17, 4, T_QUESTION);
  setRow(lv, 20, 4, T_QM);
  setRow(lv, 22, 4, T_BRICK);

  /* 矮、中管道 */
  addPipe(lv, 24, 2);
  addPipe(lv, 27, 3);
  lv.bonusPipe = { col: 27, topRow: DEFAULT_GROUND - 3 };   // 进入地下金币子关的入口管道

  /* 悬空金币三角 */
  setRow(lv, 31, 9, T_COIN); setRow(lv, 32, 8, T_COIN); setRow(lv, 33, 8, T_COIN); setRow(lv, 34, 9, T_COIN);

  /* 第二组：砖 + 问号 + 上方金币 */
  addRowSpan(lv, 48, 49, 4, T_BRICK);
  setRow(lv, 52, 4, T_QFIRE);
  setRow(lv, 54, 4, T_BRICK);
  setRow(lv, 52, 3, T_COIN);

  /* 第一处大缺口 */
  groundTo(lv, 63, 69, 15);          // 15 = 无地面 → 形成 7 格深坑

  /* 小块桥 + 短砖 */
  setRow(lv, 71, 4, T_BRICK);
  setRow(lv, 74, 4, T_QSTAR);
  setRow(lv, 73, 7, T_HIDDEN);        // 隐藏币位砖（隐形，顶出金币）

  /* 三级金字塔台阶 */
  groundTo(lv, 82, 88, DEFAULT_GROUND);
  groundTo(lv, 82, 85, 11);          // 抬高一格
  groundTo(lv, 82, 83, 10);          // 再抬高一格
  addRowSpan(lv, 86, 90, 7, T_BRICK); // 台阶上砖（充当第三层高台）

  /* 中等管道 + 长砖平台 */
  addPipe(lv, 95, 3);
  addPipe(lv, 99, 4);
  addPlant(lv, 95, 3);       // 管道食人花（近身处探出）
  addRowSpan(lv, 105, 114, 8, T_BLOCK);
  setRow(lv, 108, 8, T_Q1UP);

  /* 第二处缺口 */
  groundTo(lv, 120, 124, 15);

  /* 问号与砖组合 */
  addRowSpan(lv, 130, 131, 5, T_BRICK);
  setRow(lv, 134, 5, T_QUESTION);
  setRow(lv, 136, 5, T_BRICK);

  /* 高管道群 */
  addPipe(lv, 140, 4);
  addPlant(lv, 140, 4);
  addPipe(lv, 144, 4);
  addPlant(lv, 144, 4);

  /* 终端砖上层平台 */
  addRowSpan(lv, 152, 158, 7, T_BLOCK);

  /* 倒数高台（旗杆前） */
  groundTo(lv, 168, 184, DEFAULT_GROUND);
  groundTo(lv, 176, 184, 11);
  groundTo(lv, 181, 184, 10);
  setRow(lv, 147, 3, T_HIDDEN);        // 中段高空隐藏币位

  /* 旗杆 + 城堡 */
  addColumn(lv, 196, 4, 11, T_FLAG);       // 旗杆所在列（渲染为旗杆）
  groundTo(lv, 195, 195, 11);              // 旗杆基座（抬高 1 格）
  addRowSpan(lv, 200, 210, 6, T_CASTLE);   // 城堡主体装饰
  groundTo(lv, 200, 222, 12);

  lv.respawnX = 16;
  addEnemies(lv, 42, E_GOOMBA, 2);
  addEnemies(lv, 58, E_GOOMBA, 2);
  addEnemies(lv, 86, E_KOOPA, 1);
  addEnemies(lv, 118, E_GOOMBA, 2);
  addEnemies(lv, 136, E_KOOPA, 1);
  addEnemies(lv, 164, E_GOOMBA, 2);
  addEnemies(lv, 150, E_BUZZY, 1);        // 硬壳龟（红色，踩踏缩壳可踢）
  addEnemies(lv, 154, E_BULLET, 1);       // 炮弹刺客
  return lv;
}

/* ================= 程序生成回落关（保证世界推进可玩） ================= */
function build_generic(world, level){
  /* 城堡关（世界每 4 关）：岩浆桥 + 库巴 BOSS 战场 */
  if (level === 4) return build_castle(world);

  const rnd = mulberry32(world * 97 + level * 31 + 13);
  const water = (level === 3);
  const castle = (level === 4);
  const cols = 208 + level * 12;
  const lv = makeLevel(cols);
  lv.water = water; lv.castle = castle;

  /* 顶部一段引路装饰 */
  if(!water){
    addRowSpan(lv, 20, 21, 10, T_COIN);
  }
  /* 若干组问号 + 砖 */
  let seg = 30;
  for(let i=0;i<4;i++){
    const c = seg;
    setRow(lv, c, 6, T_QUESTION);
    setRow(lv, c+2, 6, T_BRICK);
    setRow(lv, c, 5, T_COIN);
    if(rnd()>0.5) addPipe(lv, c+5, 3);
    else groundTo(lv, c+5, c+6, 15);
    seg += 22;
  }

  /* 旗杆与城堡 */
  const flagC = cols - 30;
  addColumn(lv, flagC, 4, 11, T_FLAG);
  addRowSpan(lv, cols-18, cols-4, 7, T_CASTLE);
  lv.boss = castle;
  lv.respawnX = 16;
  if (water){
    /* 水下关（第 3 关）：乌贼 + 飞鱼 */
    addEnemies(lv, 30, E_CHEEP, 2);
    addEnemies(lv, 70, E_BLOOPER, 1);
    addEnemies(lv, 120, E_CHEEP, 2);
  } else {
    addEnemies(lv, 30, E_GOOMBA, 2);
    addEnemies(lv, 70, E_KOOPA, 1);
    addEnemies(lv, 120, E_GOOMBA, 2);
    addEnemies(lv, 96, E_HAMMER, 1);      // 锤子兄弟（陆地关）
    addEnemies(lv, 40, E_BULLET, 1);      // 炮弹刺客
    addEnemies(lv, 62, E_BUZZY, 1);       // 硬壳龟
    addEnemies(lv, 104, E_LAKITU, 1);     // 云里花（周期性掉落刺猬）
  }
  placeWarp(lv, world, level);                   // 隐藏跳转区（若有）
  return lv;
}

/* ================= 城堡关：岩浆桥 + 库巴 BOSS 战场 ================= */
function build_castle(world){
  const lv = makeLevel(168);
  lv.castle = true; lv.boss = true;
  lv.respawnX = 16;

  /* 平直走廊，少量问号/砖 */
  addRowSpan(lv, 20, 21, 6, T_QUESTION);
  setRow(lv, 30, 6, T_BRICK);
  addRowSpan(lv, 40, 41, 8, T_BLOCK);
  setRow(lv, 44, 8, T_QM);
  addRowSpan(lv, 62, 63, 6, T_BRICK);
  setRow(lv, 66, 6, T_QFIRE);

  /* 沿途敌兵 */
  addEnemies(lv, 42, E_GOOMBA, 2);
  addEnemies(lv, 80, E_KOOPA, 1);
  addEnemies(lv, 100, E_GOOMBA, 2);

  /* 火棒（绕轴旋转）与熔岩蹦床（岩浆起跳） */
  lv.firebars = [
    { x: 50 * TILE + 8, y: 8 * TILE + 8, count: 5, r: 30, speed: 0.10 },
    { x: 70 * TILE + 8, y: 8 * TILE + 8, count: 4, r: 26, speed: 0.13 },
  ];
  lv.podoboos = [
    { col: 60 }, { col: 72 }, { col: 84 },
  ];

  /* 尽头 BOSS 战场：岩浆坑 + 桥 + 右岸阶梯斧头 */
  const bc = 118;
  groundTo(lv, bc, bc + 13, 15);                         // 岩浆坑（无地面）
  addRowSpan(lv, bc, bc + 11, 11, T_BRIDGE);             // 桥面（库巴行走）
  groundTo(lv, bc + 14, lv.cols - 1, DEFAULT_GROUND);    // 右岸
  setRow(lv, bc + 12, 11, T_BLOCK);                      // 上岸阶梯（与桥面齐高）
  setRow(lv, bc + 13, 10, T_BLOCK);
  setRow(lv, bc + 14, 9, T_BLOCK);
  setRow(lv, bc + 14, 8, T_AXE);                         // 斧头位于阶梯顶端块上方（不再覆盖阶梯块）

  /* 库巴出生坐标（站在桥面，桥面顶 row 11） */
  lv.bossSpawn = { x: (bc + 3) * TILE, y: 11 * TILE - 34 };
  return lv;
}

/* 隐藏跳转区：在指定关放置 T_WARP 触发格，脚下按住 ↓ 跳向目标世界 */
const WARP_TABLE = { "1-2":"2-1", "1-3":"3-1", "4-2":"5-1", "4-3":"7-1" };
function placeWarp(lv, world, level){
  const tgt = WARP_TABLE[world + "-" + level];
  if (!tgt) return;
  lv.warpTarget = +tgt.split("-")[0];
  const c = 24;
  setRow(lv, c,    11, T_WARP); setRow(lv, c + 1, 11, T_WARP);
  setRow(lv, c,     9, T_BLOCK); setRow(lv, c + 1,  9, T_BLOCK);   // 顶盖抬高到 row9，留 2 格空隙，大形态也可站入触发
}

/* 简易伪随机 */
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a>>>15, 1|a);
    t = t + Math.imul(t ^ t>>>7, 61|t) ^ t;
    return ((t ^ t>>>14)>>>0) / 4294967296;
  };
}

/* ================= 关卡索引 ================= */
const TOTAL_WORLDS = 8;

/* 地下金币子关：管道进入后的奖励房（无敌人，满铺金币，右侧出口管道） */
function build_bonus_room(){
  const lv = makeLevel(44);
  groundTo(lv, 0, 43, 12);
  addRowSpan(lv, 1, 42, 3, T_BRICK);                 // 顶部砖墙（装饰）

  /* 悬空砖台 + 金币对（可站上去收集） */
  let c = 8;
  while (c < 38){
    addBricks(lv, c, c + 1, 8, T_BRICK);
    setRow(lv, c + 2, 8, T_COIN); setRow(lv, c + 3, 8, T_COIN);
    c += 8;
  }
  /* 两排高架金币 */
  for (let x = 6; x <= 38; x += 4) setRow(lv, x, 5, T_COIN);

  /* 右侧出口管道（站在管顶按 ↓ 回到主关） */
  addPipe(lv, 40, 4);
  lv.exitPipe = { col: 40, topRow: DEFAULT_GROUND - 4 };
  lv.respawnX = 4;
  return lv;
}

function loadLevel(world, level){
  if (world === 1 && level === 1) return build_1_1();
  return build_generic(world, level);
}