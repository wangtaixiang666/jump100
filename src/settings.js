/* =========================================================================
 * settings.js — 玩家设置：窗口 / 画面 / 音频
 * -------------------------------------------------------------------------
 * 桌面版（Electron）：通过 window.desktopAPI 调整真实窗口；
 * 网页版：退化为浏览器全屏 API + 画布显示尺寸，设置同样持久化。
 * ========================================================================= */

const KEY = 'jump100_settings_v1';

/** 默认设置（首次启动或本地数据损坏时使用） */
export const DEFAULT_SETTINGS = {
  displayMode: 'window',    // window | borderless | fullscreen
  sizePreset: 'medium',     // small | medium | large | custom
  customW: 1100,            // 自定义窗口宽（桌面版生效）
  customH: 1000,            // 自定义窗口高（桌面版生效）
  alwaysOnTop: false,       // 窗口始终置顶（仅桌面版）
  resizable: true,          // 允许拖拽调整窗口大小（仅桌面版）
  bgmVol: 45,               // 0..100
  sfxVol: 70,               // 0..100
  muted: false,
};

/** 显示模式选项 */
export const DISPLAY_MODES = [
  { id: 'window', name: '窗口化', desc: '普通窗口，可拖动标题栏' },
  { id: 'borderless', name: '无边框', desc: '隐藏标题栏，顶部可拖动' },
  { id: 'fullscreen', name: '全屏', desc: '占满整个屏幕，ESC 退出' },
];

/** 窗口尺寸预设。网页版会按比例映射为画布显示宽度。 */
export const SIZE_PRESETS = [
  { id: 'small', name: '小', w: 720, h: 760, webW: 340 },
  { id: 'medium', name: '标准', w: 900, h: 860, webW: 400 },
  { id: 'large', name: '大', w: 1100, h: 1000, webW: 480 },
  { id: 'custom', name: '自定义', w: 0, h: 0, webW: 560 },
];

/** 是否运行在 Electron 桌面版 */
export function isDesktop() {
  return !!(window.desktopAPI && window.desktopAPI.isElectron);
}

/** 读取设置（与默认值合并，兼容旧版本缺失字段） */
export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const s = { ...DEFAULT_SETTINGS, ...raw };
    if (!DISPLAY_MODES.some((m) => m.id === s.displayMode)) s.displayMode = DEFAULT_SETTINGS.displayMode;
    if (!SIZE_PRESETS.some((p) => p.id === s.sizePreset)) s.sizePreset = DEFAULT_SETTINGS.sizePreset;
    s.bgmVol = clamp(s.bgmVol, 0, 100);
    s.sfxVol = clamp(s.sfxVol, 0, 100);
    s.customW = clamp(s.customW, 600, 2560);
    s.customH = clamp(s.customH, 600, 1600);
    return s;
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

/** 保存设置 */
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* 隐私模式忽略 */ }
}

/** 取当前设置对应的窗口尺寸 */
export function resolveSize(s) {
  if (s.sizePreset === 'custom') {
    return { w: clamp(s.customW, 600, 2560), h: clamp(s.customH, 600, 1600) };
  }
  const p = SIZE_PRESETS.find((x) => x.id === s.sizePreset) || SIZE_PRESETS[1];
  return { w: p.w, h: p.h };
}

/** 应用设置到当前窗口 / 画面。返回可选的提示信息。 */
export async function applySettings(s) {
  const desktop = isDesktop();
  const size = resolveSize(s);

  // 同步 body class，供 CSS 控制铺满 / 无边框标题栏
  document.body.classList.toggle('desktop-fullscreen', desktop && s.displayMode === 'fullscreen');
  document.body.classList.toggle('mode-borderless', desktop && s.displayMode === 'borderless');

  if (desktop) {
    try {
      await window.desktopAPI.applyWindowSettings({
        displayMode: s.displayMode,
        width: size.w,
        height: size.h,
        alwaysOnTop: !!s.alwaysOnTop,
        resizable: !!s.resizable,
      });
    } catch (e) {
      return '窗口设置应用失败：' + (e && e.message ? e.message : e);
    }
    return null;
  }

  // --- 网页版 ---
  const preset = SIZE_PRESETS.find((p) => p.id === s.sizePreset) || SIZE_PRESETS[1];
  const webW = s.sizePreset === 'custom'
    ? clamp(Math.round(size.w * 400 / 900), 320, 640)
    : preset.webW;
  document.documentElement.style.setProperty('--stage-w', webW + 'px');

  const wantFull = s.displayMode === 'fullscreen';
  try {
    if (wantFull && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else if (!wantFull && document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch (e) {
    // 浏览器常拒绝非用户手势触发的全屏；回退为窗口化并提示
    return '浏览器拒绝了全屏请求，已保持窗口化（可点击设置项重试）';
  }
  document.body.classList.toggle('desktop-fullscreen', wantFull);
  return null;
}

/** 退出游戏（桌面版真正退出进程；网页版关闭标签页） */
export function quitApp() {
  if (isDesktop()) { window.desktopAPI.quit(); return; }
  window.close();
  setTimeout(() => {
    // 浏览器通常禁止脚本关闭非脚本打开的页面，给出可见提示
    const tip = document.getElementById('web-quit-tip');
    if (tip) {
      tip.classList.remove('hidden');
      setTimeout(() => tip.classList.add('hidden'), 3500);
    }
  }, 150);
}

/** 无边框窗口的最小化 / 关闭 */
export function minimizeWindow() {
  if (isDesktop()) window.desktopAPI.minimize();
}
export function closeWindow() {
  if (isDesktop()) window.desktopAPI.close();
  else quitApp();
}

function clamp(v, lo, hi) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
}
