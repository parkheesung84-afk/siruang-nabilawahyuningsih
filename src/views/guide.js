'use strict';

const { esc, icon, statusBadge } = require('./components');

function guidePage({ user }) {
  const steps = [
    {
      n: '01',
      title: 'Masuk dengan akun kampus',
      body: 'Gunakan tombol Masuk Akun dengan Email/NIM dan password. Peran ditentukan sistem, bukan dipilih pengguna. Sesi berakhir setelah 12 jam tidak aktif.'
    },
    {
      n: '02',
      title: 'Cek ruangan dan slot',
      body: 'Di beranda, pilih tanggal, jam mulai, jam selesai, dan kapasitas. Kartu ruangan menampilkan status Tersedia, Terisi, atau Diblokir untuk rentang tersebut. Gunakan Filter lengkap untuk fasilitas dan gedung.'
    },
    {
      n: '03',
      title: 'Ajukan reservasi',
      body: 'Buka detail ruangan atau tombol Ajukan. Isi nama organisasi mahasiswa (opsional), nama kegiatan, jumlah peserta, peminjaman tambahan, dan catatan. Pengurus organisasi dapat mengajukan atas nama organisasi.'
    },
    {
      n: '04',
      title: 'Pantau keputusan',
      body: 'Ruangan mode bebas langsung disetujui jika slot kosong. Ruangan mode persetujuan menunggu keputusan pengelola, maksimal 2 hari kerja atau sebelum waktu mulai. Status dan alasan tampil di Reservasi saya.'
    },
    {
      n: '05',
      title: 'Pakai atau batalkan',
      body: 'Datang tepat waktu. Pembatalan mandiri dapat dilakukan sampai 2 jam sebelum mulai. Slot langsung tersedia kembali untuk orang lain dan perubahan tercatat di audit log.'
    }
  ];

  const rules = [
    ['Durasi maksimum', '4 jam per reservasi (dapat berbeda per ruangan).'],
    ['Reservasi aktif', 'Maksimal 3 per pengguna pada satu waktu.'],
    ['Kapasitas', 'Jumlah peserta tidak boleh melebihi kapasitas ruangan.'],
    ['Jam operasional', 'Reservasi harus berada di dalam jam operasional ruangan.'],
    ['Masa lalu', 'Waktu mulai yang sudah lewat ditolak.'],
    ['Konflik slot', 'Hanya satu reservasi aktif per slot beririsan; permintaan lain mendapat 409.'],
    ['Kedaluwarsa', 'Pengajuan tanpa keputusan menjadi Kedaluwarsa setelah 2 hari kerja atau sebelum mulai.'],
    ['Privasi', 'Kalender publik tidak menampilkan nama atau identitas pribadi pemesan.']
  ];

  return `
  <div class="page-head">
    <div class="wrap">
      <p class="eyebrow">Panduan penggunaan</p>
      <h1>Panduan Layanan SiRuang</h1>
      <p class="page-lede">SiRuang membantu civitas IDB Bali mengajukan, memantau, dan membatalkan peminjaman ruangan tanpa bentrok. Berikut alur dan aturan yang berlaku pada rilis 1.0.</p>
      <div class="guide-head-actions">
        <a class="btn btn-primary" href="/">${icon('grid', 16)} Daftar ruangan</a>
        <a class="btn btn-quiet" href="/kalender">${icon('calendar', 16)} Jadwal ruangan</a>
      </div>
    </div>
  </div>

  <div class="wrap guide-layout">
    <div class="guide-main">
      <section class="panel">
        <div class="panel-head"><div><p class="eyebrow eyebrow-tight">Alur utama</p><h2>Dari cek slot sampai ruang dipakai</h2></div></div>
        <ol class="guide-step-list">
          ${steps
            .map(
              (step) => `<li>
                <span class="guide-step-num">${step.n}</span>
                <div><h3>${esc(step.title)}</h3><p>${esc(step.body)}</p></div>
              </li>`
            )
            .join('')}
        </ol>
      </section>

      <section class="panel">
        <div class="panel-head"><div><p class="eyebrow eyebrow-tight">Aturan</p><h2>Yang perlu diperhatikan</h2></div></div>
        <dl class="guide-rules">
          ${rules
            .map(
              ([term, body]) => `<div><dt>${esc(term)}</dt><dd>${esc(body)}</dd></div>`
            )
            .join('')}
        </dl>
      </section>

      <section class="panel">
        <div class="panel-head"><div><p class="eyebrow eyebrow-tight">Status</p><h2>Arti badge reservasi</h2></div></div>
        <ul class="guide-status-list">
          <li>${statusBadge('Diajukan')}<span>Slot ditahan, menunggu keputusan pengelola.</span></li>
          <li>${statusBadge('Disetujui')}<span>Slot dialokasikan eksklusif dan siap dipakai.</span></li>
          <li>${statusBadge('Ditolak')}<span>Pengajuan ditolak; alasan wajib diisi pengelola.</span></li>
          <li>${statusBadge('Dibatalkan')}<span>Dibatalkan pemohon atau pengelola; slot kembali tersedia.</span></li>
          <li>${statusBadge('Kedaluwarsa')}<span>Melewati batas keputusan; slot kembali tersedia.</span></li>
          <li>${statusBadge('Selesai')}<span>Waktu pemakaian sudah berakhir.</span></li>
        </ul>
      </section>

      <section class="panel">
        <div class="panel-head"><div><p class="eyebrow eyebrow-tight">Pengelola</p><h2>Menyetujui, menolak, dan memblokir</h2></div></div>
        <p class="guide-copy">Pengelola ruangan melihat antrean pengajuan untuk ruangan yang dikelola. Penolakan dan pembatalan wajib beralasan. Blokir jadwal untuk kuliah, perawatan, atau acara resmi yang beririsan dengan reservasi aktif meminta konfirmasi dan memberi tahu pemohon.</p>
        <p class="guide-copy">Admin sistem mengelola pengguna, peran, dan master ruangan. Semua perubahan penting tercatat di audit log append-only.</p>
      </section>
    </div>

    <aside class="guide-aside">
      <div class="panel guide-contact">
        <p class="eyebrow eyebrow-tight">Butuh bantuan?</p>
        <h2>Hubungi pengelola</h2>
        <p>Untuk penjadwalan khusus, perubahan slot, atau bentrok jadwal, hubungi pengelola ruangan terkait.</p>
        <a class="btn btn-primary btn-block" href="mailto:dedi@idbbali.ac.id">${icon('mail', 16)} Biro Sarana Prasarana</a>
        <a class="btn btn-quiet btn-block" href="mailto:admin@idbbali.ac.id">${icon('mail', 16)} Admin SiRuang</a>
        <p class="inline-note">${icon('shield', 14)} Jangan kirim kata sandi melalui email. Sistem tidak menyimpan password pengguna.</p>
      </div>
      <div class="panel">
        <p class="eyebrow eyebrow-tight">Waktu &amp; zona</p>
        <h2>WITA (UTC+8)</h2>
        <p class="guide-copy">Semua waktu disimpan dalam UTC dan ditampilkan dalam WITA, sehingga konsisten di perangkat mana pun.</p>
        <p class="guide-copy">Jam layanan pengelola: Senin–Jumat 08.30–17.30, Sabtu 08.30–14.00 WITA.</p>
      </div>
      <div class="panel">
        <p class="eyebrow eyebrow-tight">Rilis 1.0</p>
        <h2>Di luar cakupan</h2>
        <p class="guide-copy">Pembayaran, inventaris alat, check-in QR, reservasi berulang, dan aplikasi native belum termasuk pada rilis ini.</p>
        ${user ? '' : `<a class="btn btn-dark btn-block" href="/masuk?next=%2F">${icon('user', 16)} Masuk / Daftar</a>`}
      </div>
    </aside>
  </div>`;
}

module.exports = { guidePage };
