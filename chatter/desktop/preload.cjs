'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Deliberately expose only operations rooted in the package's Chatter News folder.
contextBridge.exposeInMainWorld('orbitDesktop', Object.freeze({
  getInfo: () => ipcRenderer.invoke('orbit:get-info'),
  createDirectory: (segments) => ipcRenderer.invoke('orbit:create-directory', segments),
  beginWrite: (segments) => ipcRenderer.invoke('orbit:begin-write', segments),
  appendWrite: (token, bytes) => ipcRenderer.invoke('orbit:append-write', token, bytes),
  commitWrite: (token) => ipcRenderer.invoke('orbit:commit-write', token),
  abortWrite: (token) => ipcRenderer.invoke('orbit:abort-write', token),
  statFile: (segments) => ipcRenderer.invoke('orbit:stat-file', segments),
  readFile: (segments, start, end) => ipcRenderer.invoke('orbit:read-file', segments, start, end),
}));
