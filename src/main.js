/* =========================================================================
 * main.js — 游戏主循环、界面状态机、设置与 UI 绑定
 * -------------------------------------------------------------------------
 * 界面状态：menu → playing ⇄ paused → gameover / win
 *           menu / paused → settings → 原界面；menu → help → menu
 * ========================================================================= */
import { VIEW, PHYS, THEMES, themeOfFloor } from './config.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Platform } from './platform.js';
import { Level } from './level.js';
import { Camera } from './camera.js';
import { Renderer } from './renderer.js';
import { AudioSystem } from './audio.js';
import {
  DISPLAY_MODES, isDesktop, loadSettings, saveSettings, applySettings,
  quitApp, minimizeWindow, closeWindow,
} from './settings.js';

/* ------------------------------- DOM ------------------------------------ */
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;                 // 像素风：关闭平滑

const SCREENS = ['menu-screen', 'settings-screen', 'help-screen', 'pause-screen', 'overlay', 'web-quit-tip'];
const muteBtn = $('mute-btn');
const bgmSlider = $('bgm-vol');
const sfxSlider = $('sfx-vol');
const bestLabel = $('best-label');

/* ------------------------------ 系统实例 -------------------------------- */
const input = new Input();
const audio = new AudioSystem();
const camera = new Camera();
const renderer = new Renderer(ctx);

/* ------------------------------ 游戏状态 -------------------------------- */
let state = 'menu';
let level, player;
let time = 0;        // 视觉时间：一直累加，供粒子 / 动画使用
let gameTime = 0;    // 游戏逻辑时间：仅在 playing 时累加，驱动平台摆动
                     // （暂停时若继续走，恢复瞬间 moving 平台会跳位）
let lastThemeIndex = -1;
let currentTheme = THEMES[0];
let bannerText = '';
let bannerTimer = 0;
let lastMilestone = 0;
let displayFloor = 1;      // UI 显示楼层：仅在站立时更新，与主题判定同源，避免空中跳变
let best = loadBest();
let settings = loadSettings();
let settingsReturn = 'menu';       // 从哪个界面进入设置
let tipTimer = 0;

/* ------------------------------ 工具函数 -------------------------------- */
function loadBest() {
  try { return parseInt(localStorage.getItem('jump100_best') || '0', 10) || 0; }
  catch (e) { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem('jump100_best', String(v)); } catch (e) { /* 隐私模式忽略 */ }
}
function updateBestLabel() {
  bestLabel.textContent = `最高：${best} 层`;
  $('menu-best').textContent = String(best);
}

/** 显示指定遮罩界面；null 表示全部隐藏（游戏画面） */
function showScreen(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  document.body.classList.toggle('in-game',
    state === 'playing' || state === 'paused' || state === 'gameover' || state === 'win');
}

