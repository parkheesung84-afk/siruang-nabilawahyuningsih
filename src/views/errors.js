'use strict';

const { icon } = require('./components');

function errorPage({ code, title, message, action = '/', actionLabel = 'Kembali ke beranda' }) {
  return `<div class="wrap error-page">
    <p class="error-code">${code}</p>
    <h1>${title}</h1>
    <p class="page-lede">${message}</p>
    <div class="error-actions">
      <a class="btn btn-primary" href="${action}">${icon('arrow', 16)} ${actionLabel}</a>
      <a class="btn btn-quiet" href="/cari">Cari ruangan</a>
    </div>
  </div>`;
}

module.exports = { errorPage };
