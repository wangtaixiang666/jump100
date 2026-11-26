/* =========================================================================
 * config.js — 全局常量与配置表
 * -------------------------------------------------------------------------
 * 调难度 / 主题 / 音频时，优先修改本文件。所有数值均带注释说明用途。
 * 坐标系：逻辑像素，原点在屏幕左上角；世界 Y 向上为负（楼层越高 Y 越小）。
 * ========================================================================= */

/* 逻辑分辨率（实际 canvas 尺寸固定为此值，通过 CSS 整数倍缩放） */
export const VIEW = {
  W: 400,   // 逻辑宽
  H: 600,   // 逻辑高
};

/* ------------------------------ 物理参数 -------------------------------- */
export const PHYS = {
  GRAVITY: 2200,            // 重力加速度 px/s^2
  HOLD_GRAVITY: 0.50,       // 按住空格上升时的重力倍率(越小跳越高)
  JUMP_VY: 600,             // 起跳初速度 px/s（满蓄力跳高约 147px）
  MAX_HOLD_TIME: 0.30,      // 跳跃蓄力(减重力)最长持续时间 s
                            // 关键约束：满蓄力跳高 147px 需落在
                            // (层间距 100, 隔层底面距头部 160) 区间内，
                            // 既能上一层，又不会满蓄力撞到再上一层的底面
  MAX_FALL_VY: 900,         // 下落终端速度 px/s
  MOVE_ACCEL: 2000,         // 地面水平加速度 px/s^2
  AIR_ACCEL: 1400,          // 空中水平加速度 px/s^2
  MAX_RUN: 240,             // 最大水平速度 px/s
  FLOOR_HEIGHT: 100,        // 每层之间的垂直间距 px（隔层底面距角色头部 160px）
  CAMERA_ANCHOR: 0.60,      // 角色固定在屏幕纵向的位置比例(0 顶 1 底)
  PLAYER_W: 20,             // 角色碰撞盒宽
  PLAYER_H: 30,             // 角色碰撞盒高
  CEILING_BOUNCE: 150,      // 上升撞到平台底面后的向下反弹速度 px/s
};

/* 各平台落地摩擦：值越大减速越快，ice 极低摩擦保留惯性 */
export const FRICTION = {
  normal: 1800, ice: 140, sand: 1100, timed: 1800,
  trap: 1800, moving: 1800, lava: 1800,
};

/* 落地惯性滑行：站立摩擦(1800)太强，落地会瞬间钉住。
 * 落地后一段时间内改用这里的低摩擦，让角色在平台上滑一段再停。
 * 冲击越大、水平速度越大，滑得越远；垂直坠落则按朝向补一个最小冲量。
 * 冰面平台仍用其自身更低的摩擦(140)，滑得更远。 */
export const SLIDE = {
  LAND_FRICTION: 600,       // 普通落地滑行减速度 px/s²
  CRASH_FRICTION: 520,      // 摔趴滑行减速度 px/s²（更低，摔出去更滑稽）
  MIN_IMPACT: 140,          // 冲击超过此值才触发额外滑行
  IMPACT_GAIN: 0.22,        // 冲击速度转为水平滑行速度的比例
  MIN_KICK: 160,            // 垂直坠落时按朝向给予的最小滑行速度
  MAX_VX: 200,              // 滑行水平速度上限（略低于 MAX_RUN，避免滑出平台）
  TIME: 1.0,                // 滑行状态最长持续时间 s
};

