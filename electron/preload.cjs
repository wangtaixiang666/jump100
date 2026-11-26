/* =========================================================================
 * preload.cjs — 渲染进程与 Electron 主进程之间的受限桥
 * 只暴露窗口控制所需的最小 API，不开放 Node 能力。
 * ========================================================================= */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  isElectron: true,
  applyWindowSettings: (settings) => ipcRenderer.invoke('window:apply', settings),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  quit: () => ipcRenderer.send('app:quit'),
});
