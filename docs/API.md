# API — SiRuang 1.0

Base URL lokal: `http://127.0.0.1:3000`.

- Format JSON; mutasi wajib `Content-Type: application/json`.
- Autentikasi: cookie sesi `siruang_session` (HttpOnly, SameSite=Lax).
- Semua mutasi memeriksa `Origin` (CSRF). Origin berbeda → 403.
- Waktu memakai ISO 8601 UTC. Klien mengirim offset WITA (`+08:00`) atau ISO UTC.
- `Idempotency-Key` wajib untuk `POST /api/reservations`.

## Auth

Login memakai **Email/NIM + Password**. Password dicek terhadap mock provider (`MOCK_SSO_PASSWORD`, default `idb12345`) dan **tidak disimpan** per pengguna. NIM/email dicek ke tabel `users`.

### `POST /api/auth/login`
Body: `{ "login": "rani@student.idbbali.ac.id", "password": "idb12345", "next": "/" }` (`login` boleh email atau NIM).

200:
```json
{ "ok": true, "redirect": "/", "user": { "id": 1, "name": "Rani Puspita", "email": "rani@student.idbbali.ac.id", "nim": "2215101001", "role": "pemohon" } }
```
Set-Cookie sesi HttpOnly. 401 `INVALID_CREDENTIALS`; 429 rate limit (5 percobaan/15 menit/IP).

Halaman:
- `GET/POST /masuk` — form Masuk Akun; redirect default `/dashboard` atau `next` jika ada.
- `GET/POST /masuk/admin` — form Masuk Admin; hanya role `admin`, redirect default `/admin`.
- `GET /auth/login` → `/masuk`.
- `POST /api/auth/logout` — hapus sesi.

API login tanpa `next` mengarah ke `/dashboard`.

## Publik

### `GET /api/rooms`
Query opsional: `building`, `capacity`.
```json
{ "rooms": [ { "id": 1, "slug": "lab-komputer", "name": "Lab Komputer", "building": "Gedung Kampus", "floor": "Lantai 1", "capacity": 36, "facilities": ["36 PC"], "rules": ["..."], "operating_hours": [null, ["08:30","17:30"], ...], "mode": "persetujuan", "photo": "/images/rooms/lab-komputer.jpg" } ] }
```

### `GET /api/rooms/:idOrSlug`
200 `{ room }`; 404 `ROOM_NOT_FOUND`.

### `GET /api/availability`
Query: `date=2026-10-29&start=09:00&end=11:00&capacity=20&building=Gedung%20Kampus&facility=AC&facility=Proyektor`.
```json
{
  "startAt": "2026-10-29T01:00:00.000Z",
  "endAt": "2026-10-29T03:00:00.000Z",
  "free": [ { "id": 2, "name": "Lab iMac", "capacity": 30 } ],
  "busyCount": 1,
  "suggestions": [ { "roomSlug": "lab-imac", "roomName": "Lab iMac", "startAt": "...", "endAt": "..." } ]
}
```
Tanpa hasil → `free: []` + `suggestions` (sampai 6).

### `GET /api/calendar?month=2026-10&room=aula`

`room` opsional (slug). Tanpa `room` = semua ruangan.
```json
{ "month": "2026-10", "events": [ { "title": "Workshop pola dasar", "description": "...", "room": "Lab Fashion Design", "organizer": "Himpunan Mahasiswa DKV", "startAt": "...", "endAt": "..." } ] }
```
Tidak mengandung nama/email pemesan.

### `GET /healthz`
```json
{ "status": "ok", "database": "ok", "time": "2026-10-28T01:00:00.000Z" }
```

## Pemohon (login)

### `POST /api/reservations`
Header: `Idempotency-Key: <uuid>`.
```json
{
  "roomId": 1,
  "startAt": "2026-10-29T13:00:00+08:00",
  "endAt": "2026-10-29T15:00:00+08:00",
  "organizationName": "BEM IDB Bali",
  "activityName": "Kerja kelompok riset visual",
  "additionalBorrowing": "2 microphone dan kursi tambahan",
  "participants": 18,
  "notes": "Butuh proyektor",
  "isPublic": false,
  "publicDescription": ""
}
```

201:
```json
{ "reservation": { "public_id": "RSV-A1B2C3", "status": "Diajukan", "organization_name": "BEM IDB Bali", "additional_borrowing": "2 microphone dan kursi tambahan", ... }, "message": "Reservasi diajukan..." }
```

