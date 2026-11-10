# SiRuang — ringkasan implementasi PRD RuangIDB 0.2

> Sumber asli: `docs/PRD_RuangIDB_v0_2.pdf` (12 halaman, 21 Oktober 2026). Dokumen ini merangkum requirement yang diimplementasikan pada rilis 1.0. Jika ada konflik, PDF adalah acuan.

## 1. Produk, masalah, tujuan

Ruang IDB Bali (aula, lab komputer, lab iMac, lab fashion, perpustakaan, creative gallery, ruang kelas/rapat) dipakai kuliah dan kegiatan organisasi. Informasi ketersediaan tersebar, konfirmasi lambat, dan jadwal dapat bentrok.

**Value proposition:** SiRuang membantu civitas IDB Bali menemukan ruangan yang tersedia, memesannya tanpa bentrok, dan mengetahui status serta kegiatan kampus di satu tempat.

| Tujuan | Target rilis | Cara ukur |
|---|---|---|
| Tanpa jadwal bentrok | 0 bentrok | Concurrency test + pilot |
| Reservasi mudah | ≥85% selesai tanpa bantuan | Usability test 10 pengguna |
| Keputusan cepat | Median ≤1 hari kerja | Selisih ajuan–keputusan |
| Info kegiatan terpusat | ≥80% menemukan ruang kosong ≤1 menit | Usability test |

Keputusan produk: status **Disetujui** hanya muncul setelah slot dialokasikan eksklusif. Guardrail: satu ruangan tidak boleh punya dua reservasi aktif beririsan.

## 2. Pengguna dan cakupan

| Peran | Kebutuhan | Batas kewenangan |
|---|---|---|
| Pemohon (mahasiswa, dosen, staf) | Cari slot, ajukan, batalkan | Diri sendiri |
| Pengurus organisasi (BEM/Himpunan/UKM) | Reservasi organisasi, usul publikasi | Diri/organisasi |
| Pengelola ruangan (Sarpras/Kemahasiswaan) | Setujui/tolak, atur jadwal, blokir | Ruangan yang dikelola |
| Admin sistem | Kelola pengguna/peran, master ruangan, audit | Semua, tercatat audit |
| Pengunjung publik | Lihat kalender dan ruangan | Hanya baca, tanpa identitas pemesan |

**Termasuk 1.0:** login, daftar/detail ruangan, cari ketersediaan, reservasi, persetujuan, pembatalan, status, notifikasi email (mock), kalender publik, kelola ruangan/blokir, audit log, laporan penggunaan + CSV, tampilan ponsel, panduan.

**Di luar cakupan:** pembayaran, inventaris peralatan, reservasi lintas kampus, rekomendasi AI, check-in QR/sensor, impor otomatis jadwal kuliah (blokir manual/CSV), aplikasi native, reservasi berulang, PWA/offline.

## 3. Alur utama

1. **Masuk** — mock SSO Microsoft 365; peran ditetapkan sistem.
2. **Cari** — pilih tanggal, jam, kapasitas, fasilitas; hanya ruangan bebas; tanpa hasil → saran waktu terdekat.
3. **Detail** — keperluan, nama kegiatan, peserta; validasi kapasitas/jam/durasi.
4. **Ajukan** — konfirmasi; cek ulang ketersediaan; ID + status.
5. **Keputusan** — pengelola setujui/tolak (alasan wajib bila tolak); ruangan mode bebas otomatis disetujui.
6. **Pakai/batal** — slot kembali tersedia bila batal; status Selesai setelah waktu lewat.

Alternatif: slot diambil orang lain → 409 + opsi slot lain. Koneksi putus saat konfirmasi → cek Riwayat tanpa memesan ulang (idempotensi).

## 4. Layar dan navigasi