function showTip(msg) {
  const el = $('settings-tip');
  if (!msg) { el.classList.add('hidden'); return; }
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

function commitSettings() {
  saveSettings(settings);
  applySettings(settings).then(showTip).catch((e) => showTip('窗口设置失败：' + e.message));
}

/* ------------------------------ 游戏流程 -------------------------------- */
function newGame() {
  // 中途重开（R / Enter）也要保存本次最高纪录，否则进度会丢失
  if ((state === 'playing' || state === 'paused') && player && player.maxFloor > best) {
    best = player.maxFloor; saveBest(best); updateBestLabel();
  }
  level = new Level();
  player = new Player(VIEW.W / 2 - PHYS.PLAYER_W / 2, -PHYS.PLAYER_H);
  camera.snapTo(player);
  time = 0;
  gameTime = 0;
  lastThemeIndex = -1;
  currentTheme = THEMES[0];
  bannerText = '';
  bannerTimer = 0;
  lastMilestone = 0;
  displayFloor = 1;
  state = 'playing';
  showScreen(null);
  audio.unlock();
  checkTheme(true);
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  audio.setSlide(false);
  $('pause-floor').textContent = String(player ? player.floor : 1);
  showScreen('pause-screen');
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  showScreen(null);
}

function backToMenu() {
  if ((state === 'playing' || state === 'paused') && player && player.maxFloor > best) {
    best = player.maxFloor; saveBest(best); updateBestLabel();
  }
  state = 'menu';
  audio.setSlide(false);
  showScreen('menu-screen');
}

function gameOver() {
  if (state !== 'playing') return;
  state = 'gameover';
  audio.setSlide(false);
  audio.gameover();
  if (player.maxFloor > best) { best = player.maxFloor; saveBest(best); updateBestLabel(); }
  $('overlay-title').textContent = '游戏结束';
  $('overlay-msg').innerHTML = `到达 <b>${player.maxFloor}</b> 层<br>MAX FLOOR ${player.maxFloor} / 100`;
  $('start-btn').textContent = '再来一次';
  showScreen('overlay');
}

function winGame() {
  if (state !== 'playing') return;
  state = 'win';
  player.win = true;
  player.vx = 0; player.vy = 0;
  audio.setSlide(false);
  audio.win();
  if (100 > best) { best = 100; saveBest(best); updateBestLabel(); }
  $('overlay-title').textContent = '通关！';
  $('overlay-msg').innerHTML = '你跳完了全部 <b>100</b> 层<br>LEGENDARY CLIMBER';
  $('start-btn').textContent = '再挑战';
  showScreen('overlay');
}

function openSettings(from) {
  settingsReturn = from;
  state = 'settings';
  syncSettingsUI();
  showScreen('settings-screen');
}

function closeSettings() {
  state = settingsReturn;
  if (state === 'paused') showScreen('pause-screen');
  else { state = 'menu'; showScreen('menu-screen'); }
}

function checkTheme(force = false) {
  // 主题跟随角色「当前实际站立的平台」所属楼层，而不是历史最高层：
  // 从雪地掉回平原时，背景 / 粒子 / BGM 都要切回平原。
  let targetIndex = lastThemeIndex;
  if (force) targetIndex = 0;
  else if (player && player.onGround && player.groundPlatform) {
    targetIndex = themeOfFloor(player.groundPlatform.floor || 1).index;
  }
  if (targetIndex !== lastThemeIndex || force) {
    const goingBack = targetIndex < lastThemeIndex;
    lastThemeIndex = targetIndex;
    currentTheme = THEMES[targetIndex];
    bannerText = goingBack ? `↩ ${currentTheme.name} ↩` : currentTheme.banner;
    bannerTimer = 1.9;
    audio.setTheme(currentTheme);
  }
}

function checkMilestone() {
  const target = lastMilestone + 10;
  if (player.floor >= target && target <= 100) {
    lastMilestone = target;
    audio.milestone();
  }
}

/* ------------------------------ 设置界面 -------------------------------- */
function setSwitch(el, on) {
  el.classList.toggle('on', !!on);
  el.textContent = on ? '开' : '关';
}

function syncSettingsUI() {
  // 显示模式
  for (const b of $('seg-mode').querySelectorAll('button')) {
    b.classList.toggle('active', b.dataset.value === settings.displayMode);
  }
  const modeHint = DISPLAY_MODES.find((m) => m.id === settings.displayMode);
  $('mode-hint').textContent = (modeHint ? modeHint.desc : '') +
    (isDesktop() ? '' : '（网页版通过浏览器全屏实现）');
  $('custom-size').classList.toggle('hidden', settings.sizePreset !== 'custom');
  $('custom-w').value = String(settings.customW);
  $('custom-h').value = String(settings.customH);

  for (const b of $('seg-size').querySelectorAll('button')) {
    b.classList.toggle('active', b.dataset.value === settings.sizePreset);
  }
  setSwitch($('sw-top'), settings.alwaysOnTop);
  setSwitch($('sw-resize'), settings.resizable);
  setSwitch($('sw-mute'), settings.muted);

  $('set-bgm').value = String(settings.bgmVol);
  $('set-sfx').value = String(settings.sfxVol);
  $('bgm-val').textContent = String(settings.bgmVol);
  $('sfx-val').textContent = String(settings.sfxVol);
  bgmSlider.value = String(settings.bgmVol);
  sfxSlider.value = String(settings.sfxVol);
  muteBtn.textContent = settings.muted ? '🔇' : '🔊';
}

function syncAudioFromSettings() {
  audio.setBgmVolume(settings.bgmVol / 100);
  audio.setSfxVolume(settings.sfxVol / 100);
  if (audio.muted !== settings.muted) audio.toggleMute();
}

function toggleMute() {
  audio.unlock();
  settings.muted = audio.toggleMute();
  muteBtn.textContent = settings.muted ? '🔇' : '🔊';
  setSwitch($('sw-mute'), settings.muted);
  saveSettings(settings);
}

/* ------------------------------ UI 绑定 --------------------------------- */
// 主菜单
$('menu-start').addEventListener('click', () => newGame());
$('menu-settings').addEventListener('click', () => openSettings('menu'));
$('menu-help').addEventListener('click', () => { state = 'help'; showScreen('help-screen'); });
$('menu-quit').addEventListener('click', () => quitApp());

// 设置
$('seg-mode').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-value]');
  if (!b) return;
  settings.displayMode = b.dataset.value;
  syncSettingsUI(); commitSettings();
});
$('seg-size').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-value]');
  if (!b) return;
  settings.sizePreset = b.dataset.value;
  syncSettingsUI(); commitSettings();
});
$('custom-apply').addEventListener('click', () => {
  settings.customW = Math.max(600, Math.min(2560, Number($('custom-w').value) || 1100));
  settings.customH = Math.max(600, Math.min(1600, Number($('custom-h').value) || 1000));
  settings.sizePreset = 'custom';
  syncSettingsUI(); commitSettings();
});
$('sw-top').addEventListener('click', () => {
  settings.alwaysOnTop = !settings.alwaysOnTop;
  syncSettingsUI(); commitSettings();
});
$('sw-resize').addEventListener('click', () => {
  settings.resizable = !settings.resizable;
  syncSettingsUI(); commitSettings();
});
$('sw-mute').addEventListener('click', () => toggleMute());
$('set-bgm').addEventListener('input', (e) => {
  settings.bgmVol = Number(e.target.value);
  $('bgm-val').textContent = String(settings.bgmVol);
  bgmSlider.value = String(settings.bgmVol);
  audio.setBgmVolume(settings.bgmVol / 100);
  saveSettings(settings);
});
$('set-sfx').addEventListener('input', (e) => {
  settings.sfxVol = Number(e.target.value);
  $('sfx-val').textContent = String(settings.sfxVol);
  sfxSlider.value = String(settings.sfxVol);
  audio.setSfxVolume(settings.sfxVol / 100);
  saveSettings(settings);
});
$('settings-back').addEventListener('click', () => closeSettings());
$('help-back').addEventListener('click', () => { state = 'menu'; showScreen('menu-screen'); });

