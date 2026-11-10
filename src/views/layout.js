'use strict';

const { esc, icon, brand, roleBadge, avatar, ROLE_LABEL } = require('./components');
const { formatDate, formatTime, nowIso } = require('../time');

function navItem({ href, label, iconName, active, badge }) {
  return `<a class="nav-link${active ? ' is-active' : ''}" href="${href}" ${active ? 'aria-current="page"' : ''}>
    ${icon(iconName, 18)}<span>${esc(label)}</span>${badge ? `<span class="nav-count">${esc(badge)}</span>` : ''}
  </a>`;
}

function layout({
  title,
  description = 'SiRuang — reservasi ruangan dan kalender kegiatan kampus Institut Desain dan Bisnis Bali.',
  user,
  active = '',
  body,
  nonce = '',
  page = '',
  pageData = {},
  scripts = [],
  managerQueueCount = 0,
  wide = false
}) {
  const canBook = user && ['pemohon', 'pengurus'].includes(user.role);
  const isManager = user && ['pengelola', 'admin'].includes(user.role);
  const isAdmin = user && user.role === 'admin';
  const todayLabel = `${formatDate(nowIso())} · ${formatTime(nowIso())} WITA`;

  const desktopNav = [
    user
      ? { href: '/dashboard', label: 'Dashboard', iconName: 'home', active: active === 'dashboard' }
      : null,
    { href: '/', label: 'Daftar Ruangan', iconName: 'grid', active: active === 'beranda' || active === 'cari' },
    { href: '/reservasi/baru', label: 'Form Pinjam', iconName: 'plus', active: active === 'form' },
    { href: '/kalender', label: 'Jadwal Ruangan', iconName: 'calendar', active: active === 'kalender' },
    { href: '/panduan', label: 'Panduan', iconName: 'info', active: active === 'panduan' },
    isManager
      ? { href: '/pengelola', label: 'Kelola', iconName: 'shield', active: active === 'pengelola', badge: managerQueueCount || '' }
      : null
  ].filter(Boolean);

  const accountMenu = user
    ? `<details class="account-menu">
        <summary class="account-trigger" aria-label="Menu akun ${esc(user.name)}">
          ${avatar(user.name, 'sm')}
          <span class="account-copy"><span class="account-name">${esc(user.name.split(' ')[0])}</span><span class="account-role">${esc(ROLE_LABEL[user.role] || user.role)}</span></span>
          ${icon('chevron', 14)}
        </summary>
        <div class="account-pop">
          <div class="account-pop-head">
            ${avatar(user.name, 'md')}
            <div><strong>${esc(user.name)}</strong><span>${esc(user.email)}</span></div>
          </div>
          <div class="account-pop-role">${roleBadge(user.role)}</div>
          <a href="/dashboard" class="account-link">${icon('home', 16)} Dashboard</a>
          <a href="/akun" class="account-link">${icon('user', 16)} Akun &amp; notifikasi</a>
          <a href="/reservasi-saya" class="account-link">${icon('ticket', 16)} Reservasi saya</a>
          ${isAdmin ? `<a href="/admin" class="account-link">${icon('grid', 16)} Panel admin</a>` : ''}
          <form method="post" action="/api/auth/logout">
            <button type="submit" class="account-link account-logout">${icon('logout', 16)} Keluar</button>
          </form>
        </div>
      </details>`
    : `<a class="btn btn-ghost btn-sm" href="/masuk">${icon('user', 16)} Masuk<span class="hide-sm"> Akun</span></a>`;

  const sideNav = user
    ? [
        { href: '/dashboard', label: 'Dashboard', iconName: 'home', active: active === 'dashboard' },
        { href: '/', label: 'Daftar Ruangan', iconName: 'grid', active: active === 'beranda' || active === 'cari' },
        { href: '/reservasi/baru', label: 'Form Pinjam', iconName: 'plus', active: active === 'form' },
        { href: '/kalender', label: 'Jadwal Ruangan', iconName: 'calendar', active: active === 'kalender' },
        { href: '/panduan', label: 'Panduan', iconName: 'info', active: active === 'panduan' },
        { href: '/reservasi-saya', label: 'Reservasi Saya', iconName: 'ticket', active: active === 'reservasi' },
        isManager
          ? { href: '/pengelola', label: 'Kelola', iconName: 'shield', active: active === 'pengelola', badge: managerQueueCount || '' }
          : null,
        isAdmin
          ? { href: '/admin', label: 'Admin', iconName: 'grid', active: active === 'admin' }
          : null,
        { href: '/akun', label: 'Akun', iconName: 'user', active: active === 'akun' }
      ].filter(Boolean)
    : [];

  const appSidebar = user
    ? `<aside class="app-sidebar" aria-label="Navigasi aplikasi">
        <div class="side-brand">${brand({ href: '/dashboard' })}</div>
        <nav class="side-nav" aria-label="Navigasi utama">
          ${sideNav
            .map(
              (item) => `<a class="side-link${item.active ? ' is-active' : ''}" href="${item.href}" ${item.active ? 'aria-current="page"' : ''}>
                ${icon(item.iconName, 20)}
                <span>${esc(item.label)}</span>
                ${item.badge ? `<span class="side-count">${esc(item.badge)}</span>` : ''}
              </a>`
            )
            .join('')}
        </nav>
        <div class="side-foot">
          <p class="side-date">${esc(formatDate(nowIso(), { short: true }))}<span>${esc(formatTime(nowIso()))} WITA</span></p>
          <form method="post" action="/api/auth/logout">
            <button class="side-logout" type="submit">${icon('logout', 18)} <span>Logout</span></button>
          </form>
        </div>
      </aside>`
    : '';

  const mobileNav = [
    { href: '/', label: 'Ruangan', iconName: 'grid', active: active === 'beranda' || active === 'cari' },
    { href: '/kalender', label: 'Jadwal', iconName: 'calendar', active: active === 'kalender' },
    {
      href: user ? '/reservasi/baru' : '/masuk?next=%2Freservasi%2Fbaru',
      label: 'Form',
      iconName: 'plus',
      active: active === 'form'
    },
    {
      href: user ? '/dashboard' : '/masuk',
      label: user ? 'Dashboard' : 'Masuk',
      iconName: user ? 'home' : 'user',
      active: active === 'dashboard'
    }
  ];

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)} · SiRuang</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#024D71">
  <link rel="icon" href="/favicon.png" type="image/png">
  <link rel="preload" href="/fonts/fraunces-600.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/montserrat-400.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/fonts/fonts.css">
  <link rel="stylesheet" href="/styles.css">