| Layar | Isi utama |
|---|---|
| Dashboard | Sapaan “Hello, {nama}”, ringkasan reservasi, notifikasi, agenda, akses cepat sesuai peran |
| Beranda publik | “Daftar Ruangan Tersedia”, checker tanggal/jam/kapasitas, kartu ruangan berfoto + status, kontak pengelola, alur, kegiatan minggu ini |
| Cari ruangan | Filter tanggal, jam, kapasitas, fasilitas, gedung; hasil kartu; empty state + saran |
| Detail ruangan | Foto, gedung/lantai, kapasitas, fasilitas, aturan, jam operasional, jadwal 7 hari, CTA |
| Formulir reservasi | Maksimal 4 langkah (Slot → Detail → Konfirmasi → Selesai) |
| Reservasi saya | Status, alasan, pembatalan mandiri |
| Kalender kampus | Bulan/minggu/hari; kegiatan publik tanpa identitas |
| Panduan | Alur, aturan, arti status, kontak |
| Panel pengelola | Antrean, moderasi, blokir, laporan + CSV, cari ID |
| Panel admin | Pengguna/peran, master ruangan, audit log |

**Navigasi:** pengguna login memakai sidebar vertikal pada desktop; pengunjung memakai navigasi atas. **Mobile (MB-01):** navigasi bawah pada <767 px: Ruangan, Jadwal, Form, Akun/Masuk. Alur reservasi satu tangan.

**Pola beranda (revisi):** mengikuti struktur referensi FMIPA ITB `peminjaman-ruangan`: tab Daftar Ruangan / Form Pinjam / Jadwal Ruangan / Panduan / Masuk, checker waktu, kartu ruangan, kontak pengelola. Identitas visual tetap IDB Bali.

## 5. Kebutuhan fungsional

| ID | Perilaku | Prioritas |
|---|---|---|
| AK-01 | Login SSO Microsoft 365 kampus; peran ditentukan sistem; sesi invalid → login; API privat 401 | Must |
| AK-02 | Sesi berakhir saat keluar atau 12 jam tidak aktif; token disimpan sebagai hash | Must |
| RM-01 | Daftar/detail ruangan: nama, gedung, lantai, kapasitas, fasilitas, foto, aturan, jam operasional | Must |
| RM-02 | Cari ketersediaan (tanggal, jam, kapasitas, fasilitas, gedung); hanya bebas; tanpa hasil → saran waktu terdekat | Must |
| RS-01 | Ajukan satu ruangan pada satu rentang; keperluan, kegiatan, peserta, catatan; cek ulang; ID | Must |
| RS-02 | Alokasi eksklusif; dua request beririsan → tepat satu berhasil, lainnya 409 + opsi | Must |
| RS-03 | Idempotency-Key sama tidak membuat reservasi ganda | Must |
| RS-04 | Reservasi saya: status, ruangan, waktu, alasan; pengelola cari via ID | Must |
| PS-01 | Antrean pengelola; setujui/tolak (alasan wajib); mode bebas otomatis | Must |
| PS-02 | Diajukan tanpa keputusan 2 hari kerja / sebelum mulai → Kedaluwarsa + notifikasi | Must |
| PB-01 | Pemohon batal sampai 2 jam sebelum mulai; pengelola batal dengan alasan; slot langsung bebas | Must |
| BL-01 | Blokir jadwal; beririsan dengan reservasi aktif butuh konfirmasi + notifikasi | Must |
| KG-01 | Kalender publik: ruangan terisi + kegiatan terbit tanpa identitas pribadi | High |
| KG-02 | Pengurus menandai kegiatan publik; terbit setelah disetujui + dimoderasi | High |
| NT-01 | Email/notifikasi saat diajukan, disetujui, ditolak, dibatalkan; gagal kirim dicatat, tidak membatalkan | High |
| AD-01 | Admin kelola peran + master ruangan; audit (pelaku, waktu, aksi, objek, alasan) | Must |
| LP-01 | Laporan penggunaan per ruangan/periode + ekspor CSV | High |

## 6. Hak akses

| Aksi | Pengunjung | Pemohon | Pengurus | Pengelola | Admin |
|---|---|---|---|---|---|
| Lihat kalender & ruangan | Ya | Ya | Ya | Ya | Ya |
| Lihat identitas pemesan | Tidak | Miliknya | Miliknya | Ruangan dikelola | Ya (audit) |
| Ajukan reservasi | Tidak | Diri sendiri | Diri/organisasi | Sesuai kewenangan | Tidak otomatis |
| Batalkan | Tidak | Milik sendiri | Milik sendiri/organisasi | Dengan alasan | Tidak otomatis |
| Setujui/tolak, blokir | Tidak | Tidak | Tidak | Ruangan dikelola | Tidak otomatis |
| Kelola akun & peran | Tidak | Tidak | Tidak | Tidak | Ya, audit |

