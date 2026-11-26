/* =========================================================================
 * Electron 主进程 —— 把 jump100 网页游戏封装为 Windows 可执行程序
 * -------------------------------------------------------------------------
 * 1. 用 Node 内置 http 在 127.0.0.1 随机端口起静态服务器（ES Module 需 http）
 * 2. 创建 BrowserWindow，并通过 preload 暴露最小窗口控制 API
 * 3. 记住玩家的窗口模式 / 尺寸偏好，下次启动直接按偏好创建窗口
 * ========================================================================= */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');

// 可选调试端口：仅当设置 JUMP100_DEBUG 时开启，正常用户不受影响
if (process.env.JUMP100_DEBUG) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.JUMP100_DEBUG);
}

// 静态资源根目录：打包后为 asar 内的 game/ 目录；开发时为上级目录
const ROOT = app.isPackaged
  ? path.join(process.resourcesPath, 'game')
  : path.join(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

let win = null;
let server = null;
let pageUrl = '';

/* --------------------------- 窗口偏好持久化 ------------------------------ */
function prefsFile() {
  return path.join(app.getPath('userData'), 'jump100-window.json');
}
function readPrefs() {
  try { return JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) || {}; }
  catch (e) { return {}; }
}
function writePrefs(p) {
  try {
    fs.mkdirSync(path.dirname(prefsFile()), { recursive: true });
    fs.writeFileSync(prefsFile(), JSON.stringify(p));
  } catch (e) { /* 只读用户目录时忽略 */ }
}
function clampInt(v, lo, hi, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
}

/* ------------------------------ 静态服务器 ------------------------------- */
function startServer() {
  return new Promise((resolve, reject) => {
    const s = http.createServer((req, res) => {
      let urlPath;
      try {
        urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      } catch (e) {
        res.writeHead(400); res.end('Bad Request'); return;
      }
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
      if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not Found'); return; }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(data);
      });
    });
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

/* ------------------------------ 窗口控制 --------------------------------- */
function createWindow(prefs) {
  const mode = ['window', 'borderless', 'fullscreen'].includes(prefs.displayMode)
    ? prefs.displayMode : 'window';
  const w = clampInt(prefs.width, 480, 3000, 900);
  const h = clampInt(prefs.height, 620, 2000, 860);

  const browser = new BrowserWindow({
    width: w,
    height: h,
    minWidth: 480,
    minHeight: 620,
    frame: mode !== 'borderless',
    fullscreen: mode === 'fullscreen',
    resizable: prefs.resizable !== false,
    alwaysOnTop: !!prefs.alwaysOnTop,
    backgroundColor: '#0d1220',
    title: '是男人就跳100层',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  browser.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  return browser;
}

/** 运行时应用窗口设置（由渲染进程设置面板调用） */
function applyWindowSettings(s) {
  if (!win || win.isDestroyed()) return;
  const mode = ['window', 'borderless', 'fullscreen'].includes(s && s.displayMode)
    ? s.displayMode : 'window';

  // 切换有边框 / 无边框。Electron 在 Windows 上会内部重建原生窗口，
  // 但不会重新加载页面，游戏进度不丢失。
  if (typeof win.setHasFrame === 'function') {
    try {
      const hasFrame = typeof win.hasFrame === 'function' ? win.hasFrame() : mode !== 'borderless';
      if (hasFrame !== (mode !== 'borderless')) win.setHasFrame(mode !== 'borderless', false);
    } catch (e) { /* 个别平台不支持时退回全屏 / 普通窗口 */ }
  }

  const wantFull = mode === 'fullscreen';
  win.setFullScreen(wantFull);
  if (!wantFull) {
    const w = clampInt(s && s.width, 480, 3000, 900);
    const h = clampInt(s && s.height, 620, 2000, 860);
    win.setSize(w, h);
    win.center();
  }
  win.setResizable(!(s && s.resizable === false));
  win.setAlwaysOnTop(!!(s && s.alwaysOnTop), 'floating');

  writePrefs({
    displayMode: mode,
    width: clampInt(s && s.width, 480, 3000, 900),
    height: clampInt(s && s.height, 620, 2000, 860),
    resizable: !(s && s.resizable === false),
    alwaysOnTop: !!(s && s.alwaysOnTop),
  });
}

/* ------------------------------- 启动 ------------------------------------ */
async function main() {
  server = await startServer();
  const port = server.address().port;
  pageUrl = `http://127.0.0.1:${port}/`;

  if (!app.requestSingleInstanceLock()) {
    server.close();
    app.quit();
    return;
  }
  app.on('second-instance', () => {
    if (BrowserWindow.getAllWindows().length) BrowserWindow.getAllWindows()[0].focus();
  });

  await app.whenReady();
  Menu.setApplicationMenu(null);

  win = createWindow(readPrefs());
  await win.loadURL(pageUrl);

  ipcMain.handle('window:apply', (_e, settings) => applyWindowSettings(settings));
  ipcMain.on('window:minimize', () => { if (win && !win.isDestroyed()) win.minimize(); });
  ipcMain.on('window:close', () => { if (win && !win.isDestroyed()) win.close(); });
  ipcMain.on('app:quit', () => app.quit());

  app.on('window-all-closed', () => {
    if (server) server.close();
    app.quit();
  });
  app.on('before-quit', () => { if (server) server.close(); });

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      win = createWindow(readPrefs());
      await win.loadURL(pageUrl);
    }
  });
}

main().catch((err) => {
  console.error('启动失败:', err);
  app.quit();
});
