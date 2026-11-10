'use strict';

const {
  esc,
  icon,
  statusBadge,
  roomArt,
  stepper,
  fieldError,
  invalidAttr,
  describeAttr,
  emptyState,
  ROLE_LABEL,
  formatRange
} = require('./components');
const {
  formatDate,
  formatDateTime,
  formatTime,
  utcToWitaInput,
  todayWitaKey
} = require('../time');

function bookingPage({ user, room, prefill, org, suggestions = [] }) {
  const startInput = utcToWitaInput(prefill.startAt) || `${prefill.dateKey}T09:00`;
  const endInput = utcToWitaInput(prefill.endAt) || `${prefill.dateKey}T11:00`;
  const canOrg = user.is_officer && user.org_id && org;
  return `
  <div class="page-head page-head-form">
    <div class="wrap">
      <p class="eyebrow">Formulir reservasi</p>
      <h1>Ajukan ${esc(room.name)}</h1>
      <p class="page-lede">${esc(room.building)}, ${esc(room.floor)} · ${room.capacity} orang · maksimal ${room.max_hours} jam</p>
      ${stepper(1, ['Slot', 'Detail', 'Konfirmasi', 'Selesai'])}
    </div>
  </div>

  <div class="wrap booking-layout">
    <form class="booking-form" id="booking-form" novalidate>
      <div class="form-alert" id="form-alert" role="alert" hidden></div>

      <section class="step-panel is-active" data-step="1" aria-labelledby="step-1-title">
        <div class="step-head">
          <span class="step-kicker">Langkah 01</span>
          <h2 id="step-1-title">Pilih slot</h2>
          <p>Slot dicek ulang di server saat konfirmasi. Jika baru saja diambil orang lain, kamu akan mendapat opsi slot terdekat.</p>
        </div>
        <div class="field">
          <label for="r-date">Tanggal</label>
          <input id="r-date" name="date" type="date" value="${esc(prefill.dateKey)}" min="${todayWitaKey()}" required>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="r-start">Mulai</label>
            <input id="r-start" name="start" type="time" step="900" value="${esc(startInput.slice(11, 16))}" required>
          </div>
          <div class="field">
            <label for="r-end">Selesai</label>
            <input id="r-end" name="end" type="time" step="900" value="${esc(endInput.slice(11, 16))}" required>
          </div>
        </div>
        <div class="field">
          <label for="r-participants">Jumlah peserta</label>
          <input id="r-participants" name="participants" type="number" min="1" max="${room.capacity}" value="${esc(prefill.participants || 10)}" required>
          <p class="field-hint">Kapasitas ruangan ${room.capacity} orang.</p>
        </div>
        <div id="slot-status" class="slot-status" role="status" aria-live="polite"></div>
        ${suggestions.length ? `<div class="slot-suggestions" id="slot-suggestions">
          <p class="field-hint">Slot terdekat yang kosong:</p>
          <div class="chip-row">${suggestions
            .slice(0, 4)
            .map((s) => `<button type="button" class="chip chip-button" data-suggest-start="${esc(s.startAt)}" data-suggest-end="${esc(s.endAt)}" data-suggest-date="${esc(s.startAt.slice(0, 10))}">${esc(formatDate(s.startAt, { short: true }))} · ${esc(formatTime(s.startAt))}–${esc(formatTime(s.endAt))}</button>`)
            .join('')}</div>
        </div>` : ''}
        <div class="step-actions">
          <button class="btn btn-primary" type="button" data-next-step="2">Lanjut ke detail ${icon('arrow', 16)}</button>
          <button class="btn btn-quiet" type="button" id="check-slot">${icon('clock', 16)} Cek slot ini</button>
        </div>
      </section>

      <section class="step-panel" data-step="2" aria-labelledby="step-2-title" hidden>
        <div class="step-head">
          <span class="step-kicker">Langkah 02</span>
          <h2 id="step-2-title">Detail kegiatan</h2>
          <p>Data ini dipakai pengelola untuk memutuskan. Nama pemesan tidak tampil di kalender publik.</p>
        </div>
        <div class="field">
          <label for="r-org">Nama organisasi mahasiswa <span class="label-optional">(opsional)</span></label>
          <input id="r-org" name="organizationName" type="text" maxlength="120" value="${canOrg ? esc(org.name) : ''}" placeholder="Contoh: BEM IDB Bali">
          <p class="field-hint">Kosongkan jika peminjaman atas nama pribadi.</p>
        </div>
        <div class="field">
          <label for="r-activity">Nama kegiatan</label>
          <input id="r-activity" name="activityName" type="text" maxlength="120" placeholder="Contoh: Kerja kelompok riset visual" required>
        </div>
        <div class="field">
          <label for="r-additional">Peminjaman tambahan <span class="label-optional">(opsional)</span></label>
          <textarea id="r-additional" name="additionalBorrowing" rows="2" maxlength="300" placeholder="Contoh: 2 microphone, kursi tambahan, meja registrasi."></textarea>
          <p class="field-hint">Permintaan ini dikonfirmasi pengelola, bukan inventaris otomatis.</p>
        </div>
        <div class="field">
          <label for="r-notes">Catatan untuk pengelola <span class="label-optional">(opsional)</span></label>
          <textarea id="r-notes" name="notes" rows="3" maxlength="500" placeholder="Kebutuhan teknis, susunan acara, atau info lain."></textarea>
        </div>
        <div class="field">
          <label class="check-line">
            <input type="checkbox" name="isPublic" id="r-public">
            <span><strong>Tampilkan sebagai kegiatan publik</strong><small>Judul dan deskripsi tampil di kalender kampus setelah disetujui dan dimoderasi. Nama pemesan tetap tersembunyi.</small></span>
          </label>
        </div>
        <div class="field" id="public-desc-wrap" hidden>
          <label for="r-public-desc">Deskripsi publik</label>
          <textarea id="r-public-desc" name="publicDescription" rows="3" maxlength="600" placeholder="Deskripsi singkat kegiatan untuk kalender kampus."></textarea>
        </div>
        <div class="step-actions">
          <button class="btn btn-quiet" type="button" data-prev-step="1">${icon('arrow', 16)} Kembali</button>
          <button class="btn btn-primary" type="button" data-next-step="3">Lanjut ke konfirmasi ${icon('arrow', 16)}</button>
        </div>
      </section>

      <section class="step-panel" data-step="3" aria-labelledby="step-3-title" hidden>
        <div class="step-head">
          <span class="step-kicker">Langkah 03</span>
          <h2 id="step-3-title">Konfirmasi</h2>
          <p>Periksa ringkasan. Setelah dikirim, sistem mengecek ketersediaan sekali lagi dalam transaksi database.</p>
        </div>
        <dl class="review-list" id="review-list"></dl>
        <div class="field">
          <label class="check-line">
            <input type="checkbox" name="agree" id="r-agree" required>
            <span><strong>Saya menyetujui aturan ruangan</strong><small>${room.rules.map((r) => esc(r)).join(' · ')}</small></span>
          </label>
        </div>
        <div class="step-actions">
          <button class="btn btn-quiet" type="button" data-prev-step="2">${icon('arrow', 16)} Kembali</button>
          <button class="btn btn-primary" type="submit" id="submit-booking">Kirim pengajuan ${icon('arrow', 16)}</button>
        </div>
        <p class="submit-note" id="submit-note">${icon('shield', 14)} Permintaan memakai Idempotency-Key, jadi klik ganda tidak membuat reservasi ganda.</p>
      </section>

      <section class="step-panel step-success" data-step="4" aria-labelledby="step-4-title" hidden>
        <div class="success-mark" aria-hidden="true">${icon('check', 30)}</div>
        <span class="step-kicker">Langkah 04</span>
        <h2 id="step-4-title">Reservasi diterima</h2>
        <p id="success-message">Reservasi diajukan. Menunggu persetujuan.</p>
        <div class="success-id" id="success-id"></div>
        <div class="success-actions">
          <a class="btn btn-primary" href="/reservasi-saya">Lihat reservasi saya ${icon('arrow', 16)}</a>
          <a class="btn btn-quiet" href="/cari">Cari ruangan lain</a>
        </div>
      </section>
    </form>

    <aside class="booking-summary" aria-label="Ringkasan reservasi">
      <div class="summary-art">${room.photo ? `<img src="${esc(room.photo)}" alt="" loading="lazy" decoding="async" width="400" height="300">` : roomArt(room.art, room.name)}</div>
      <div class="summary-body">
        <span class="summary-kicker">Ringkasan</span>
        <h2>${esc(room.name)}</h2>
        <p class="summary-place">${icon('pin', 14)} ${esc(room.building)} · ${esc(room.floor)}</p>
        <dl class="summary-list">
          <div><dt>Waktu</dt><dd id="sum-time">${formatRange(prefill.startAt, prefill.endAt)}</dd></div>
          <div><dt>Peserta</dt><dd id="sum-participants">${esc(prefill.participants || 10)} orang</dd></div>
          <div><dt>Organisasi</dt><dd id="sum-organization">${canOrg ? esc(org.name) : 'Pribadi'}</dd></div>
          <div><dt>Peminjaman tambahan</dt><dd id="sum-additional">—</dd></div>
          <div><dt>Kegiatan</dt><dd id="sum-activity">Belum diisi</dd></div>
        </dl>
        <div class="summary-rule">
          <span class="badge ${room.mode === 'bebas' ? 'is-approved' : 'is-pending'}">${room.mode === 'bebas' ? 'Disetujui otomatis' : 'Perlu persetujuan'}</span>
          <p>${room.mode === 'bebas' ? 'Slot langsung dialokasikan jika kosong.' : 'Pengelola ruangan akan memutuskan sebelum batas 2 hari kerja.'}</p>
        </div>
        <p class="summary-privacy">${icon('shield', 14)} Nama dan email kamu tidak tampil di kalender publik.</p>
      </div>
    </aside>
  </div>`;
}

