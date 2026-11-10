'use strict';

const { esc, icon, emptyState } = require('./components');
const { formatDateTime } = require('../time');

function adminPage({ user, users, rooms, audit, stats }) {
  return `
  <div class="page-head">
    <div class="wrap">
      <p class="eyebrow">Panel admin</p>
      <p class="panel-greeting">Hello, ${esc(user.name)}</p>
      <h1>Pengguna, ruangan, audit</h1>
      <p class="page-lede">Perubahan peran dan master ruangan tercatat append-only. Data pribadi seperlunya.</p>
    </div>
  </div>

  <div class="wrap admin-layout">
    <section class="stat-row" aria-label="Ringkasan sistem">
      <div class="stat-card"><span>Pengguna aktif</span><strong>${stats.users}</strong><small>${stats.officers} pengurus · ${stats.managers} pengelola</small></div>
      <div class="stat-card"><span>Ruangan aktif</span><strong>${stats.rooms}</strong><small>${stats.modeFree} bebas · ${stats.modeApproval} persetujuan</small></div>
      <div class="stat-card"><span>Reservasi</span><strong>${stats.reservations}</strong><small>${stats.pending} menunggu · ${stats.conflicts} konflik tercatat</small></div>
      <div class="stat-card"><span>Notifikasi gagal</span><strong>${stats.failedNotifications}</strong><small>tidak membatalkan reservasi</small></div>
    </section>

    <section class="panel">
      <div class="panel-head"><div><p class="eyebrow eyebrow-tight">Akses</p><h2>Pengguna &amp; peran</h2></div><span class="panel-meta">${users.length} akun</span></div>
      <div class="table-wrap">
        <table class="data-table admin-table">
          <caption class="sr-only">Daftar pengguna dan peran</caption>
          <thead><tr><th scope="col">Nama</th><th scope="col">Email</th><th scope="col">Unit / organisasi</th><th scope="col">Peran</th><th scope="col">Status</th></tr></thead>
          <tbody>
            ${users
              .map(
                (u) => `<tr data-user-id="${u.id}">
                  <th scope="row">${esc(u.name)}</th>
                  <td>${esc(u.email)}</td>
                  <td>${esc(u.org_name || u.unit || '-')}</td>
                  <td>
                    <label class="sr-only" for="role-${u.id}">Peran ${esc(u.name)}</label>
                    <select id="role-${u.id}" class="table-select" data-role-select="${u.id}">
                      ${['pemohon', 'pengurus', 'pengelola', 'admin']
                        .map((role) => `<option value="${role}" ${u.role === role ? 'selected' : ''}>${role === 'pemohon' ? 'Pemohon' : role === 'pengurus' ? 'Pengurus' : role === 'pengelola' ? 'Pengelola' : 'Admin'}</option>`)
                        .join('')}
                    </select>
                  </td>
                  <td>
                    <label class="switch">
                      <input type="checkbox" data-active-toggle="${u.id}" ${u.active ? 'checked' : ''}>
                      <span class="switch-track" aria-hidden="true"></span>
                      <span class="sr-only">Aktifkan ${esc(u.name)}</span>
                    </label>
                  </td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <p class="inline-note">${icon('shield', 14)} Setiap perubahan peran dan status akun masuk audit log dengan pelaku dan waktu.</p>
    </section>

    <section class="panel">
      <div class="panel-head"><div><p class="eyebrow eyebrow-tight">Master data</p><h2>Ruangan</h2></div><span class="panel-meta">${rooms.length} ruangan</span></div>
      <div class="table-wrap">
        <table class="data-table admin-table">
          <caption class="sr-only">Master ruangan</caption>
          <thead><tr><th scope="col">Ruangan</th><th scope="col">Kapasitas</th><th scope="col">Mode</th><th scope="col">Pengelola</th><th scope="col">Aktif</th></tr></thead>
          <tbody>
            ${rooms
              .map(
                (r) => `<tr data-room-id="${r.id}">
                  <th scope="row">${esc(r.name)}<small>${esc(r.building)} · ${esc(r.floor)}</small></th>
                  <td><input class="table-input" type="number" min="1" max="500" value="${r.capacity}" data-capacity-input="${r.id}" aria-label="Kapasitas ${esc(r.name)}"></td>
                  <td>
                    <select class="table-select" data-mode-select="${r.id}" aria-label="Mode ${esc(r.name)}">
                      <option value="persetujuan" ${r.mode === 'persetujuan' ? 'selected' : ''}>persetujuan</option>
                      <option value="bebas" ${r.mode === 'bebas' ? 'selected' : ''}>bebas</option>
                    </select>
                  </td>
                  <td>${esc(r.manager_name)}</td>
                  <td>
                    <label class="switch"><input type="checkbox" data-room-active="${r.id}" ${r.active ? 'checked' : ''}><span class="switch-track" aria-hidden="true"></span><span class="sr-only">Aktifkan ${esc(r.name)}</span></label>
                  </td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><div><p class="eyebrow eyebrow-tight">Jejak audit</p><h2>Audit log</h2></div><span class="panel-meta">${audit.length} entri terakhir</span></div>
      ${audit.length
        ? `<div class="table-wrap">
            <table class="data-table audit-table">
              <caption class="sr-only">Audit log sistem</caption>
              <thead><tr><th scope="col">Waktu</th><th scope="col">Pelaku</th><th scope="col">Aksi</th><th scope="col">Objek</th><th scope="col">Alasan</th></tr></thead>
              <tbody>
                ${audit
                  .map(
                    (a) => `<tr>
                      <td class="nowrap">${formatDateTime(a.created_at)}</td>
                      <td>${esc(a.actor_label)}</td>
                      <td><span class="audit-action">${esc(a.action)}</span></td>
                      <td class="mono">${esc(a.object_type)} · ${esc(a.object_id)}</td>
                      <td>${esc(a.reason || '-')}</td>
                    </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>`
        : emptyState({ title: 'Audit log kosong', body: 'Aksi pengguna dan pengelola akan tercatat di sini.' })}
      <p class="inline-note">${icon('shield', 14)} Audit log append-only: update dan delete ditolak oleh trigger database.</p>
    </section>
  </div>`;
}

module.exports = { adminPage };
