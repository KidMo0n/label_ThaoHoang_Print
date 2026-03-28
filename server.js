/**
 * server.js — Thảo Hoàng Orchid | Print Server
 *
 * ┌─────────────────────────────────────────────────────────┐
 *  PATH MAP (local LAN = http://IP:4001 | tunnel = domain)
 *
 *  GET  /                     → index.html  (trang chủ)
 *  GET  /in_label             → index.html  (trang chủ)
 *  GET  /in_label/health      → JSON status máy in tem
 *  POST /in_label/print       → In tem (PNG base64)
 *
 *  GET  /in_a4                → index.html  (trang chủ)
 *  GET  /in_a4/health         → JSON status máy in A4
 *  POST /in_a4/print          → In A4 (PDF/DOCX/IMG base64)
 * └─────────────────────────────────────────────────────────┘
 *
 * Cloudflare Tunnel routing:
 *   a_print.thangmotsach.com  → http://192.168.0.6:4001
 *   b_print.thangmotsach.com  → http://192.168.2.14:4001
 *
 * Dependency: express  (npm install)
 * Chạy      : node server.js
 * Service   : sudo ./install.sh
 */

'use strict';

const express  = require('express');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const { exec } = require('child_process');

// ─── CONFIG ────────────────────────────────────────────────────────────
const PORT = 4001;

// Nhận dạng khu bằng hostname
// Đặt hostname trên từng máy:
//   sudo hostnamectl set-hostname print-khu-a   (Khu A)
//   sudo hostnamectl set-hostname print-khu-b   (Khu B)
const HOSTNAME = os.hostname().toLowerCase();
const IS_A     = HOSTNAME.includes('khu-a') || HOSTNAME.includes('khua') || HOSTNAME.includes('aserver');
const KHU      = IS_A ? 'A' : 'B';

// ── Máy in tem (XPrinter) ─────────────────────────────────────────────
const PRINTER_LABEL_A = 'XP-365B';
const PRINTER_LABEL_B = 'XP-470B';
const PRINTER_LABEL   = IS_A ? PRINTER_LABEL_A : PRINTER_LABEL_B;
const MEDIA_LABEL     = 'Custom.73x97mm';

// ── Máy in A4 ─────────────────────────────────────────────────────────
// TODO: chạy "lpstat -a" trên từng server để lấy tên CUPS thật
const PRINTER_A4_A = 'A4-Printer-KhuA';
const PRINTER_A4_B = 'A4-Printer-KhuB';
const PRINTER_A4   = IS_A ? PRINTER_A4_A : PRINTER_A4_B;

console.log('──────────────────────────────────────────');
console.log(`  Khu          : ${KHU}`);
console.log(`  Hostname     : ${HOSTNAME}`);
console.log(`  Printer label: ${PRINTER_LABEL}`);
console.log(`  Printer A4   : ${PRINTER_A4}`);
console.log(`  Media label  : ${MEDIA_LABEL}`);
console.log(`  Port         : ${PORT}`);
console.log('──────────────────────────────────────────');

// ─── APP ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '25mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const HTML    = path.join(__dirname, 'index.html');
const sendHTML = (res) => res.sendFile(HTML);

// ─── SERVE HTML ────────────────────────────────────────────────────────
app.get('/',           (_req, res) => sendHTML(res));
app.get('/index.html', (_req, res) => sendHTML(res));
app.get('/in_label',   (_req, res) => sendHTML(res));
app.get('/in_a4',      (_req, res) => sendHTML(res));

// ─── /in_label/health ─────────────────────────────────────────────────
app.get('/in_label/health', (_req, res) => {
  exec(`lpstat -p "${PRINTER_LABEL}" 2>&1`, (err, out) => {
    res.json({
      status   : 'ok',
      khu      : KHU,
      printer  : PRINTER_LABEL,
      available: !err && !out.toLowerCase().includes('unknown'),
      media    : MEDIA_LABEL,
      timestamp: new Date().toISOString()
    });
  });
});

// ─── /in_label/print ──────────────────────────────────────────────────
app.post('/in_label/print', (req, res) => {
  const { imageBase64, numCopies = 1 } = req.body;
  if (!imageBase64) return res.json({ success: false, message: 'Thiếu imageBase64' });

  const copies = Math.max(1, Math.min(999, parseInt(numCopies) || 1));
  const pngTmp = path.join(os.tmpdir(), `label_${Date.now()}.png`);

  console.log(`\n[LABEL] ${new Date().toLocaleString('vi-VN')}  copies=${copies}`);

  try {
    fs.writeFileSync(pngTmp, Buffer.from(imageBase64, 'base64'));
  } catch (e) {
    return res.json({ success: false, message: 'Lỗi ghi file: ' + e.message });
  }

  const cmd = [
    'lp',
    `-d "${PRINTER_LABEL}"`,
    `-n ${copies}`,
    `-o media=${MEDIA_LABEL}`,
    `-o fit-to-page`,
    `-o page-left=0 -o page-right=0 -o page-top=0 -o page-bottom=0`,
    `"${pngTmp}"`
  ].join(' ');

  console.log(`[LABEL] ${cmd}`);

  exec(cmd, (err, _out, stderr) => {
    try { fs.unlinkSync(pngTmp); } catch (_) {}
    if (err) {
      console.error('[LABEL] lp error:', err.message);
      return res.json({ success: false, message: `Lỗi máy in: ${err.message}` });
    }
    if (stderr) console.warn('[LABEL] stderr:', stderr);
    console.log(`[LABEL] OK — ${copies} bản → ${PRINTER_LABEL}`);
    res.json({
      success: true,
      message: `Đã gửi ${copies} tem đến Khu ${KHU}`,
      details: { printer: PRINTER_LABEL, copies, ts: new Date().toLocaleString('vi-VN') }
    });
  });
});

