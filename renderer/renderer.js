'use strict';

/* ═══════════════════════════════════════════════════════════════
   ZEX — Secure File Vault · renderer.js  (full feature build)
   Features: Drag&Drop, Output Folder, Key File Export/Import,
             Secure Wipe, Keyboard Shortcuts, Key Strength Meter,
             Multiple File Selection
   ═══════════════════════════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);

// ── DOM refs ─────────────────────────────────────────────────────
const loadingScreen      = $('loadingScreen');
const loadingBarFill     = $('loadingBarFill');
const themeToggle        = $('themeToggle');
const themeIcon          = $('themeIcon');
const tabEnc             = $('tabEnc');
const tabDec             = $('tabDec');
const tabAudit           = $('tabAudit');
const encPanel           = $('encPanel');
const decPanel           = $('decPanel');
const auditPanel         = $('auditPanel');

// Encrypt
const browseEncBtn       = $('browseEncBtn');
const encFilePath        = $('encFilePath');
const extInput           = $('extInput');
const resetExtBtn        = $('resetExtBtn');
const extBadge           = $('extBadge');
const customKeyInput     = $('customKeyInput');
const showCustomKeyBtn   = $('showCustomKeyBtn');
const importKeyBtn       = $('importKeyBtn');
const keyStrengthWrap    = $('keyStrengthWrap');
const keyStrengthFill    = $('keyStrengthFill');
const keyStrengthLabel   = $('keyStrengthLabel');
const encOutputDir       = $('encOutputDir');
const browseEncOutputBtn = $('browseEncOutputBtn');
const clearEncOutputBtn  = $('clearEncOutputBtn');
const secureWipeToggle   = $('secureWipeToggle');
const deleteToggle       = $('deleteToggle');
const encProgressWrap    = $('encProgressWrap');
const encProgress        = $('encProgress');
const encStatus          = $('encStatus');
const encryptBtn         = $('encryptBtn');
const encResult          = $('encResult');
const encOutName         = $('encOutName');
const encOrigSize        = $('encOrigSize');
const encEncSize         = $('encEncSize');
const encKeyBox          = $('encKeyBox');
const copyKeyBtn         = $('copyKeyBtn');
const exportKeyBtn       = $('exportKeyBtn');
const encResetBtn        = $('encResetBtn');

// Decrypt
const browseDecBtn       = $('browseDecBtn');
const decFilePath        = $('decFilePath');
const keyInput           = $('keyInput');
const showKeyBtn         = $('showKeyBtn');
const importDecKeyBtn    = $('importDecKeyBtn');
const decOutputDir       = $('decOutputDir');
const browseDecOutputBtn = $('browseDecOutputBtn');
const clearDecOutputBtn  = $('clearDecOutputBtn');
const decProgressWrap    = $('decProgressWrap');
const decProgress        = $('decProgress');
const decStatus          = $('decStatus');
const decryptBtn         = $('decryptBtn');
const decSuccess         = $('decSuccess');
const decOutName         = $('decOutName');
const decOutSize         = $('decOutSize');
const decError           = $('decError');
const decErrorMsg        = $('decErrorMsg');
const decResetBtnSuccess = $('decResetBtnSuccess');
const decResetBtnError   = $('decResetBtnError');

// Audit
const refreshLogBtn      = $('refreshLogBtn');
const clearLogBtn        = $('clearLogBtn');
const auditTableBody     = $('auditTableBody');
const auditEmpty         = $('auditEmpty');

// ── State for multiple file selection ────────────────────────────
let selectedFiles    = [];
let selectedDecFiles = [];

/* ══════════════════════════════════════════════════════════════
   LOADING
   ═══════════════════════════════════════════════════════════════ */
const LOADING_MESSAGES = ['Initializing secure vault…','Loading crypto engine…','Verifying integrity…','Ready.'];

function runLoadingSequence() {
  if (!loadingScreen) return;
  const subtitle = loadingScreen.querySelector('.loading-subtitle');
  let idx = 0;
  const steps = [25, 55, 85, 100];
  if (subtitle) subtitle.textContent = LOADING_MESSAGES[0];
  if (loadingBarFill) loadingBarFill.style.width = '10%';

  const iv = setInterval(() => {
    idx++;
    if (idx < LOADING_MESSAGES.length) {
      if (subtitle) subtitle.textContent = LOADING_MESSAGES[idx];
      if (loadingBarFill) loadingBarFill.style.width = steps[idx] + '%';
    } else clearInterval(iv);
  }, 360);

  setTimeout(() => { if (loadingBarFill) loadingBarFill.style.width = '100%'; }, 1200);
  setTimeout(() => {
    clearInterval(iv);
    loadingScreen.classList.add('hidden');
    loadingScreen.addEventListener('transitionend', () => loadingScreen.remove(), { once: true });
  }, 1650);
}

