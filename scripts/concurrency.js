'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = Number(process.env.CONCURRENCY_PORT || 3199);
const BASE = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siruang-concurrency-'));
const dbFile = path.join(dir, 'test.db');
const outbox = path.join(dir, 'outbox.log');

function witaDate(offsetDays) {
  return new Date(Date.now() + 8 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function iso(dateKey, clock) {
  return new Date(`${dateKey}T${clock}:00+08:00`).toISOString();
}

async function waitForServer(child) {
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode !== null) throw new Error('Server exited early');
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server did not become healthy');
}

const EMAILS = {
  1: 'rani@student.idbbali.ac.id',
  2: 'bagus@idbbali.ac.id',
  3: 'komang@idbbali.ac.id',
  8: 'made@student.idbbali.ac.id',
  9: 'ketut@idbbali.ac.id'
};

async function login(userId) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE
    },
    body: JSON.stringify({ login: EMAILS[userId], password: 'idb12345', next: '/' })
  });
  if (!res.ok) throw new Error(`Login failed for user ${userId}: ${res.status}`);
  const raw = res.headers.getSetCookie?.()[0] || res.headers.get('set-cookie');
  return String(raw).split(';')[0];
}

async function postReservation(cookie, payload, key) {
  const res = await fetch(`${BASE}/api/reservations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE,
      'Idempotency-Key': key,
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: JSON.stringify(payload)
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

(async () => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      SIRUANG_DB: dbFile,
      SIRUANG_OUTBOX: outbox,
      MOCK_EMAIL_FAIL: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const logs = [];
  child.stdout.on('data', (d) => logs.push(String(d)));
  child.stderr.on('data', (d) => logs.push(String(d)));

  let exitCode = 0;
  try {
    await waitForServer(child);

    const cookies = new Map();
    for (const id of [1, 2, 3, 8, 9]) {
      cookies.set(id, await login(id));
    }

    const dateKey = witaDate(1);
    const startAt = iso(dateKey, '13:00');
    const endAt = iso(dateKey, '15:00');
    const payloadFor = (userId) => ({
      roomId: 1,
      startAt,
      endAt,
      purpose: 'pribadi',
      activityName: `Uji konkuransi pengguna ${userId}`,
      participants: 10,
      notes: 'AC-RS2A',
      isPublic: false,
      publicDescription: ''
    });

    const requests = [...cookies.entries()].map(([userId, cookie]) =>
      postReservation(cookie, payloadFor(userId), `race-${userId}`)
    );
    const results = await Promise.all(requests);
    const statuses = results.map((r) => r.status).sort();
    const successes = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    const others = results.filter((r) => ![201, 409].includes(r.status));

    console.log('AC-RS2A concurrency');
    console.log('  concurrent requests :', results.length);
    console.log('  statuses            :', statuses.join(', '));
    console.log('  success (201)       :', successes.length);
    console.log('  conflict (409)      :', conflicts.length);
    console.log('  other               :', others.length);
    if (others.length) console.log('  other bodies        :', JSON.stringify(others.map((o) => o.body)));
    console.log('  conflict message    :', conflicts[0]?.body?.message || '-');

    const racePass = successes.length === 1 && conflicts.length === results.length - 1;
    console.log('  verdict             :', racePass ? 'PASS' : 'FAIL');
    if (!racePass) exitCode = 1;

    // Idempotency: the same key twice must return the same reservation.
    const idemPayload = {
      roomId: 2,
      startAt: iso(witaDate(2), '10:00'),
      endAt: iso(witaDate(2), '12:00'),
      purpose: 'pribadi',
      activityName: 'Uji idempotensi',
      participants: 8,
      notes: '',
      isPublic: false,
      publicDescription: ''
    };
    const first = await postReservation(cookies.get(2), idemPayload, 'idem-http');
    const second = await postReservation(cookies.get(2), idemPayload, 'idem-http');
    const idemPass =
      first.status === 201 &&
      second.status === 200 &&
      first.body.reservation.public_id === second.body.reservation.public_id;
    console.log('AC-RS3A idempotency');
    console.log('  first / second      :', first.status, '/', second.status);
    console.log('  same public_id      :', first.body?.reservation?.public_id === second.body?.reservation?.public_id);
    console.log('  verdict             :', idemPass ? 'PASS' : 'FAIL');
    if (!idemPass) exitCode = 1;

    // Unauthenticated access must be rejected.
    const anon = await postReservation(null, idemPayload, 'anon');
    const anonPass = anon.status === 401;
    console.log('AC-AK1A anonymous write');
    console.log('  status              :', anon.status);
    console.log('  verdict             :', anonPass ? 'PASS' : 'FAIL');
    if (!anonPass) exitCode = 1;

    console.log('RESULT               :', exitCode === 0 ? 'PASS' : 'FAIL');
  } catch (error) {
    console.error('Concurrency test failed:', error);
    console.error(logs.join(''));
    exitCode = 1;
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      child.on('exit', resolve);
      setTimeout(resolve, 2000);
    });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  process.exit(exitCode);
})();
