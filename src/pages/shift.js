/**
 * src/pages/shift.js
 * Buka/tutup shift dengan user tracking.
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatRupiah, formatDateTime } from '../core/utils.js';
import { openModal, closeModal, confirm } from '../ui/components/modal.js';
import { toastSuccess, toastError } from '../ui/components/toast.js';
import { createNumpad } from '../ui/components/numpad.js';
import { getActiveShift, openShift, closeShift, computeShiftTotals } from '../services/shift-service.js';
import { getCurrentUser } from '../services/auth-service.js';

const page = {
  title: 'Shift Kasir',
  layout: 'main',

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Shift Kasir');
    ctx.setNavbarBack?.(true);

    const currentUser = getCurrentUser();
    const cashierId = currentUser?.username || currentUser?.id || 'kasir';
    const cashierName = currentUser?.name || 'Kasir';

    const pageEl = el('div', { class: 'page' });
    root.appendChild(pageEl);

    async function reload() {
      clear(pageEl);
      pageEl.appendChild(el('div', { class: 'page__header' }, el('h2', { class: 'page__title' }, 'Shift Kasir')));

      const active = await getActiveShift(ctx);
      if (active) await renderActive(active);
      else renderOpen();

      await renderHistory();
    }

    async function renderActive(shift) {
      const totals = await computeShiftTotals(ctx, shift.id);
      const expected = shift.openingCash + totals.cashSales - totals.refundCash;

      const card = el('div', { class: 'card' },
        el('div', { class: 'card__title' }, 'Shift Aktif ', el('span', { class: 'chip chip--success', style: { marginLeft: '6px' } }, 'OPEN')),
        el('div', { class: 'card__row' }, el('span', null, 'Kasir'), el('strong', null, shift.cashierId)),
        el('div', { class: 'card__row' }, el('span', null, 'Dibuka'), el('strong', null, formatDateTime(shift.openedAt))),
        el('div', { class: 'card__row' }, el('span', null, 'Modal awal'), el('strong', null, formatRupiah(shift.openingCash))),
        el('div', { class: 'card__row' }, el('span', null, 'Transaksi'), el('strong', null, String(totals.countSales))),
        el('div', { class: 'card__row' }, el('span', null, 'Penjualan'), el('strong', null, formatRupiah(totals.totalSales))),
        el('div', { class: 'card__row' }, el('span', null, 'Tunai masuk'), el('strong', null, formatRupiah(totals.cashSales))),
        el('div', { class: 'card__row' }, el('span', null, 'Kembalian keluar'), el('strong', null, formatRupiah(totals.refundCash))),
        el('div', { class: 'card__row', style: { borderTop: '1px solid var(--color-border)', paddingTop: '8px', marginTop: '8px' } },
          el('span', null, 'Kas yang seharusnya'),
          el('strong', { style: { color: 'var(--color-primary)' } }, formatRupiah(expected))),
      );

      const closeBtn = el('button', { class: 'btn btn--danger btn--block', style: { marginTop: '12px' }, onClick: () => openCloseForm(shift, expected) }, icon('close', { size: 18 }), 'Tutup Shift');

      pageEl.appendChild(card);
      pageEl.appendChild(closeBtn);
    }

    function renderOpen() {
      const card = el('div', { class: 'card', style: { textAlign: 'center' } },
        el('div', { style: { padding: '16px' } },
          icon('utang', { size: 48 }),
          el('div', { class: 'card__title', style: { marginTop: '8px' } }, 'Tidak ada shift aktif'),
          el('div', { style: { fontSize: 'var(--fs-sm)', color: 'var(--color-text-muted)' } }, 'Buka shift untuk mencatat modal awal.'),
        ),
      );
      const openBtn = el('button', { class: 'btn btn--primary btn--block', style: { marginTop: '12px' }, onClick: openOpenForm }, icon('plus', { size: 18 }), 'Buka Shift');
      pageEl.appendChild(card);
      pageEl.appendChild(openBtn);
    }

    function openOpenForm() {
      const numpad = createNumpad({ allowDecimal: false, enterLabel: 'Buka', initial: '0', onEnter: (v) => submit(v) });
      const notesInput = el('input', { class: 'input', placeholder: 'Catatan (opsional)' });
      const confirmBtn = el('button', { class: 'btn btn--primary btn--block', onClick: () => submit(numpad.getValue()) }, 'Buka Shift');
      const content = el('div', null,
        el('div', { style: { padding: '8px 0', color: 'var(--color-text-muted)', fontSize: 'var(--fs-sm)' } },
          `Kasir: ${cashierName}`),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Modal awal'), numpad.root),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Catatan'), notesInput),
        confirmBtn,
      );
      openModal({ title: 'Buka Shift', content });
      async function submit(v) {
        try {
          const amount = Math.round(Number(v) || 0);
          await openShift(ctx, { cashierId, openingCash: amount, notes: notesInput.value.trim() });
          closeModal(); toastSuccess('Shift dibuka'); await reload();
        } catch (e) { toastError(e.message || 'Gagal membuka shift'); }
      }
    }

    function openCloseForm(shift, expected) {
      const numpad = createNumpad({ allowDecimal: false, enterLabel: 'Tutup', initial: String(expected), onEnter: (v) => submit(v) });
      const notesInput = el('input', { class: 'input', placeholder: 'Catatan (opsional)' });
      const diffInfo = el('div', { class: 'card__row' }, el('span', null, 'Selisih'), el('strong', null, formatRupiah(0)));
      const displayEl = numpad.root.querySelector('.numpad__display');
      function updateDiff() {
        const v = Number(numpad.getValue()) || 0;
        const diff = Math.round(v) - expected;
        const strong = diffInfo.querySelector('strong');
        strong.textContent = formatRupiah(diff);
        strong.style.color = diff === 0 ? 'var(--color-success)' : diff > 0 ? 'var(--color-warning)' : 'var(--color-danger)';
      }
      const obs = new MutationObserver(updateDiff);
      if (displayEl) obs.observe(displayEl, { childList: true, characterData: true, subtree: true });
      updateDiff();
      const confirmBtn = el('button', { class: 'btn btn--danger btn--block', onClick: async () => {
        const ok = await confirm({ title: 'Tutup Shift', message: 'Setelah ditutup, shift tidak bisa dibuka kembali. Lanjut?', confirmText: 'Tutup', danger: true });
        if (!ok) return; submit(numpad.getValue());
      } }, 'Tutup Shift');
      const content = el('div', null,
        el('div', { class: 'card', style: { marginBottom: '12px' } },
          el('div', { class: 'card__row' }, el('span', null, 'Kas seharusnya'), el('strong', null, formatRupiah(expected)))),
        el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Kas aktual dihitung'), numpad.root),
        diffInfo,
        el('div', { class: 'field', style: { marginTop: '12px' } }, el('label', { class: 'field__label' }, 'Catatan'), notesInput),
        confirmBtn,
      );
      openModal({ title: 'Tutup Shift', content });
      async function submit(v) {
        try {
          obs.disconnect();
          const amount = Math.round(Number(v) || 0);
          await closeShift(ctx, shift.id, amount, notesInput.value.trim());
          closeModal(); toastSuccess('Shift ditutup'); await reload();
        } catch (e) { toastError(e.message || 'Gagal menutup shift'); }
      }
    }

    async function renderHistory() {
      const all = await ctx.repos.shifts.list();
      const closed = all.filter((s) => s.status === 'closed').sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0)).slice(0, 20);
      const wrap = el('div', { style: { marginTop: '16px' } }, el('div', { class: 'form-section__title' }, 'Riwayat Shift Terakhir'));
      if (closed.length === 0) {
        wrap.appendChild(el('div', { class: 'empty', style: { padding: '16px' } }, el('div', { class: 'empty__title' }, 'Belum ada riwayat')));
      } else {
        for (const s of closed) {
          const diffColor = s.difference === 0 ? 'var(--color-success)' : s.difference > 0 ? 'var(--color-warning)' : 'var(--color-danger)';
          wrap.appendChild(el('div', { class: 'card', style: { marginBottom: '8px' } },
            el('div', { class: 'card__row' }, el('span', null, formatDateTime(s.closedAt || s.openedAt)), el('strong', null, s.cashierId)),
            el('div', { class: 'card__row' }, el('span', null, 'Buka'), el('span', null, formatRupiah(s.openingCash))),
            el('div', { class: 'card__row' }, el('span', null, 'Kas seharusnya'), el('span', null, formatRupiah(s.expectedCash || 0))),
            el('div', { class: 'card__row' }, el('span', null, 'Kas aktual'), el('span', null, formatRupiah(s.closingCash || 0))),
            el('div', { class: 'card__row' }, el('span', null, 'Selisih'), el('strong', { style: { color: diffColor } }, formatRupiah(s.difference || 0))),
          ));
        }
      }
      pageEl.appendChild(wrap);
    }

    await reload();
  },
};

export default page;