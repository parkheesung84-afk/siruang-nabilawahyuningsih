# DATA — skema, invariant, dan transisi

Database: SQLite (`data/siruang.db`), diakses lewat `node:sqlite` `DatabaseSync`. Skema ada di `src/schema.sql`; migrasi ringan (cek kolom) di `src/db.js`.

## Tabel

### users
| Kolom | Tipe | Catatan |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | |
| email | TEXT UNIQUE | email kampus sintetis |
| nim | TEXT UNIQUE | NIM/NIDN sintetis; boleh null untuk data lama |
| role | TEXT | `pemohon`, `pengurus`, `pengelola`, `admin` |
| org_id | INTEGER FK organizations | nullable |
| is_officer | INTEGER 0/1 | pengurus terdaftar |
| unit | TEXT | unit/prodi |
| active | INTEGER 0/1 | akun nonaktif tidak bisa login |
| created_at | TEXT UTC | |

### organizations
`id`, `name`, `kind` (`BEM`/`Himpunan`/`UKM`/`Prodi`), `created_at`.

### rooms
| Kolom | Tipe | Catatan |
|---|---|---|
| id | INTEGER PK | |
| slug | TEXT UNIQUE | URL detail |
| name | TEXT | |
| building | TEXT | `Gedung Kampus` |
| floor | TEXT | `Lantai 1`–`Lantai 3` |
| capacity | INTEGER | >0 |
| facilities | TEXT JSON array | |
| rules | TEXT JSON array | |
| operating_hours | TEXT JSON | array 7 hari (0=Minggu), `[["08:00","16:00"], ...]`; `null` = tutup |
| manager_id | INTEGER FK users | pengelola |
| mode | TEXT | `persetujuan` / `bebas` |
| max_hours | INTEGER | default 4 |
| description | TEXT | |
| photo | TEXT | path `/images/rooms/*.jpg` |
| art | TEXT | fallback SVG |
| active | INTEGER 0/1 | |
| created_at | TEXT UTC | |

### reservations
| Kolom | Tipe | Catatan |
|---|---|---|
| id | INTEGER PK | |
| public_id | TEXT UNIQUE | `RSV-XXXXXX` |
| user_id | INTEGER FK users | |
| room_id | INTEGER FK rooms | |
| organization_id | INTEGER FK organizations | nullable |
| start_at / end_at | TEXT UTC ISO | |
| purpose | TEXT | `pribadi`/`organisasi` |
| activity_name | TEXT | |
| organization_name | TEXT | nama organisasi mahasiswa (isi bebas) |
| additional_borrowing | TEXT | permintaan peminjaman tambahan (teks) |
| participants | INTEGER | >0, ≤ kapasitas |
| notes | TEXT | |
| status | TEXT | lihat transisi |
| is_public | INTEGER 0/1 | usul tampil di kalender |
| public_description | TEXT | |
| decision_reason | TEXT | alasan tolak/batal/kedaluwarsa |
| idempotency_key | TEXT | unik bersama user_id |
| request_hash | TEXT | deteksi payload berbeda |
| created_at / updated_at | TEXT UTC | |
| decided_by | INTEGER FK users | |
| decided_at | TEXT UTC | |

Unique: `(user_id, idempotency_key)`.

### blocks
`id`, `room_id` FK, `start_at`/`end_at` UTC, `reason`, `created_by`, `created_at`. Dihitung dalam cek konflik.

### events
`id`, `reservation_id` FK UNIQUE, `title`, `description`, `moderation_status` (`menunggu`/`terbit`/`ditolak`), `created_at`. Satu event per reservasi.

### audit_logs
`id`, `actor_id`, `actor_label`, `action`, `object_type`, `object_id`, `reason`, `meta` JSON, `created_at`. **Append-only** (trigger menolak UPDATE/DELETE).

### sessions
`token_hash` PK, `user_id`, `created_at`, `last_seen_at`, `expires_at`, `ip`. Token acak 32 byte; hanya hash SHA-256 yang disimpan. Masa berlaku 12 jam, diperpanjang saat request valid.

### notifications
`id`, `user_id`, `reservation_id`, `channel` (`email`), `subject`, `body`, `status` (`terkirim`/`gagal`), `error`, `created_at`. Email mock juga ditulis ke `data/outbox.log`.

