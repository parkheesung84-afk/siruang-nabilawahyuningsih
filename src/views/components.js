'use strict';

const { formatDate, formatTime, formatRange } = require('../time');

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="1.5"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  ticket: '<path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z"/><path d="M13 5v14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3 6"/>',
  pin: '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="m3 7 9 6 9-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M12 3 2.8 19h18.4Z"/><path d="M12 9v5M12 17h.01"/>',
  building: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16"/><path d="M15 9h4a1 1 0 0 1 1 1v11"/><path d="M8 8h3M8 12h3M8 16h3M18 13h.01M18 17h.01"/><path d="M2 21h20"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V6Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 20h16"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  grid: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
  home: '<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M10 20v-6h4v6"/>',
  lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="m3 3 18 18"/><path d="M10.6 6.1A10.9 10.9 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.4 4.1M6.2 6.8A17 17 0 0 0 2.5 12S6 18 12 18a10 10 0 0 0 4-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'
};

function icon(name, size = 18) {
  const path = ICONS[name] || ICONS.info;
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
}

function logoMark() {
  return `<svg class="logo-mark" width="34" height="34" viewBox="0 0 34 34" aria-hidden="true" focusable="false">
    <rect x="1" y="1" width="32" height="32" rx="2" fill="#024D71"/>
    <path d="M17 1h16v16a16 16 0 0 1-16-16Z" fill="#F17711"/>
    <path d="M9 25V9h7.2a5 5 0 0 1 0 10H9" fill="none" stroke="#F6F1E7" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M17 19l6 6" stroke="#F6F1E7" stroke-width="2.6" stroke-linecap="round"/>
  </svg>`;
}

function brand({ footer = false, href = '/' } = {}) {
  const logoSrc = footer ? '/brand/idb-bali-logo-w.png' : '/brand/idb-bali-logo-full.png';
  return `<a class="brand${footer ? ' brand-footer' : ''}" href="${esc(href)}" aria-label="SiRuang — IDB Bali, beranda">
    <img class="brand-logo" src="${logoSrc}" alt="IDB Bali" width="813" height="532" decoding="async">
    <span class="brand-text">
      <span class="brand-name">SiRuang</span>
      <span class="brand-sub">Sistem Reservasi Ruangan</span>
    </span>
  </a>`;
}

const STATUS_CLASS = {
  Diajukan: 'is-pending',
  Disetujui: 'is-approved',
  Ditolak: 'is-rejected',
  Dibatalkan: 'is-cancelled',
  Kedaluwarsa: 'is-expired',
  Selesai: 'is-done'
};

function statusBadge(status) {
  const cls = STATUS_CLASS[status] || 'is-neutral';
  return `<span class="badge ${cls}"><span class="badge-dot" aria-hidden="true"></span>${esc(status)}</span>`;
}

const ROLE_LABEL = {
  pemohon: 'Pemohon',
  pengurus: 'Pengurus organisasi',
  pengelola: 'Pengelola ruangan',
  admin: 'Admin sistem'
};

const ROLE_SHORT = {
  pemohon: 'Pemohon',
  pengurus: 'Pengurus',
  pengelola: 'Pengelola',
  admin: 'Admin'
};

function roleBadge(role) {
  return `<span class="role-badge role-${esc(role)}">${esc(ROLE_SHORT[role] || role)}</span>`;
}

function avatar(name, size = 'md') {
  const initials = String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return `<span class="avatar avatar-${size}" aria-hidden="true">${esc(initials)}</span>`;
}

