'use strict';

const {
  esc,
  icon,
  statusBadge,
  roomArt,
  dialog,
  emptyState,
  formatRange
} = require('./components');
const { formatDate, formatDateTime, formatTime, utcToWitaInput, todayWitaKey } = require('../time');

function queueCard(r) {
  return `<article class="queue-card" data-queue-id="${esc(r.public_id)}">
    <div class="queue-main">
      <div class="queue-top">
        <span class="res-id">${esc(r.public_id)}</span>
        ${statusBadge(r.status)}
        ${r.is_public ? '<span class="badge is-neutral">Publik</span>' : ''}
      </div>
      <h3>${esc(r.activity_name)}</h3>
      <p class="queue-room">${esc(r.room_name)} · ${formatRange(r.start_at, r.end_at)}</p>
      <dl class="queue-facts">
        <div><dt>Pemohon</dt><dd>${esc(r.requester_name)}<small>${esc(r.requester_email)}</small></dd></div>
        <div><dt>Organisasi</dt><dd>${esc(r.organization_name || r.registered_organization_name || 'Pribadi')}</dd></div>
        <div><dt>Peserta</dt><dd>${r.participants} orang</dd></div>
        <div><dt>Diajukan</dt><dd>${formatDateTime(r.created_at)}</dd></div>
      </dl>
      ${r.additional_borrowing ? `<p class="queue-notes"><strong>Peminjaman tambahan:</strong> ${esc(r.additional_borrowing)}</p>` : ''}
      ${r.notes ? `<p class="queue-notes"><strong>Catatan:</strong> ${esc(r.notes)}</p>` : ''}
      ${r.is_public ? `<p class="queue-notes"><strong>Usul publikasi:</strong> ${esc(r.public_description || r.activity_name)}</p>` : ''}
    </div>
    <div class="queue-actions">
      <button class="btn btn-primary btn-sm" type="button" data-approve="${esc(r.public_id)}">${icon('check', 15)} Setujui</button>
      <button class="btn btn-danger btn-sm" type="button" data-reject="${esc(r.public_id)}" data-reject-title="${esc(r.activity_name)}">${icon('x', 15)} Tolak</button>
    </div>
  </article>`;
}

