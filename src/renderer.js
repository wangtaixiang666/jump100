/* =========================================================================
 * renderer.js — 像素渲染：背景、粒子、平台外观、角色、UI
 * -------------------------------------------------------------------------
 * 所有绘制坐标取整；ctx.imageSmoothingEnabled = false 由 main.js 设置。
 * ========================================================================= */
import { VIEW, PLAT, themeOfFloor } from './config.js';

const PH = PLAT.THICKNESS;  // 平台渲染厚度（与碰撞厚度一致）

export class Renderer {
  constructor(ctx) {
    this.ctx = ctx;
  }

  draw(s) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIEW.W, VIEW.H);
    this._background(ctx, s.theme, s.camera, s.time);
    this._platforms(ctx, s.level.platforms, s.camera, s.theme, s.time);
    // 角色使用世界坐标绘制，此处统一应用摄像机偏移（屏幕Y = 世界Y - camera.y）
    if (s.player && !s.player.dead) {
      ctx.save();
      ctx.translate(0, -s.camera.y);
      s.player.draw(ctx);
      ctx.restore();
    }
    this._ui(ctx, s);
    if (s.bannerTimer > 0) this._banner(ctx, s.bannerText, s.bannerTimer);
  }

  /* ------------------------------ 背景层 -------------------------------- */
  _background(ctx, theme, cam, time) {
    // 天空渐变
    const g = ctx.createLinearGradient(0, 0, 0, VIEW.H);
    g.addColorStop(0, theme.skyTop);
    g.addColorStop(1, theme.skyBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);

    // 远景山形剪影：固定贴在画面底部的一小条，不再随摄像机高度把整块地面推上来
    // （旧实现用 (-cam.y*0.08)%90 作为偏移，跳得越高绿色矩形越高，像一块大绿框）
    ctx.fillStyle = theme.far;
    for (let k = 0; k < 3; k++) {
      const baseY = VIEW.H - 52 + k * 17;
      ctx.beginPath();
      ctx.moveTo(0, VIEW.H);
      for (let x = 0; x <= VIEW.W; x += 20) {
        const y = baseY + Math.sin((x + k * 60) * 0.02) * 9;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(VIEW.W, VIEW.H);
      ctx.closePath();
      ctx.fill();
    }
    // 近景草地带：固定 14px 细条
    ctx.fillStyle = theme.near;
    ctx.fillRect(0, VIEW.H - 14, VIEW.W, 14);

    // 主题粒子（屏幕空间）
    this._particles(ctx, theme, time, cam);
  }

  _particles(ctx, theme, time, cam) {
    ctx.save();
    const kind = theme.particle;
    const n = 46;
    for (let i = 0; i < n; i++) {
      const seed = i * 97.13;
      let x, y, size = 2, alpha = 0.75;
      ctx.fillStyle = theme.accent;
      switch (kind) {
        case 'snow':
          x = (seed * 3 + Math.sin(time * 0.6 + i) * 12 + VIEW.W) % VIEW.W;
          y = (seed * 2 + time * (22 + (i % 5) * 6) - cam.y * 0.15 + VIEW.H * 4) % VIEW.H;
          size = i % 6 === 0 ? 3 : 2;
          alpha = 0.5 + (i % 4) * 0.12;
          break;
        case 'sand':
          x = (seed + time * (38 + (i % 7) * 7)) % (VIEW.W + 20) - 10;
          y = (seed * 1.7 + Math.sin(time + i) * 8 - cam.y * 0.12 + VIEW.H * 3) % VIEW.H;
          // 沙粒是横向细线：交给循环末尾统一设置 globalAlpha 后绘制，
          // 不能在此提前 continue，否则透明度会沿用上一个粒子的值。
          ctx.fillStyle = theme.accent;
          ctx.globalAlpha = 0.22;
          ctx.fillRect(Math.round(x), Math.round(y), 6 + (i % 3) * 4, 1);
          continue;
        case 'spark':
          x = seed % VIEW.W;
          y = (seed * 1.3 - cam.y * 0.05 + VIEW.H * 4) % VIEW.H;
          alpha = (Math.sin(time * 6 + i * 2.1) > 0.4) ? 0.9 : 0.12;
          size = 2;
          break;
        case 'ember':
          x = (seed * 2 + Math.sin(time * 1.4 + i) * 10 + VIEW.W) % VIEW.W;
          y = (seed * 1.1 - time * (16 + (i % 4) * 9) - cam.y * 0.1 + VIEW.H * 4) % VIEW.H;
          alpha = 0.3 + (i % 5) * 0.14;
          ctx.fillStyle = i % 3 === 0 ? '#ffd23f' : '#ff6a2c';
          break;
        default: // grass / 花粉
          x = (seed + Math.sin(time * 0.8 + i) * 16 + VIEW.W) % VIEW.W;
          y = (seed * 1.9 - time * 8 - cam.y * 0.1 + VIEW.H * 4) % VIEW.H;
          size = 2; alpha = 0.3 + (i % 3) * 0.16;
          ctx.fillStyle = '#ffffff';
          break;
      }
      ctx.globalAlpha = alpha;
      ctx.fillRect(Math.round(x), Math.round(y), size, size);
    }
    ctx.restore();
  }

  /* ------------------------------ 平台层 -------------------------------- */
  _platforms(ctx, platforms, cam, theme, time) {
    for (const p of platforms) {
      const sy = cam.toScreenY(p.y);
      if (sy > VIEW.H + 24 || sy < -24) continue;
      // 平台按自身楼层主题配色：掉回平原时，上方的雪地平台仍保持雪色
      const platTheme = p.floor ? themeOfFloor(p.floor).theme : theme;
      this._platform(ctx, p, sy, platTheme, time);
    }
  }

  _platform(ctx, p, sy, theme, time) {
    const x = Math.round(p.x), w = p.w;   // 移动平台 x 为浮点，取整避免像素边缘发虚
    ctx.save();
    ctx.globalAlpha = p.active ? 1 : 0.22;

    // 通用底座
    ctx.fillStyle = theme.platSide;
    ctx.fillRect(x, sy + 4, w, PH - 4);
    ctx.fillStyle = theme.platTop;
    ctx.fillRect(x, sy, w, 5);
    ctx.fillStyle = theme.platLine;
    ctx.fillRect(x, sy, w, 1);

    switch (p.type) {
      case 'ice': {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = p.active ? 0.8 : 0.2;
        for (let i = 0; i < w; i += 14) ctx.fillRect(x + i, sy + 1, 5, 2);
        ctx.fillStyle = '#bfe9ff';
        ctx.fillRect(x, sy + 5, w, 2);
        break;
      }
      case 'sand': {
        ctx.fillStyle = '#8a5a22';
        ctx.globalAlpha = p.active ? 0.7 : 0.2;
        for (let i = 4; i < w; i += 10) ctx.fillRect(x + i, sy + 2, 3, 2);
        // 漩涡
        ctx.strokeStyle = '#7a4d1c';
        ctx.lineWidth = 1;
        const t = time * 2 + p.sink * 0.1;
        ctx.beginPath();
        ctx.ellipse(x + w / 2, sy + 3, 6 + Math.sin(t) * 2, 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'timed':
      case 'lava': {
        const life = p.type === 'lava' ? PLAT.LAVA_LIFE : PLAT.TIMED_LIFE;
        const ratio = p.timer > 0 ? Math.max(0, 1 - p.timer / life) : 1;
        ctx.fillStyle = p.type === 'lava' ? '#ff5a2c' : '#ffd23f';
        ctx.globalAlpha = p.active ? (p.timer > 0 ? 0.55 + 0.4 * Math.sin(time * 18) ** 2 : 0.75) : 0.2;
        ctx.fillRect(x, sy, w, 2);
        // 倒计时环
        ctx.globalAlpha = p.active ? 1 : 0.2;
        ctx.strokeStyle = p.type === 'lava' ? '#ff8a3c' : '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + w / 2, sy - 7, 6, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'trap': {
        ctx.globalAlpha = p.active ? 1 : 0.2;
        if (p.trapFlash > 0) {
          ctx.fillStyle = '#f2f2f2';
          const spikes = Math.max(3, Math.floor(w / 10));
          const sw = w / spikes;
          for (let i = 0; i < spikes; i++) {
            const sx = x + i * sw;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + sw / 2, sy - 8);
            ctx.lineTo(sx + sw, sy);
            ctx.closePath();
            ctx.fill();
          }
        } else {
          ctx.fillStyle = '#2b2b2b';
          for (let i = 6; i < w - 4; i += 12) ctx.fillRect(x + i, sy + 1, 4, 1);
          ctx.fillStyle = '#ff5a4a';
          ctx.fillRect(x + 2, sy + 3, 4, 2);
          ctx.fillRect(x + w - 6, sy + 5, 4, 2);
        }
        break;
      }
      case 'moving': {
        ctx.globalAlpha = p.active ? 0.4 : 0.15;
        ctx.strokeStyle = theme.accent;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        // 轨迹线必须画在屏幕坐标：平台 baseY 是世界坐标，需减去 camera.y
        // 否则跳高后轨迹线会飞出屏幕。幅度用收敛后的 moveRange，与实际摆动一致。
        if (p.axis === 'x') {
          ctx.moveTo(p.baseX - p.moveRange, sy + PH + 3);
          ctx.lineTo(p.baseX + p.moveRange, sy + PH + 3);
        } else {
          // _platform 未接收 cam：用当前平台屏幕 Y(sy) 加上 baseY 与 y 的世界差
          // 推出基准位置的屏幕 Y，等价于 cam.toScreenY(baseY)。
          const baseScreenY = sy + (p.baseY - p.y);
          ctx.moveTo(x + w + 4, baseScreenY - p.moveRange);
          ctx.lineTo(x + w + 4, baseScreenY + p.moveRange);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = p.active ? 1 : 0.2;
        ctx.fillStyle = theme.accent;
        ctx.fillRect(x + 3, sy + 5, 4, 2);
        ctx.fillRect(x + w - 7, sy + 5, 4, 2);
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }

  /* -------------------------------- UI ---------------------------------- */
  _ui(ctx, s) {
    // 优先用 main.js 传入的 displayFloor（站立平台楼层，与主题同源），
    // 不再直接用 player.floor（按 y 算，空中会与主题对不上）。
    const floor = s.floor || (s.player ? s.player.floor : 1);
    ctx.save();

    // 顶栏
    ctx.fillStyle = 'rgba(10,16,26,0.62)';
    ctx.fillRect(0, 0, VIEW.W, 38);
    ctx.font = 'bold 16px Consolas, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`FLOOR ${String(floor).padStart(3, '0')} / 100`, 10, 14);
    ctx.font = '11px Consolas, monospace';
    ctx.fillStyle = '#9fc4e8';
    ctx.fillText(s.theme.name, 10, 29);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd76a';
    ctx.fillText(`BEST ${s.best}`, VIEW.W - 10, 14);
    ctx.fillStyle = s.muted ? '#ff7a6a' : '#8fe0a0';
    ctx.fillText(s.muted ? 'MUTED' : (s.bgmVol > 0 ? '♪ ON' : '♪ --'), VIEW.W - 10, 29);
    ctx.textAlign = 'left';

    // 左侧进度条
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(4, 48, 6, VIEW.H - 100);
    const prog = Math.max(0, Math.min(1, floor / 100));
    ctx.fillStyle = '#7ed957';
    ctx.fillRect(4, 48 + (VIEW.H - 100) * (1 - prog), 6, (VIEW.H - 100) * prog);
    ctx.restore();
  }

  _banner(ctx, text, timer) {
    const total = 1.9;
    const k = Math.min(1, timer / 0.35, (total - timer) / 0.35);
    ctx.save();
    ctx.globalAlpha = Math.max(0, k);
    ctx.fillStyle = 'rgba(8,12,20,0.78)';
    ctx.fillRect(0, VIEW.H / 2 - 30, VIEW.W, 60);
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 22px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, VIEW.W / 2, VIEW.H / 2);
    ctx.restore();
  }
}