function roomArt(art, label) {
  const common = `viewBox="0 0 400 300" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid slice"`;
  const frame = `<rect width="400" height="300" fill="#EDE6D8"/>
    <g stroke="#D8CEBD" stroke-width="1">
      <path d="M0 75h400M0 150h400M0 225h400M100 0v300M200 0v300M300 0v300"/>
    </g>`;
  const artMap = {
    mainframe: `<g fill="none" stroke="#024D71" stroke-width="2">
        <rect x="52" y="58" width="120" height="76" rx="2"/><rect x="82" y="82" width="60" height="36" rx="1"/>
        <rect x="212" y="58" width="120" height="76" rx="2"/><rect x="242" y="82" width="60" height="36" rx="1"/>
        <rect x="52" y="166" width="120" height="76" rx="2"/><rect x="82" y="190" width="60" height="36" rx="1"/>
        <path d="M172 96h40M172 204h40"/>
      </g>
      <g fill="#F17711"><circle cx="246" cy="214" r="8"/><path d="M228 238h36"/></g>`,
    imac: `<g fill="none" stroke="#024D71" stroke-width="2">
        <rect x="48" y="70" width="140" height="92" rx="2"/><path d="M118 162v26M94 188h48"/>
        <rect x="220" y="52" width="120" height="80" rx="2"/><path d="M280 132v20M262 152h36"/>
        <circle cx="118" cy="116" r="26"/><path d="M118 90v52M92 116h52"/>
      </g>
      <path d="M238 208c30-24 58-24 82 0" fill="none" stroke="#F17711" stroke-width="3"/>`,
    fashion: `<g fill="none" stroke="#024D71" stroke-width="2">
        <path d="M200 54v42M176 96h48M188 96c-14 20-18 62-18 96h60c0-34-4-76-18-96"/>
        <path d="M188 128h24M188 158h24M188 188h24"/>
        <path d="M110 60c40 12 40 48 0 60M96 120h28v120H96Z"/>
        <path d="M292 60c-40 12-40 48 0 60M276 120h28v120h-28Z"/>
      </g>
      <g stroke="#F17711" stroke-width="2" stroke-dasharray="4 6"><path d="M148 224h104"/></g>`,
    library: `<g stroke="#024D71" stroke-width="2" fill="none">
        <path d="M60 258V72h280v186"/>
        <path d="M92 72v186M124 72v186M156 72v186M188 72v186M220 72v186M252 72v186M284 72v186M316 72v186"/>
        <path d="M60 130h280M60 198h280"/>
      </g>
      <g fill="#F17711"><rect x="98" y="94" width="16" height="30"/><rect x="130" y="102" width="16" height="22"/><rect x="226" y="88" width="16" height="36"/><rect x="258" y="108" width="16" height="16"/></g>`,
    hall: `<g fill="none" stroke="#024D71" stroke-width="2">
        <path d="M54 250V120a146 146 0 0 1 292 0v130"/>
        <path d="M92 250V128a108 108 0 0 1 216 0v122"/>
        <path d="M54 250h292"/>
      </g>
      <g fill="none" stroke="#F17711" stroke-width="3"><path d="M128 250v-46h144v46"/><path d="M168 204v46M232 204v46"/></g>
      <g fill="#024D71" opacity=".25"><circle cx="100" cy="262" r="7"/><circle cx="140" cy="262" r="7"/><circle cx="180" cy="262" r="7"/><circle cx="220" cy="262" r="7"/><circle cx="260" cy="262" r="7"/><circle cx="300" cy="262" r="7"/></g>`,
    gallery: `<g fill="none" stroke="#024D71" stroke-width="2">
        <rect x="58" y="56" width="94" height="126"/><rect x="174" y="56" width="70" height="86"/>
        <rect x="266" y="56" width="76" height="126"/><path d="M58 182h284"/>
      </g>
      <g fill="none" stroke="#F17711" stroke-width="2.5">
        <path d="M84 150c18-58 46-58 44 0"/><circle cx="105" cy="104" r="16"/>
        <path d="M198 122l22-34 22 34Z"/>
        <path d="M284 158c20-28 44-28 42 0M290 174h34"/>
      </g>
      <path d="M44 248h312" stroke="#024D71" stroke-width="3"/>`,
    meeting: `<g fill="none" stroke="#024D71" stroke-width="2">
        <ellipse cx="200" cy="158" rx="104" ry="56"/>
        <ellipse cx="200" cy="158" rx="74" ry="36"/>
        <path d="M96 158v52M304 158v52"/>
      </g>
      <g fill="#024D71"><circle cx="132" cy="96" r="12"/><circle cx="176" cy="82" r="12"/><circle cx="224" cy="82" r="12"/><circle cx="268" cy="96" r="12"/><circle cx="132" cy="232" r="12"/><circle cx="200" cy="246" r="12"/><circle cx="268" cy="232" r="12"/></g>
      <path d="M286 84l24-24M300 60h10v10" stroke="#F17711" stroke-width="2.5" fill="none"/>`,
    grid: `<g fill="none" stroke="#024D71" stroke-width="2">
        <rect x="60" y="50" width="130" height="90"/><rect x="210" y="50" width="130" height="90"/>
        <rect x="60" y="160" width="130" height="90"/><rect x="210" y="160" width="130" height="90"/>
      </g><circle cx="200" cy="145" r="16" fill="#F17711"/>`
  };
  return `<svg ${common} class="room-art">${frame}${artMap[art] || artMap.grid}</svg>`;
}

