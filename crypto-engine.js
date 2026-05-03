'use strict';

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const ALGORITHM    = 'aes-256-gcm';
const CHUNK_SIZE   = 65536; // 64 KB
const IV_LENGTH    = 16;
const TAG_LENGTH   = 16;
const HEADER_SIZE  = IV_LENGTH + TAG_LENGTH; // 32 bytes
const MAX_AUDIT    = 200;

// Use userData path — works in both dev and production build
// Dev:   C:\Users\Name\AppData\Roaming\zex\
// Build: same path, always writable (never inside .asar)
function getAuditFile() {
  try {
    const { app } = require('electron');
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'audit-log.json');
  } catch {
    // Fallback for dev if electron not available
    return path.join(__dirname, 'audit-log.json');
  }
}

// ---------------------------------------------------------------------------
// 1. generateKey
// ---------------------------------------------------------------------------
function generateKey() {
  return crypto.randomBytes(32).toString('base64');
}

// ---------------------------------------------------------------------------
// 2. encryptFile
// ---------------------------------------------------------------------------
function encryptFile(inputPath, outputPath, keyBase64) {
  return new Promise((resolve) => {
    try {
      const key = Buffer.from(keyBase64, 'base64');
      if (key.length !== 32) {
        return resolve({ success: false, error: 'Key must be 32 bytes (base64-encoded).' });
      }

      const iv     = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

      const inputStat = fs.statSync(inputPath);
      const originalSize = inputStat.size;

      const readStream  = fs.createReadStream(inputPath,  { highWaterMark: CHUNK_SIZE });
      const writeStream = fs.createWriteStream(outputPath);

      // Collect ciphertext chunks so we can prepend header (IV + authTag).
      // For 1 GB+ support we write ciphertext to a temp file first, then
      // prepend the header, avoiding full RAM load.
      const tmpPath = outputPath + '.tmp';
      const tmpStream = fs.createWriteStream(tmpPath);

      let encryptError = null;

      readStream.on('error', (err) => {
        encryptError = err;
        tmpStream.destroy();
      });

      tmpStream.on('error', (err) => {
        encryptError = err;
        readStream.destroy();
      });

      readStream.on('data', (chunk) => {
        const encrypted = cipher.update(chunk);
        if (encrypted.length) tmpStream.write(encrypted);
      });

      readStream.on('end', () => {
        if (encryptError) {
          return resolve({ success: false, error: encryptError.message });
        }

        const finalChunk = cipher.final();
        if (finalChunk.length) tmpStream.write(finalChunk);

        const authTag = cipher.getAuthTag(); // 16 bytes

        tmpStream.end(() => {
          if (encryptError) {
            fs.unlink(tmpPath, () => {});
            return resolve({ success: false, error: encryptError.message });
          }

          // Write final output: IV(16) + authTag(16) + ciphertext
          const header = Buffer.concat([iv, authTag]);
          writeStream.write(header);

          const cipherStream = fs.createReadStream(tmpPath, { highWaterMark: CHUNK_SIZE });

          cipherStream.on('data', (chunk) => writeStream.write(chunk));

          cipherStream.on('error', (err) => {
            fs.unlink(tmpPath, () => {});
            resolve({ success: false, error: err.message });
          });

          cipherStream.on('end', () => {
            writeStream.end(() => {
              fs.unlink(tmpPath, () => {}); // clean up temp file

              try {
                const encryptedSize = fs.statSync(outputPath).size;
                resolve({ success: true, outputPath, originalSize, encryptedSize });
              } catch (e) {
                resolve({ success: false, error: e.message });
              }
            });
          });

          writeStream.on('error', (err) => {
            fs.unlink(tmpPath, () => {});
            resolve({ success: false, error: err.message });
          });
        });
      });

    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

// ---------------------------------------------------------------------------
// 3. decryptFile
// ---------------------------------------------------------------------------
function decryptFile(inputPath, outputPath, keyBase64) {
  return new Promise((resolve) => {
    try {
      const key = Buffer.from(keyBase64, 'base64');
      if (key.length !== 32) {
        return resolve({ success: false, error: 'Key must be 32 bytes (base64-encoded).' });
      }

      // Read the 32-byte header synchronously (IV + authTag).
      const fd = fs.openSync(inputPath, 'r');
      const header = Buffer.alloc(HEADER_SIZE);
      const bytesRead = fs.readSync(fd, header, 0, HEADER_SIZE, 0);
      fs.closeSync(fd);

      if (bytesRead < HEADER_SIZE) {
        return resolve({ success: false, error: 'Wrong key or corrupted file' });
      }

      const iv      = header.slice(0, IV_LENGTH);
      const authTag = header.slice(IV_LENGTH, HEADER_SIZE);

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      // Stream ciphertext (everything after the 32-byte header).
      const readStream  = fs.createReadStream(inputPath,  { start: HEADER_SIZE, highWaterMark: CHUNK_SIZE });
      const writeStream = fs.createWriteStream(outputPath);

      let decryptedSize = 0;
      let streamError   = null;

      readStream.on('error', (err) => {
        streamError = err;
        writeStream.destroy();
      });

      writeStream.on('error', (err) => {
        streamError = err;
        readStream.destroy();
      });

      readStream.on('data', (chunk) => {
        try {
          const decrypted = decipher.update(chunk);
          if (decrypted.length) {
            decryptedSize += decrypted.length;
            writeStream.write(decrypted);
          }
        } catch (err) {
          streamError = err;
          readStream.destroy();
          writeStream.destroy();
        }
      });

      readStream.on('end', () => {
        if (streamError) {
          fs.unlink(outputPath, () => {});
          return resolve({ success: false, error: 'Wrong key or corrupted file' });
        }

        try {
          const finalChunk = decipher.final();
          if (finalChunk.length) {
            decryptedSize += finalChunk.length;
            writeStream.write(finalChunk);
          }

          writeStream.end(() => {
            resolve({ success: true, outputPath, decryptedSize });
          });
        } catch (err) {
          // GCM auth tag mismatch lands here
          writeStream.destroy();
          fs.unlink(outputPath, () => {});
          resolve({ success: false, error: 'Wrong key or corrupted file' });
        }
      });

    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

// ---------------------------------------------------------------------------
// 4. logAudit
// ---------------------------------------------------------------------------
function logAudit(entry) {
  try {
    const AUDIT_FILE = getAuditFile();
    let entries = [];

    if (fs.existsSync(AUDIT_FILE)) {
      try {
        const raw = fs.readFileSync(AUDIT_FILE, 'utf8');
        entries = JSON.parse(raw);
        if (!Array.isArray(entries)) entries = [];
      } catch {
        entries = [];
      }
    }

    entries.push(entry);

    // Trim to MAX_AUDIT, keeping the most recent entries.
    if (entries.length > MAX_AUDIT) {
      entries = entries.slice(entries.length - MAX_AUDIT);
    }

    fs.writeFileSync(AUDIT_FILE, JSON.stringify(entries, null, 2), 'utf8');
  } catch (err) {
    // Non-fatal — audit failure should not crash the app.
    console.error('[ZEX] logAudit error:', err.message);
  }
}

// ---------------------------------------------------------------------------
// 5. readAuditLog
// ---------------------------------------------------------------------------
function readAuditLog() {
  try {
    const AUDIT_FILE = getAuditFile();
    if (!fs.existsSync(AUDIT_FILE)) return [];
    const raw = fs.readFileSync(AUDIT_FILE, 'utf8');
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) return [];
    return entries.slice().reverse(); // newest first
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  generateKey,
  encryptFile,
  decryptFile,
  logAudit,
  readAuditLog,
};