/* ---------------------------- 平台生成参数 ------------------------------ */
export const PLAT = {
  THICKNESS: 10,            // 平台碰撞/渲染厚度（实心，上升时会撞到底面）
  MIN_W: 60, MAX_W: 110,    // 平台宽度范围
  MAX_X_STEP: 55,           // 相邻层平台中心的最大水平偏移(配合越顶后的横移窗口)
  EDGE_MARGIN: 16,          // 平台离左右边界的最小间距
  CLEAR_ABOVE: 18,          // 上层平台不得覆盖下层平台中心左右此宽度的起跳安全带
                            // （实心平台必须留出通道，否则从下方起跳必撞头）
  TIMED_LIFE: 2.0,          // timed 平台存活时间 s
  TIMED_RESPAWN: 2.4,       // timed 平台复原延迟 s (0 表示不复原)
  LAVA_LIFE: 1.1,           // lava 平台存活时间 s
  SAND_SINK_DELAY: 1.3,     // sand 平台站立多久后开始陷入 s
  SAND_SINK_SPEED: 28,      // sand 平台下陷速度 px/s
  SAND_RESPAWN: 2.0,        // sand 陷入消失后重新浮出的等待时间 s
  TRAP_KNOCKBACK: 380,      // trap 击退力度 px/s
  MOVE_SPEED: 62,           // moving 平台移动速度 px/s
  MOVE_RANGE: 72,           // moving 平台往复幅度 px
};

/* ------------------------------ 动画参数 -------------------------------- */
export const ANIM = {
  FPS: 10,                  // 动画帧率
  HURT_TIME: 0.45,          // 受伤硬直/闪烁时长 s
  LAND_TIME: 0.14,          // 落地压缩时长 s
  CRASH_TIME: 0.85,         // 高空坠落摔趴持续时间 s
  CRASH_VY: 620,            // 落地冲击速度超过此值触发"摔惨了"动作 px/s
  BLINK_INTERVAL: 2.4,      // 待机眨眼间隔 s
};

/* ------------------------------ 音频参数 -------------------------------- */
export const AUDIO = {
  DEFAULT_BGM: 0.45,        // 默认 BGM 音量 0~1
  DEFAULT_SFX: 0.70,        // 默认音效音量 0~1
  MASTER: 0.9,              // 总音量
  FADE_TIME: 0.38,          // 主题切换淡入淡出时长 s
  LOOKAHEAD: 0.12,          // 调度器预排时间窗 s
  TICK: 25,                 // 调度器轮询间隔 ms
};

/* =========================================================================
 * 主题区段配置表：5 段 × 20 层
 * 新增主题：复制一份，改 floors / 配色 / particle / types / music 即可，
 * audio.js 会直接读取 music 字段生成对应风格的 BGM。
 * music.notes  : 16 步主旋律，值为相对 root 的半音数，null 为休止
 * music.bass   : 16 步低音，相对 root 低八度的半音数
 * music.drum   : 16 步鼓点，'K'底鼓 'H'踩镲 'S'军鼓 null 休止
 * ========================================================================= */
