'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path   = require('path');
const fs     = require('fs');
const crypto = require('./crypto-engine');

// ── Window ───────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width:           940,
    height:          660,
    minWidth:        720,
    minHeight:       560,
    resizable:       true,
    frame:           false,
    backgroundColor: '#f0f4f8',
    title:           'ZEX — Zion Encrypted X-Layer',
    autoHideMenuBar: true,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  });

  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Helpers ──────────────────────────────────────────────────────
function encOutputPath(filePath, extension) {
  const ext = extension.replace(/^\.+/, '');
  return filePath + '.' + ext;
}

function decOutputPath(filePath) {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, parsed.name);
}

function buildAuditEntry(action, filePath, size, status) {
  return {
    timestamp: new Date().toISOString(),
    action,
    filename:  path.basename(filePath),
    size:      size   || 0,
    status:    status || 'unknown',
  };
}

// ── IPC Handlers ─────────────────────────────────────────────────

// 1. open-dialog — Open file (with multiple selection support)
ipcMain.handle('open-dialog', async (_event, options = {}) => {
  const win = BrowserWindow.getFocusedWindow();
  const multiple = options.multiple || false;
  
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    title: multiple ? 'Select File(s)' : 'Select File',
  });
  
  if (canceled || !filePaths || filePaths.length === 0) return multiple ? [] : null;
  
  // Return array for multiple, string for single
  return multiple ? filePaths : filePaths[0];
});

// 2. open-folder-dialog — Open folder
ipcMain.handle('open-folder-dialog', async () => {
  const win = BrowserWindow.getFocusedWindow();
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Select Output Folder',
  });
  if (canceled || !filePaths || filePaths.length === 0) return null;
  return filePaths[0];
});

// 3. encrypt-file
ipcMain.handle('encrypt-file', async (_event, { filePath, extension, deleteOriginal, customKey, outputDir }) => {
  try {
    // Validate file exists
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found: ' + filePath };
    }

    // Use custom key if provided, otherwise generate one
    const key = customKey || crypto.generateKey();

    // Determine output path
    let outputPath;
    if (outputDir && fs.existsSync(outputDir)) {
      const fileName = path.basename(filePath);
      const ext = extension.replace(/^\.+/, '');
      outputPath = path.join(outputDir, fileName + '.' + ext);
    } else {
      outputPath = encOutputPath(filePath, extension || 'zex');
    }

    // Validate custom key if provided
    if (customKey) {
      try {
        const keyBuffer = Buffer.from(customKey, 'base64');
        if (keyBuffer.length !== 32) {
          return { success: false, error: 'Key must be 32 bytes when base64-decoded (256-bit)' };
        }
      } catch (e) {
        return { success: false, error: 'Invalid Base64 key format' };
      }
    }

    const result = await crypto.encryptFile(filePath, outputPath, key);

    if (result.success) {
      if (deleteOriginal) {
        try { 
          fs.unlinkSync(filePath); 
        } catch (e) { 
          console.error('Failed to delete original:', e.message);
        }
      }
      crypto.logAudit(buildAuditEntry('ENCRYPT', filePath, result.originalSize, 'success'));
      return { ...result, key };
    }

    crypto.logAudit(buildAuditEntry('ENCRYPT', filePath, 0, 'failed'));
    return result;

  } catch (err) {
    crypto.logAudit(buildAuditEntry('ENCRYPT', filePath || 'unknown', 0, 'failed'));
    return { success: false, error: err.message };
  }
});

// 4. decrypt-file
ipcMain.handle('decrypt-file', async (_event, { filePath, key, outputDir }) => {
  try {
    // Validate file exists
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found: ' + filePath };
    }

    // Validate key format
    if (!key || typeof key !== 'string') {
      return { success: false, error: 'Decryption key is required' };
    }

    // Determine output path
    let outputPath;
    if (outputDir && fs.existsSync(outputDir)) {
      const fileName = decOutputPath(filePath);
      outputPath = path.join(outputDir, path.basename(fileName));
    } else {
      outputPath = decOutputPath(filePath);
    }

    const result = await crypto.decryptFile(filePath, outputPath, key);
    const status = result.success ? 'success' : 'failed';
    crypto.logAudit(buildAuditEntry('DECRYPT', filePath, result.decryptedSize || 0, status));
    return result;

  } catch (err) {
    crypto.logAudit(buildAuditEntry('DECRYPT', filePath || 'unknown', 0, 'failed'));
    return { success: false, error: err.message };
  }
});

// 5. read-log
ipcMain.handle('read-log', () => {
  return crypto.readAuditLog();
});

// 6. clear-log
ipcMain.handle('clear-log', () => {
  try {
    const AUDIT_LOG = path.join(app.getPath('userData'), 'audit-log.json');
    if (fs.existsSync(AUDIT_LOG)) fs.unlinkSync(AUDIT_LOG);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 7. load-key-file
ipcMain.handle('load-key-file', async () => {
  try {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'ZEX Key Files', extensions: ['zexkey'] }],
      title: 'Select .zexkey file',
    });
    
    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, error: 'Cancelled' };
    }

    const keyFile = filePaths[0];
    const keyContent = fs.readFileSync(keyFile, 'utf8').trim();
    
    return { success: true, key: keyContent };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 8. save-key-file
ipcMain.handle('save-key-file', async (_event, { key, filename }) => {
  try {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: filename,
      filters: [{ name: 'ZEX Key Files', extensions: ['zexkey'] }],
      title: 'Save encryption key',
    });

    if (canceled || !filePath) {
      return { success: false, error: 'Cancelled' };
    }

    fs.writeFileSync(filePath, key, 'utf8');
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 9. Window controls (for frameless window)
ipcMain.on('win-minimize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.minimize();
});

ipcMain.on('win-maximize', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
});

ipcMain.on('win-close', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.close();
});