</head>
<body data-page="${esc(page)}" data-active="${esc(active)}"${user ? ' class="has-sidebar"' : ''}>
  <a class="skip-link" href="#main">Lewati ke konten</a>
  ${appSidebar}
  <aside class="topline" aria-label="Informasi kampus">
    <div class="wrap topline-inner">
      <span class="topline-place">${icon('pin', 13)} Kampus IDB Bali · Denpasar</span>
      <span class="topline-date">${esc(todayLabel)}</span>
    </div>
  </aside>

  <header class="site-header">
    <div class="wrap header-inner">
      ${brand({ href: user ? '/dashboard' : '/' })}
      <nav class="main-nav" aria-label="Navigasi utama">
        ${desktopNav.map(navItem).join('')}
      </nav>
      <div class="header-actions">
        ${accountMenu}
      </div>
    </div>
  </header>

  <main id="main" class="site-main${wide ? ' is-wide' : ''}">
    ${body}
  </main>

  <footer class="site-footer">
    <div class="wrap footer-grid">
      <div class="footer-brand">
        ${brand({ footer: true })}
        <p>SiRuang membantu civitas IDB Bali menemukan ruangan yang tersedia, memesannya tanpa bentrok, dan mengetahui kegiatan kampus di satu tempat.</p>
        <p class="footer-note">${icon('shield', 14)} Data sintetis untuk demo rilis 1.0</p>
      </div>
      <div class="footer-col">
        <h2>Jelajahi</h2>
        <a href="/">Daftar ruangan</a>
        <a href="/reservasi/baru">Form pinjam</a>
        <a href="/kalender">Jadwal ruangan</a>
        <a href="/panduan">Panduan</a>
        <a href="/reservasi-saya">Reservasi saya</a>
      </div>
      <div class="footer-col">
        <h2>Kampus</h2>
        <p>Jl. Tukad Batanghari No. 29<br>Panjer, Denpasar, Bali 80225</p>
        <p>Senin–Jumat 08.30–17.30<br>Sabtu 08.30–14.00 WITA</p>
      </div>
      <div class="footer-col">
        <h2>Untuk pengelola</h2>
        <a href="/pengelola">Panel pengelola</a>
        <a href="/masuk/admin">Panel admin</a>
        <p class="footer-small">Rilis 1.0 · PRD 0.2</p>
      </div>
    </div>
    <div class="wrap footer-base">
      <span>© 2026 Institut Desain dan Bisnis Bali</span>
      <span>Waktu disimpan UTC, ditampilkan WITA (UTC+8)</span>
    </div>
  </footer>

  <nav class="mobile-nav" aria-label="Navigasi bawah">
    ${mobileNav
      .map(
        (item) => `<a class="mobile-link${item.active ? ' is-active' : ''}" href="${item.href}" ${item.active ? 'aria-current="page"' : ''}>
          ${icon(item.iconName, 21)}<span>${esc(item.label)}</span>
        </a>`
      )
      .join('')}
  </nav>

  ${pageData && Object.keys(pageData).length ? `<script type="application/json" id="page-data">${JSON.stringify(pageData).replace(/</g, '\\u003c')}</script>` : ''}
  <script src="/app.js" defer></script>
  ${scripts.map((src) => `<script src="${esc(src)}" defer></script>`).join('')}
</body>
</html>`;
}

function authLayout({ title, body, page = 'login' }) {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)} · SiRuang</title>
  <meta name="description" content="Masuk ke SiRuang, sistem reservasi ruangan Institut Desain dan Bisnis Bali.">
  <meta name="theme-color" content="#f1f1ef">
  <meta name="robots" content="noindex">
  <link rel="icon" href="/favicon.png" type="image/png">
  <link rel="preload" href="/fonts/fraunces-600.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/montserrat-400.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/fonts/fonts.css">
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="auth-page" data-page="${esc(page)}">
  <main class="auth-shell">
    ${body}
    <p class="auth-copyright">Copyright © 2026 <strong>Institut Desain dan Bisnis Bali</strong>. All rights reserved.</p>
  </main>
  <script src="/app.js" defer></script>
</body>
</html>`;
}

module.exports = { layout, authLayout };