function roomFacts(room) {
  return `${room.capacity} orang · ${esc(room.building)}, ${esc(room.floor)}`;
}

function facChips(facilities, limit = 3) {
  return facilities
    .slice(0, limit)
    .map((f) => `<span class="chip chip-sm">${esc(f)}</span>`)
    .join('');
}

function fieldError(errors, name) {
  if (!errors || !errors[name]) return '';
  return `<p class="field-error" id="error-${esc(name)}">${icon('alert', 14)} ${esc(errors[name])}</p>`;
}

function invalidAttr(errors, name) {
  return errors && errors[name] ? 'aria-invalid="true"' : '';
}

function describeAttr(errors, name) {
  return errors && errors[name] ? `aria-describedby="error-${esc(name)}"` : '';
}

function emptyState({ title, body, action }) {
  return `<div class="empty">
    <span class="empty-mark" aria-hidden="true">${icon('spark', 28)}</span>
    <h3>${esc(title)}</h3>
    <p>${esc(body)}</p>
    ${action || ''}
  </div>`;
}

function toastRegion() {
  return `<div class="toast-region" id="toast-region" role="status" aria-live="polite" aria-atomic="false"></div>`;
}

function dialog(id, { title, body, actions = '', wide = false }) {
  return `<dialog class="modal${wide ? ' modal-wide' : ''}" id="${esc(id)}" aria-labelledby="${esc(id)}-title">
    <form method="dialog" class="modal-close-form">
      <button class="icon-btn" value="cancel" aria-label="Tutup dialog">${icon('x', 18)}</button>
    </form>
    <div class="modal-body">
      <h2 id="${esc(id)}-title">${esc(title)}</h2>
      ${body}
    </div>
    <div class="modal-actions">${actions}</div>
  </dialog>`;
}

function stepper(current, steps) {
  return `<ol class="stepper" aria-label="Langkah reservasi">
    ${steps
      .map((step, index) => {
        const n = index + 1;
        const state = n < current ? 'done' : n === current ? 'current' : 'todo';
        return `<li class="step is-${state}" ${n === current ? 'aria-current="step"' : ''}>
          <span class="step-num">${n < current ? icon('check', 13) : n}</span>
          <span class="step-label">${esc(step)}</span>
        </li>`;
      })
      .join('')}
  </ol>`;
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return formatDate(iso, { dateOnly: true });
}

function dateChip(iso) {
  return `<span class="date-chip"><span class="date-chip-day">${formatDate(iso, { short: true }).split(',')[1]?.trim()}</span><span class="date-chip-time">${formatTime(iso)}</span></span>`;
}

module.exports = {
  esc,
  icon,
  logoMark,
  brand,
  statusBadge,
  roleBadge,
  ROLE_LABEL,
  ROLE_SHORT,
  avatar,
  roomArt,
  roomFacts,
  facChips,
  fieldError,
  invalidAttr,
  describeAttr,
  emptyState,
  toastRegion,
  dialog,
  stepper,
  timeAgo,
  dateChip,
  formatRange
};
