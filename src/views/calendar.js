'use strict';

const { esc, icon, emptyState } = require('./components');
const {
  MONTH_NAMES,
  formatDate,
  formatTime,
  formatRange,
  todayWitaKey,
  monthRangeUtc,
  shiftMonth,
  startOfWeekWita,
  addDays,
  witaDateKey,
  witaDayIndex
} = require('../time');

function monthLabel(month) {
  const [year, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${year}`;
}

function dayEvents(events, dateKey) {
  return events.filter((e) => witaDateKey(e.start_at) === dateKey);
}

function calendarPage({ events, month, selectedDay, dayStatus, rooms = [], roomFilter = null }) {
  const first = `${month}-01`;
  const gridStart = startOfWeekWita(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = todayWitaKey();
  const selected = selectedDay || today;
  const list = dayEvents(events, selected);
  const monthEventsCount = events.length;
  const busyRooms = dayStatus.filter(
    (item) => item.reservations.length || item.blocks.length
  ).length;
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const roomQuery = roomFilter ? `&room=${encodeURIComponent(roomFilter.slug)}` : '';

  return `
  <div class="page-head">
    <div class="wrap">
      <div class="page-head-row">
        <div>
          <p class="eyebrow">Kalender kampus</p>
          <h1>${roomFilter ? `Jadwal ${esc(roomFilter.name)}` : 'Kegiatan &amp; ruang terpakai'}</h1>
          <p class="page-lede">Jadwal publik tanpa identitas pribadi pemesan. Klik tanggal untuk melihat detail.</p>
        </div>
        <a class="btn btn-primary" href="/cari">${icon('search', 16)} Cari slot kosong</a>
      </div>
    </div>
  </div>

  <div class="wrap calendar-layout">
    <section class="calendar-panel" aria-label="Kalender bulanan">
      <div class="calendar-toolbar">
        <div class="calendar-nav">
          <a class="icon-btn icon-btn-flip" href="/kalender?month=${prev}${roomQuery}" aria-label="Bulan sebelumnya">${icon('chevron', 18)}</a>
          <h2>${esc(monthLabel(month))}</h2>
          <a class="icon-btn" href="/kalender?month=${next}${roomQuery}" aria-label="Bulan berikutnya">${icon('chevron', 18)}</a>
        </div>
        <div class="calendar-tools">
          <form class="calendar-filter" method="get" action="/kalender">
            <input type="hidden" name="month" value="${esc(month)}">
            <input type="hidden" name="day" value="${esc(selectedDay)}">
            <label class="sr-only" for="cal-room">Filter ruangan</label>
            <select id="cal-room" name="room">
              <option value="">Semua ruangan</option>
              ${rooms.map((room) => `<option value="${esc(room.slug)}" ${roomFilter && roomFilter.id === room.id ? 'selected' : ''}>${esc(room.name)}</option>`).join('')}
            </select>
            <button class="btn btn-quiet btn-sm" type="submit">Filter</button>
          </form>
          <a class="btn btn-quiet btn-sm" href="/kalender${roomQuery}">Hari ini</a>
        </div>
      </div>
      <div class="calendar-legend">
        <span><i class="legend-swatch is-event"></i> Kegiatan terbit</span>
        <span><i class="legend-swatch is-today"></i> Hari ini</span>
        <span>${monthEventsCount} kegiatan bulan ini${roomFilter ? ` · ${esc(roomFilter.name)}` : ''}</span>
      </div>
      <div class="calendar-grid" role="group">
        ${['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
          .map((d) => `<div class="calendar-dow">${d}</div>`)
          .join('')}
        ${cells
          .map((dateKey) => {
            const items = dayEvents(events, dateKey);
            const isOther = !dateKey.startsWith(month);
            const isToday = dateKey === today;
            const isSelected = dateKey === selected;
            return `<a class="calendar-cell${isOther ? ' is-other' : ''}${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}"
              href="/kalender?month=${month}&day=${dateKey}${roomQuery}"
              aria-label="${esc(formatDate(dateKey + 'T00:00:00+08:00', { dateOnly: true }))}${items.length ? `, ${items.length} kegiatan` : ', tidak ada kegiatan'}">
              <span class="calendar-date">${Number(dateKey.slice(8, 10))}</span>
              <span class="calendar-events">
                ${items.slice(0, 2).map((e) => `<span class="calendar-event-dot"><i></i><span>${esc(e.title)}</span></span>`).join('')}
                ${items.length > 2 ? `<span class="calendar-more">+${items.length - 2}</span>` : ''}
              </span>
            </a>`;
          })
          .join('')}
      </div>
      <p class="privacy-note">${icon('shield', 14)} Hanya kegiatan yang disetujui dan dimoderasi yang tampil. Reservasi privat tidak menampilkan judul maupun nama.</p>
    </section>

    <aside class="calendar-side">
      <div class="day-panel">
        <div class="day-panel-head">
          <div>
            <p class="eyebrow eyebrow-tight">${esc(formatDate(selected + 'T00:00:00+08:00'))}</p>
            <h2>${list.length ? `${list.length} kegiatan` : 'Tidak ada kegiatan terbit'}</h2>
          </div>
          <span class="day-badge">${busyRooms} ruang terpakai</span>
        </div>
        ${list.length
          ? `<ul class="day-event-list">${list
              .map(
                (e) => `<li>
                  <span class="day-event-time">${formatTime(e.start_at)}<small>${formatTime(e.end_at)}</small></span>
                  <div><strong>${esc(e.title)}</strong><span>${esc(e.room_name)} · ${esc(e.organizer_name)}</span><p>${esc(e.description || '')}</p></div>
                </li>`
              )
              .join('')}</ul>`
          : emptyState({
              title: 'Hari ini tenang',
              body: 'Belum ada kegiatan publik terbit pada tanggal ini. Ketersediaan ruangan tetap bisa dicek.'
            })}
        <a class="btn btn-block btn-quiet" href="/cari?date=${selected}">${icon('search', 16)} Cek ruang kosong tanggal ini</a>
      </div>

      <div class="day-panel">
        <div class="day-panel-head"><div><p class="eyebrow eyebrow-tight">Okupansi</p><h2>${roomFilter ? esc(roomFilter.name) : 'Status ruang'}</h2></div></div>
        <ul class="occupancy-list">
          ${dayStatus
            .map((item) => {
              const busy = item.reservations.length + item.blocks.length;
              return `<li>
                <span>${esc(item.room.name)}</span>
                <span class="${busy ? 'occ-busy' : 'occ-free'}">${busy ? `${busy} slot terpakai` : 'Kosong'}</span>
              </li>`;
            })
            .join('')}
        </ul>
        <p class="inline-note">Tanpa judul atau identitas pemesan untuk reservasi privat.</p>
      </div>
    </aside>
  </div>`;
}

module.exports = { calendarPage };
