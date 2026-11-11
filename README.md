# SiRuang

Sistem reservasi ruangan dan informasi kegiatan kampus **Institut Desain dan Bisnis Bali (IDB Bali)**. Rilis 1.0 mengikuti PRD 0.2 dan memakai autentikasi demo (Email/NIM + password) serta data sintetis.

## Stack

- **Node.js ≥ 22.5** (`node:http`, `node:sqlite`, `node:crypto`) — tanpa dependency npm.
- HTML server-rendered, CSS/JS native.
- SQLite dengan transaksi `BEGIN IMMEDIATE`, trigger anti-overlap, dan audit log append-only.
- Foto/logo ruangan diambil dari aset publik [idbbali.ac.id](https://www.idbbali.ac.id/).

> Stack zero-dependency dipilih karena registry npm pada lingkungan ini sangat lambat/tidak stabil. Persyaratan PRD (database relasional transaksional, SSO, email) tetap terpenuhi.

## Menjalankan

```bash
# Node 22.14+
npm start
# buka http://127.0.0.1:3000
```

Database `data/siruang.db` dibuat dan di-seed otomatis saat pertama kali jalan. Untuk reset data demo:

```bash
rm -f data/siruang.db data/siruang.db-wal data/siruang.db-shm
npm start
```

### Akun demo

Login memakai **Email/NIM + Password** di `/masuk`. Halaman admin terpisah di `/masuk/admin`.
**Password demo semua akun: `idb12345`** (dapat diubah lewat env `MOCK_SSO_PASSWORD`).

| Nama | Email | NIM | Peran |
|---|---|---|---|
| Rani Puspita | rani@student.idbbali.ac.id | 2215101001 | Pemohon |
| Bagus Mahendra | bagus@idbbali.ac.id | 2215101006 | Pemohon (Mahasiswa) |
| Komang Aditya | komang@idbbali.ac.id | 2315101002 | Pengurus BEM |
| Ayu Lestari | ayu@idbbali.ac.id | 2315101003 | Pengurus Himpunan DKV |
| Ketut Ardana | ketut@idbbali.ac.id | 2315101005 | Pengurus UKM Fotografi |
| Dedi Setiawan | dedi@idbbali.ac.id | 1985103001 | Pengelola |
| Luh Ayu Kirana | luh@idbbali.ac.id | 1985103002 | Pengelola |
| Made Sari | made@student.idbbali.ac.id | 2215101004 | Pemohon |
| Admin SiRuang | admin@idbbali.ac.id | 1985102001 | Admin/Dosen (gunakan `/masuk/admin`) |

## Halaman

- `/dashboard` — sapaan “Hello, {nama}”, ringkasan reservasi, notifikasi, agenda, akses cepat sesuai peran.
- `/` — Daftar ruangan tersedia + cek tanggal/jam/kapasitas, kartu ruangan berfoto, kontak pengelola, alur, agenda.
- `/cari` — filter lengkap: tanggal, jam, kapasitas, gedung, fasilitas.
- `/ruangan/:slug` — foto, kapasitas, fasilitas, aturan, jam operasional, jadwal 7 hari.
- `/reservasi/baru` — wizard 4 langkah.
- `/reservasi-saya` — status, alasan, pembatalan mandiri.
- `/kalender` — kalender kegiatan publik tanpa identitas pemesan.
- `/panduan` — alur, aturan, arti status, kontak.
- `/pengelola` — antrean persetujuan, moderasi kegiatan, blokir, laporan CSV, cari ID.
- `/admin` — pengguna/peran, master ruangan, audit log.
- `/masuk` — Masuk Akun (Email/NIM + password), diarahkan ke dashboard; `/masuk/admin` — Masuk Admin, diarahkan ke panel admin.

## API ringkas

Lihat `docs/API.md`. Endpoint inti:

```text
GET  /healthz
GET  /api/rooms
GET  /api/rooms/:id
GET  /api/availability
GET  /api/calendar
POST /api/reservations            (Idempotency-Key wajib)
GET  /api/reservations/me
POST /api/reservations/:id/cancel
GET  /api/manage/queue
POST /api/reservations/:id/approve
POST /api/reservations/:id/reject
POST /api/rooms/:id/blocks
POST /api/events/:id/moderate
GET  /api/manage/export.csv
GET/PATCH /api/admin/users
GET/PATCH /api/admin/rooms
GET  /api/admin/audit
```

## Konfigurasi

| Env | Default | Fungsi |
|---|---|---|
| `PORT` | `3000` | Port HTTP |
| `HOST` | `127.0.0.1` | Bind address |
| `SIRUANG_DB` | `data/siruang.db` | Lokasi SQLite |
| `SIRUANG_OUTBOX` | `data/outbox.log` | Log email mock |
| `MOCK_EMAIL_FAIL` | – | Set `1` untuk mensimulasikan kegagalan email |
| `MOCK_SSO_PASSWORD` | `idb12345` | Password demo mock SSO (tidak disimpan) |

## Pengujian

```bash
npm test               # 18 unit/integration test
npm run test:concurrency   # uji HTTP nyata AC-RS2A + idempotensi
```

Hasil terakhir: **18/18 lulus**; uji konkuransi 5 request → **1×201, 4×409**; idempotensi dan 401 lulus. Detail: `docs/TESTING.md`.

## Struktur

```text
server.js                 router, halaman, API, static, keamanan
src/
  schema.sql              skema + trigger anti-overlap + audit append-only
  db.js                   koneksi, migrasi, transaksi
  seed.js                 data sintetis IDB
  time.js                 UTC ↔ WITA, format tanggal
  validation.js           BR-01..BR-09
  bookings.js             ketersediaan, reservasi, keputusan, blokir, laporan
  auth.js                 sesi hash, RBAC, rate limit login
  audit.js                audit log + email mock
  views/                  layout, beranda, pencarian, detail, reservasi, kalender, pengelola, admin, panduan
public/
  styles.css, app.js      design system + interaksi
  images/rooms/           foto ruangan dari idbbali.ac.id
  brand/                  logo resmi IDB Bali
scripts/
  concurrency.js          uji konkuransi HTTP
tests/
  business.test.js        aturan bisnis & keamanan
docs/                     PRD, DATA, DESIGN, API, TESTING
```

## Deploy Vercel (mode demo)

Repo ini sudah menyertakan `vercel.json` dan `api/index.js` agar bisa dibuka di Vercel.

Vercel tidak menyediakan disk permanen, jadi mode ini menaruh SQLite di `/tmp`:

- Data (reservasi, sesi login, audit) **hilang setiap cold start** dan tidak dibagi antar instance.
- Cocok untuk demo tampilan/alur sekali jalan, bukan uji coba multi-pengguna.
- Untuk data yang konsisten, pakai host dengan persistent disk (Render/Railway) atau database eksternal.

## Batasan rilis 1.0

Autentikasi demo, email mock, tanpa pembayaran/inventaris/check-in QR/reservasi berulang/aplikasi native. Belum diuji untuk beban 300 pengguna, usability 10 peserta, atau SSO/email produksi. Lihat `docs/TESTING.md`.