function reservationCard(r, { canCancel, cancelNote }) {
  const isActive = ['Diajukan', 'Disetujui'].includes(r.status);
  return `<article class="res-card" data-reservation="${esc(r.public_id)}">
    <div class="res-card-head">
      <span class="res-id">${esc(r.public_id)}</span>
      ${statusBadge(r.status)}
    </div>
    <h3 class="res-title">${esc(r.activity_name)}</h3>
    <p class="res-room">${esc(r.room_name)} · ${esc(r.building)} · ${esc(r.floor)}</p>
    <dl class="res-facts">
      <div><dt>${icon('calendar', 14)} Waktu</dt><dd>${formatRange(r.start_at, r.end_at)}</dd></div>
      <div><dt>${icon('users', 14)} Peserta</dt><dd>${r.participants} orang</dd></div>
      <div><dt>${icon('user', 14)} Organisasi</dt><dd>${esc(r.organization_name || r.registered_organization_name || 'Pribadi')}</dd></div>
    </dl>
    ${r.additional_borrowing ? `<p class="res-reason"><strong>Peminjaman tambahan:</strong> ${esc(r.additional_borrowing)}</p>` : ''}
    ${r.decision_reason ? `<p class="res-reason"><strong>Catatan keputusan:</strong> ${esc(r.decision_reason)}</p>` : ''}
    <div class="res-actions">
      ${isActive && canCancel ? `<button class="btn btn-danger btn-sm" type="button" data-cancel-id="${esc(r.public_id)}" data-cancel-title="${esc(r.activity_name)}">Batalkan</button>` : ''}
      ${isActive && !canCancel ? `<span class="res-note">${esc(cancelNote || '')}</span>` : ''}
      ${r.room_slug ? `<a class="btn btn-quiet btn-sm" href="/ruangan/${esc(r.room_slug)}">Lihat ruangan</a>` : ''}
    </div>
  </article>`;
}