## Invariant

1. **BR-02:** untuk ruangan yang sama, reservasi berstatus `Diajukan`/`Disetujui` tidak boleh beririsan dengan reservasi aktif lain atau blokir.
   - Dicek dalam `BEGIN IMMEDIATE` sebelum insert/update.
   - Trigger `trg_reservation_overlap_insert`, `trg_reservation_overlap_update`, `trg_block_overlap_insert`, `trg_block_overlap_update` melakukan pengecekan ulang dan `RAISE(ABORT,'SLOT_CONFLICT')` sebagai pertahanan terakhir.
2. **Idempotensi:** insert dengan `(user_id, idempotency_key)` yang sama mengembalikan reservasi lama (200). Payload berbeda → 409 `IDEMPOTENCY_MISMATCH`.
3. **Status:** hanya transisi di bawah yang sah.
4. **Waktu:** semua `start_at`/`end_at`/timestamp disimpan UTC ISO; perhitungan hari/jam operasional memakai WITA (UTC+8) tanpa DST.
5. **Audit:** tidak boleh diubah/dihapus.
6. **Privasi:** query kalender publik tidak menyertakan `users.name`/`email`; panel pengelola hanya untuk ruangan yang dikelola.

## Transisi status

```text
Diajukan ──approve──> Disetujui ──waktu lewat──> Selesai
    │                     │
    ├──reject──> Ditolak  └──cancel──> Dibatalkan
    ├──cancel──> Dibatalkan
    └──lewat batas──> Kedaluwarsa
```

- Kedaluwarsa: `min(created_at + 2 hari kerja, start_at)`.
- Selesai: `Disetujui` dan `end_at <= sekarang`, diproses lazy (`completePast`).
- Blokir beririsan: pengelola harus konfirmasi; reservasi aktif yang beririsan dibatalkan dengan alasan blokir (BR-02 tetap terjaga).

## Aturan bisnis → implementasi

| ID | Lokasi |
|---|---|
| BR-01/03/04/06/07 | `src/validation.js` |
| BR-02 | `src/bookings.js` + trigger |
| BR-05/08 | `validateCancel`, `validateDecision` |
| BR-09 | `src/time.js` |

Batas: 4 jam (atau `rooms.max_hours`), 3 reservasi aktif/pengguna, batal 2 jam, kedaluwarsa 2 hari kerja, sesi 12 jam.

## RBAC

- `apiUser` memeriksa sesi untuk semua endpoint privat.
- `manageRoom`/`managesRoom`: pengelola hanya ruangannya; admin boleh semua.
- Pemohon/pengurus hanya melihat reservasi sendiri (`/api/reservations/me`).
- Admin: `PATCH /api/admin/users/:id`, `PATCH /api/admin/rooms/:id`; tidak bisa menurunkan/menonaktifkan akunnya sendiri (`SELF_LOCKOUT`).
- Moderasi event: pengelola ruangan terkait atau admin.

## Seed sintetis

- 9 pengguna, 3 organisasi, 9 ruangan, 14 reservasi (semua status), 3 blokir, event publik terbit/menunggu.
- Ruangan & foto mengacu pada `idbbali.ac.id`:
  - Lab Komputer (36, Lantai 1)
  - Lab iMac (30, Lantai 1)
  - Lab Fashion Design (24, Lantai 1)
  - Perpustakaan (40, Lantai 3)
  - Aula (200, Lantai 1)
  - Creative Gallery (80, Lantai 1)
  - Gedung Serbaguna (300, Gedung Serbaguna)
  - Studio Foto (10, Lantai 1)
  - Lab Software Development (30, Lantai 2)
- Kapasitas/lantai yang tidak tercantum di situs kampus adalah asumsi operasional.
- Form reservasi tidak lagi memakai pilihan “Keperluan”; diganti **Nama Organisasi Mahasiswa** dan **Peminjaman Tambahan**. `purpose` tetap dipertahankan untuk kompatibilitas API/data lama.

## Reset & migrasi

- Reset demo: hapus `data/siruang.db*`, jalankan `npm start`.
- Migrasi `photo`: `src/db.js` mengecek `PRAGMA table_info(rooms)` dan menambah kolom jika belum ada.
- Jangan commit file database/outbox (lihat `.gitignore`).