export const THEMES = [
  {
    id: 'plain', name: '平原', banner: '✦ 平原 ✦', floors: [1, 20],
    skyTop: '#6fb7e8', skyBot: '#cdeaff',
    far: '#8fd0a0', near: '#5aa84f',
    platTop: '#79c83c', platSide: '#3f7d24', platLine: '#a7ea6b',
    accent: '#ffffff', particle: 'grass',
    types: { normal: 1 },
    music: {
      root: 261.63, tempo: 132, wave: 'square', cutoff: 2600,
      notes: [0, 4, 7, 12, 7, 4, 0, 4, 2, 5, 9, 12, 9, 5, 2, 0],
      bass:  [0, null, null, null, 5, null, null, null, 7, null, null, null, 5, null, null, null],
      drum:  ['K', 'H', 'H', 'H', 'K', 'H', 'H', 'H', 'K', 'H', 'H', 'H', 'K', 'H', 'S', 'H'],
    },
  },
  {
    id: 'snow', name: '雪原', banner: '❄ 雪原 ❄', floors: [21, 40],
    skyTop: '#4a6b96', skyBot: '#cfe4f7',
    far: '#a9c4dd', near: '#dcecf8',
    platTop: '#eaf6ff', platSide: '#8fb6d6', platLine: '#ffffff',
    accent: '#ffffff', particle: 'snow',
    types: { normal: 0.55, ice: 0.45 },
    music: {
      root: 293.66, tempo: 104, wave: 'sine', cutoff: 3200,
      notes: [0, null, 7, null, 12, null, 7, null, 5, null, 9, null, 12, null, 14, null],
      bass:  [0, null, null, null, 5, null, null, null, 7, null, null, null, 3, null, null, null],
      drum:  ['K', null, 'H', null, 'K', null, 'H', null, 'K', null, 'H', null, 'K', null, 'S', null],
    },
  },
  {
    id: 'desert', name: '沙漠', banner: '☀ 沙漠 ☀', floors: [41, 60],
    skyTop: '#e2a24c', skyBot: '#ffdfa0',
    far: '#d99b52', near: '#c77b38',
    platTop: '#e8bb63', platSide: '#9c6327', platLine: '#ffe19a',
    accent: '#fff3cf', particle: 'sand',
    types: { normal: 0.5, sand: 0.5 },
    music: {
      root: 277.18, tempo: 118, wave: 'triangle', cutoff: 2200,
      notes: [0, 1, 4, 7, 5, 4, 1, 0, 8, 7, 4, 1, 5, 4, 1, 0],
      bass:  [0, null, 0, null, 4, null, 4, null, 5, null, 5, null, 0, null, 0, null],
      drum:  ['K', 'H', 'H', 'S', 'K', 'H', 'H', 'H', 'K', 'H', 'H', 'S', 'K', 'H', 'S', 'H'],
    },
  },
  {
    id: 'factory', name: '机械工厂', banner: '⚙ 机械工厂 ⚙', floors: [61, 80],
    skyTop: '#2b3440', skyBot: '#4c5d6b',
    far: '#3c4854', near: '#28313a',
    platTop: '#9aa7b2', platSide: '#4c5761', platLine: '#d7e2ea',
    accent: '#ffd23f', particle: 'spark',
    types: { normal: 0.28, timed: 0.26, trap: 0.16, moving: 0.30 },
    music: {
      root: 220.00, tempo: 148, wave: 'sawtooth', cutoff: 1800,
      notes: [0, 0, 7, 0, 3, 0, 7, 0, 5, 0, 12, 0, 3, 0, 7, 0],
      bass:  [0, null, 0, null, 3, null, 3, null, 5, null, 5, null, 0, null, 0, null],
      drum:  ['K', 'H', 'K', 'H', 'K', 'H', 'S', 'H', 'K', 'H', 'K', 'H', 'K', 'H', 'S', 'H'],
    },
  },
  {
    id: 'lava', name: '熔岩地牢', banner: '🔥 熔岩地牢 🔥', floors: [81, 100],
    skyTop: '#1a0d0d', skyBot: '#4a1410',
    far: '#3a1210', near: '#220b0a',
    platTop: '#7a3a2c', platSide: '#3d1712', platLine: '#ff7a3c',
    accent: '#ff5a2c', particle: 'ember',
    types: { normal: 0.20, lava: 0.34, timed: 0.20, trap: 0.16, moving: 0.10 },
    music: {
      root: 207.65, tempo: 162, wave: 'square', cutoff: 2000,
      notes: [0, 1, 0, 8, 0, 1, 0, 7, 0, 1, 0, 8, 0, 7, 5, 1],
      bass:  [0, 0, null, 0, 0, 0, null, 0, 0, 0, null, 0, 0, 7, 5, 1],
      drum:  ['K', 'K', 'H', 'K', 'K', 'K', 'H', 'S', 'K', 'K', 'H', 'K', 'K', 'H', 'S', 'H'],
    },
  },
];

/* 由楼层号获取所属主题及主题内的序号 */
export function themeOfFloor(floor) {
  for (let i = 0; i < THEMES.length; i++) {
    const t = THEMES[i];
    if (floor >= t.floors[0] && floor <= t.floors[1]) return { theme: t, index: i };
  }
  const last = THEMES[THEMES.length - 1];
  return { theme: last, index: THEMES.length - 1 };
}

/* 按权重表随机挑选平台类型 */
export function pickType(weights, rnd = Math.random) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = rnd() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}
