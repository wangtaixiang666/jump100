/* =========================================================================
 * audio.js — Web Audio API 程序化 BGM 与音效（零外部素材）
 * -------------------------------------------------------------------------
 * BGM：16 步循环音序器，按主题数据（旋律/低音/鼓点/波形/BPM）合成 8-bit 音乐；
 *      换主题时先淡出 → 换数据 → 淡入。
 * 音效：一次性 Oscillator / 噪声突发合成；冰面滑行是常驻噪声环路 + 增益包络。
 * 浏览器自动播放策略：必须在首次用户交互后调用 unlock()。
 * ========================================================================= */
import { AUDIO, THEMES } from './config.js';

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.bgmVol = AUDIO.DEFAULT_BGM;
    this.sfxVol = AUDIO.DEFAULT_SFX;
    this.currentMusic = THEMES[0].music;
    this.step = 0;
    this.nextNoteTime = 0;
    this.timer = null;
    this.slideGain = null;
    this._sandClock = 0;
    this._fadeTimer = null;
  }

  /* ---------------------------- 初始化 / 解锁 ---------------------------- */
  unlock() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : AUDIO.MASTER;
    this.master.connect(ctx.destination);

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.bgmVol;
    this.musicGain.connect(this.master);

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = this.sfxVol;
    this.sfxGain.connect(this.master);

    // 预生成 1 秒白噪声缓冲，供鼓点 / 摩擦声复用
    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // 冰面滑行常驻噪声环路
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer; src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.8;
    this.slideGain = ctx.createGain();
    this.slideGain.gain.value = 0;
    src.connect(bp); bp.connect(this.slideGain); this.slideGain.connect(this.sfxGain);
    src.start();

    if (ctx.state === 'suspended') ctx.resume();
    this.ready = true;
    this.nextNoteTime = ctx.currentTime + 0.08;
    this.timer = setInterval(() => this._schedule(), AUDIO.TICK);
  }

  /* ------------------------------ BGM 调度 ------------------------------- */
  setTheme(theme) {
    const music = theme.music;
    if (this.currentMusic === music && this.ready) return;
    if (!this.ready) { this.currentMusic = music; return; }

    const t = this.ctx.currentTime;
    const g = this.musicGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + AUDIO.FADE_TIME);

    clearTimeout(this._fadeTimer);
    this._fadeTimer = setTimeout(() => {
      this.currentMusic = music;
      this.step = 0;
      this.nextNoteTime = this.ctx.currentTime + 0.05;
      const t2 = this.ctx.currentTime;
      const g2 = this.musicGain.gain;
      g2.cancelScheduledValues(t2);
      g2.setValueAtTime(0, t2);
      g2.linearRampToValueAtTime(this.bgmVol, t2 + AUDIO.FADE_TIME);
    }, AUDIO.FADE_TIME * 1000);
  }

  _schedule() {
    if (!this.ready || this.ctx.state !== 'running') return;
    const m = this.currentMusic;
    const stepDur = 60 / m.tempo / 2;   // 八分音符
    const now = this.ctx.currentTime;
    // 切到后台时 setInterval 被节流，nextNoteTime 会远远落后于现实时间。
    // 若不重置，回到前台会一次性补排成百上千个音符，造成卡顿和爆音。
    if (this.nextNoteTime < now - 0.5) {
      this.nextNoteTime = now + 0.02;
      this.step = 0;
    }
    while (this.nextNoteTime < now + AUDIO.LOOKAHEAD) {
      const i = this.step % 16;
      const t = this.nextNoteTime;

      // 主旋律
      if (m.notes[i] !== null && m.notes[i] !== undefined) {
        const freq = m.root * Math.pow(2, m.notes[i] / 12);
        this._tone(freq, t, stepDur * 0.82, m.wave, 0.11, this.musicGain, m.cutoff);
      }
      // 低音（root 低八度）
      if (m.bass[i] !== null && m.bass[i] !== undefined) {
        const freq = (m.root / 2) * Math.pow(2, m.bass[i] / 12);
        this._tone(freq, t, stepDur * 1.5, 'triangle', 0.16, this.musicGain, 900);
      }
      // 鼓点
      const d = m.drum[i];
      if (d === 'K') this._kick(t);
      else if (d === 'H') this._hat(t);
      else if (d === 'S') this._snare(t);

      this.step++;
      this.nextNoteTime += stepDur;
    }
  }

  /* ------------------------------ 合成基元 ------------------------------- */
  _tone(freq, t, dur, wave, vol, dest, cutoff) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = cutoff;
      o.connect(f); node = f;
    }
    node.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.03);
  }

  _noise(t, dur, vol, type, freq, dest) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, vol), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    src.start(t); src.stop(t + dur + 0.02);
  }

  _kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.34, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + 0.18);
  }

  _hat(t) { this._noise(t, 0.045, 0.055, 'highpass', 6500, this.musicGain); }
  _snare(t) {
    this._noise(t, 0.11, 0.11, 'bandpass', 1800, this.musicGain);
    this._tone(180, t, 0.08, 'triangle', 0.06, this.musicGain, 2000);
  }

  /* ------------------------------- 音效 --------------------------------- */
  jump(charge) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const f0 = 380 + charge * 300;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.7, t + 0.11);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.15);
  }

  land(impact) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const vol = Math.min(0.22, 0.06 + impact / 4000);
    this._tone(110, t, 0.09, 'sine', vol, this.sfxGain, 800);
    this._noise(t, 0.06, vol * 0.5, 'lowpass', 900, this.sfxGain);
  }

  /** 上升撞到平台底面的闷响 */
  bump() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._tone(160, t, 0.10, 'sine', 0.14, this.sfxGain, 900);
    this._noise(t, 0.05, 0.05, 'lowpass', 700, this.sfxGain);
  }

  /** 高空坠落摔趴：噪声拍地 + 下滑滑稽音。impact 越大音量越响、下滑越长。 */
  crash(impact = 620) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    // 冲击力度归一化：CRASH_VY(620) 附近为最轻，MAX_FALL_VY(900) 为最重
    const k = Math.max(0, Math.min(1, (impact - 620) / (900 - 620)));
    const vol = 0.18 + 0.12 * k;          // 0.18 ~ 0.30
    const slideDur = 0.26 + 0.14 * k;     // 下滑时长随力度增加
    this._noise(t, 0.28, vol, 'lowpass', 1100, this.sfxGain);
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(280 + 60 * k, t);
    o.frequency.exponentialRampToValueAtTime(70, t + slideDur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16 + 0.08 * k, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + slideDur + 0.02);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + slideDur + 0.04);
  }

  /** 冰面滑行：持续开关增益，避免每帧创建节点 */
  setSlide(active) {
    if (!this.ready) return;
    const g = this.slideGain.gain;
    g.setTargetAtTime(active ? 0.16 : 0, this.ctx.currentTime, 0.06);
  }

  /** 流沙下陷：节流播放细碎摩擦声 */
  sandSink(dt) {
    if (!this.ready) return;
    this._sandClock += dt;
    if (this._sandClock > 0.18) {
      this._sandClock = 0;
      this._noise(this.ctx.currentTime, 0.09, 0.06, 'lowpass', 600, this.sfxGain);
    }
  }

  timedStart() {
    if (!this.ready) return;
    this._tone(880, this.ctx.currentTime, 0.06, 'square', 0.08, this.sfxGain, 4000);
  }

  lavaIgnite() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.25, 0.12, 'bandpass', 1200, this.sfxGain);
    this._tone(180, t, 0.18, 'sawtooth', 0.08, this.sfxGain, 1400);
  }

  timedGone(type) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type === 'lava' ? 'sawtooth' : 'square';
    o.frequency.setValueAtTime(720, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.24);
    this._noise(t, 0.12, 0.07, 'highpass', 3000, this.sfxGain);
  }

  trap() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.16, 0.16, 'highpass', 2200, this.sfxGain);
    this._tone(520, t, 0.14, 'sawtooth', 0.12, this.sfxGain, 3000);
  }

  hurt() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [660, 520, 390].forEach((f, i) => {
      this._tone(f, t + i * 0.055, 0.09, 'square', 0.11, this.sfxGain, 3000);
    });
  }

  milestone() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [784, 1047].forEach((f, i) => this._tone(f, t + i * 0.09, 0.16, 'square', 0.10, this.sfxGain, 5000));
  }

  win() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      this._tone(f, t + i * 0.11, 0.28, 'square', 0.13, this.sfxGain, 6000));
  }

  gameover() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [392, 330, 262, 196].forEach((f, i) =>
      this._tone(f, t + i * 0.15, 0.3, 'triangle', 0.16, this.sfxGain, 2000));
  }

  /* ------------------------------ 音量控制 ------------------------------- */
  setBgmVolume(v) {
    this.bgmVol = Math.max(0, Math.min(1, v));
    if (this.ready) this.musicGain.gain.setTargetAtTime(this.bgmVol, this.ctx.currentTime, 0.03);
  }
  setSfxVolume(v) {
    this.sfxVol = Math.max(0, Math.min(1, v));
    if (this.ready) this.sfxGain.gain.setTargetAtTime(this.sfxVol, this.ctx.currentTime, 0.03);
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.ready) this.master.gain.setTargetAtTime(this.muted ? 0 : AUDIO.MASTER, this.ctx.currentTime, 0.03);
    return this.muted;
  }
}