// 暂停
$('pause-resume').addEventListener('click', () => resumeGame());
$('pause-restart').addEventListener('click', () => newGame());
$('pause-settings').addEventListener('click', () => openSettings('paused'));
$('pause-menu').addEventListener('click', () => backToMenu());

// 结束 / 通关
$('start-btn').addEventListener('click', () => newGame());
$('over-menu').addEventListener('click', () => backToMenu());

// 游戏内控制条
muteBtn.addEventListener('click', () => toggleMute());
bgmSlider.addEventListener('input', () => {
  audio.unlock();
  settings.bgmVol = Number(bgmSlider.value);
  audio.setBgmVolume(settings.bgmVol / 100);
  $('set-bgm').value = String(settings.bgmVol);
  $('bgm-val').textContent = String(settings.bgmVol);
  saveSettings(settings);
});
sfxSlider.addEventListener('input', () => {
  audio.unlock();
  settings.sfxVol = Number(sfxSlider.value);
  audio.setSfxVolume(settings.sfxVol / 100);
  $('set-sfx').value = String(settings.sfxVol);
  $('sfx-val').textContent = String(settings.sfxVol);
  saveSettings(settings);
});

// 无边框窗口标题栏
$('title-min').addEventListener('click', () => minimizeWindow());
$('title-close').addEventListener('click', () => closeWindow());