// ─── /in_a4/health ────────────────────────────────────────────────────
app.get('/in_a4/health', (_req, res) => {
  exec(`lpstat -p "${PRINTER_A4}" 2>&1`, (err, out) => {
    res.json({
      status    : 'ok',
      khu       : KHU,
      printer_a4: PRINTER_A4,
      available : !err && !out.toLowerCase().includes('unknown'),
      timestamp : new Date().toISOString()
    });
  });
});

// ─── /in_a4/print ─────────────────────────────────────────────────────
app.post('/in_a4/print', async (req, res) => {
  const { fileBase64, fileName = 'document', numCopies = 1 } = req.body;
  if (!fileBase64) return res.json({ success: false, message: 'Thiếu fileBase64' });

  const copies  = Math.max(1, Math.min(99, parseInt(numCopies) || 1));
  const ext     = (fileName.split('.').pop() || 'pdf').toLowerCase();
  const ts      = Date.now();
  const tmpIn   = path.join(os.tmpdir(), `a4_${ts}.${ext}`);
  let   printTarget = tmpIn;

  console.log(`\n[A4] ${new Date().toLocaleString('vi-VN')}  file=${fileName}  copies=${copies}`);

  try {
    fs.writeFileSync(tmpIn, Buffer.from(fileBase64, 'base64'));
  } catch (e) {
    return res.json({ success: false, message: 'Lỗi ghi file: ' + e.message });
  }

  const cleanup = () => {
    try { fs.unlinkSync(tmpIn); } catch (_) {}
    if (printTarget !== tmpIn) { try { fs.unlinkSync(printTarget); } catch (_) {} }
  };

  const isOffice = ['docx','doc','odt','xlsx','xls','pptx','ppt'].includes(ext);
  if (isOffice) {
    const tmpDir  = os.tmpdir();
    const pdfOut  = path.join(tmpDir, path.basename(tmpIn, '.' + ext) + '.pdf');
    try {
      await new Promise((resolve, reject) => {
        const cmd = `libreoffice --headless --convert-to pdf --outdir "${tmpDir}" "${tmpIn}"`;
        console.log(`[A4] convert: ${cmd}`);
        exec(cmd, { timeout: 30000 }, (err, _, stderr) => {
          if (err) return reject(new Error('LibreOffice: ' + (stderr || err.message)));
          if (!fs.existsSync(pdfOut)) return reject(new Error('PDF output không tìm thấy'));
          resolve();
        });
      });
      printTarget = pdfOut;
    } catch (e) {
      cleanup();
      return res.json({ success: false, message: e.message });
    }
  }

  const cmd = [
    'lp',
    `-d "${PRINTER_A4}"`,
    `-n ${copies}`,
    `-o media=A4`,
    `-o sides=one-sided`,
    `-o fit-to-page`,
    `"${printTarget}"`
  ].join(' ');

  console.log(`[A4] ${cmd}`);

  exec(cmd, (err, _out, stderr) => {
    cleanup();
    if (err) {
      console.error('[A4] lp error:', err.message);
      return res.json({ success: false, message: `Lỗi máy in: ${err.message}` });
    }
    if (stderr) console.warn('[A4] stderr:', stderr);
    console.log(`[A4] OK — ${copies} bản → ${PRINTER_A4}`);
    res.json({
      success: true,
      message: `Đã gửi ${copies} bản đến Khu ${KHU}`,
      details: { printer: PRINTER_A4, copies, fileName, ts: new Date().toLocaleString('vi-VN') }
    });
  });
});

// ─── 404 ───────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, message: 'Not found: ' + req.path }));

// ─── START ─────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅  Print server → http://0.0.0.0:${PORT}`);
  console.log(`    Khu ${KHU} | Label: ${PRINTER_LABEL} | A4: ${PRINTER_A4}`);
  console.log(`    GET  /in_label/health  — status máy in tem`);
  console.log(`    POST /in_label/print   — {imageBase64, numCopies}`);
  console.log(`    GET  /in_a4/health     — status máy in A4`);
  console.log(`    POST /in_a4/print      — {fileBase64, fileName, numCopies}\n`);
});
