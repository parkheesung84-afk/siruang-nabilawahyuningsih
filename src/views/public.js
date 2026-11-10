'use strict';

const {
  esc,
  icon,
  statusBadge,
  roomArt,
  roomFacts,
  facChips,
  emptyState,
  formatRange
} = require('./components');
const {
  formatDate,
  formatTime,
  todayWitaKey,
  addDays,
  startOfWeekWita,
  witaDateKey,
  witaClock,
  durationHours
} = require('../time');

const RAIL_START = 8 * 60;
const RAIL_END = 20 * 60;

function pct(minutes) {
  return ((minutes - RAIL_START) / (RAIL_END - RAIL_START)) * 100;
}

function railSegments(dayStatus) {
  const segments = [];
  for (const item of dayStatus) {
    for (const r of item.reservations) {
      segments.push({
        roomId: item.room.id,
        start: witaClock(r.start_at),
        end: witaClock(r.end_at),
        kind: 'reserved'
      });
    }
    for (const b of item.blocks) {
      segments.push({
        roomId: item.room.id,
        start: witaClock(b.start_at),
        end: witaClock(b.end_at),
        kind: 'blocked'
      });
    }
  }
  return segments;
}

function availabilityRail({ rooms, dayStatus, dateKey }) {
  const segments = railSegments(dayStatus);
  const now = new Date();
  const isToday = dateKey === todayWitaKey();
  const nowMin = isToday ? now.getUTCHours() * 60 + now.getUTCMinutes() + 480 : null;
  const nowPct =
    nowMin && nowMin >= RAIL_START && nowMin <= RAIL_END ? pct(nowMin) : null;

  return `<div class="rail-card">
    <div class="rail-head">
      <div>
        <p class="eyebrow eyebrow-tight">${icon('spark', 13)} Ketersediaan hari ini</p>
        <h2 class="rail-title">${esc(formatDate(dateKey + 'T00:00:00+08:00'))}</h2>
      </div>
      <a class="text-link" href="/cari?date=${dateKey}">Cari slot ${icon('arrow', 14)}</a>
    </div>
    <div class="rail-legend">
      <span><i class="legend-swatch is-free"></i> Kosong</span>
      <span><i class="legend-swatch is-reserved"></i> Terisi</span>
      <span><i class="legend-swatch is-blocked"></i> Blokir</span>
    </div>
    <div class="rail-rows">
      ${rooms
        .slice(0, 6)
        .map((room) => {
          const roomSegments = segments.filter((s) => s.roomId === room.id);
          const busy = roomSegments.length > 0;
          return `<div class="rail-row">
            <a class="rail-room" href="/ruangan/${esc(room.slug)}">
              <span class="rail-name">${esc(room.name)}</span>
              <span class="rail-meta">${room.capacity} org</span>
            </a>
            <div class="rail-track" aria-hidden="true">
              ${roomSegments
                .map((s) => {
                  const left = Math.max(0, pct(Math.max(s.start, RAIL_START)));
                  const right = Math.min(100, pct(Math.min(s.end, RAIL_END)));
                  if (right <= left) return '';
                  return `<span class="rail-seg is-${s.kind}" style="left:${left}%;width:${right - left}%"></span>`;
                })
                .join('')}
              ${nowPct !== null ? `<span class="rail-now" style="left:${nowPct}%"></span>` : ''}
            </div>
            <span class="rail-state ${busy ? 'is-busy' : 'is-free'}">${busy ? 'Terisi' : 'Kosong'}</span>
          </div>`;
        })
        .join('')}
    </div>
    <div class="rail-scale" aria-hidden="true">
      <span>08.00</span><span>12.00</span><span>16.00</span><span>20.00</span>
    </div>
  </div>`;
}