// 键盘动作
input.onAction = (a) => {
  if (a === 'mute') { toggleMute(); return; }
  if (a === 'escape') {
    if (state === 'settings') { closeSettings(); return; }
    if (state === 'help') { state = 'menu'; showScreen('menu-screen'); return; }
    if (state === 'paused') { resumeGame(); return; }
    if (state === 'playing') {
      // ESC 只暂停游戏，不改玩家的显示模式偏好。
      // 网页版浏览器全屏由浏览器自行响应 ESC 退出，桌面版则保持全屏暂停。
      // 旧实现会在这里把 displayMode 永久写成 window 并持久化，导致下次启动
      // 莫名变成窗口模式——那是 bug，已移除。
      pauseGame();
    }
    return;
  }
  if (a === 'restart' && (state === 'playing' || state === 'paused')) newGame();
  if (a === 'enter') {
    if (state === 'menu') newGame();
    else if (state === 'gameover' || state === 'win') newGame();
  }
};

/* --------------------------- 菜单角色动画 -------------------------------- */
const heroCtx = $('menu-hero').getContext('2d');
heroCtx.imageSmoothingEnabled = false;
const heroInput = {
  state: { left: false, right: false, jump: false },
  pressed: { jump: false, left: false, right: false },
  released: { jump: false },
};
const heroPlatform = new Platform(0, 55, 120, 'normal');
const heroPlayer = new Player(10, 25);
heroPlayer.onGround = true;
heroPlayer.groundPlatform = heroPlatform;

function drawHero(dt) {
  heroPlayer.update(dt, heroInput, [heroPlatform], null, time);
  heroCtx.setTransform(1, 0, 0, 1, 0, 0);
  heroCtx.clearRect(0, 0, 80, 110);
  heroCtx.setTransform(2, 0, 0, 2, 0, 0);
  heroPlayer.draw(heroCtx);
}

/* ------------------------------ 主循环 ---------------------------------- */
let lastTime = performance.now();
function frame(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.05) dt = 0.05;              // 防止切后台后大跳步
  time += dt;

  if (state === 'playing') {
    gameTime += dt;
    level.update(dt, gameTime, audio);
    player.update(dt, input, level.platforms, audio, gameTime);
    camera.follow(player, dt);
    checkTheme();
    // 显示楼层只在站立时更新（与主题同源）：空中保持上一次落地楼层，
    // 不会因起跳瞬间 y 变小就提前显示下一主题的楼层号。
    if (player.onGround && player.groundPlatform) {
      displayFloor = player.groundPlatform.floor || Math.round((-player.y) / PHYS.FLOOR_HEIGHT) + 1;
    }
    checkMilestone();

    // 掉出屏幕底部 → 结束
    if (player.bottom > camera.y + VIEW.H + 40) gameOver();
    // 到达第 100 层 → 通关
    if (player.floor >= 100 && player.onGround && player.groundPlatform === level.platforms[99]) winGame();
  } else if (state === 'menu' || state === 'help') {
    drawHero(dt);
  }

  if (bannerTimer > 0) bannerTimer = Math.max(0, bannerTimer - dt);

  renderer.draw({
    player, level, camera, theme: currentTheme, time,
    best, bannerText, bannerTimer,
    muted: audio.muted, bgmVol: audio.bgmVol, sfxVol: audio.sfxVol,
    floor: displayFloor,
  });

  input.endFrame();
  requestAnimationFrame(frame);
}

/* ------------------------------ 初始化 ---------------------------------- */
if (isDesktop()) document.body.classList.add('has-desktop-api');

// 网页版：浏览器原生响应 ESC 退出全屏后，同步样式 class，避免全屏布局残留。
// 注意这里只更新视觉 class，不改动 settings.displayMode（玩家的偏好保持不变）。
if (!isDesktop()) {
  document.addEventListener('fullscreenchange', () => {
    document.body.classList.toggle('desktop-fullscreen', !!document.fullscreenElement);
  });
}
level = new Level();
player = new Player(VIEW.W / 2 - PHYS.PLAYER_W / 2, -PHYS.PLAYER_H);
camera.snapTo(player);
updateBestLabel();
syncAudioFromSettings();
syncSettingsUI();
applySettings(settings).catch(() => {});
showScreen('menu-screen');
requestAnimationFrame(frame);