`organizationName` opsional. Jika pengguna adalah pengurus terdaftar dan mengisi nama organisasi, reservasi otomatis dicatat sebagai organisasi. `additionalBorrowing` hanya catatan permintaan, bukan inventaris otomatis. `purpose`/`organizationId` lama masih diterima untuk kompatibilitas API.
200 (kunci sama): `{ reservation, reused: true }`.
400 `IDEMPOTENCY_REQUIRED`; 409 `SLOT_CONFLICT` (+ `conflicts`, `suggestions`); 409 `IDEMPOTENCY_MISMATCH`; 422 `VALIDATION_ERROR` (+ `fields`); 401; 403; 429.

### `GET /api/reservations/me`
`{ reservations: [...] }` hanya milik user.

### `POST /api/reservations/:id/cancel`
Body opsional `{ "reason": "..." }`. Pemohon: sampai 2 jam sebelum mulai. Pengelola: wajib alasan. 200 / 403 / 404 / 409 / 422.

## Pengelola / admin (login)

### `GET /api/manage/queue`
Antrean `Diajukan` untuk ruangan yang dikelola (admin: semua).

### `POST /api/reservations/:id/approve`
Tanpa body. Cek ulang konflik dalam transaksi. 200 / 403 / 404 / 409 / 422.

### `POST /api/reservations/:id/reject`
Body `{ "reason": "..." }` wajib minimal 3 karakter. 200 / 422.

### `POST /api/rooms/:id/blocks`
```json
{ "startAt": "...", "endAt": "...", "reason": "Perawatan", "confirmOverlap": false }
```
Jika beririsan dengan reservasi aktif dan `confirmOverlap=false` → 409 `OVERLAP_CONFIRMATION_REQUIRED` + `conflicts`. Dengan `true` → reservasi aktif dibatalkan dengan alasan blokir, notifikasi dikirim, blokir dibuat. 201 / 409.

### `POST /api/events/:id/moderate`
Body `{ "status": "terbit" | "ditolak" }`. Hanya pengelola ruangan terkait/admin. 200 / 403 / 404 / 422.

### `GET /api/manage/export.csv?month=2026-10`
CSV (BOM UTF-8), kolom: ruangan, gedung, disetujui, jam_terpakai, dibatalkan, ditolak.

## Admin (login, role admin)

- `GET /api/admin/users` → daftar pengguna.
- `PATCH /api/admin/users/:id` body `{ role?, active? }`. 422 `SELF_LOCKOUT` jika menurunkan/menonaktifkan diri sendiri.
- `GET /api/admin/rooms` → semua ruangan termasuk nonaktif.
- `PATCH /api/admin/rooms/:id` body `{ capacity?, mode?, active? }`.
- `GET /api/admin/audit?limit=100` → audit log terbaru (maks 500).

Semua perubahan admin menulis `audit_logs`.

## Kode error umum

| HTTP | `error` | Arti |
|---|---|---|
| 400 | `BAD_REQUEST`, `INVALID_JSON` | Body/header tidak valid |
| 401 | `UNAUTHENTICATED` | Sesi tidak valid |
| 403 | `FORBIDDEN`, `CSRF` | Tidak berwenang/origin salah |
| 404 | `ROOM_NOT_FOUND`, `NOT_FOUND` | Objek tidak ada |
| 409 | `SLOT_CONFLICT`, `IDEMPOTENCY_MISMATCH`, `OVERLAP_CONFIRMATION_REQUIRED` | Konflik slot/kunci/blokir |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Bukan JSON |
| 422 | `VALIDATION_ERROR`, `CANCEL_REJECTED`, `DECISION_REJECTED` | Aturan bisnis |
| 429 | `RATE_LIMITED` | Login terlalu sering |
| 500 | `INTERNAL_ERROR` | Gagal server |

## Contoh 409

```json
{
  "error": "SLOT_CONFLICT",
  "message": "Slot baru saja dipesan pengguna lain. Pilih waktu atau ruangan lain.",
  "conflicts": { "reservations": [ ... ], "blocks": [] },
  "suggestions": [
    { "roomSlug": "lab-komputer", "roomName": "Lab Komputer", "startAt": "...", "endAt": "..." }
  ]
}
```