function myReservationsPage({ user, reservations, filter, counts }) {
  const filters = [
    ['all', 'Semua', counts.all],
    ['aktif', 'Aktif', counts.active],
    ['riwayat', 'Riwayat', counts.history]
  ];
  const now = Date.now();
  return `
  <div class="page-head">
    <div class="wrap">
      <div class="page-head-row">
        <div>
          <p class="eyebrow">Reservasi saya</p>
          <h1>Jejak pemesanan kamu</h1>
          <p class="page-lede">Status, alasan keputusan, dan pembatalan mandiri dalam satu daftar.</p>
        </div>
        <a class="btn btn-primary" href="/cari">${icon('plus', 16)} Reservasi baru</a>
      </div>
      <div class="filter-tabs" role="tablist" aria-label="Filter reservasi">
        ${filters.map(([key, label, count]) => `<a role="tab" aria-selected="${filter === key}" class="filter-tab${filter === key ? ' is-active' : ''}" href="/reservasi-saya${key === 'all' ? '' : `?status=${key}`}">${label} <span>${count}</span></a>`).join('')}
      </div>
    </div>
  </div>
  <div class="wrap">
    ${reservations.length
      ? `<h2 class="sr-only">Daftar reservasi</h2><div class="res-grid">${reservations
          .map((r) => {
            const isActive = ['Diajukan', 'Disetujui'].includes(r.status);
            const cutoff = new Date(r.start_at).getTime() - 2 * 60 * 60 * 1000;
            const canCancel = isActive && now < cutoff;
            const cancelNote = isActive && now >= cutoff ? 'Batas batal 2 jam sebelum mulai sudah lewat.' : '';
            return reservationCard(r, { canCancel, cancelNote });
          })
          .join('')}</div>`
      : emptyState({
          title: filter === 'riwayat' ? 'Belum ada riwayat' : 'Belum ada reservasi',
          body: 'Mulai dari mencari slot kosong. Status dan alasan keputusan akan muncul di sini.',
          action: `<a class="btn btn-primary" href="/cari">Cari ruangan ${icon('arrow', 16)}</a>`
        })}
  </div>

  <dialog class="modal" id="cancel-dialog" aria-labelledby="cancel-title">
    <form method="dialog" class="modal-close-form"><button class="icon-btn" value="cancel" aria-label="Tutup dialog">${icon('x', 18)}</button></form>
    <div class="modal-body">
      <span class="step-kicker">Konfirmasi pembatalan</span>
      <h2 id="cancel-title">Batalkan reservasi?</h2>
      <p id="cancel-copy">Slot akan langsung tersedia kembali untuk orang lain. Tindakan ini tercatat di audit log.</p>
      <div class="form-alert" id="cancel-alert" role="alert" hidden></div>
    </div>
    <div class="modal-actions">
      <form method="dialog"><button class="btn btn-quiet">Pertahankan</button></form>
      <button class="btn btn-danger" type="button" id="confirm-cancel">Ya, batalkan</button>
    </div>
  </dialog>`;
}