## 7. Aturan bisnis

| ID | Aturan | Implementasi |
|---|---|---|
| BR-01 | Mulai harus sebelum selesai | `validation.js` |
| BR-02 | Reservasi aktif (Diajukan/Disetujui) dan blokir tidak boleh beririsan | `BEGIN IMMEDIATE` + trigger SQLite |
| BR-03 | Hanya dalam jam operasional dan tidak di masa lalu | Validasi hari + jam WITA |
| BR-04 | Peserta ≤ kapasitas | Validasi server |
| BR-05 | Pembatalan pemohon hanya miliknya, sebelum batas | Cek owner + 2 jam |
| BR-06 | Maks 4 jam dan 3 reservasi aktif/pengguna (dapat diubah per ruangan) | Validasi server |
| BR-07 | Reservasi organisasi hanya pengurus terdaftar | Cek `is_officer` + org |
| BR-08 | Penolakan/pembatalan pengelola wajib alasan | Validasi server |
| BR-09 | Simpan UTC, tampil WITA (UTC+8) | `time.js` |

## 8. Status reservasi

| Status | Arti | Perpindahan sah |
|---|---|---|
| Diajukan | Slot ditahan, menunggu keputusan | Disetujui, Ditolak, Dibatalkan, Kedaluwarsa |
| Disetujui | Slot dialokasikan eksklusif | Dibatalkan, Selesai |
| Ditolak / Dibatalkan / Kedaluwarsa | Akhir; slot bebas | – |
| Selesai | Waktu pemakaian lewat | – |

## 9. Model data

`users`, `organizations`, `rooms`, `reservations`, `blocks`, `events`, `audit_logs`, plus `sessions` dan `notifications` untuk operasional. Detail kolom dan invariant: `docs/DATA.md`.

Aturan konsistensi: status hanya berubah sesuai tabel; cek konflik + simpan dalam satu transaksi; audit append-only; `reservations`, `blocks`, `audit_logs` bukan cache.

## 10. Pesan dan error

| Kode | Respons UI |
|---|---|
| 400/422 | Tandai kolom, jelaskan alasan yang dapat diperbaiki |
| 401/403 | Kembali ke login / jelaskan hak akses |
| 404 | Perbarui daftar; jangan bocorkan data orang lain |
| 409 | “Slot baru saja dipesan” + tawarkan slot lain |
| 429 | Jelaskan waktu tunggu |
| 5xx | Pesan umum; coba lagi; cek Reservasi saya sebelum memesan ulang |

Pesan sukses hanya setelah operasi berhasil. Klik ganda ditangani idempotensi; tombol dinonaktifkan saat proses.

## 11. Ponsel dan aksesibilitas

- MB-01 navigasi bawah <767 px; satu tangan.
- MB-02 tanpa scroll horizontal 390 px; target sentuh ±44 px; keyboard tidak menutupi tombol konfirmasi.
- MB-03 keyboard menjangkau semua fungsi; fokus terlihat; modal mengatur fokus; status dibaca screen reader; `prefers-reduced-motion`.
- MB-04 kontras WCAG 2.1 AA; diuji axe-core.
- PWA/offline tidak termasuk; saat offline tampilkan pesan koneksi; tidak menyimpan data privat di cache.

## 12. Nonfungsional

| ID | Ketentuan |
|---|---|
| NF-01 | 95% pencarian ≤2 detik dengan data representatif (target awal) |
| NF-02 | 300 pengguna bersamaan (asumsi) |
| NF-03 | 0 reservasi ganda; restart tidak menghilangkan data |
| NF-04 | Jam layanan ditentukan operator; tanpa failover otomatis |
| NF-05 | Bahasa Indonesia; WITA; format tanggal konsisten |

Parameter awal: durasi maks 4 jam; 3 reservasi aktif; batal 2 jam; kedaluwarsa 2 hari kerja; sesi 12 jam; login gagal 5/15 menit; jam layanan Senin–Jumat 08.30–17.30, Sabtu 08.30–14.00.

