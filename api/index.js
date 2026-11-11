'use strict';

// Entrypoint Vercel Function (mode demo).
// Filesystem proyek read-only, jadi SQLite dan log email diarahkan ke /tmp.
// /tmp bersifat sementara dan bisa berbeda antar instance (lihat README).
if (!process.env.SIRUANG_DB) process.env.SIRUANG_DB = '/tmp/siruang.db';
if (!process.env.SIRUANG_OUTBOX) process.env.SIRUANG_OUTBOX = '/tmp/outbox.log';

module.exports = require('../server.js');
