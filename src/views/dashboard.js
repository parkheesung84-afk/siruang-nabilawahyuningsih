'use strict';

const { esc, icon, statusBadge, emptyState } = require('./components');
const { formatDate, formatRange, formatTime, nowIso } = require('../time');

function dashboardPage({
  user,
  reservations,
  active,
  pending,
  approved,
  completed,
  upcoming,
  notifications,
  events,
  queueCount,
  managedRooms,
  adminStats
}) {
  const isManager = user.role === 'pengelola' || user.role === 'admin';
  const isAdmin = user.role === 'admin';
  const actions = [
    { href: '/cari', icon: 'search', title: 'Cari ruangan', copy: 'Filter tanggal, jam, kapasitas, dan fasilitas.' },
    { href: '/reservasi/baru', icon: 'plus', title: 'Form pinjam', copy: 'Ajukan reservasi ruangan baru.' },
    { href: '/reservasi-saya', icon: 'ticket', title: 'Reservasi saya', copy: 'Pantau status dan batalkan reservasi.' },
    { href: '/kalender', icon: 'calendar', title: 'Jadwal ruangan', copy: 'Lihat agenda dan ruang terpakai.' }
  ];

  return `
  <section class="dashboard-hero">
    <div class="wrap">
      <div class="dashboard-head">
        <div>
          <p class="eyebrow"><span class="eyebrow-dot" aria-hidden="true"></span> Dashboard</p>
          <h1>Hello, ${esc(user.name)}</h1>
          <p class="page-lede">Selamat datang kembali. Ini ringkasan reservasi dan aktivitas kamu di SiRuang.</p>
        </div>
        <div class="dashboard-date">
          <span class="dash-date-day">${esc(formatDate(nowIso()))}</span>
          <span>${esc(formatTime(nowIso()))} WITA</span>
        </div>
      </div>

      <div class="dash-actions">
        ${actions
          .map(
            (action) => `<a class="dash-action" href="${action.href}">
              <span class="dash-action-icon">${icon(action.icon, 20)}</span>
              <span class="dash-action-copy"><strong>${esc(action.title)}</strong><small>${esc(action.copy)}</small></span>
              ${icon('arrow', 16)}
            </a>`
          )
          .join('')}
      </div>
    </div>
  </section>

  <div class="wrap dashboard-body">
    <div class="dash-stats">
      <div class="stat-card"><span>Reservasi aktif</span><strong>${active.length}</strong><small>Diajukan + disetujui</small></div>
      <div class="stat-card"><span>Menunggu keputusan</span><strong>${pending.length}</strong><small>Dalam antrean pengelola</small></div>
      <div class="stat-card"><span>Disetujui</span><strong>${approved.length}</strong><small>Siap dipakai</small></div>
      <div class="stat-card"><span>Selesai</span><strong>${completed.length}</strong><small>Riwayat pemakaian</small></div>
    </div>

    <div class="dash-grid">
      <section class="panel">
        <div class="panel-head">
          <div><p class="eyebrow eyebrow-tight">Reservasi</p><h2>Jadwal mendatang</h2></div>
          <a class="text-link" href="/reservasi-saya">Semua ${icon('arrow', 14)}</a>
        </div>
        ${upcoming.length
          ? `<ul class="dash-res-list">${upcoming
              .map(
                (r) => `<li>
                  <div class="dash-res-main">
                    <div class="dash-res-top"><span class="res-id">${esc(r.public_id)}</span>${statusBadge(r.status)}</div>
                    <strong>${esc(r.activity_name)}</strong>
                    <span>${esc(r.room_name)} · ${formatRange(r.start_at, r.end_at)}</span>
                    ${r.organization_name ? `<small>${esc(r.organization_name)}</small>` : ''}
                  </div>
                  <a class="icon-btn" href="/ruangan/${esc(r.room_slug)}" aria-label="Lihat ${esc(r.room_name)}">${icon('arrow', 16)}</a>
                </li>`
              )
              .join('')}</ul>`
          : emptyState({
              title: 'Belum ada jadwal mendatang',
              body: 'Cari ruangan yang kosong lalu ajukan reservasi pertamamu.',
              action: `<a class="btn btn-primary" href="/cari">Cari ruangan ${icon('arrow', 16)}</a>`
            })}
        ${reservations.length ? `<p class="inline-note">${icon('info', 14)} ${reservations.length} reservasi tercatat di akun ini.</p>` : ''}
      </section>

      <aside class="dash-side">
        <section class="panel">
          <div class="panel-head">
            <div><p class="eyebrow eyebrow-tight">Notifikasi</p><h2>Terbaru</h2></div>
            <a class="text-link" href="/akun">Semua</a>
          </div>
          ${notifications.length
            ? `<ul class="dash-notif-list">${notifications
                .map(
                  (n) => `<li>
                    <span class="notif-icon ${n.status === 'gagal' ? 'is-failed' : ''}">${icon(n.status === 'gagal' ? 'alert' : 'mail', 15)}</span>
                    <div><strong>${esc(n.subject)}</strong><span>${esc(n.body)}</span><small>${esc(formatDate(n.created_at, { short: true }))} · ${esc(formatTime(n.created_at))} WITA</small></div>
                  </li>`
                )
                .join('')}</ul>`
            : `<p class="inline-note">Belum ada notifikasi.</p>`}
        </section>

        <section class="panel">
          <div class="panel-head"><div><p class="eyebrow eyebrow-tight">Agenda</p><h2>Kegiatan kampus</h2></div><a class="text-link" href="/kalender">Kalender</a></div>
          ${events.length
            ? `<ul class="dash-event-list">${events
                .slice(0, 3)
                .map(
                  (e) => `<li>
                    <span class="dash-event-date">${esc(formatDate(e.start_at, { short: true }))}</span>
                    <strong>${esc(e.title)}</strong>
                    <span>${esc(formatTime(e.start_at))}–${esc(formatTime(e.end_at))} WITA · ${esc(e.room_name)}</span>
                  </li>`
                )
                .join('')}</ul>`
            : `<p class="inline-note">Belum ada kegiatan publik minggu ini.</p>`}
        </section>
      </aside>
    </div>

    ${isManager
      ? `<section class="panel dash-role">
          <div class="panel-head"><div><p class="eyebrow eyebrow-tight">${isAdmin ? 'Administrasi' : 'Pengelolaan'}</p><h2>${isAdmin ? 'Panel admin' : 'Antrean pengelola'}</h2></div>
          <a class="btn btn-primary btn-sm" href="${isAdmin ? '/admin' : '/pengelola'}">${isAdmin ? 'Buka panel admin' : 'Buka panel pengelola'} ${icon('arrow', 15)}</a></div>
          <div class="dash-role-stats">
            ${
              isAdmin
                ? `<div><strong>${adminStats.users}</strong><span>pengguna aktif</span></div>
                   <div><strong>${adminStats.rooms}</strong><span>ruangan aktif</span></div>
                   <div><strong>${adminStats.reservations}</strong><span>reservasi</span></div>
                   <div><strong>${adminStats.pending}</strong><span>menunggu</span></div>`
                : `<div><strong>${queueCount}</strong><span>pengajuan menunggu</span></div>
                   <div><strong>${managedRooms.length}</strong><span>ruangan dikelola</span></div>`
            }
          </div>
          ${!isAdmin && managedRooms.length
            ? `<p class="inline-note">${icon('pin', 14)} ${managedRooms.map((r) => esc(r.name)).join(' · ')}</p>`
            : ''}
        </section>`
      : ''}
  </div>`;
}

module.exports = { dashboardPage };
