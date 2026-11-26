/* =========================================================================
 * platform.js — 平台实体与 7 种类型的行为
 * -------------------------------------------------------------------------
 * 统一数据结构：{ x, y, w, type, ...extra }
 *   x = 左边缘, y = 顶面, w = 宽度, type = 类型字符串
 * 所有分支按 type 处理，新增类型只需在 update / onStand / draw 中加分支。
 * ========================================================================= */
import { PLAT, FRICTION, PHYS, VIEW } from './config.js';

export class Platform {
  /**
   * @param {number} x 左边缘
   * @param {number} y 顶面 Y
   * @param {number} w 宽度
   * @param {string} type normal|ice|sand|timed|trap|moving|lava
   * @param {object} extra 额外参数：{ axis:'x'|'y', phase, respawn }
   */
  constructor(x, y, w, type, extra = {}) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.type = type;
    this.baseX = x;
    this.baseY = y;

    this.active = true;         // 是否可站立 / 可见
    this.timer = 0;             // timed / lava 存活计时；sand 站立计时
    this.sink = 0;              // sand 陷入位移
    this.trapCd = 0;            // trap 触发冷却
    this.trapFlash = 0;         // trap 尖刺弹出动画计时
    this.respawnTimer = 0;      // 复原倒计时
    this.dx = 0; this.dy = 0;   // 本帧位移，用于载人

    this.axis = extra.axis || 'x';
    this.phase = extra.phase || 0;
    this.respawn = extra.respawn !== undefined ? extra.respawn : PLAT.TIMED_RESPAWN;

    // 摆动幅度按平台实际位置收敛，避免两个副作用：
    //  x 轴：平台摆出屏幕外，把站在上面的玩家带到边界后被强行剥离；
    //  y 轴：平台摆进上下层平台的角色身高范围，可能把玩家夹在两层之间。
    // 摆动频率仍用配置的 MOVE_RANGE 计算（速度感不变），只收敛振幅。
    const wantRange = extra.moveRange !== undefined ? extra.moveRange : PLAT.MOVE_RANGE;
    let safeRange = wantRange;
    if (this.type === 'moving') {
      if (this.axis === 'x') {
        // 平台左边缘 x∈[0, VIEW.W - w] 才完整可见
        safeRange = Math.min(wantRange, this.baseX, VIEW.W - (this.baseX + this.w));
      } else {
        // 与上下层保持半个身位：幅度 < 层间距 - 角色高 - 平台厚
        const gap = PHYS.FLOOR_HEIGHT - PHYS.PLAYER_H - PLAT.THICKNESS;
        safeRange = Math.min(wantRange, Math.max(0, gap - 8));
      }
      safeRange = Math.max(0, safeRange);
    }
    this.moveRange = safeRange;
    // 频率基于原始配置，保证收敛幅度后摆动节奏一致
    this.moveOmega = PLAT.MOVE_SPEED / (wantRange || PLAT.MOVE_RANGE);
  }

  get right() { return this.x + this.w; }
  get top() { return this.y; }

  /** 落地摩擦（player.js 读取） */
  get friction() {
    return FRICTION[this.type] !== undefined ? FRICTION[this.type] : FRICTION.normal;
  }

  /** 每个物理步更新自身行为 */
  update(dt, time) {
    this.dx = 0; this.dy = 0;
    if (!this.active) {
      if (this.respawn > 0) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.reset();
      }
      return;
    }

    switch (this.type) {
      case 'moving': {
        const off = Math.sin(time * this.moveOmega + this.phase) * this.moveRange;
        if (this.axis === 'x') {
          const nx = this.baseX + off;
          this.dx = nx - this.x; this.x = nx;
        } else {
          const ny = this.baseY + off;
          this.dy = ny - this.y; this.y = ny;
        }
        break;
      }
      case 'sand': {
        // 未被踩踏时缓慢恢复
        if (this.standThisFrame !== true) this.sink = Math.max(0, this.sink - PLAT.SAND_SINK_SPEED * 0.6 * dt);
        const ny = this.baseY + this.sink;
        this.dy = ny - this.y;          // 记录位移用于载人
        this.y = ny;
        if (this.sink > 30) {
          this.active = false;
          this.respawnTimer = PLAT.SAND_RESPAWN;   // 陷入后延迟浮出，而非下一帧立即复活
        }
        break;
      }
      case 'timed':
      case 'lava': {
        // timer 由 onStand 启动；启动后独立倒计时
        if (this.timer > 0) {
          this.timer += dt;
          const life = this.type === 'lava' ? PLAT.LAVA_LIFE : PLAT.TIMED_LIFE;
          if (this.timer >= life) {
            this.timer = life;
            this.active = false;
            this.respawnTimer = this.respawn;
            if (this.onExpire) this.onExpire(this);
          }
        }
        break;
      }
      case 'trap': {
        this.trapCd = Math.max(0, this.trapCd - dt);
        this.trapFlash = Math.max(0, this.trapFlash - dt);
        break;
      }
      default:
        break;
    }
    this.standThisFrame = false;
  }

  /** 角色站立在本平台顶部时每帧调用 */
  onStand(player, dt, audio) {
    this.standThisFrame = true;
    switch (this.type) {
      case 'sand': {
        // 站久开始下陷 + 减速（摩擦本身已在 FRICTION 中较低效）
        if (this.sink > 0 || this.timer > PLAT.SAND_SINK_DELAY) {
          this.sink += PLAT.SAND_SINK_SPEED * dt;
          player.vx *= 0.90;
          if (audio) audio.sandSink(dt);
        } else {
          this.timer += dt;
        }
        break;
      }
      case 'timed':
      case 'lava': {
        // 计时统一由 update() 推进；这里仅负责首次启动与提示音
        if (this.timer === 0) {
          this.timer = 0.0001;
          if (audio) {
            if (this.type === 'lava' && audio.lavaIgnite) audio.lavaIgnite();
            else if (audio.timedStart) audio.timedStart();
          }
        }
        break;
      }
      case 'trap': {
        if (this.trapCd <= 0) {
          this.trapCd = 1.2;
          this.trapFlash = 0.35;
          if (audio && audio.trap) audio.trap();
          player.hurt(PLAT.TRAP_KNOCKBACK, this, audio);
        }
        break;
      }
      default:
        break;
    }
  }

  /** 复原（timed / lava / sand 下陷重置） */
  reset() {
    this.active = true;
    this.timer = 0;
    this.sink = 0;
    this.y = this.baseY;
    this.x = this.baseX;
    this.respawnTimer = 0;
  }
}
