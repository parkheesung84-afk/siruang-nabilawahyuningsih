'use strict';

(() => {
  document.documentElement.classList.add('js');

  const pageData = (() => {
    const el = document.getElementById('page-data');
    if (!el) return {};
    try {
      return JSON.parse(el.textContent || '{}');
    } catch {
      return {};
    }
  })();

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ------------------------------------------------------------- toasts */
  function toast(message, kind = 'ok') {
    const region = $('#toast-region');
    if (!region) return;
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.innerHTML = `<span class="toast-dot" aria-hidden="true"></span><span>${escapeHtml(message)}</span>`;
    region.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 300);
    }, 5200);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* --------------------------------------------------------------- login */
  $$('[data-toggle-password]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.getAttribute('aria-controls'));
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(show));
      if (button.querySelector('svg')) {
        button.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
      } else {
        button.textContent = show ? 'Sembunyikan' : 'Lihat';
      }
    });
  });

  $$('[data-demo-login]').forEach((button) => {
    button.addEventListener('click', () => {
      const login = $('#login');
      const password = $('#password');
      if (login) login.value = button.dataset.demoLogin || '';
      if (password) password.value = button.dataset.demoPassword || '';
      const submit = $('.login-submit');
      if (submit) submit.focus();
    });
  });

  $$('[data-login-form]').forEach((form) => {
    form.addEventListener('submit', () => {
      const submit = $('.login-submit', form);
      if (submit) {
        submit.setAttribute('aria-busy', 'true');
        submit.textContent = 'Memproses…';
      }
    });
  });

  /* --------------------------------------------------------- account menu */
  $$('.account-menu').forEach((menu) => {
    document.addEventListener('click', (event) => {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') menu.open = false;
    });
  });

  /* -------------------------------------------------------------- dialogs */
  function openDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  $$('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => closeDialog(button.dataset.closeDialog));
  });

  async function api(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin'
    });
    let payload = null;
    const type = response.headers.get('content-type') || '';
    if (type.includes('application/json')) {
      payload = await response.json();
    }
    if (response.status === 401) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.href = `/masuk?next=${next}`;
      throw new Error('Sesi berakhir.');
    }
    if (!response.ok) {
      const error = new Error(payload?.message || 'Permintaan gagal.');
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  /* ----------------------------------------------------------- filter chips */
  $$('[data-show-chips]').forEach((button) => {
    button.addEventListener('click', () => {
      const row = button.closest('[data-chip-row]');
      if (!row) return;
      const expanded = row.classList.toggle('is-expanded');
      button.textContent = expanded
        ? 'Sembunyikan fasilitas'
        : `+${button.dataset.moreCount} fasilitas lain`;
    });
  });

  /* ---------------------------------------------------------- booking flow */
  const bookingForm = $('#booking-form');
  if (bookingForm) initBooking(bookingForm);

  function initBooking(form) {
    let step = 1;
    let idemKey = newIdemKey();
    const room = pageData.room || {};
    const alertBox = $('#form-alert');
    const slotStatus = $('#slot-status');
    const panels = $$('.step-panel', form);

    const fields = {
      date: $('#r-date'),
      start: $('#r-start'),
      end: $('#r-end'),
      participants: $('#r-participants'),
      organization: $('#r-org'),
      activity: $('#r-activity'),
      additional: $('#r-additional'),
      notes: $('#r-notes'),
      publicCheck: $('#r-public'),
      publicDesc: $('#r-public-desc'),
      agree: $('#r-agree')
    };

    function newIdemKey() {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      return 'idem-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    }

    function showStep(next) {
      step = next;
      panels.forEach((panel) => {
        const isActive = Number(panel.dataset.step) === next;
        panel.hidden = !isActive;
        panel.classList.toggle('is-active', isActive);
      });
      const stepper = $('.stepper');
      if (stepper) {
        $$('.step', stepper).forEach((li, index) => {
          const n = index + 1;
          li.classList.toggle('is-done', n < next);
          li.classList.toggle('is-current', n === next);
          li.classList.toggle('is-todo', n > next);
          if (n === next) li.setAttribute('aria-current', 'step');
          else li.removeAttribute('aria-current');
        });
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      focusFirst(next);
    }

    function focusFirst(next) {
      const panel = $(`.step-panel[data-step="${next}"]`, form);
      if (!panel) return;
      const focusable = panel.querySelector('input, select, textarea, button, a[href]');
      if (focusable) focusable.focus({ preventScroll: true });
    }

    function startIso() {
      const value = `${fields.date.value}T${fields.start.value}:00+08:00`;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }

    function endIso() {
      const value = `${fields.date.value}T${fields.end.value}:00+08:00`;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }

    function showAlert(message, kind = 'error') {
      if (!alertBox) return;
      alertBox.hidden = false;
      alertBox.className = `form-alert is-${kind}`;
      alertBox.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 3 2.8 19h18.4Z"/><path d="M12 9v5M12 17h.01"/></svg><span>${escapeHtml(message)}</span>`;
      alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function clearAlert() {
      if (alertBox) {
        alertBox.hidden = true;
        alertBox.innerHTML = '';
      }
      $$('.field-error[data-client]', form).forEach((el) => el.remove());
      $$('[aria-invalid="true"]', form).forEach((el) => el.removeAttribute('aria-invalid'));
    }

    function fieldError(name, message) {
      const input = form.querySelector(`[name="${name}"]`);
      if (!input) return;
      input.setAttribute('aria-invalid', 'true');
      const parent = input.closest('.field') || input.parentElement;
      if (!parent) return;
      let el = parent.querySelector('.field-error[data-client]');
      if (!el) {
        el = document.createElement('p');
        el.className = 'field-error';
        el.dataset.client = '1';
        parent.appendChild(el);
      }
      el.textContent = message;
    }

    function validateStepOne() {
      clearAlert();
      let ok = true;
      const start = startIso();
      const end = endIso();
      if (!fields.date.value) {
        fieldError('date', 'Pilih tanggal.');
        ok = false;
      }
      if (!start) {
        fieldError('start', 'Waktu mulai tidak valid.');
        ok = false;
      }
      if (!end) {
        fieldError('end', 'Waktu selesai tidak valid.');
        ok = false;
      }
      if (start && end && end <= start) {
        fieldError('end', 'Waktu selesai harus setelah waktu mulai.');
        ok = false;
      }
      if (start && end) {
        const hours = (end - start) / 3600000;
        if (hours > (room.maxHours || 4)) {
          fieldError('end', `Durasi maksimum ${room.maxHours || 4} jam.`);
          ok = false;
        }
      }
      const participants = Number(fields.participants.value);
      if (!Number.isInteger(participants) || participants < 1) {
        fieldError('participants', 'Jumlah peserta minimal 1.');
        ok = false;
      } else if (participants > room.capacity) {
        fieldError('participants', `Melebihi kapasitas ${room.capacity} orang.`);
        ok = false;
      }
      if (!ok) showAlert('Periksa kembali slot yang dipilih.');
      return ok;
    }

    function validateStepTwo() {
      clearAlert();
      let ok = true;
      if (fields.activity.value.trim().length < 3) {
        fieldError('activityName', 'Nama kegiatan minimal 3 karakter.');
        ok = false;
      }
      if (fields.organization.value.trim().length > 120) {
        fieldError('organizationName', 'Nama organisasi maksimal 120 karakter.');
        ok = false;
      }
      if (fields.additional.value.trim().length > 300) {
        fieldError('additionalBorrowing', 'Peminjaman tambahan maksimal 300 karakter.');
        ok = false;
      }
      if (fields.notes.value.length > 500) {
        fieldError('notes', 'Catatan maksimal 500 karakter.');
        ok = false;
      }
      if (!ok) showAlert('Periksa kembali detail kegiatan.');
      return ok;
    }

    function organizationLabel() {
      return fields.organization.value.trim() || 'Pribadi';
    }

    function updateSummary() {
      const start = startIso();
      const end = endIso();
      const format = (iso) => {
        if (!iso) return '—';
        return new Intl.DateTimeFormat('id-ID', {
          timeZone: 'Asia/Makassar',
          day: '2-digit',
          month: 'short'
        }).format(new Date(iso)) + ' · ' +
          new Intl.DateTimeFormat('id-ID', {
            timeZone: 'Asia/Makassar',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }).format(new Date(iso)).replace(':', '.');
      };
      const sumTime = $('#sum-time');
      const sumParticipants = $('#sum-participants');
      const sumOrganization = $('#sum-organization');
      const sumAdditional = $('#sum-additional');
      const sumActivity = $('#sum-activity');
      if (sumTime) {
        const sameDay = start && end && toWitaDateKey(start) === toWitaDateKey(end);
        sumTime.textContent = sameDay
          ? `${format(start)}–${formatTimeWita(end)} WITA`
          : `${format(start)}–${format(end)} WITA`;
      }
      if (sumParticipants) sumParticipants.textContent = `${fields.participants.value || 0} orang`;
      if (sumOrganization) sumOrganization.textContent = organizationLabel();
      if (sumAdditional) sumAdditional.textContent = fields.additional.value.trim() || '—';
      if (sumActivity) sumActivity.textContent = fields.activity.value.trim() || 'Belum diisi';
    }

    function updateReview() {
      const list = $('#review-list');
      if (!list) return;
      const start = startIso();
      const end = endIso();
      const rows = [
        ['Ruangan', `${room.name} · ${room.capacity} orang`],
        ['Waktu', `${formatDateWita(start)} · ${formatTimeWita(start)}–${formatTimeWita(end)} WITA`],
        ['Peserta', `${fields.participants.value} orang`],
        ['Organisasi', organizationLabel()],
        ['Kegiatan', fields.activity.value.trim() || '—'],
        ['Peminjaman tambahan', fields.additional.value.trim() || '—'],
        ['Publikasi', fields.publicCheck.checked ? 'Tampil di kalender publik (setelah moderasi)' : 'Tidak dipublikasikan'],
        ['Persetujuan', room.mode === 'bebas' ? 'Otomatis bila slot kosong' : 'Menunggu pengelola']
      ];
      list.innerHTML = rows
        .map(
          ([term, value]) =>
            `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`
        )
        .join('');
    }

    function toWitaDateKey(iso) {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Makassar',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date(iso));
    }

    function formatDateWita(iso) {
      if (!iso) return '—';
      return new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Makassar',
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).format(new Date(iso));
    }

    function formatTimeWita(iso) {
      if (!iso) return '—';
      return new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Makassar',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(new Date(iso)).replace(':', '.');
    }

    async function checkSlot() {
      const start = startIso();
      const end = endIso();
      if (!start || !end || end <= start) {
        showAlert('Isi tanggal dan waktu dengan benar sebelum memeriksa slot.');
        return;
      }
      slotStatus.className = 'slot-status is-loading';
      slotStatus.textContent = 'Memeriksa ketersediaan…';
      try {
        const params = new URLSearchParams({
          date: fields.date.value,
          start: fields.start.value,
          end: fields.end.value,
          capacity: fields.participants.value
        });
        const data = await api(`/api/availability?${params.toString()}`);
        const isFree = data.free.some((r) => r.id === room.id || r.slug === room.slug);
        if (isFree) {
          slotStatus.className = 'slot-status is-free';
          slotStatus.innerHTML = '<strong>Slot tersedia.</strong> Ketersediaan tetap dicek ulang saat konfirmasi.';
        } else {
          slotStatus.className = 'slot-status is-busy';
          slotStatus.innerHTML = '<strong>Slot ini terisi.</strong> Pilih waktu lain atau gunakan saran di bawah.';
          renderSuggestions(data.suggestions || []);
        }
      } catch (error) {
        slotStatus.className = 'slot-status is-busy';
        slotStatus.textContent = error.message;
      }
    }

    function renderSuggestions(suggestions) {
      const wrap = $('#slot-suggestions');
      if (!wrap || !suggestions.length) return;
      wrap.hidden = false;
      const row = $('.chip-row', wrap);
      if (!row) return;
      row.innerHTML = suggestions
        .map(
          (s) => `<button type="button" class="chip chip-button" data-suggest-start="${escapeHtml(s.startAt)}" data-suggest-end="${escapeHtml(s.endAt)}" data-suggest-date="${escapeHtml(s.startAt.slice(0, 10))}">${escapeHtml(formatDateWita(s.startAt))} · ${escapeHtml(formatTimeWita(s.startAt))}–${escapeHtml(formatTimeWita(s.endAt))}</button>`
        )
        .join('');
      bindSuggestions();
    }

    function bindSuggestions() {
      $$('[data-suggest-start]', form).forEach((button) => {
        button.addEventListener('click', () => {
          const start = new Date(button.dataset.suggestStart);
          const end = new Date(button.dataset.suggestEnd);
          const witaDate = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Makassar',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).format(start);
          fields.date.value = witaDate;
          fields.start.value = button.dataset.suggestStart.slice(11, 16);
          fields.end.value = button.dataset.suggestEnd.slice(11, 16);
          updateSummary();
          checkSlot();
        });
      });
    }

    function buildPayload() {
      return {
        roomId: room.id,
        startAt: startIso(),
        endAt: endIso(),
        organizationName: fields.organization.value.trim(),
        activityName: fields.activity.value.trim(),
        additionalBorrowing: fields.additional.value.trim(),
        participants: Number(fields.participants.value),
        notes: fields.notes.value.trim(),
        isPublic: fields.publicCheck.checked,
        publicDescription: fields.publicDesc.value.trim()
      };
    }

    function showServerFields(fieldsErrors) {
      const map = {
        startAt: ['start', 1],
        endAt: ['end', 1],
        participants: ['participants', 1],
        organizationName: ['organizationName', 2],
        activityName: ['activityName', 2],
        additionalBorrowing: ['additionalBorrowing', 2],
        notes: ['notes', 2],
        publicDescription: ['publicDescription', 2],
        form: [null, 0]
      };
      let firstStep = 0;
      Object.entries(fieldsErrors || {}).forEach(([key, message]) => {
        const entry = map[key];
        if (!entry) {
          showAlert(message);
          return;
        }
        if (entry[0]) fieldError(entry[0], message);
        if (!firstStep || entry[1] < firstStep) firstStep = entry[1];
      });
      if (firstStep) showStep(firstStep);
      showAlert(Object.values(fieldsErrors)[0] || 'Periksa kembali data reservasi.');
    }

    form.addEventListener('input', () => {
      updateSummary();
      if (step === 3) updateReview();
    });
    form.addEventListener('change', () => {
      updateSummary();
      if (step === 3) updateReview();
    });

    fields.publicCheck.addEventListener('change', () => {
      const wrap = $('#public-desc-wrap');
      if (wrap) wrap.hidden = !fields.publicCheck.checked;
    });

    $$('[data-next-step]', form).forEach((button) => {
      button.addEventListener('click', () => {
        const target = Number(button.dataset.nextStep);
        if (target >= 2 && !validateStepOne()) return;
        if (target >= 3 && !validateStepTwo()) return;
        if (target === 3) updateReview();
        showStep(target);
      });
    });

    $$('[data-prev-step]', form).forEach((button) => {
      button.addEventListener('click', () => {
        clearAlert();
        showStep(Number(button.dataset.prevStep));
      });
    });

    const checkButton = $('#check-slot');
    if (checkButton) checkButton.addEventListener('click', checkSlot);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearAlert();
      if (!validateStepOne()) return;
      if (!validateStepTwo()) return;
      if (!fields.agree.checked) {
        fieldError('agree', 'Centang persetujuan aturan ruangan.');
        showAlert('Centang persetujuan aturan ruangan sebelum mengirim.');
        return;
      }
      const submit = $('#submit-booking');
      const original = submit.innerHTML;
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      submit.innerHTML = 'Mengirim…';
      try {
        const payload = buildPayload();
        const data = await api('/api/reservations', {
          method: 'POST',
          headers: { 'Idempotency-Key': idemKey },
          body: JSON.stringify(payload)
        });
        showStep(4);
        const message = $('#success-message');
        const idEl = $('#success-id');
        if (message) message.textContent = data.message;
        if (idEl) {
          idEl.textContent = data.reservation?.public_id || '';
          idEl.hidden = !idEl.textContent;
        }
        toast('Reservasi berhasil dikirim.', 'ok');
      } catch (error) {
        if (error.status === 409) {
          idemKey = newIdemKey();
          const payload = error.payload || {};
          if (payload.error === 'IDEMPOTENCY_MISMATCH') {
            showAlert('Permintaan berubah. Silakan kirim ulang.');
          } else {
            showAlert(payload.message || 'Slot baru saja dipesan. Pilih waktu lain.');
            renderSuggestions(payload.suggestions || []);
          }
        } else if (error.status === 422 && error.payload?.fields) {
          showServerFields(error.payload.fields);
          idemKey = newIdemKey();
        } else if (error.status === 429) {
          showAlert(error.payload?.message || 'Terlalu banyak percobaan. Tunggu sebentar.');
        } else {
          showAlert(error.message || 'Gagal mengirim reservasi. Coba lagi.');
        }
      } finally {
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
        submit.innerHTML = original;
      }
    });

    bindSuggestions();
    updateSummary();
  }

  /* -------------------------------------------------------- cancel dialog */
  const cancelDialog = $('#cancel-dialog');
  if (cancelDialog) {
    let cancelId = null;
    $$('[data-cancel-id]').forEach((button) => {
      button.addEventListener('click', () => {
        cancelId = button.dataset.cancelId;
        const copy = $('#cancel-copy');
        if (copy) {
          copy.textContent = `Reservasi "${button.dataset.cancelTitle}" akan dibatalkan. Slot langsung tersedia kembali dan tindakan ini tercatat di audit log.`;
        }
        const alertEl = $('#cancel-alert');
        if (alertEl) alertEl.hidden = true;
        openDialog('cancel-dialog');
      });
    });
    const confirm = $('#confirm-cancel');
    if (confirm) {
      confirm.addEventListener('click', async () => {
        if (!cancelId) return;
        confirm.disabled = true;
        confirm.setAttribute('aria-busy', 'true');
        const original = confirm.textContent;
        confirm.textContent = 'Membatalkan…';
        try {
          const data = await api(`/api/reservations/${encodeURIComponent(cancelId)}/cancel`, {
            method: 'POST',
            body: JSON.stringify({})
          });
          closeDialog('cancel-dialog');
          toast(data.message || 'Reservasi dibatalkan.', 'ok');
          setTimeout(() => location.reload(), 500);
        } catch (error) {
          const alertEl = $('#cancel-alert');
          if (alertEl) {
            alertEl.hidden = false;
            alertEl.textContent = error.message;
          }
        } finally {
          confirm.disabled = false;
          confirm.removeAttribute('aria-busy');
          confirm.textContent = original;
        }
      });
    }
  }

  /* ------------------------------------------------------------- manager */
  if (document.body.dataset.page === 'manager') initManager();

  function initManager() {
    let rejectId = null;

    $$('[data-approve]').forEach((button) => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        try {
          const data = await api(`/api/reservations/${encodeURIComponent(button.dataset.approve)}/approve`, {
            method: 'POST',
            body: JSON.stringify({})
          });
          toast(data.message || 'Reservasi disetujui.', 'ok');
          setTimeout(() => location.reload(), 600);
        } catch (error) {
          toast(error.message, 'error');
          button.disabled = false;
          button.removeAttribute('aria-busy');
        }
      });
    });

    $$('[data-reject]').forEach((button) => {
      button.addEventListener('click', () => {
        rejectId = button.dataset.reject;
        const copy = $('#reject-copy');
        if (copy) copy.textContent = `Tolak "${button.dataset.rejectTitle}"? Alasan wajib diisi dan akan dikirim ke pemohon.`;
        const reason = $('#reject-reason');
        if (reason) reason.value = '';
        const alertEl = $('#reject-alert');
        if (alertEl) alertEl.hidden = true;
        openDialog('reject-dialog');
        setTimeout(() => reason && reason.focus(), 50);
      });
    });

    const confirmReject = $('#confirm-reject');
    if (confirmReject) {
      confirmReject.addEventListener('click', async () => {
        const reason = $('#reject-reason');
        const alertEl = $('#reject-alert');
        if (!reason || reason.value.trim().length < 3) {
          if (alertEl) {
            alertEl.hidden = false;
            alertEl.textContent = 'Alasan penolakan wajib diisi.';
          }
          if (reason) reason.focus();
          return;
        }
        confirmReject.disabled = true;
        confirmReject.setAttribute('aria-busy', 'true');
        try {
          const data = await api(`/api/reservations/${encodeURIComponent(rejectId)}/reject`, {
            method: 'POST',
            body: JSON.stringify({ reason: reason.value.trim() })
          });
          closeDialog('reject-dialog');
          toast(data.message || 'Reservasi ditolak.', 'ok');
          setTimeout(() => location.reload(), 600);
        } catch (error) {
          if (alertEl) {
            alertEl.hidden = false;
            alertEl.textContent = error.message;
          }
        } finally {
          confirmReject.disabled = false;
          confirmReject.removeAttribute('aria-busy');
        }
      });
    }

    $$('[data-publish], [data-unpublish]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.publish || button.dataset.unpublish;
        const status = button.dataset.publish ? 'terbit' : 'ditolak';
        button.disabled = true;
        try {
          const data = await api(`/api/events/${encodeURIComponent(id)}/moderate`, {
            method: 'POST',
            body: JSON.stringify({ status })
          });
          toast(data.message || 'Moderasi disimpan.', 'ok');
          setTimeout(() => location.reload(), 600);
        } catch (error) {
          toast(error.message, 'error');
          button.disabled = false;
        }
      });
    });

    const blockForm = $('#block-form');
    if (blockForm) {
      let pendingBlock = null;
      blockForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const alertEl = $('#block-alert');
        if (alertEl) alertEl.hidden = true;
        const formData = new FormData(blockForm);
        const payload = {
          roomId: Number(formData.get('roomId')),
          startAt: toIsoWita(formData.get('start')),
          endAt: toIsoWita(formData.get('end')),
          reason: String(formData.get('reason') || '').trim()
        };
        if (!payload.startAt || !payload.endAt) {
          showBlockAlert('Waktu blokir tidak valid.');
          return;
        }
        if (payload.endAt <= payload.startAt) {
          showBlockAlert('Waktu selesai harus setelah waktu mulai.');
          return;
        }
        if (payload.reason.length < 3) {
          showBlockAlert('Alasan blokir wajib diisi.');
          return;
        }
        await submitBlock(payload, false);
      });

      async function submitBlock(payload, confirmOverlap) {
        const submit = blockForm.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
          const data = await api(`/api/rooms/${encodeURIComponent(payload.roomId)}/blocks`, {
            method: 'POST',
            body: JSON.stringify({ ...payload, confirmOverlap })
          });
          toast(data.message || 'Blokir dibuat.', 'ok');
          setTimeout(() => location.reload(), 600);
        } catch (error) {
          if (error.status === 409 && error.payload?.error === 'OVERLAP_CONFIRMATION_REQUIRED') {
            pendingBlock = payload;
            const list = $('#block-conflicts');
            if (list) {
              list.innerHTML = (error.payload.conflicts?.reservations || [])
                .map(
                  (r) => `<li><strong>${escapeHtml(r.public_id)}</strong> · ${escapeHtml(r.activity_name)} · ${escapeHtml(r.requester_name)}</li>`
                )
                .join('');
            }
            openDialog('block-confirm-dialog');
          } else {
            showBlockAlert(error.message);
          }
        } finally {
          submit.disabled = false;
        }
      }

      function showBlockAlert(message) {
        const alertEl = $('#block-alert');
        if (!alertEl) return;
        alertEl.hidden = false;
        alertEl.textContent = message;
      }

      const confirmOverlap = $('#confirm-block-overlap');
      if (confirmOverlap) {
        confirmOverlap.addEventListener('click', async () => {
          if (!pendingBlock) return;
          confirmOverlap.disabled = true;
          try {
            await submitBlock(pendingBlock, true);
            closeDialog('block-confirm-dialog');
          } finally {
            confirmOverlap.disabled = false;
          }
        });
      }
    }
  }

  function toIsoWita(value) {
    if (!value) return null;
    const d = new Date(`${value}:00+08:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  /* --------------------------------------------------------------- admin */
  if (document.body.dataset.page === 'admin') initAdmin();

  function initAdmin() {
    $$('[data-role-select]').forEach((select) => {
      select.dataset.previous = select.value;
      select.addEventListener('change', async () => {
        const id = select.dataset.roleSelect;
        const previous = select.dataset.previous;
        select.disabled = true;
        try {
          await api(`/api/admin/users/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ role: select.value })
          });
          select.dataset.previous = select.value;
          toast('Peran pengguna diperbarui.', 'ok');
        } catch (error) {
          select.value = previous;
          toast(error.message, 'error');
        } finally {
          select.disabled = false;
        }
      });
    });

    $$('[data-active-toggle]').forEach((input) => {
      input.addEventListener('change', async () => {
        const id = input.dataset.activeToggle;
        input.disabled = true;
        try {
          await api(`/api/admin/users/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ active: input.checked })
          });
          toast(input.checked ? 'Akun diaktifkan.' : 'Akun dinonaktifkan.', 'ok');
        } catch (error) {
          input.checked = !input.checked;
          toast(error.message, 'error');
        } finally {
          input.disabled = false;
        }
      });
    });

    $$('[data-mode-select]').forEach((select) => {
      select.dataset.previous = select.value;
      select.addEventListener('change', async () => {
        const id = select.dataset.modeSelect;
        const previous = select.dataset.previous;
        select.disabled = true;
        try {
          await api(`/api/admin/rooms/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ mode: select.value })
          });
          select.dataset.previous = select.value;
          toast('Mode ruangan diperbarui.', 'ok');
        } catch (error) {
          select.value = previous;
          toast(error.message, 'error');
        } finally {
          select.disabled = false;
        }
      });
    });

    $$('[data-room-active]').forEach((input) => {
      input.addEventListener('change', async () => {
        const id = input.dataset.roomActive;
        input.disabled = true;
        try {
          await api(`/api/admin/rooms/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ active: input.checked })
          });
          toast(input.checked ? 'Ruangan diaktifkan.' : 'Ruangan dinonaktifkan.', 'ok');
        } catch (error) {
          input.checked = !input.checked;
          toast(error.message, 'error');
        } finally {
          input.disabled = false;
        }
      });
    });

    $$('[data-capacity-input]').forEach((input) => {
      input.dataset.previous = input.value;
      input.addEventListener('change', async () => {
        const id = input.dataset.capacityInput;
        const previous = input.dataset.previous;
        const capacity = Number(input.value);
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
          input.value = previous;
          toast('Kapasitas harus 1–500.', 'error');
          return;
        }
        input.disabled = true;
        try {
          await api(`/api/admin/rooms/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ capacity })
          });
          input.dataset.previous = String(capacity);
          toast('Kapasitas diperbarui.', 'ok');
        } catch (error) {
          input.value = previous;
          toast(error.message, 'error');
        } finally {
          input.disabled = false;
        }
      });
    });
  }

})();