function akunPage({ user, notifications, session }) {
  return `
  <div class="page-head">
    <div class="wrap">
      <p class="eyebrow">Akun</p>
      <h1>${esc(user.name)}</h1>
      <p class="page-lede">${esc(user.email)} · ${esc(ROLE_LABEL[user.role] || user.role)}${user.unit ? ` · ${esc(user.unit)}` : ''}</p>
    </div>
  </div>
  <div class="wrap account-grid">
    <section class="panel">
      <div class="panel-head"><h2>Profil &amp; sesi</h2></div>
      <dl class="profile-list">
        <div><dt>Nama</dt><dd>${esc(user.name)}</dd></div>
        <div><dt>Email kampus</dt><dd>${esc(user.email)}</dd></div>
        <div><dt>Peran</dt><dd>${esc(ROLE_LABEL[user.role] || user.role)}</dd></div>
        <div><dt>Unit / organisasi</dt><dd>${esc(user.unit || '-')}</dd></div>
        <div><dt>Sesi berakhir</dt><dd>${formatDateTime(session.expires_at)}</dd></div>
      </dl>
      <div class="panel-actions">
        <a class="btn btn-quiet" href="/reservasi-saya">Reservasi saya</a>
        <form method="post" action="/api/auth/logout"><button class="btn btn-danger" type="submit">${icon('logout', 16)} Keluar</button></form>
      </div>
      <p class="inline-note">${icon('shield', 14)} Sesi disimpan sebagai hash dan berakhir setelah 12 jam tidak aktif. Sistem tidak menyimpan password.</p>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Notifikasi</h2><span class="panel-meta">${notifications.length} terakhir</span></div>
      ${notifications.length
        ? `<ul class="notification-list">${notifications
            .map(
              (n) => `<li class="notification-item">
                <span class="notif-icon ${n.status === 'gagal' ? 'is-failed' : ''}">${icon(n.status === 'gagal' ? 'alert' : 'mail', 16)}</span>
                <div class="notif-body">
                  <strong>${esc(n.subject)}</strong>
                  <p>${esc(n.body)}</p>
                  <span class="notif-meta">${formatDateTime(n.created_at)} · ${n.status === 'gagal' ? 'Gagal kirim (tidak membatalkan reservasi)' : 'Email mock terkirim'}</span>
                </div>
              </li>`
            )
            .join('')}</ul>`
        : emptyState({ title: 'Belum ada notifikasi', body: 'Notifikasi reservasi akan muncul di sini.' })}
    </section>
  </div>`;
}

