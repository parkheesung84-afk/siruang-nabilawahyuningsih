# DESIGN — Bali Studio Editorial

## Design brief

```text
Purpose:    Temukan ruang kosong, ajukan reservasi tanpa bentrok, dan lihat kegiatan kampus.
Audience:   Mahasiswa/dosen/staf di ponsel 390px; pengelola & admin di desktop.
Tone:       Bali Studio Editorial — katalog pameran kampus bertemu wayfinding signage.
Reference:  Identitas IDB Bali (Montserrat, oranye #F17711, teal #024D71) + pola beranda FMIPA ITB.
Palette:    Kertas hangat / permukaan gading / ink teal-gelap / aksen oranye + status fungsional.
Type:       Fraunces (display ekspresif) + Montserrat (UI/body).
Memorable:  Indeks ruangan berfoto dengan nomor/kapasitas editorial + rail ketersediaan.
Restraint:  Tanpa glassmorphism, gradien ungu, bayangan kartu, atau sudut bulat seragam.
```

## Arah visual

- **Bali Studio Editorial**: kertas hangat, tipografi serif ekspresif, garis tipis, label uppercase, nomor besar. Kreatif tetapi tertata seperti katalog pameran/kampus.
- **Pola beranda (revisi)**: mengikuti informasi arsitektur referensi FMIPA ITB `peminjaman-ruangan`:
  - tab **Daftar Ruangan / Form Pinjam / Jadwal Ruangan / Panduan / Masuk**;
  - judul **“Daftar Ruangan Tersedia”**;
  - checker **tanggal + jam + kapasitas** di kanan;
  - **kartu ruangan berfoto** dengan status, kapasitas, fasilitas, aksi;
  - **kontak pengelola**; alur 4 langkah; agenda kampus.
- Identitas tetap IDB Bali (teal/oranye), bukan menyalin biru FMIPA.

## Token

| Token | Nilai | Catatan |
|---|---|---|
| `--base` | `#f6f1e7` | kertas hangat |
| `--surface` | `#fffdf8` | kartu/permukaan |
| `--surface-2` | `#ede6d8` | tint/panel |
| `--ink` | `#10231f` | teks utama |
| `--ink-2` | `#40544f` | teks sekunder |
| `--ink-3` | `#55645d` | meta/tersier (≥4.5:1 pada surface-2) |
| `--line` | `#d8cebd` | garis |
| `--teal` | `#024d71` | brand utama, tombol |
| `--accent` | `#f17711` | aksen oranye resmi IDB |
| `--accent-ink` | `#a94a00` | teks oranye di kertas (≥4.5:1) |
| `--success` | `#0b6b4f` | status disetujui/tersedia |
| `--warning` | `#8a5a00` | status diajukan |
| `--danger` | `#a3261b` | tolak/batal/error |
| radius | `2px` | satu nilai di seluruh UI |
| shadow | hanya dialog | tidak ada bayangan kartu |
| font display | Fraunces | heading/angka |
| font text | Montserrat | UI/body |

Tipe: skala 1.250 (minor third); body 1rem/1.6; hero clamp 2.5–4.8rem; label 0.62–0.78rem uppercase tracking 0.06–0.16em.

## Komponen

- **Header publik**: logo resmi IDB Bali + wordmark SiRuang; nav horizontal untuk pengunjung.
- **Sidebar pengguna login (≥1200px)**: nav vertikal (Dashboard, Daftar Ruangan, Form Pinjam, Jadwal Ruangan, Panduan, Reservasi Saya, Kelola/Admin, Akun), item aktif berupa pill teal, dan **Logout** dengan ikon di bagian paling bawah.
- **Tablet/mobile**: navigasi bawah (Ruangan, Jadwal, Form, Dashboard/Masuk); sidebar disembunyikan.
- **Dashboard login**: “Hello, {nama}”, aksi cepat, statistik reservasi, jadwal mendatang, notifikasi, agenda, dan panel peran (pengelola/admin).
- **Logo** resmi full color `public/brand/idb-bali-logo-full.png` (813×532, tidak dipotong) untuk header/sidebar/auth; footer memakai `idb-bali-logo-w.png` (putih, latar transparan, tanpa tile). Favicon memakai logo persegi resmi `logo-idb-fullcolor.png`.
- **Kartu ruangan**: foto 4:3, badge status (Tersedia/Terisi/Diblokir), nama, kapasitas, lokasi, deskripsi 2 baris, 3 fasilitas, mode persetujuan, tombol Detail/Ajukan.
- **Checker**: form GET `/` — tanggal, mulai, selesai, kapasitas; status kartu mengikuti rentang.
- **Badge reservasi**: Diajukan, Disetujui, Ditolak, Dibatalkan, Kedaluwarsa, Selesai.
- **Modal**: konfirmasi batal, tolak dengan alasan, konfirmasi blokir beririsan. `<dialog>` + focus kembali.
- **Tabel**: panel pengelola/admin dengan wrapper scroll horizontal internal.
- **Foto**: `public/images/rooms/*.jpg` dari `idbbali.ac.id` (Lab Komputer, Lab iMac, Lab Fashion, Perpustakaan, Aula, Creative Gallery, Gedung Serbaguna, Studio Foto, Lab Software Development).

## Layout responsif

- Desktop ≥1200: wrap 1200; beranda 2 kolom (intro + checker), grid kartu 3 kolom.
- 960–1199: grid 3/2 kolom; nav desktop tetap; gap lebih rapat.
- ≤960: hero/detail/booking/kalender menjadi 1 kolom; panel samping statis.
- ≤767: navigasi bawah 4 item (Ruangan, Jadwal, Form, Akun/Masuk); grid 1 kolom; target sentuh ≥44px; tanpa scroll horizontal di 390px.
- ≤400: filter 1 kolom; statistik dipangkas.

## Aksesibilitas

- Kontras teks dicek; `--ink-3` digelapkan ke `#55645d` agar lolos pada surface-2.
- Fokus terlihat (`:focus-visible` 2px teal), skip link, landmark `aside` untuk topline, heading berurutan, `aria-live` untuk status/toast, form label eksplisit, error `aria-describedby`.
- Modal `<dialog>` memakai `showModal` (focus trap bawaan); tombol tutup berlabel.
- `prefers-reduced-motion` mematikan animasi.
- Kalender memakai grup link dengan label tanggal + jumlah kegiatan (tanpa ARIA grid yang rusak).
- Target: WCAG 2.1 AA / 2.2 AA praktik.

### Bukti axe-core (agent-browser)

| Halaman | Violations |
|---|---|
| Beranda `/` | 0 |
| Cari `/cari` | 0 |
| Detail `/ruangan/aula` | 0 |
| Kalender `/kalender` | 0 |
| Panduan `/panduan` | 0 |
| Booking `/reservasi/baru` | 0 |
| Reservasi saya | 0 (setelah heading order diperbaiki) |
| Pengelola | 0 |
| Admin | 0 |
| Masuk | 0 |

Catatan: axe “incomplete” warna pada blok jadwal dihapus dengan latar solid + border kiri.

## Foto & logo

- Sumber foto/ruangan: halaman fasilitas `idbbali.ac.id` (diakses via mirror teks karena Cloudflare).
- Logo resmi: halaman `idbbali.ac.id/logo/` — full color `idb-bali-logo.png` (813×532), varian putih `idb-bali-logo-w.png`, logo persegi `logo-idb-fullcolor.png` untuk favicon.
- Tidak memakai foto mahasiswa nyata; semua data reservasi sintetis.
