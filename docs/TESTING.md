# TESTING — bukti dan batasan

Tanggal uji: 28 Oktober 2026. Node v22.14.0, macOS arm64. Server lokal `http://127.0.0.1:3000`.

## Perintah

```bash
npm test
npm run test:concurrency
```

## 1. Unit/integration (`npm test`)

`node --test tests/*.test.js` — **18 test, 18 lulus, 0 gagal**.

Mencakup:

- AC-RS1A reservasi valid (mode persetujuan & bebas).
- AC-RS3A idempotensi (kunci sama → satu reservasi, 200 reused).
- BR-01/03/04/06 waktu terbalik, di luar jam, masa lalu, kapasitas, durasi.
- BR-07 reservasi organisasi hanya pengurus.
- AC-RS2A dua request slot beririsan (level service) → satu 201, satu 409.
- Trigger database menolak insert overlap langsung (`SLOT_CONFLICT`).
- AC-PS1A/BR-08 tolak tanpa alasan gagal; dengan alasan berhasil.
- Pengelola ruangan lain tidak bisa memutuskan (403).
- AC-PB1A/1B/1C batal milik orang lain, batas 2 jam, batal sah + slot bebas.
- PS-02 kedaluwarsa otomatis.
- Audit append-only (UPDATE/DELETE ditolak).
- Kalender publik tanpa identitas pemesan.
- BR-09 simpan UTC, tampil WITA.
- BR-06 maksimal 3 reservasi aktif.
- AC-NT1A email gagal → reservasi tetap Disetujui + notifikasi `gagal`.
- AC-BL1A blokir beririsan → konfirmasi, reservasi dibatalkan, blokir dibuat.
- Jam operasional Aula (Sabtu/Minggu).
- Nama organisasi mahasiswa + peminjaman tambahan tersimpan; pengurus otomatis tercatat sebagai organisasi.

## 2. Uji konkuransi HTTP nyata (`npm run test:concurrency`)

Script menjalankan server terpisah dengan database sementara, login 5 pengguna, lalu mengirim **5 request POST `/api/reservations` secara bersamaan** pada slot yang sama (Lab Komputer, hari berikutnya 13.00–15.00 WITA).

Hasil:

```text
AC-RS2A concurrency
  concurrent requests : 5
  statuses            : 201, 409, 409, 409, 409
  success (201)       : 1
  conflict (409)      : 4
  other               : 0
  conflict message    : Slot baru saja dipesan pengguna lain. Pilih waktu atau ruangan lain.
  verdict             : PASS

AC-RS3A idempotency
  first / second      : 201 / 200
  same public_id      : true
  verdict             : PASS

AC-AK1A anonymous write
  status              : 401
  verdict             : PASS

RESULT               : PASS
```

Catatan: request yang sama diulang dengan `Idempotency-Key` sama mengembalikan reservasi yang sama (tidak ganda). Tanpa sesi → 401.

## 3. Audit aksesibilitas (axe-core via agent-browser)

| Halaman | Violations | Passes |
|---|---|---|
| `/` beranda | 0 | 40 |
| `/dashboard` (login) | 0 | 34 |
| `/cari` | 0 | 41 |
| `/ruangan/aula` | 0 | 46 |
| `/kalender` | 0 | 38 |
| `/panduan` | 0 | 36 |
| `/reservasi/baru` (login) | 0 | 43 |
| `/reservasi-saya` | 0 | 42 |
| `/akun` | 0 | 35 |
| `/pengelola` | 0 | 48 |
| `/admin` | 0 | 42 |
| `/masuk` | 0 | 35 |

Incomplete manual: `.nav-count` (badge oranye) — teks ink gelap di atas oranye, rasio >4.5:1. Tidak ada scroll horizontal pada 390px (scrollWidth = clientWidth = 390).

## 4. Uji alur manual (agent-browser)

- Sidebar desktop ≥1200px: item aktif pill, Logout di bawah berfungsi (POST → sesi dihapus); header horizontal disembunyikan; tablet memakai bottom nav; mobile 390px tanpa overflow.
- Login normal → `/dashboard` dengan “Hello, {nama}”; pengelola melihat antrean, admin melihat ringkasan admin; login admin lewat `/masuk/admin` → `/admin` dengan sapaan.
- Beranda: 9 kartu ruangan + foto, status tersedia/terisi/diblokir sesuai query tanggal/jam.
- Filter kapasitas 100 → hanya Aula (1 kartu).
- Tombol **Ajukan** membawa `date`, `startTime`, `endTime`, `participants`; setelah login, form terisi 29 Okt 13.00–15.00, 20 peserta.
- Submit reservasi → status sukses + ID `RSV-...` (mis. RSV-D96DFC; data demo di-reset setelah uji).
- Reservasi saya: modal batal, status berubah Dibatalkan, slot bebas.
- Pengelola: setujui antrean, tolak dengan alasan, blokir beririsan → dialog konfirmasi, reservasi dibatalkan, notifikasi `terkirim`, audit tercatat.
- Moderasi kegiatan: Terbitkan → event `terbit`.
- Admin: ubah peran Made → Pengelola, audit `admin.user.update`; self-lockout ditolak 422.
- Mock email gagal (env `MOCK_EMAIL_FAIL=1`) diuji di unit test, bukan produksi.

## 5. Yang belum terverifikasi / batasan

- SSO Microsoft 365 nyata (masih mock), email SMTP nyata, HTTPS/domain kampus.
- Load test 300 pengguna (NF-02) dan target 95% pencarian ≤2 detik (NF-01).
- Usability test 10 pengguna (target ≥85%).
- Uji lintas browser/perangkat fisik; uji pembaca layar manual (axe bukan pengganti).
- Restore backup/RPO/RTO, deployment, monitoring, failover.
- WhatsApp/registrasi akun seperti referensi FMIPA **tidak** ditambahkan karena di luar PRD (privasi & cakupan 1.0).
- Data reservasi demo bergantung pada tanggal berjalan; reset DB untuk demo bersih.
