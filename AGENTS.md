# AGENTS.md — SiRuang

Panduan untuk agen yang melanjutkan pekerjaan di repo ini.

## Sumber kebenaran

1. `docs/PRD_RuangIDB_v0_2.pdf` (dokumen asli).
2. `docs/PRD.md` (ringkasan terstruktur + ID requirement).
3. `docs/DATA.md` (skema, invariant, transisi status).
4. `docs/API.md` (kontrak endpoint).
5. `docs/DESIGN.md` (design brief dan token).

Jangan menambah fitur di luar cakupan rilis 1.0 (pembayaran, inventaris alat, check-in QR, reservasi berulang, aplikasi native, rekomendasi AI).

## Aturan yang tidak boleh dilanggar

- **Zero double-booking (BR-02/RS-02):** cek konflik dan insert berada dalam satu transaksi `BEGIN IMMEDIATE`; trigger `trg_reservation_overlap_*` dan `trg_block_overlap_*` adalah pertahanan terakhir.
- **Idempotensi (RS-03):** `Idempotency-Key` wajib; kombinasi `(user_id, idempotency_key)` unik. Kunci yang sama + payload berbeda → 409 `IDEMPOTENCY_MISMATCH`.
- **Validasi server:** jangan mengandalkan validasi klien. Aturan di `src/validation.js`.
- **Waktu:** simpan UTC ISO (`TEXT`), tampilkan WITA (UTC+8) lewat `src/time.js`.
- **Privasi:** kalender publik tidak boleh mengembalikan nama/email pemesan. Hanya pengelola ruangan terkait yang melihat identitas di panel.
- **RBAC:** periksa di server pada tiap request (`apiUser`, `managesRoom`, role check).
- **Audit:** append-only; trigger menolak UPDATE/DELETE. Catat perubahan penting.
- **Email gagal tidak membatalkan reservasi**; catat di `notifications`.
- **Uji jangan dihapus/dilonggarkan** agar lulus.

## Perintah

```bash
npm start                 # server + seed otomatis
npm test                  # 18 test (node:test)
npm run test:concurrency  # 5 request paralel, harus 1×201 + 4×409
```

Tidak ada build step, linter, atau dependency npm. Jangan menambahkan paket tanpa alasan kuat dan persetujuan.

## Konvensi teknis

- CommonJS, Node ≥ 22.5, `node:sqlite` (`DatabaseSync`).
- SQL mentah di `src/bookings.js`; migrasi ringan di `src/db.js` (cek kolom).
- HTML di `src/views/*`, CSS di `public/styles.css`, interaksi di `public/app.js`.
- Semua mutasi API: `Content-Type: application/json`, cek Origin (CSRF), sesi cookie HttpOnly.
- Rate limit login 5/15 menit per klien; header keamanan + CSP di `server.js`.
- Bahasa UI Indonesia, tanggal `id-ID`, jam WITA dengan titik (`09.00`).

## Desain

- Arah: **Bali Studio Editorial** — kertas hangat, teal `#024D71`, oranye `#F17711`, Fraunces + Montserrat.
- Beranda mengikuti pola referensi FMIPA ITB: “Daftar Ruangan Tersedia”, checker tanggal/jam, kartu ruangan berfoto, kontak pengelola, tab Daftar/Form/Jadwal/Panduan.
- Foto dan data ruangan mengacu pada `idbbali.ac.id`; logo resmi ada di `public/brand/`.
- Radius 2px, tanpa shadow kartu, focus visible, target sentuh ≥44px, no horizontal scroll di 390px.
- Jalankan `agent-browser a11y <url>` pada halaman yang diubah; target 0 violation.

## Data sintetis

Jangan memakai data mahasiswa nyata. Semua akun, reservasi, dan kegiatan di `src/seed.js` adalah fiktif. Jangan commit database (`data/*.db`) atau log email.