## 13. Keamanan dan privasi

- SEC-01 autentikasi mock SSO; tidak menyimpan password.
- SEC-02 hak akses diperiksa di server setiap request.
- SEC-03 HTTPS di produksi, cookie HttpOnly/SameSite, CSRF origin check, rate limit, header keamanan.
- SEC-04 rahasia tidak di kode/log; mock tanpa secret.
- SEC-05 data pribadi seperlunya; kalender publik tanpa nama/email.
- SEC-06 audit log tanpa data berlebih; retensi mengikuti kebijakan kampus/UU PDP.
- SEC-07 data sintetis; tidak memakai data mahasiswa nyata.

## 14. API

Lihat `docs/API.md`. Ringkas: `/auth/*`, `/api/rooms`, `/api/availability`, `/api/calendar`, `/api/reservations`, `/api/manage/*`, `/api/admin/*`, `/healthz`.

## 15. Kriteria penerimaan

| ID | Given | When | Then |
|---|---|---|---|
| AC-RS1A | Slot tersedia, akun valid | Konfirmasi | Satu reservasi + ID + status sesuai mode |
| AC-RS2A | Slot tersedia, dua akun valid | Dua request bersamaan | Tepat satu berhasil, satu 409 |
| AC-RS3A | Reservasi sudah berhasil | Request sama diulang | Tidak ada reservasi ganda |
| AC-RS1B | Peserta melebihi kapasitas | Konfirmasi | Ditolak, kolom ditandai |
| AC-PS1A | Status Diajukan | Tolak tanpa alasan | Ditolak sistem, status tidak berubah |
| AC-PS2A | Pengajuan lewat batas | Job kedaluwarsa | Kedaluwarsa, slot bebas, notifikasi |
| AC-PB1A | Reservasi milik A | B membatalkan | 403, data tidak berubah |
| AC-PB1B | <2 jam sebelum mulai | Pemohon batal | Ditolak dengan pesan batas waktu |
| AC-PB1C | Reservasi disetujui | Pemohon batal tepat waktu | Dibatalkan, slot bebas, audit |
| AC-BL1A | Reservasi aktif di slot | Pengelola blokir | Konfirmasi; pemohon diberi tahu; audit |
| AC-KG1A | Kegiatan publik disetujui + dimoderasi | Pengunjung buka kalender | Tampil tanpa identitas pribadi |
| AC-NT1A | Layanan email gagal | Reservasi disetujui | Tetap Disetujui; kegagalan dicatat |
| AC-AK1A | Pengguna anonim | Akses endpoint privat | 401 |

## 16. Risiko dan keputusan terbuka

Risiko: jadwal kuliah tidak lengkap, SSO belum siap, pengelola lambat, aturan antar unit berbeda, no-show, satu server.

Pertanyaan terbuka: unit pemilik/pengelola tiap kategori; pemetaan peran M365; ruangan mana yang perlu persetujuan; nilai final durasi/batal/kedaluwarsa; inventaris alat; kebijakan privasi/retensi; moderator kegiatan publik.

## 17. Catatan implementasi

- Form Langkah 02 tidak lagi menampilkan pilihan “Keperluan”; diganti field **Nama Organisasi Mahasiswa** dan **Peminjaman Tambahan**. Pilihan lama tetap didukung API untuk kompatibilitas.
- Login memakai halaman **Masuk Akun** (Email/NIM + Password + Masuk Sekarang) dan halaman terpisah **Masuk Admin** (`/masuk/admin`). Password dicek ke mock provider (`MOCK_SSO_PASSWORD`, default `idb12345`) dan tidak disimpan per pengguna.
- Beranda mengikuti pola FMIPA ITB (daftar ruangan + checker + kartu + kontak + tab), dengan identitas IDB Bali.
- Ruangan dan foto diselaraskan dengan `idbbali.ac.id`: Lab Komputer, Lab iMac, Lab Fashion Design, Perpustakaan, Aula, Creative Gallery, Gedung Serbaguna, Studio Foto, Lab Software Development.
- Dua ruangan tambahan (Studio Foto, Lab Software Development) diambil dari daftar fasilitas situs kampus; kapasitas/lantai yang tidak tercantum di situs adalah asumsi operasional.
