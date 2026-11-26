/* =========================================================================
 * camera.js — 摄像机跟随
 * 让角色稳定处于屏幕纵向 ANCHOR(0.6) 处；带平滑插值，向下有下限避免露出虚空。
 * ========================================================================= */
import { VIEW, PHYS } from './config.js';

export class Camera {
  constructor() {
    this.y = 0;
  }

  snapTo(player) {
    this.y = this._target(player);
  }

  _target(player) {
    const target = player.cy - VIEW.H * PHYS.CAMERA_ANCHOR;
    return Math.min(0, target);   // 不向下滚出起点
  }

  follow(player, dt) {
    const t = this._target(player);
    this.y += (t - this.y) * Math.min(1, dt * 8);
  }

  /** 世界 Y → 屏幕 Y */
  toScreenY(worldY) { return Math.round(worldY - this.y); }
}
