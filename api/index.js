'use strict';

// Entrypoint Vercel Function (mode demo).
// Filesystem proyek read-only, jadi SQLite dan log email diarahkan ke /tmp.
// /tmp bersifat sementara dan bisa berbeda antar instance (lihat README).
if (!process.env.SIRUANG_DB) process.env.SIRUANG_DB = '/tmp/siruang.db';
if (!process.env.SIRUANG_OUTBOX) process.env.SIRUANG_OUTBOX = '/tmp/outbox.log';

let handler = null;
let bootError = null;

try {
  handler = require('../server.js');
} catch (error) {
  bootError = error;
  console.error('[siruang] boot failed', error);
}

module.exports = async function siruangHandler(req, res) {
  if (!bootError && typeof handler === 'function') {
    return handler(req, res);
  }

  const reason = bootError || new Error('server.js tidak mengekspor handler yang valid');
  const detail = [
    'SiRuang gagal start di Vercel.',
    '',
    `node : ${process.version}`,
    `cwd  : ${process.cwd()}`,
    `db   : ${process.env.SIRUANG_DB}`,
    `out  : ${process.env.SIRUANG_OUTBOX}`,
    '',
    String(reason && reason.stack ? reason.stack : reason)
  ].join('\n');

  console.error('[siruang] request failed', detail);

  res.statusCode = 500;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(detail);
};
