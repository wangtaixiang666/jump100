/* =========================================================================
 * level.js — 100 层关卡程序化生成 + 主题区段管理
 * -------------------------------------------------------------------------
 * 保证可通关（数值以 config.js 为准）：
 *  · 相邻层垂直间距 FLOOR_HEIGHT(100) < 满蓄力跳高(约 147)
 *  · 相邻层中心偏移限制在 MAX_X_STEP(55) 内，实测最大约 76px
 *  · 满蓄力滞空约 0.79s × MAX_RUN(240) ≈ 189px，远大于所需横移量
 *  · 上层平台为下层的中心保留 CLEAR_ABOVE(18) 起跳安全带，避免堵死通道
 * ========================================================================= */
import { VIEW, PHYS, PLAT, THEMES, themeOfFloor, pickType } from './config.js';
import { Platform } from './platform.js';

/* 可复现的伪随机数发生器（mulberry32） */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Level {
  constructor(seed = (Math.random() * 1e9) | 0) {
    this.platforms = [];
    this.generate(seed);
  }

  generate(seed) {
    const rnd = makeRng(seed);
    this.platforms.length = 0;
    let prevCenter = VIEW.W / 2;

    for (let floor = 1; floor <= 100; floor++) {
      const { theme } = themeOfFloor(floor);
      const w = floor === 1 ? 120 : Math.round(PLAT.MIN_W + rnd() * (PLAT.MAX_W - PLAT.MIN_W));

      // 水平位置：随机偏移后必须给下层平台中心留出起跳通道。
      // 平台是实心的，若上层完全盖住下层中心，玩家从下方起跳必撞头、无法上行。
      let center;
      if (floor === 1) {
        center = VIEW.W / 2;
      } else {
        const safeL = prevCenter - PLAT.CLEAR_ABOVE;
        const safeR = prevCenter + PLAT.CLEAR_ABOVE;
        const min = PLAT.EDGE_MARGIN + w / 2;
        const max = VIEW.W - PLAT.EDGE_MARGIN - w / 2;
        const candidates = [
          prevCenter + (rnd() * 2 - 1) * PLAT.MAX_X_STEP, // 优先随机偏移
          safeR + 2 + w / 2,                             // 从右侧留出通道
          safeL - 2 - w / 2,                             // 从左侧留出通道
        ];
        center = candidates.find(c =>
          c >= min && c <= max && !(c - w / 2 <= safeR && c + w / 2 >= safeL));
        if (center === undefined) {
          center = (safeR + 2 + w / 2 <= max) ? safeR + 2 + w / 2 : safeL - 2 - w / 2;
        }
      }
      const x = Math.round(center - w / 2);
      const y = -(floor - 1) * PHYS.FLOOR_HEIGHT;

      // 类型：第 1 层固定普通，其余按主题权重抽取
      const type = floor === 1 ? 'normal' : pickType(theme.types, rnd);
      const extra = {};
      if (type === 'moving') {
        extra.axis = rnd() < 0.65 ? 'x' : 'y';
        extra.phase = rnd() * Math.PI * 2;
      }
      const p = new Platform(x, y, w, type, extra);
      p.floor = floor;   // 平台所属楼层：主题判定以此为准（玩家落回哪层就用哪层的主题）
      this.platforms.push(p);
      prevCenter = center;
    }
  }

  /** 更新所有平台（100 个，开销可忽略） */
  update(dt, time, audio) {
    for (const p of this.platforms) {
      // 给计时平台挂一个过期音效回调（避免直接依赖 audio 模块）
      if (!p.onExpire) p.onExpire = (plat) => { if (audio) audio.timedGone(plat.type); };
      p.update(dt, time);
    }
  }

  /** 找到角色下方即将落到的平台（供调试/扩展使用） */
  floorPlatform(floor) { return this.platforms[floor - 1]; }

  /** 主题横幅判定：楼层跨越主题边界时返回主题对象 */
  static themeAt(floor) { return themeOfFloor(floor); }
}
