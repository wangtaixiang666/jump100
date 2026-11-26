/* =========================================================================
 * player.js — 角色实体：物理、动画状态机、逐帧像素绘制
 * -------------------------------------------------------------------------
 * 动画状态：idle / run / jump / fall / land / hurt / crash / win
 * 角色完全由代码逐帧绘制，无外部图片；朝向翻转、拉伸压扁增强手感。
 * ========================================================================= */
import { PHYS, ANIM, FRICTION, SLIDE, VIEW, PLAT } from './config.js';

/* 像素小人调色板 */
const C = {
  hair: '#33261c', skin: '#ffcfa0', eye: '#1b1b1b',
  shirt: '#e8483d', shirtDark: '#a82d26',
  pants: '#2d4c93', pantsDark: '#1d3163',
  shoe: '#241a12', white: '#ffffff', flash: '#ff5a4a',
};

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;                 // 碰撞盒左上角
    this.w = PHYS.PLAYER_W; this.h = PHYS.PLAYER_H;
    this.vx = 0; this.vy = 0;
    this.facing = 1;                        // 1 右 / -1 左
    this.onGround = false;
    this.groundPlatform = null;

    this.jumpHeld = false;
    this.jumpHoldTime = 0;
    this.landTimer = 0;
    this.hurtTimer = 0;
    this.crashTimer = 0;              // 高空坠落摔趴剩余时间
    this.slideTimer = 0;              // 落地惯性滑行剩余时间
    this.win = false;
    this.dead = false;

    this.animState = 'idle';
    this.animFrame = 0;
    this.animClock = 0;
    this.blinkClock = 0;
    this.blinking = false;

    this.floor = 1;
    this.maxFloor = 1;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get bottom() { return this.y + this.h; }

  /* ------------------------------ 受伤 ---------------------------------- */
  hurt(knockback, platform, audio) {
    if (this.hurtTimer > 0 || this.win) return;
    this.vy = -knockback;
    const dir = platform ? (this.cx < platform.x + platform.w / 2 ? -1 : 1) : -this.facing;
    this.vx = dir * knockback * 0.5;
    this.hurtTimer = ANIM.HURT_TIME;
    this.slideTimer = 0;
    this.onGround = false;
    this.groundPlatform = null;
    this._setState('hurt', true);
    if (audio) audio.hurt();
  }

  /* ----------------------------- 主更新 --------------------------------- */
  update(dt, input, platforms, audio, time) {
    if (this.win) { this.animClock += dt; this._animate(dt); return; }
    if (this.dead) return;

    /* --- 被移动/下陷平台载着走 --- */
    if (this.onGround && this.groundPlatform && this.groundPlatform.active) {
      this.x += this.groundPlatform.dx || 0;
      this.y += this.groundPlatform.dy || 0;
    }

    /* --- 水平输入 / 落地惯性滑行 --- */
    const accel = this.onGround ? PHYS.MOVE_ACCEL : PHYS.AIR_ACCEL;
    const dir = (input.state.right ? 1 : 0) - (input.state.left ? 1 : 0);
    const sliding = this.slideTimer > 0;
    if (this.hurtTimer <= 0 && this.crashTimer <= 0) {
      if (dir !== 0) {
        this.vx += dir * accel * dt;
        this.facing = dir;
      } else if (this.onGround) {
        // 落地后改用低摩擦滑行；冰面仍用其自身更低的摩擦
        const platF = this.groundPlatform ? this.groundPlatform.friction : FRICTION.normal;
        const f = sliding ? Math.min(SLIDE.LAND_FRICTION, platF) : platF;
        const drop = f * dt;
        if (Math.abs(this.vx) <= drop) this.vx = 0;
        else this.vx -= Math.sign(this.vx) * drop;
      }
    } else if (sliding && this.onGround) {
      // 摔趴硬直期间：趴在地上以更低摩擦滑出去
      const platF = this.groundPlatform ? this.groundPlatform.friction : FRICTION.normal;
      const drop = Math.min(SLIDE.CRASH_FRICTION, platF) * dt;
      if (Math.abs(this.vx) <= drop) this.vx = 0;
      else this.vx -= Math.sign(this.vx) * drop;
    }
    const vxCap = sliding ? SLIDE.MAX_VX : PHYS.MAX_RUN;
    this.vx = Math.max(-vxCap, Math.min(vxCap, this.vx));

    /* --- 跳跃：蓄力(按住减重力) + 松手截断 --- */
    if (input.pressed.jump && this.onGround && this.hurtTimer <= 0 && this.crashTimer <= 0) {
      this.vy = -PHYS.JUMP_VY;
      this.onGround = false;
      this.groundPlatform = null;
      this.jumpHeld = true;
      this.jumpHoldTime = 0;
      this._setState('jump', true);
      if (audio) audio.jump(0);
    }
    let g = PHYS.GRAVITY;
    if (this.jumpHeld && input.state.jump && this.vy < 0 && this.jumpHoldTime < PHYS.MAX_HOLD_TIME) {
      g = PHYS.GRAVITY * PHYS.HOLD_GRAVITY;
      this.jumpHoldTime += dt;
      if (this.jumpHoldTime >= PHYS.MAX_HOLD_TIME && audio) audio.jump(1);
    }
    if (input.released.jump && this.jumpHeld) {
      this.jumpHeld = false;
      if (this.vy < 0) this.vy *= 0.72;   // 提前松手 → 截短跳跃
    }
    if (this.vy >= 0) this.jumpHeld = false;
    this.vy = Math.min(PHYS.MAX_FALL_VY, this.vy + g * dt);

    /* --- 计时器 --- */
    if (this.hurtTimer > 0) this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    if (this.landTimer > 0) this.landTimer = Math.max(0, this.landTimer - dt);
    if (this.crashTimer > 0) this.crashTimer = Math.max(0, this.crashTimer - dt);
    if (this.slideTimer > 0) this.slideTimer = Math.max(0, this.slideTimer - dt);
    this.blinkClock += dt;
    if (this.blinkClock >= ANIM.BLINK_INTERVAL) {
      this.blinkClock = 0;
      this.blinking = true;
    } else if (this.blinkClock > 0.12) this.blinking = false;

    /* --- X 轴移动（角色无墙体碰撞，仅限制世界左右边界） --- */
    this.x += this.vx * dt;
    if (this.x < 0) { this.x = 0; this.vx = 0; }
    if (this.x + this.w > VIEW.W) { this.x = VIEW.W - this.w; this.vx = 0; }

    /* --- Y 轴移动 + 实心平台碰撞（上升撞底面反弹 / 下落顶面着陆） --- */
    const prevY = this.y;             // 移动前的头部 Y
    const prevBottom = this.bottom;
    this.y += this.vy * dt;
    this.onGround = false;
    this.groundPlatform = null;

    if (this.vy < 0) {
      // 上升：头部撞到平台底面 → 挡住并向下反弹（平台不再可从下方穿过）
      for (const p of platforms) {
        if (!p.active) continue;
        if (this.x + this.w <= p.x + 2 || this.x >= p.right - 2) continue;
        const underside = p.top + PLAT.THICKNESS;
        if (prevY >= underside && this.y < underside) {
          this.y = underside;
          this.vy = PHYS.CEILING_BOUNCE;
          this.jumpHeld = false;
          this.jumpHoldTime = 0;
          if (audio) audio.bump();
          break;
        }
      }
    } else {
      let best = null;
      for (const p of platforms) {
        if (!p.active) continue;
        if (this.x + this.w <= p.x + 2 || this.x >= p.right - 2) continue;
        if (prevBottom <= p.top + 6 && this.bottom >= p.top) {
          if (!best || p.top < best.top) best = p;
        }
      }
      if (best) {
        const impact = this.vy;
        this.y = best.top - this.h;
        this.vy = 0;
        this.onGround = true;
        this.groundPlatform = best;

        // 落地惯性：冲击越大、原有水平速度越大，滑得越远；
        // 垂直坠落时按朝向补一个最小滑行速度，摔趴后也会滑出去一段。
        if (impact > SLIDE.MIN_IMPACT) {
          this.slideTimer = SLIDE.TIME;
          const dirV = Math.abs(this.vx) > 20 ? Math.sign(this.vx) : this.facing;
          const kick = Math.max(SLIDE.MIN_KICK, impact * SLIDE.IMPACT_GAIN);
          this.vx = dirV * Math.min(SLIDE.MAX_VX, Math.max(Math.abs(this.vx), kick));
        }

        if (impact > ANIM.CRASH_VY) {
          // 高空坠落：趴地撅臀，短暂硬直
          this.crashTimer = ANIM.CRASH_TIME;
          this._setState('crash', true);
          if (audio) audio.crash(impact);
        } else if (impact > 120) {
          this.landTimer = ANIM.LAND_TIME;
          this._setState('land', true);
          if (audio) audio.land(impact);
        }
        best.onStand(this, dt, audio);
      }
    }

    /* --- 冰面滑行持续音效 --- */
    if (audio) {
      const onIce = this.onGround && this.groundPlatform && this.groundPlatform.type === 'ice';
      audio.setSlide(!!onIce && Math.abs(this.vx) > 40);
    }

    /* --- 楼层统计 --- */
    this.floor = Math.max(1, Math.min(100, Math.round((-this.y) / PHYS.FLOOR_HEIGHT) + 1));
    if (this.floor > this.maxFloor) this.maxFloor = this.floor;

    this._animate(dt);
  }

  /* ---------------------------- 动画状态机 ------------------------------- */
  _setState(s, force = false) {
    if (this.animState === s && !force) return;
    this.animState = s;
    this.animFrame = 0;
    this.animClock = 0;
  }

  _animate(dt) {
    if (this.win) { this._setState('win'); }
    else if (this.hurtTimer > 0) this._setState('hurt');
    else if (this.crashTimer > 0) this._setState('crash');
    else if (this.landTimer > 0) this._setState('land');
    else if (!this.onGround) this._setState(this.vy < 0 ? 'jump' : 'fall');
    else if (Math.abs(this.vx) > 24) this._setState('run');
    else this._setState('idle');

    this.animClock += dt;
    const frames = { idle: 4, run: 4, jump: 2, fall: 2, land: 1, hurt: 2, crash: 2, win: 4 }[this.animState] || 1;
    this.animFrame = Math.floor(this.animClock * ANIM.FPS) % frames;
  }

  /* ------------------------------ 绘制 ---------------------------------- */
  draw(ctx) {
    if (this.animState === 'crash') { this._drawCrash(ctx); return; }
    const f = this.facing;
    let sx = 1, sy = 1;
    // 拉伸压扁
    if (this.landTimer > 0) {
      const k = this.landTimer / ANIM.LAND_TIME;
      sy = 1 - 0.32 * k; sx = 1 + 0.26 * k;
    } else if (this.animState === 'jump' && this.vy < 0) { sy = 1.12; sx = 0.92; }
    else if (this.animState === 'fall') { sy = 1.06; sx = 0.96; }

    const u = 3;                          // 每个像素格 3 逻辑像素
    const W = 8, H = 10;                  // 角色网格 8×10 → 24×30
    const cx = Math.round(this.x + this.w / 2);
    const bottom = Math.round(this.bottom);
    const x0 = cx - (W * u * sx) / 2;
    const y0 = bottom - H * u * sy;

    ctx.save();
    ctx.translate(cx, bottom);
    ctx.scale(sx, sy);
    ctx.translate(-cx, -bottom);

    const cell = (col, row, w, h, color) => {
      const c = f > 0 ? col : (W - col - w);
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x0 + c * u), Math.round(y0 + row * u), w * u, h * u);
    };
    this._drawGuy(cell);
    ctx.restore();
  }

  /** 高空坠落：趴在地上、屁股撅起、头顶冒晕眩星星 */
  _drawCrash(ctx) {
    const u = 3, W = 8, H = 10;
    const f = this.facing;
    const cx = Math.round(this.x + this.w / 2);
    const bottom = Math.round(this.bottom);
    const x0 = cx - W * u / 2;
    const y0 = bottom - H * u;

    ctx.save();
    // 图案整体按朝向镜像，保证趴下时脸仍朝向移动方向
    const cell = (col, row, w, h, color) => {
      const c = f > 0 ? col : (W - col - w);
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x0 + c * u), Math.round(y0 + row * u), w * u, h * u);
    };

    // 头贴地在前方
    cell(0, 8, 2, 2, C.skin);
    cell(0, 8, 1, 1, C.hair);
    cell(1, 8, 1, 1, C.eye);
    // 前伸的手臂
    cell(2, 9, 2, 1, C.shirtDark);
    // 身体横躺
    cell(2, 7, 3, 2, C.shirt);
    cell(3, 7, 2, 1, C.shirtDark);
    // 撅起的屁股
    cell(5, 6, 2, 2, C.pants);
    // 向后上方翘起的小腿与鞋
    cell(6, 4, 1, 2, C.pantsDark);
    cell(6, 3, 2, 1, C.shoe);

    // 晕眩星星（绕头顶闪烁）
    const fr = this.animFrame;
    const starX = x0 + (f > 0 ? 1 : 5) * u;
    ctx.fillStyle = '#ffd76a';
    ctx.fillRect(Math.round(starX + fr * 2), Math.round(y0 + 6 * u), 3, 3);
    ctx.fillRect(Math.round(starX + 12 - fr * 2), Math.round(y0 + 5 * u), 2, 2);
    ctx.restore();
  }

  /** 依据 animState + animFrame 逐格绘制小人 */
  _drawGuy(cell) {
    const s = this.animState, fr = this.animFrame;
    const bob = (s === 'idle' && (fr === 1 || fr === 3)) ? 1 : 0; // 呼吸起伏
    const eye = (s === 'idle' && this.blinking) || (s === 'hurt' && fr % 2 === 1)
      ? C.hair : C.eye;

    // 头（row 0~2 含移动 bob）
    cell(2, 0 + bob, 4, 1, C.hair);
    cell(2, 1 + bob, 4, 1, C.skin);
    cell(3, 2 + bob, 1, 1, eye);
    cell(2, 2 + bob, 1, 1, C.skin);

    if (s === 'hurt' && fr % 2 === 0) {
      // 受伤闪红：整体覆盖一层红色半透明块
      cell(1, 0, 6, 10, C.flash);
      return;
    }

    switch (s) {
      case 'run': {
        const phase = fr % 4;
        const armFront = (phase === 0 || phase === 3);
        // 手臂
        cell(armFront ? 1 : 6, 4, 1, 2, C.shirtDark);
        cell(armFront ? 6 : 1, 4, 1, 2, C.shirt);
        // 身体
        cell(2, 4, 4, 2, C.shirt);
        cell(2, 5, 4, 1, C.shirtDark);
        // 腿：交替前后
        if (phase === 0) { cell(2, 6, 2, 2, C.pants); cell(5, 7, 1, 2, C.pantsDark); cell(1, 9, 3, 1, C.shoe); cell(5, 9, 2, 1, C.shoe); }
        else if (phase === 1) { cell(2, 6, 4, 2, C.pants); cell(2, 8, 2, 2, C.shoe); cell(5, 8, 1, 2, C.shoe); }
        else if (phase === 2) { cell(1, 7, 1, 2, C.pantsDark); cell(4, 6, 2, 2, C.pants); cell(1, 9, 2, 1, C.shoe); cell(4, 9, 3, 1, C.shoe); }
        else { cell(2, 6, 4, 2, C.pants); cell(2, 8, 2, 2, C.shoe); cell(5, 8, 1, 2, C.shoe); }
        break;
      }
      case 'jump': {
        cell(1, 3, 1, 2, C.shirt); cell(6, 3, 1, 2, C.shirt); // 手向上
        cell(2, 4, 4, 2, C.shirt); cell(2, 6, 4, 1, C.pants);
        cell(2, 7, 2, 1, C.pantsDark); cell(4, 7, 2, 1, C.pantsDark);
        cell(2, 8, 2, 1, C.shoe); cell(5, 8, 1, 1, C.shoe);
        break;
      }
      case 'fall': {
        cell(0, 4, 1, 2, C.shirtDark); cell(7, 4, 1, 2, C.shirt); // 手张开
        cell(2, 4, 4, 2, C.shirt);
        cell(1, 6, 2, 2, C.pants); cell(5, 6, 2, 2, C.pants);
        cell(1, 8, 2, 1, C.shoe); cell(5, 8, 2, 1, C.shoe);
        break;
      }
      case 'land': {
        cell(1, 5, 1, 1, C.shirtDark); cell(6, 5, 1, 1, C.shirtDark);
        cell(2, 4, 4, 2, C.shirt);
        cell(2, 6, 4, 2, C.pants);
        cell(2, 8, 2, 1, C.shoe); cell(4, 8, 2, 1, C.shoe);
        break;
      }
      case 'win': {
        const up = fr % 2 === 0;
        cell(1, 2, 1, 3, C.shirt); cell(6, 2, 1, 3, C.shirt); // 举手
        cell(2, 4, 4, 2, C.shirt);
        cell(2, 6, 4, 2, C.pants);
        if (up) { cell(2, 8, 2, 1, C.shoe); cell(5, 8, 1, 1, C.shoe); }
        else { cell(1, 8, 2, 1, C.shoe); cell(5, 8, 2, 1, C.shoe); }
        break;
      }
      case 'hurt': {
        cell(1, 4, 1, 1, C.shirtDark); cell(6, 4, 1, 1, C.shirt);
        cell(2, 4, 4, 2, C.shirt);
        cell(2, 6, 4, 2, C.pants);
        cell(1, 8, 2, 1, C.shoe); cell(5, 8, 2, 1, C.shoe);
        break;
      }
      default: { // idle
        cell(1, 4 + bob, 1, 2, C.shirtDark); cell(6, 4 + bob, 1, 2, C.shirt);
        cell(2, 4 + bob, 4, 2, C.shirt);
        cell(2, 6 + bob, 4, 2, C.pants);
        cell(2, 8, 2, 1, C.shoe); cell(4, 8, 2, 1, C.shoe);
        break;
      }
    }
  }
}