/* ═══════════════════════════════════════════════════════════════
   THEME
   ═══════════════════════════════════════════════════════════════ */
const THEME_KEY = 'zex-theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (themeIcon) themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}

function initTheme() {
  let saved = 'light';
  try { saved = localStorage.getItem(THEME_KEY) || 'light'; } catch {}
  applyTheme(saved);
}

if (themeToggle) themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

/* ═══════════════════════════════════════════════════════════════
   TABS
   ═══════════════════════════════════════════════════════════════ */
const TABS = [
  { btn: tabEnc,   panel: encPanel   },
  { btn: tabDec,   panel: decPanel   },
  { btn: tabAudit, panel: auditPanel },
];

function switchTab(i) {
  TABS.forEach(({ btn, panel }, idx) => {
    const active = idx === i;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
    panel.hidden = !active;
  });
  if (i === 2) loadAuditLog();
}

TABS.forEach(({ btn }, i) => btn.addEventListener('click', () => switchTab(i)));

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
function animateProgress(elementId, targetPct, durationMs) {
  const fill = $(elementId); if (!fill) return;
  const wrap = $(elementId.replace('Progress','ProgressWrap'));
  if (wrap) wrap.hidden = false;
  const s = parseFloat(fill.style.width) || 0, d = targetPct - s, t0 = performance.now();
  const step = (now) => {
    const p = Math.min((now - t0) / durationMs, 1);
    fill.style.width = (s + d * (1 - Math.pow(1 - p, 3))) + '%';
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function formatSize(b) {
  if (b == null) return '—';
  if (b >= 1048576) return (b/1048576).toFixed(1)+' MB';
  if (b >= 1024)    return (b/1024).toFixed(0)+' KB';
  return b+' B';
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')} ${d.toLocaleString('en-GB',{month:'short'})} ${d.getFullYear()}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  } catch { return iso; }
}

function basename(p) { return p ? p.replace(/.*[\\/]/,'') : '—'; }

function setStatus(el, msg, color) {
  if (!el) return;
  el.textContent = msg; el.style.color = color || ''; el.hidden = !msg;
}



/* ═══════════════════════════════════════════════════════════════
   EXTENSION BADGE
   ═══════════════════════════════════════════════════════════════ */
function syncExtBadge() {
  if (!extInput || !extBadge) return;
  const val = extInput.value.trim() || 'zex';
  extBadge.textContent = '.' + val;
}

extInput.addEventListener('input', syncExtBadge);
resetExtBtn.addEventListener('click', () => { extInput.value = 'zex'; syncExtBadge(); });

/* ═══════════════════════════════════════════════════════════════
   CUSTOM KEY STRENGTH INDICATOR
   ═══════════════════════════════════════════════════════════════ */
function analyzeKeyStrength(key) {
  if (!key || key.length < 16) return { label: 'Too short', width: 20, cls: 'weak' };
  if (key.length < 32) return { label: 'Weak', width: 40, cls: 'weak' };
  const hasLower = /[a-z]/.test(key), hasUpper = /[A-Z]/.test(key),
        hasDigit = /\d/.test(key), hasSymbol = /[^a-zA-Z0-9]/.test(key);
  const score = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  if (score === 4 && key.length >= 64) return { label: 'Strong', width: 100, cls: 'strong' };
  if (score >= 3 && key.length >= 44) return { label: 'Good', width: 75, cls: 'good' };
  return { label: 'Fair', width: 50, cls: 'fair' };
}

if (customKeyInput) {
  customKeyInput.addEventListener('input', () => {
    const key = customKeyInput.value.trim();
    if (!key) {
      keyStrengthWrap.hidden = true;
      return;
    }
    const { label, width, cls } = analyzeKeyStrength(key);
    keyStrengthWrap.hidden = false;
    keyStrengthLabel.textContent = label;
    keyStrengthFill.style.width = width + '%';
    keyStrengthFill.className = 'key-strength-fill ' + cls;
  });
}

/* ═══════════════════════════════════════════════════════════════
   ENCRYPT
   ═══════════════════════════════════════════════════════════════ */

browseEncBtn.addEventListener('click', async () => {
  const files = await window.zexAPI.openDialog(true);
  if (files && files.length > 0) {
    selectedFiles = files;
    if (files.length === 1) {
      encFilePath.value = files[0];
    } else {
      encFilePath.value = `${files.length} files selected`;
    }
  }
});

showCustomKeyBtn.addEventListener('click', () => {
  const h = customKeyInput.type === 'password';
  customKeyInput.type = h ? 'text' : 'password';
  showCustomKeyBtn.textContent = h ? 'Hide' : 'Show';
});

// Import key for encrypt
if (importKeyBtn) importKeyBtn.addEventListener('click', async () => {
  const r = await window.zexAPI.loadKeyFile();
  if (r && r.success) {
    customKeyInput.value = r.key;
    // Trigger input event to update strength meter
    customKeyInput.dispatchEvent(new Event('input'));
  }
  else if (r && r.error !== 'Cancelled') alert('Import failed: ' + r.error);
});

// Output folder for encrypt
browseEncOutputBtn.addEventListener('click', async () => {
  const fp = await window.zexAPI.openFolderDialog();
  if (fp) {
    encOutputDir.value = fp;
  }
});
clearEncOutputBtn.addEventListener('click', () => { encOutputDir.value = ''; });

encryptBtn.addEventListener('click', async () => {
  const filesToEncrypt = selectedFiles.length > 0 ? selectedFiles : [encFilePath.value.trim()];
  const ext       = extInput.value.trim() || 'zex';
  const doWipe    = secureWipeToggle.checked;
  const doDelete  = deleteToggle.checked;
  const customKey = customKeyInput.value.trim() || null;
  const outputDir = encOutputDir.value.trim() || null;

  if (filesToEncrypt.length === 0 || !filesToEncrypt[0]) {
    setStatus(encStatus, 'Please select file(s) first.', 'var(--red)');
    return;
  }

  // Validate custom key if provided
  if (customKey) {
    try {
      const decoded = atob(customKey);
      if (decoded.length !== 32) {
        setStatus(encStatus, 'Key must be 32 bytes (256-bit) when base64-decoded.', 'var(--red)');
        return;
      }
    } catch (e) {
      setStatus(encStatus, 'Invalid Base64 key format.', 'var(--red)');
      return;
    }
  }

  encryptBtn.disabled     = true;
  encResult.hidden        = true;
  encProgress.style.width = '0%';
  
  const totalFiles = filesToEncrypt.length;
  let successCount = 0;
  let failedCount = 0;
  let lastKey = '';

  setStatus(encStatus, `Encrypting ${totalFiles} file(s)…`, 'var(--muted)');
  animateProgress('encProgress', 80, 2000);

  for (let i = 0; i < totalFiles; i++) {
    const filePath = filesToEncrypt[i];
    try {
      const result = await window.zexAPI.encryptFile(filePath, ext, doWipe || doDelete, customKey, outputDir);
      if (result && result.success) {
        successCount++;
        lastKey = result.key;
        const progress = 80 + (i / totalFiles) * 20;
        animateProgress('encProgress', progress, 500);
      } else {
        failedCount++;
      }
    } catch (err) {
      failedCount++;
    }
  }

  animateProgress('encProgress', 100, 200);

  if (failedCount === 0) {
    setStatus(encStatus, `✓ Successfully encrypted ${successCount} file(s).`, 'var(--green)');
    encOutName.textContent  = totalFiles === 1 ? basename(filesToEncrypt[0]) : `${successCount} files`;
    encOrigSize.textContent = totalFiles === 1 ? formatSize(await getFileSize(filesToEncrypt[0])) : '—';
    encEncSize.textContent  = '—';
    encKeyBox.textContent   = lastKey || '(no key)';
    encResult.hidden        = false;
  } else {
    setStatus(encStatus, `⚠ Encrypted ${successCount}, Failed: ${failedCount}`, 'var(--yellow)');
  }

  encryptBtn.disabled = false;
});

async function getFileSize(filePath) {
  try {
    const fs = require('fs');
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

// Copy key
copyKeyBtn.addEventListener('click', async () => {
  const key = encKeyBox.textContent; if (!key) return;
  try {
    await navigator.clipboard.writeText(key);
    const o = copyKeyBtn.textContent; copyKeyBtn.textContent = 'Copied!';
    setTimeout(() => { copyKeyBtn.textContent = o; }, 2000);
  } catch { copyKeyBtn.textContent = 'Failed'; setTimeout(() => { copyKeyBtn.textContent = 'Copy Key'; }, 2000); }
});

// Export key file
if (exportKeyBtn) exportKeyBtn.addEventListener('click', async () => {
  const key  = encKeyBox.textContent; if (!key) return;
  const name = (encOutName.textContent || 'encryption') + '.zexkey';
  const r    = await window.zexAPI.saveKeyFile(key, name);
  if (!r.success && r.error !== 'Cancelled') alert('Export failed: ' + r.error);
});

function resetEncryptUI() {
  encFilePath.value = ''; selectedFiles = []; extInput.value = 'zex'; deleteToggle.checked = false;
  secureWipeToggle.checked = false; encOutputDir.value = '';
  if (customKeyInput) customKeyInput.value = '';
  keyStrengthWrap.hidden = true;
  encProgress.style.width = '0%';
  if (encProgressWrap) encProgressWrap.hidden = true;
  encResult.hidden = true; encKeyBox.textContent = '';
  encOutName.textContent = encOrigSize.textContent = encEncSize.textContent = '—';
  setStatus(encStatus, '', ''); syncExtBadge();
}
encResetBtn.addEventListener('click', resetEncryptUI);

/* ═══════════════════════════════════════════════════════════════
   DECRYPT
   ═══════════════════════════════════════════════════════════════ */

browseDecBtn.addEventListener('click', async () => {
  const files = await window.zexAPI.openDialog(true);
  if (files && files.length > 0) {
    selectedDecFiles = files;
    decFilePath.value = files.length === 1 ? files[0] : `${files.length} files selected`;
  }
});

showKeyBtn.addEventListener('click', () => {
  const h = keyInput.type === 'password';
  keyInput.type = h ? 'text' : 'password';
  showKeyBtn.textContent = h ? 'Hide' : 'Show';
});

// Import key for decrypt
if (importDecKeyBtn) importDecKeyBtn.addEventListener('click', async () => {
  const r = await window.zexAPI.loadKeyFile();
  if (r && r.success) keyInput.value = r.key;
  else if (r && r.error !== 'Cancelled') alert('Import failed: ' + r.error);
});

// Output folder for decrypt
browseDecOutputBtn.addEventListener('click', async () => {
  const fp = await window.zexAPI.openFolderDialog();
  if (fp) {
    decOutputDir.value = fp;
  }
});
clearDecOutputBtn.addEventListener('click', () => { decOutputDir.value = ''; });

decryptBtn.addEventListener('click', async () => {
  const filesToDecrypt = selectedDecFiles.length > 0 ? selectedDecFiles : [decFilePath.value.trim()];
  const key       = keyInput.value.trim();
  const outputDir = decOutputDir.value.trim() || null;

  if (filesToDecrypt.length === 0 || !filesToDecrypt[0]) {
    setStatus(decStatus, 'Please select a file first.', 'var(--red)'); return;
  }
  if (!key) { setStatus(decStatus, 'Please enter a decryption key.', 'var(--red)'); return; }

  decryptBtn.disabled     = true;
  decSuccess.hidden       = true;
  decError.hidden         = true;
  decProgress.style.width = '0%';

  const totalFiles = filesToDecrypt.length;
  let successCount = 0;
  let failedCount  = 0;
  const failedNames = [];
  let lastResult = null;

  setStatus(decStatus, `Decrypting ${totalFiles} file(s)…`, 'var(--muted)');
  animateProgress('decProgress', 70, 1500);

  for (let i = 0; i < totalFiles; i++) {
    const filePath = filesToDecrypt[i];
    try {
      const result = await window.zexAPI.decryptFile(filePath, key, outputDir);
      if (result && result.success) {
        successCount++;
        lastResult = result;
        const progress = 70 + ((i + 1) / totalFiles) * 28;
        animateProgress('decProgress', progress, 400);
      } else {
        failedCount++;
        failedNames.push(basename(filePath));
      }
    } catch (err) {
      failedCount++;
      failedNames.push(basename(filePath));
    }
  }

  animateProgress('decProgress', 100, 200);

  if (failedCount === 0) {
    setStatus(decStatus, `✓ Successfully decrypted ${successCount} file(s).`, 'var(--green)');
    decOutName.textContent = totalFiles === 1 ? basename(lastResult.outputPath) : `${successCount} files`;
    decOutSize.textContent = totalFiles === 1 ? formatSize(lastResult.decryptedSize) : '—';
    decSuccess.hidden = false;
  } else if (successCount === 0) {
    setStatus(decStatus, '', '');
    decErrorMsg.textContent = totalFiles === 1
      ? 'Decryption failed. Check your key and file.'
      : `All ${totalFiles} files failed. Check your key.`;
    decError.hidden = false;
  } else {
    setStatus(decStatus, `⚠ Decrypted ${successCount}, Failed: ${failedCount}`, 'var(--yellow)');
  }

  decryptBtn.disabled = false;
});

function resetDecryptUI() {
  decFilePath.value = keyInput.value = ''; selectedDecFiles = []; keyInput.type = 'password';
  showKeyBtn.textContent = 'Show'; decOutputDir.value = '';
  decProgress.style.width = '0%';
  if (decProgressWrap) decProgressWrap.hidden = true;
  decSuccess.hidden = decError.hidden = true;
  decOutName.textContent = decOutSize.textContent = '—';
  decErrorMsg.textContent = ''; setStatus(decStatus, '', '');
}
decResetBtnSuccess.addEventListener('click', resetDecryptUI);
decResetBtnError.addEventListener('click',   resetDecryptUI);

/* ═══════════════════════════════════════════════════════════════
   AUDIT LOG
   ═══════════════════════════════════════════════════════════════ */
function buildStatusBadge(status) {
  const span = document.createElement('span');
  span.classList.add('status-badge');
  const s = (status || '').toLowerCase();
  if (s === 'success' || s === 'ok') { span.classList.add('status-badge--success'); span.textContent = 'SUCCESS'; }
  else if (s === 'failed' || s === 'error') { span.classList.add('status-badge--error'); span.textContent = 'FAILED'; }
  else { span.classList.add('status-badge--warn'); span.textContent = (status||'—').toUpperCase(); }
  return span;
}

async function loadAuditLog() {
  try {
    const entries = await window.zexAPI.readLog();
    auditTableBody.innerHTML = '';
    if (!entries || entries.length === 0) { auditEmpty.hidden = false; return; }
    auditEmpty.hidden = true;
    entries.forEach((entry) => {
      const tr = document.createElement('tr');
      const tds = Array.from({length:5}, () => { const td = document.createElement('td'); tr.appendChild(td); return td; });
      tds[0].textContent = formatDate(entry.timestamp);
      tds[1].textContent = (entry.action||'—').toUpperCase();
      tds[2].textContent = tds[2].title = entry.filename || '—';
      tds[3].textContent = formatSize(entry.size);
      tds[4].appendChild(buildStatusBadge(entry.status));
      auditTableBody.appendChild(tr);
    });
  } catch (err) { auditEmpty.textContent = 'Failed: ' + err.message; auditEmpty.hidden = false; }
}

refreshLogBtn.addEventListener('click', loadAuditLog);
clearLogBtn.addEventListener('click', async () => {
  if (!confirm('Clear all audit records?')) return;
  try { await window.zexAPI.clearLog(); await loadAuditLog(); }
  catch (err) { alert('Failed: ' + err.message); }
});

/* ═══════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('keydown', async (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  switch (e.key.toLowerCase()) {
    case 'o': // Browse file
      e.preventDefault();
      const activeTab = TABS.findIndex(t => t.btn.classList.contains('active'));
      if (activeTab === 0) browseEncBtn.click();
      else if (activeTab === 1) browseDecBtn.click();
      break;
    case 'e': // Encrypt
      e.preventDefault();
      switchTab(0); encryptBtn.click();
      break;
    case 'd': // Decrypt
      e.preventDefault();
      switchTab(1); decryptBtn.click();
      break;
    case 'l': // Audit log
      e.preventDefault();
      switchTab(2);
      break;
  }
});

/* ═══════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  syncExtBadge();
  runLoadingSequence();

  // Window controls
  const tbMin = $('tbMinimize');
  const tbMax = $('tbMaximize');
  const tbCls = $('tbClose');
  if (tbMin) tbMin.addEventListener('click', () => window.zexAPI.winMinimize());
  if (tbMax) tbMax.addEventListener('click', () => window.zexAPI.winMaximize());
  if (tbCls) tbCls.addEventListener('click', () => window.zexAPI.winClose());
});