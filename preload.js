'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zexAPI', {
  openDialog:         (multiple = false)                       => ipcRenderer.invoke('open-dialog', { multiple }),
  openFolderDialog:   ()                                       => ipcRenderer.invoke('open-folder-dialog'),
  encryptFile:        (filePath, ext, deleteOrig, customKey, outputDir) => ipcRenderer.invoke('encrypt-file', { filePath, extension: ext, deleteOriginal: deleteOrig, customKey, outputDir }),
  decryptFile:        (filePath, key, outputDir)               => ipcRenderer.invoke('decrypt-file', { filePath, key, outputDir }),
  readLog:            ()                                       => ipcRenderer.invoke('read-log'),
  clearLog:           ()                                       => ipcRenderer.invoke('clear-log'),
  loadKeyFile:        ()                                       => ipcRenderer.invoke('load-key-file'),
  saveKeyFile:        (key, filename)                          => ipcRenderer.invoke('save-key-file', { key, filename }),

  // Window controls
  winMinimize: () => ipcRenderer.send('win-minimize'),
  winMaximize: () => ipcRenderer.send('win-maximize'),
  winClose:    () => ipcRenderer.send('win-close'),
});