function quickSearch({ dateKey, buildings, rooms }) {
  const buildingOptions = [...new Set(buildings)];
  return `<section class="quick-search" aria-label="Pencarian cepat ruangan">
    <form class="search-bar" method="get" action="/cari">
      <div class="search-bar-field">
        <label for="q-date">Tanggal</label>
        <input id="q-date" type="date" name="date" value="${esc(dateKey)}" min="${todayWitaKey()}">
      </div>
      <div class="search-bar-field">
        <label for="q-start">Mulai</label>
        <input id="q-start" type="time" name="start" value="09:00" step="900">
      </div>
      <div class="search-bar-field">
        <label for="q-end">Selesai</label>
        <input id="q-end" type="time" name="end" value="11:00" step="900">
      </div>
      <div class="search-bar-field">
        <label for="q-capacity">Kapasitas</label>
        <select id="q-capacity" name="capacity">
          <option value="">Semua</option>
          <option value="12">≥ 12 orang</option>
          <option value="24">≥ 24 orang</option>
          <option value="40">≥ 40 orang</option>
          <option value="80">≥ 80 orang</option>
          <option value="150">≥ 150 orang</option>
        </select>
      </div>
      <div class="search-bar-field">
        <label for="q-building">Gedung</label>
        <select id="q-building" name="building">
          <option value="">Semua</option>
          ${buildingOptions.map((b) => `<option value="${esc(b)}">${esc(b)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary search-submit" type="submit">
        ${icon('search', 18)} Cek ketersediaan
      </button>
    </form>
    <p class="search-hint">${icon('info', 14)} Hanya ruangan yang benar-benar kosong pada rentang ini yang ditampilkan.</p>
  </section>`;
}

function roomRow(room, index, { href, meta = true } = {}) {
  return `<li class="room-row">
    <a class="room-row-link" href="${href || `/ruangan/${esc(room.slug)}`}">
      <span class="room-num" aria-hidden="true">${String(index).padStart(2, '0')}</span>
      <span class="room-thumb">${room.photo ? `<img src="${esc(room.photo)}" alt="" loading="lazy" decoding="async" width="400" height="300">` : roomArt(room.art, room.name)}</span>
      <span class="room-main">
        <span class="room-name">${esc(room.name)}</span>
        <span class="room-sub">${roomFacts(room)}${meta ? ` · ${room.mode === 'bebas' ? 'Disetujui otomatis' : 'Perlu persetujuan'}` : ''}</span>
        <span class="room-chips">${facChips(room.facilities, 3)}</span>
      </span>
      <span class="room-side">
        <span class="room-cap">${room.capacity}<small>orang</small></span>
        <span class="room-arrow">${icon('arrow', 18)}</span>
      </span>
    </a>
  </li>`;
}

function roomIndex(rooms) {
  return `<ol class="room-index">
    ${rooms.map((room, i) => roomRow(room, i + 1)).join('')}
  </ol>`;
}

function eventItem(event) {
  return `<li class="event-item">
    <span class="event-date">
      <strong>${formatDate(event.start_at, { short: true }).split(',')[1]?.trim().split(' ')[0]}</strong>
      <span>${formatDate(event.start_at, { short: true }).split(' ').slice(-1)}</span>
    </span>
    <span class="event-body">
      <span class="event-title">${esc(event.title)}</span>
      <span class="event-meta">${formatTime(event.start_at)}–${formatTime(event.end_at)} WITA · ${esc(event.room_name)}</span>
      <span class="event-org">${esc(event.organizer_name)}</span>
    </span>
    <a class="event-link" href="/kalender?month=${esc(witaDateKey(event.start_at).slice(0, 7))}" aria-label="Lihat ${esc(event.title)} di kalender">${icon('arrow', 16)}</a>
  </li>`;
}

function statusLabel(status) {
  return status === 'blocked' ? 'Diblokir' : status === 'busy' ? 'Terisi' : 'Tersedia';
}

function roomVisual(room, { className = 'room-photo', alt = '', loading = 'lazy' } = {}) {
  if (room.photo) {
    return `<img class="${className}" src="${esc(room.photo)}" alt="${esc(alt)}" loading="${loading}" decoding="async" width="800" height="600">`;
  }
  return roomArt(room.art, alt || room.name);
}

function homeRoomCard(room, { status, query }) {
  const free = status === 'free';
  const bookHref = `/reservasi/baru?room=${encodeURIComponent(room.slug)}&date=${encodeURIComponent(query.dateKey)}&startTime=${encodeURIComponent(query.startTime)}&endTime=${encodeURIComponent(query.endTime)}&participants=${encodeURIComponent(query.participants || 10)}`;
  return `<article class="room-card">
    <a class="room-card-media" href="/ruangan/${esc(room.slug)}" aria-label="Lihat detail ${esc(room.name)}">
      ${roomVisual(room, { className: 'room-card-img', alt: `Foto ${room.name}` })}
      <span class="room-status is-${status}"><i aria-hidden="true"></i>${statusLabel(status)}</span>
    </a>
    <div class="room-card-body">
      <div class="room-card-heading">
        <h2><a href="/ruangan/${esc(room.slug)}">${esc(room.name)}</a></h2>
        <span class="room-cap">${room.capacity}<small>orang</small></span>
      </div>
      <p class="room-loc">${icon('pin', 13)} ${esc(room.building)} · ${esc(room.floor)}</p>
      <p class="room-desc">${esc(room.description)}</p>
      <div class="room-fac">${room.facilities.slice(0, 3).map((f) => `<span class="chip chip-sm">${esc(f)}</span>`).join('')}</div>
      <div class="room-card-foot">
        <span class="room-mode">${room.mode === 'bebas' ? 'Disetujui otomatis' : 'Perlu persetujuan'}</span>
        <div class="room-card-actions">
          <a class="btn btn-quiet btn-sm" href="/ruangan/${esc(room.slug)}">Detail</a>
          ${free
            ? `<a class="btn btn-primary btn-sm" href="${bookHref}">Ajukan</a>`
            : `<a class="btn btn-quiet btn-sm" href="/ruangan/${esc(room.slug)}">Lihat jadwal</a>`}
        </div>
      </div>
    </div>
  </article>`;
}

function homePage({ user, rooms, allRooms, query, statuses, events, managers }) {
  const buildings = [...new Set(allRooms.map((room) => room.building))];
  return `
  <section class="home-app">
    <div class="wrap">
      <div class="home-head">
        <div class="home-intro">
          <p class="eyebrow"><span class="eyebrow-dot" aria-hidden="true"></span> SiRuang · IDB Bali</p>
          <h1>Daftar Ruangan Tersedia</h1>
          <p class="page-lede">Pilih ruangan dan cek ketersediaannya sebelum mengajukan peminjaman.</p>
          <div class="home-quick">
            <a class="text-link" href="/cari">${icon('filter', 15)} Filter lengkap</a>
            <a class="text-link" href="/kalender">${icon('calendar', 15)} Jadwal ruangan</a>
            <a class="text-link" href="/panduan">${icon('info', 15)} Panduan</a>
          </div>
          <p class="home-source">${icon('info', 13)} Foto dan data ruangan mengacu pada idbbali.ac.id. Dikelola Biro Sarana Prasarana dan Kemahasiswaan.</p>
        </div>
        <form class="availability-check" method="get" action="/">
          <div class="avail-head">
            <div>
              <p class="eyebrow eyebrow-tight">${icon('clock', 13)} Cek waktu ketersediaan</p>
              <h2>Ruangan mana yang kosong?</h2>
            </div>
            <a class="avail-reset" href="/">Reset</a>
          </div>
          <div class="avail-grid">
            <div class="field">
              <label for="h-date">Tanggal</label>
              <input id="h-date" type="date" name="date" value="${esc(query.dateKey)}" min="${todayWitaKey()}" required>
            </div>
            <div class="field">
              <label for="h-start">Mulai</label>
              <input id="h-start" type="time" name="start" value="${esc(query.startTime)}" step="900" required>
            </div>
            <div class="field">
              <label for="h-end">Selesai</label>
              <input id="h-end" type="time" name="end" value="${esc(query.endTime)}" step="900" required>
            </div>
            <div class="field">
              <label for="h-capacity">Kapasitas</label>
              <select id="h-capacity" name="capacity">
                <option value="">Semua</option>
                ${[12, 24, 40, 80, 150].map((n) => `<option value="${n}" ${query.participants === n ? 'selected' : ''}>≥ ${n} orang</option>`).join('')}
              </select>
            </div>
            <button class="btn btn-primary" type="submit">${icon('search', 17)} Cek</button>
          </div>
          <p class="avail-note">${icon('info', 13)} Status kartu mengikuti ${formatRange(query.startAt, query.endAt)}${query.participants ? ` · minimal ${query.participants} orang` : ''}.</p>
        </form>
      </div>

      <div class="home-results-head" id="ruangan">
        <h2>${rooms.length} ruangan ${query.participants ? 'sesuai kapasitas' : 'tersedia'}</h2>
        <span>${formatDate(query.dateKey + 'T00:00:00+08:00')} · ${esc(query.startTime)}–${esc(query.endTime)} WITA</span>
      </div>

      ${rooms.length
        ? `<div class="room-grid">${rooms.map((room) => homeRoomCard(room, { status: statuses[room.id] || 'free', query })).join('')}</div>`
        : emptyState({
            title: 'Tidak ada ruangan yang cocok',
            body: 'Coba turunkan kapasitas, ubah waktu, atau lihat semua ruangan.',
            action: `<a class="btn btn-primary" href="/">Lihat semua ruangan</a>`
          })}
    </div>
  </section>

  <section class="home-contact">
    <div class="wrap contact-layout">
      <div class="contact-intro">
        <p class="eyebrow">Bantuan peminjaman</p>
        <h2>Informasi dan konfirmasi peminjaman ruangan dapat menghubungi pengelola.</h2>
        <p>Pengelola ruangan membantu penjadwalan khusus, perubahan slot, dan penanganan bentrok. Untuk masalah akun dan data master, hubungi admin sistem.</p>
      </div>
      <div class="contact-grid">
        ${managers
          .map(
            (manager) => `<div class="contact-card">
              <strong>${esc(manager.name)}</strong>
              <span>${esc(manager.rooms.map((r) => r.name).join(' · '))}</span>
              <a href="mailto:${esc(manager.email)}">${icon('mail', 14)} Hubungi pengelola</a>
            </div>`
          )
          .join('')}
        <div class="contact-card">
          <strong>Admin SiRuang</strong>
          <span>Akun, peran, dan master ruangan</span>
          <a href="mailto:admin@idbbali.ac.id">${icon('mail', 14)} admin@idbbali.ac.id</a>
        </div>
      </div>
    </div>
  </section>

  <section class="home-guide">
    <div class="wrap guide-band">
      <div class="guide-intro">
        <p class="eyebrow">Alur peminjaman</p>
        <h2>Ajukan ruangan dalam empat langkah.</h2>
        <a class="btn btn-dark" href="/panduan">Baca panduan lengkap ${icon('arrow', 15)}</a>
      </div>
      <ol class="guide-steps">
        <li><span>01</span><div><strong>Masuk</strong><p>Gunakan Email/NIM dan password akun kampus.</p></div></li>
        <li><span>02</span><div><strong>Cek slot</strong><p>Pilih tanggal, jam, dan kapasitas.</p></div></li>
        <li><span>03</span><div><strong>Ajukan</strong><p>Isi detail kegiatan dan peserta.</p></div></li>
        <li><span>04</span><div><strong>Keputusan</strong><p>Pantau status di Reservasi saya.</p></div></li>
      </ol>
    </div>
  </section>

  <section class="home-events">
    <div class="wrap">
      <div class="section-head section-head-tight">
        <div>
          <p class="eyebrow">Kalender kampus</p>
          <h2>Kegiatan minggu ini</h2>
        </div>
        <a class="text-link" href="/kalender">Semua kegiatan ${icon('arrow', 14)}</a>
      </div>
      ${events.length
        ? `<ul class="home-event-grid">${events
            .slice(0, 3)
            .map(
              (event) => `<li>
                <span class="home-event-date">${formatDate(event.start_at, { short: true })}</span>
                <strong>${esc(event.title)}</strong>
                <span>${formatTime(event.start_at)}–${formatTime(event.end_at)} WITA · ${esc(event.room_name)}</span>
                <small>${esc(event.organizer_name)}</small>
              </li>`
            )
            .join('')}</ul>`
        : emptyState({ title: 'Belum ada kegiatan terbit', body: 'Kegiatan akan tampil setelah reservasi disetujui dan dimoderasi.' })}
      <p class="privacy-note">${icon('shield', 14)} Tanpa nama atau identitas pribadi pemesan.</p>
    </div>
  </section>`;
}

function filterChips(rooms, selected = []) {
  const facilities = [...new Set(rooms.flatMap((r) => r.facilities))].sort();
  const ordered = [
    ...facilities.filter((f) => selected.includes(f)),
    ...facilities.filter((f) => !selected.includes(f))
  ];
  const visible = ordered.slice(0, 12);
  const overflow = ordered.slice(12);
  return `<fieldset class="chip-fieldset">
    <legend>Fasilitas</legend>
    <div class="chip-row" data-chip-row>
      ${visible
        .map(
          (f) => `<label class="chip-check">
            <input type="checkbox" name="facility" value="${esc(f)}" ${selected.includes(f) ? 'checked' : ''}>
            <span>${esc(f)}</span>
          </label>`
        )
        .join('')}
      ${overflow
        .map(
          (f) => `<label class="chip-check is-overflow">
            <input type="checkbox" name="facility" value="${esc(f)}" ${selected.includes(f) ? 'checked' : ''}>
            <span>${esc(f)}</span>
          </label>`
        )
        .join('')}
      ${overflow.length ? `<button type="button" class="chip chip-button chip-toggle" data-show-chips data-more-count="${overflow.length}">+${overflow.length} fasilitas lain</button>` : ''}
    </div>
  </fieldset>`;
}

function suggestionList(suggestions) {
  if (!suggestions.length) return '';
  return `<div class="suggestions">
    <h3>Slot terdekat yang kosong</h3>
    <ul class="suggestion-list">
      ${suggestions
        .slice(0, 6)
        .map(
          (s) => `<li>
            <a href="/reservasi/baru?room=${esc(s.room.slug)}&start=${encodeURIComponent(s.startAt)}&end=${encodeURIComponent(s.endAt)}&participants=10">
              <span class="suggestion-time">${formatRange(s.startAt, s.endAt)}</span>
              <span class="suggestion-room">${esc(s.room.name)}</span>
              <span class="suggestion-arrow">${icon('arrow', 15)}</span>
            </a>
          </li>`
        )
        .join('')}
    </ul>
  </div>`;
}

function searchPage({ user, rooms, result, query, suggestions }) {
  const { free, busy } = result;
  const buildings = [...new Set(rooms.map((r) => r.building))];
  return `
  <div class="page-head">
    <div class="wrap">
      <p class="eyebrow">Cari ruangan</p>
      <h1>Slot kosong, ${esc(formatDate(query.startAt, { short: true }))}</h1>
      <p class="page-lede">${formatRange(query.startAt, query.endAt)} · ${query.participants ? `${query.participants}+ orang · ` : ''}${query.building || 'semua gedung'}</p>
    </div>
  </div>

  <div class="wrap">
    <form class="filter-panel" method="get" action="/cari" id="filter-form">
      <div class="filter-grid">
        <div class="field">
          <label for="f-date">Tanggal</label>
          <input id="f-date" type="date" name="date" value="${esc(query.dateKey)}" min="${todayWitaKey()}">
        </div>
        <div class="field">
          <label for="f-start">Mulai</label>
          <input id="f-start" type="time" name="start" value="${esc(query.startTime)}" step="900">
        </div>
        <div class="field">
          <label for="f-end">Selesai</label>
          <input id="f-end" type="time" name="end" value="${esc(query.endTime)}" step="900">
        </div>
        <div class="field">
          <label for="f-capacity">Kapasitas minimal</label>
          <input id="f-capacity" type="number" name="capacity" min="1" max="300" value="${esc(query.participants || '')}" placeholder="Semua">
        </div>
        <div class="field">
          <label for="f-building">Gedung</label>
          <select id="f-building" name="building">
            <option value="">Semua gedung</option>
            ${buildings.map((b) => `<option value="${esc(b)}" ${query.building === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}
          </select>
        </div>
      </div>
      ${filterChips(rooms, query.facilities)}
      <div class="filter-actions">
        <button class="btn btn-primary" type="submit">${icon('search', 17)} Terapkan filter</button>
        <a class="btn btn-quiet" href="/cari">Reset</a>
        <span class="filter-count">${free.length} dari ${rooms.length} ruangan kosong</span>
      </div>
    </form>

    <section class="results" aria-live="polite">
      <div class="results-head">
        <h2>${free.length ? `${free.length} ruangan tersedia` : 'Tidak ada ruangan kosong'}</h2>
        <span class="results-sub">${formatRange(query.startAt, query.endAt)}</span>
      </div>
      ${free.length
        ? `<ol class="room-index room-index-results">${free.map((room, i) => roomRow(room, i + 1)).join('')}</ol>`
        : `${emptyState({
            title: 'Slot ini sudah terisi',
            body: 'Coba ubah waktu, kurangi filter fasilitas, atau pilih salah satu slot terdekat di bawah.'
          })}${suggestionList(suggestions)}`}
      ${busy.length ? `<p class="busy-note">${icon('info', 14)} ${busy.length} ruangan lain terpakai pada rentang ini.</p>` : ''}
    </section>
  </div>`;
}

function hoursTable(hours) {
  const names = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  return `<table class="hours-table">
    <caption class="sr-only">Jam operasional ruangan</caption>
    <tbody>
      ${[1, 2, 3, 4, 5, 6, 0]
        .map((d) => `<tr><th scope="row">${names[d]}</th><td>${hours[d] ? `${hours[d][0]}–${hours[d][1]} WITA` : 'Tutup'}</td></tr>`)
        .join('')}
    </tbody>
  </table>`;
}

function weekSchedule(room, days) {
  return `<div class="week-schedule">
    ${days
      .map(
        (day) => `<div class="week-day">
          <div class="week-day-head"><strong>${formatDate(day.dateKey + 'T00:00:00+08:00', { short: true })}</strong></div>
          <div class="week-day-body">
            ${day.items.length
              ? day.items
                  .map(
                    (item) => `<span class="schedule-block ${item.kind === 'block' ? 'is-block' : ''}">
                      <span>${formatTime(item.start_at)}–${formatTime(item.end_at)}</span>
                      <small>${esc(item.label)}</small>
                    </span>`
                  )
                  .join('')
              : `<span class="schedule-free">${icon('check', 13)} Kosong</span>`}
          </div>
        </div>`
      )
      .join('')}
  </div>`;
}

function roomDetailPage({ user, room, days, nextFree, defaultSlot, isManaged, activeReservations }) {
  const canBook = user && ['pemohon', 'pengurus'].includes(user.role);
  return `
  <div class="wrap">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Beranda</a><span aria-hidden="true">/</span>
      <a href="/">Daftar ruangan</a><span aria-hidden="true">/</span>
      <span aria-current="page">${esc(room.name)}</span>
    </nav>
  </div>

  <div class="wrap detail-layout">
    <div class="detail-main">
      <header class="detail-head">
        <div>
          <p class="eyebrow">${esc(room.building)} · ${esc(room.floor)}</p>
          <h1>${esc(room.name)}</h1>
          <p class="page-lede">${esc(room.description)}</p>
        </div>
        <div class="detail-badges">
          <span class="badge ${room.mode === 'bebas' ? 'is-approved' : 'is-pending'}">${room.mode === 'bebas' ? 'Disetujui otomatis' : 'Perlu persetujuan'}</span>
          ${isManaged ? `<a class="btn btn-quiet btn-sm" href="/pengelola">${icon('shield', 15)} Kelola ruangan</a>` : ''}
        </div>
      </header>

      <div class="detail-visual">${roomVisual(room, { className: 'detail-photo', alt: `Foto ${room.name}`, loading: 'eager' })}</div>

      <dl class="spec-grid">
        <div><dt>Kapasitas</dt><dd>${room.capacity} orang</dd></div>
        <div><dt>Gedung</dt><dd>${esc(room.building)}</dd></div>
        <div><dt>Lantai</dt><dd>${esc(room.floor)}</dd></div>
        <div><dt>Pengelola</dt><dd>${esc(room.manager_name)}</dd></div>
        <div><dt>Durasi maks.</dt><dd>${room.max_hours} jam</dd></div>
        <div><dt>Reservasi aktif</dt><dd>${activeReservations}</dd></div>
      </dl>

      <section class="detail-section">
        <h2>Fasilitas</h2>
        <ul class="facility-list">${room.facilities.map((f) => `<li>${icon('check', 14)} ${esc(f)}</li>`).join('')}</ul>
      </section>

      <section class="detail-section">
        <h2>Aturan ruangan</h2>
        <ol class="rule-list">${room.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>
      </section>

      <section class="detail-section">
        <div class="section-head section-head-tight">
          <div><h2>Jadwal tujuh hari</h2><p class="inline-note">Kosong berarti slot dapat diajukan. Blokir pengelola tidak dapat dipesan.</p></div>
        </div>
        ${weekSchedule(room, days)}
      </section>

      <section class="detail-section">
        <h2>Jam operasional</h2>
        ${hoursTable(room.operating_hours)}
      </section>
    </div>

    <aside class="booking-aside" aria-label="Ajukan reservasi">
      <div class="booking-box">
        <p class="eyebrow eyebrow-tight">Ajukan ruangan ini</p>
        <h2>${esc(room.name)}</h2>
        <p class="booking-mode">${room.mode === 'bebas' ? 'Langsung disetujui bila slot kosong.' : 'Menunggu persetujuan pengelola.'}</p>
        ${
          canBook
            ? `<form method="get" action="/reservasi/baru" class="stack-form">
                <input type="hidden" name="room" value="${esc(room.slug)}">
                <div class="field">
                  <label for="b-date">Tanggal</label>
                  <input id="b-date" name="date" type="date" value="${esc(defaultSlot ? defaultSlot.dateKey : todayWitaKey())}" min="${esc(todayWitaKey())}" required>
                </div>
                <div class="field-row">
                  <div class="field"><label for="b-start">Mulai</label><input id="b-start" name="start" type="time" value="${esc(defaultSlot ? defaultSlot.start : '09:00')}" step="900" required></div>
                  <div class="field"><label for="b-end">Selesai</label><input id="b-end" name="end" type="time" value="${esc(defaultSlot ? defaultSlot.end : '11:00')}" step="900" required></div>
                </div>
                <div class="field">
                  <label for="b-participants">Jumlah peserta</label>
                  <input id="b-participants" name="participants" type="number" min="1" max="${room.capacity}" value="10" required>
                </div>
                <button class="btn btn-primary btn-block" type="submit">Lanjut ke reservasi ${icon('arrow', 16)}</button>
              </form>`
            : `<div class="login-prompt">
                <p>Masuk dengan akun kampus untuk mengajukan reservasi.</p>
                <a class="btn btn-primary btn-block" href="/masuk?next=${encodeURIComponent(`/reservasi/baru?room=${room.slug}`)}">Masuk untuk memesan</a>
              </div>`
        }
        ${nextFree ? `<div class="next-free">${icon('clock', 15)} <span>Slot terdekat: <a href="/reservasi/baru?room=${esc(room.slug)}&start=${encodeURIComponent(nextFree.startAt)}&end=${encodeURIComponent(nextFree.endAt)}&participants=10">${formatRange(nextFree.startAt, nextFree.endAt)}</a></span></div>` : ''}
        <div class="booking-foot">
          <span>${icon('users', 14)} ${room.capacity} orang</span>
          <span>${icon('clock', 14)} maks. ${room.max_hours} jam</span>
        </div>
      </div>
    </aside>
  </div>`;
}

module.exports = {
  homePage,
  roomVisual,
  searchPage,
  roomDetailPage,
  roomRow,
  eventItem,
  availabilityRail,
  RAIL_START,
  RAIL_END
};