function managerPage({ user, rooms, queue, history, blocks, pendingEvents, report, searchResult, searchQuery }) {
  const managedIds = new Set(rooms.map((r) => r.id));
  return `
  <div class="page-head">
    <div class="wrap">
      <div class="page-head-row">
        <div>
          <p class="eyebrow">Panel pengelola</p>
          <p class="panel-greeting">Hello, ${esc(user.name)}</p>
          <h1>Antrean &amp; jadwal ruangan</h1>
          <p class="page-lede">${rooms.length} ruangan dikelola · ${queue.length} pengajuan menunggu keputusan.</p>
        </div>
        <a class="btn btn-quiet" href="/api/manage/export.csv">${icon('download', 16)} Ekspor CSV</a>
      </div>
      <nav class="subnav" aria-label="Bagian panel">
        <a href="#antrean">Antrean <span>${queue.length}</span></a>
        <a href="#kegiatan">Moderasi <span>${pendingEvents.length}</span></a>
        <a href="#blokir">Blokir</a>
        <a href="#laporan">Laporan</a>
        <a href="#cari">Cari ID</a>
      </nav>
    </div>
  </div>

  <div class="wrap manager-layout">
    <section class="panel" id="antrean">
      <div class="panel-head">
        <div><p class="eyebrow eyebrow-tight">Antrean persetujuan</p><h2>Menunggu keputusan</h2></div>
        <span class="panel-meta">${queue.length} pengajuan</span>
      </div>
      ${queue.length
        ? `<div class="queue-list">${queue.map(queueCard).join('')}</div>`
        : emptyState({ title: 'Antrean bersih', body: 'Tidak ada pengajuan menunggu untuk ruangan yang kamu kelola.' })}
      <p class="inline-note">${icon('clock', 14)} Pengajuan otomatis kedaluwarsa setelah 2 hari kerja atau sebelum waktu mulai.</p>
    </section>

    <section class="panel" id="kegiatan">
      <div class="panel-head">
        <div><p class="eyebrow eyebrow-tight">Kalender publik</p><h2>Moderasi kegiatan</h2></div>
        <span class="panel-meta">${pendingEvents.length} menunggu</span>
      </div>
      ${pendingEvents.length
        ? `<ul class="moderation-list">${pendingEvents
            .map(
              (e) => `<li data-event-id="${e.id}">
                <div class="moderation-copy">
                  <span class="res-id">${esc(e.public_id)}</span>
                  <strong>${esc(e.title)}</strong>
                  <span>${esc(e.room_name)} · ${formatRange(e.start_at, e.end_at)}</span>
                  <p>${esc(e.description || 'Tanpa deskripsi.')}</p>
                </div>
                <div class="moderation-actions">
                  <button class="btn btn-primary btn-sm" type="button" data-publish="${e.id}">${icon('check', 14)} Terbitkan</button>
                  <button class="btn btn-quiet btn-sm" type="button" data-unpublish="${e.id}">${icon('x', 14)} Tolak</button>
                </div>
              </li>`
            )
            .join('')}</ul>`
        : emptyState({ title: 'Tidak ada usulan publikasi', body: 'Usulan kegiatan dari pengurus akan muncul di sini setelah reservasi disetujui.' })}
    </section>

    <section class="panel" id="blokir">
      <div class="panel-head">
        <div><p class="eyebrow eyebrow-tight">Blokir jadwal</p><h2>Tutup slot untuk kuliah atau perawatan</h2></div>
      </div>
      <form class="block-form" id="block-form">
        <div class="field">
          <label for="blk-room">Ruangan</label>
          <select id="blk-room" name="roomId" required>
            ${rooms.map((r) => `<option value="${r.id}">${esc(r.name)} — ${esc(r.building)}</option>`).join('')}
          </select>
        </div>
        <div class="field-row">
          <div class="field"><label for="blk-start">Mulai</label><input id="blk-start" name="start" type="datetime-local" value="${esc(todayWitaKey())}T13:00" required></div>
          <div class="field"><label for="blk-end">Selesai</label><input id="blk-end" name="end" type="datetime-local" value="${esc(todayWitaKey())}T15:00" required></div>
        </div>
        <div class="field">
          <label for="blk-reason">Alasan blokir</label>
          <input id="blk-reason" name="reason" type="text" maxlength="160" placeholder="Contoh: Kuliah tamu / perawatan proyektor" required>
        </div>
        <div class="form-alert" id="block-alert" role="alert" hidden></div>
        <button class="btn btn-dark" type="submit">${icon('plus', 16)} Buat blokir</button>
        <p class="inline-note">Jika beririsan dengan reservasi aktif, sistem meminta konfirmasi dan membatalkan reservasi tersebut dengan alasan blokir.</p>
      </form>
      ${blocks.length
        ? `<ul class="block-list">${blocks
            .map(
              (b) => `<li>
                <div><strong>${esc(b.room_name)}</strong><span>${formatRange(b.start_at, b.end_at)}</span><small>${esc(b.reason)} · oleh ${esc(b.created_by_name)}</small></div>
              </li>`
            )
            .join('')}</ul>`
        : `<p class="inline-note">Belum ada blokir untuk ruangan yang kamu kelola.</p>`}
    </section>

    <section class="panel" id="laporan">
      <div class="panel-head">
        <div><p class="eyebrow eyebrow-tight">Laporan bulan ini</p><h2>Penggunaan ruangan</h2></div>
        <a class="text-link" href="/api/manage/export.csv">Unduh CSV ${icon('download', 14)}</a>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <caption class="sr-only">Laporan penggunaan ruangan bulan ini</caption>
          <thead><tr><th scope="col">Ruangan</th><th scope="col">Disetujui</th><th scope="col">Jam terpakai</th><th scope="col">Dibatalkan</th><th scope="col">Ditolak</th></tr></thead>
          <tbody>
            ${report
              .map(
                (r) => `<tr><th scope="row">${esc(r.name)}<small>${esc(r.building)}</small></th><td>${r.approved || 0}</td><td>${Number(r.hours || 0).toFixed(1)}</td><td>${r.cancelled || 0}</td><td>${r.rejected || 0}</td></tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel" id="cari">
      <div class="panel-head"><div><p class="eyebrow eyebrow-tight">Pencarian</p><h2>Cari reservasi lewat ID</h2></div></div>
      <form class="inline-form" method="get" action="/pengelola">
        <div class="field"><label class="sr-only" for="q-res">ID reservasi</label><input id="q-res" name="q" type="search" placeholder="Contoh: RSV-1A2B3C" value="${esc(searchQuery || '')}"></div>
        <button class="btn btn-primary" type="submit">${icon('search', 16)} Cari</button>
      </form>
      ${searchResult
        ? `<article class="search-result-card">
            <div class="res-card-head"><span class="res-id">${esc(searchResult.public_id)}</span>${statusBadge(searchResult.status)}</div>
            <h3>${esc(searchResult.activity_name)}</h3>
            <p>${esc(searchResult.room_name)} · ${formatRange(searchResult.start_at, searchResult.end_at)}</p>
            <dl class="res-facts">
              <div><dt>Pemohon</dt><dd>${esc(searchResult.requester_name)} (${esc(searchResult.requester_email)})</dd></div>
              <div><dt>Peserta</dt><dd>${searchResult.participants} orang</dd></div>
              <div><dt>Alasan keputusan</dt><dd>${esc(searchResult.decision_reason || '-')}</dd></div>
            </dl>
          </article>`
        : searchQuery
          ? `<p class="inline-note">ID <strong>${esc(searchQuery)}</strong> tidak ditemukan pada ruangan yang kamu kelola.</p>`
          : ''}
    </section>

    <section class="panel">
      <div class="panel-head"><div><p class="eyebrow eyebrow-tight">Riwayat terbaru</p><h2>Keputusan &amp; pembatalan</h2></div></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th scope="col">ID</th><th scope="col">Kegiatan</th><th scope="col">Ruangan</th><th scope="col">Waktu</th><th scope="col">Status</th></tr></thead>
          <tbody>
            ${history
              .map(
                (r) => `<tr><td class="mono">${esc(r.public_id)}</td><td>${esc(r.activity_name)}</td><td>${esc(r.room_name)}</td><td>${formatRange(r.start_at, r.end_at)}</td><td>${statusBadge(r.status)}</td></tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>
  </div>

  ${dialog('reject-dialog', {
    title: 'Tolak pengajuan',
    body: `<p id="reject-copy">Alasan wajib diisi dan akan dikirim ke pemohon.</p>
      <div class="field"><label for="reject-reason">Alasan penolakan</label><textarea id="reject-reason" rows="3" required placeholder="Contoh: Beririsan dengan jadwal kuliah yang sudah terdaftar."></textarea></div>
      <div class="form-alert" id="reject-alert" role="alert" hidden></div>`,
    actions: `<button class="btn btn-quiet" type="button" data-close-dialog="reject-dialog">Batal</button>
      <button class="btn btn-danger" type="button" id="confirm-reject">Tolak pengajuan</button>`
  })}

  ${dialog('block-confirm-dialog', {
    title: 'Blokir beririsan',
    body: `<p>Slot ini beririsan dengan reservasi aktif. Melanjutkan akan membatalkan reservasi tersebut dan mengirim notifikasi ke pemohon.</p>
      <ul class="mini-conflicts" id="block-conflicts"></ul>`,
    actions: `<button class="btn btn-quiet" type="button" data-close-dialog="block-confirm-dialog">Batal</button>
      <button class="btn btn-danger" type="button" id="confirm-block-overlap">Konfirmasi blokir</button>`
  })}`;
}

module.exports = { managerPage };