function loginPage({ accounts, next, error, lockedUntil, mode = 'user', prefillLogin = '', demoPassword = 'idb12345' }) {
  const isAdminMode = mode === 'admin';
  const action = isAdminMode ? '/masuk/admin' : '/masuk';
  const target = isAdminMode ? (next || '/admin') : (next || '/dashboard');
  const visibleAccounts = isAdminMode
    ? accounts.filter((account) => account.role === 'admin')
    : accounts;
  return `
  <div class="auth-card">
    <a class="auth-logo" href="/" aria-label="IDB Bali, beranda">
      <img src="/brand/idb-bali-logo-full.png" alt="IDB Bali — Institut Desain dan Bisnis Bali" width="813" height="532">
    </a>
    <div class="auth-heading">
      <h1 class="auth-app">SiRuang</h1>
      <p class="auth-category">${isAdminMode ? 'Masuk Admin' : 'Masuk Akun'}</p>
      <p class="auth-help">${isAdminMode
        ? 'Hanya akun dengan peran admin yang dapat masuk.'
        : 'Gunakan Email/NIM kampus dan password untuk melanjutkan.'}</p>
    </div>

    ${error ? `<div class="form-alert auth-error" role="alert">${icon('alert', 16)} ${esc(error)}</div>` : ''}
    ${lockedUntil ? `<div class="form-alert auth-error" role="alert">${icon('alert', 16)} Terlalu banyak percobaan. Coba lagi dalam ${esc(lockedUntil)} detik.</div>` : ''}

    <form method="post" action="${action}" class="auth-form" data-login-form>
      <input type="hidden" name="next" value="${esc(target)}">
      <div class="auth-field">
        <label class="sr-only" for="login">Email / NIM</label>
        <span class="auth-input-icon" aria-hidden="true">${icon('user', 19)}</span>
        <input id="login" name="login" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" inputmode="email" required value="${esc(prefillLogin)}" placeholder="Email / NIM">
      </div>
      <div class="auth-field">
        <label class="sr-only" for="password">Password</label>
        <span class="auth-input-icon" aria-hidden="true">${icon('lock', 19)}</span>
        <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Password">
        <button type="button" class="auth-eye" data-toggle-password aria-controls="password" aria-pressed="false" aria-label="Tampilkan password">
          <span class="eye-on" aria-hidden="true">${icon('eye', 19)}</span>
          <span class="eye-off" aria-hidden="true">${icon('eyeOff', 19)}</span>
        </button>
      </div>
      <a class="auth-forgot" href="mailto:admin@idbbali.ac.id?subject=${encodeURIComponent('Bantuan akun SiRuang')}">${isAdminMode ? 'Lupa password admin?' : 'Lupa Email/NIM atau password?'}</a>
      <button class="auth-submit login-submit" type="submit">Masuk Sekarang</button>
    </form>

    <details class="auth-demo">
      <summary>Akun demo &amp; password</summary>
      <p class="demo-password">Password demo: <code>${esc(demoPassword)}</code></p>
      <ul>
        ${visibleAccounts
          .map(
            (account) => `<li>
              <span class="demo-copy"><strong>${esc(account.name)}</strong><small>${esc(account.email)} · ${esc(account.nim || '-')} · ${esc(ROLE_LABEL[account.role] || account.role)}</small></span>
              <button type="button" class="btn btn-ghost btn-sm" data-demo-login="${esc(account.email)}" data-demo-password="${esc(demoPassword)}">Isi</button>
            </li>`
          )
          .join('')}
      </ul>
    </details>
  </div>

  <div class="auth-switch">
    ${isAdminMode
      ? `<a href="/masuk">${icon('user', 15)} Masuk sebagai pengguna</a>`
      : `<a href="/masuk/admin">${icon('shield', 15)} Masuk sebagai admin</a>`}
  </div>
  <a class="auth-back" href="/">← Kembali ke beranda</a>`;
}

module.exports = { bookingPage, myReservationsPage, akunPage, loginPage, reservationCard };
