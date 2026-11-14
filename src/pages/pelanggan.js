/**
 * src/pages/pelanggan.js
 * Daftar pelanggan + CRUD + riwayat belanja + riwayat piutang + bayar piutang.
 * Setiap aksi create/delete tercatat di audit log.
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatRupiah, formatDateTime } from '../core/utils.js';
import { openModal, closeModal, confirm } from '../ui/components/modal.js';
import { toastSuccess, toastError } from '../ui/components/toast.js';
import { createSearchBox } from '../ui/components/search-box.js';
import { createNumpad } from '../ui/components/numpad.js';
import { createCustomer, validateCustomer } from '../models/customer.js';
import { getCustomerSales, getDebtLedger, payCustomerDebt } from '../services/customer-service.js';
import { getActiveShift } from '../services/shift-service.js';
import { logAudit } from '../services/audit-service.js';
import { AUDIT_ACTIONS } from '../models/audit-log.js';
import { PRICE_LEVELS } from '../models/price.js';

const page = {
  title: 'Pelanggan',
  layout: 'main',
  flush: true,

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Pelanggan');
    ctx.setNavbarBack?.(false);

    /** @type {import('../core/schema.js').Customer[]} */
    let customers = [];

    async function reload() {
      customers = await ctx.repos.customers.list();
      customers.sort((a, b) => a.name.localeCompare(b.name));
      render();
    }

    const pageEl = el('div', { class: 'kasir-page' });
    const toolbar = el('div', { class: 'kasir-toolbar' });
    const search = createSearchBox({
      placeholder: 'Cari nama/telepon…',
      onInput: () => render(),
    });
    toolbar.appendChild(el('div', { class: 'kasir-toolbar__row' }, search.root));

    const list = el('div', { class: 'kasir-list' });
    const fab = el('button', {
      class: 'fab', type: 'button', 'aria-label': 'Tambah pelanggan',
      onClick: () => openForm(null),
    }, icon('plus', { size: 24 }));

    pageEl.append(toolbar, list);
    root.appendChild(pageEl);
    pageEl.appendChild(fab);

    function render() {
      clear(list);
      const q = search.value.trim().toLowerCase();
      const filtered = q
        ? customers.filter((c) =>
            c.name.toLowerCase().includes(q) ||
            (c.phone && c.phone.includes(q)))
        : customers;

      if (!filtered.length) {
        list.appendChild(el('div', { class: 'empty' },
          icon('pelanggan', { size: 48 }),
          el('div', { class: 'empty__title' }, q ? 'Tidak ditemukan' : 'Belum ada pelanggan'),
          el('div', null, q ? 'Coba kata kunci lain.' : 'Tap + untuk menambah pelanggan.'),
        ));
        return;
      }

      for (const c of filtered) {
        const debtBadge = c.debt > 0
          ? el('span', { class: 'chip chip--warning', style: { marginLeft: '6px' } },
              `Utang ${formatRupiah(c.debt)}`)
          : null;
        list.appendChild(el('div', {
          class: 'list-item',
          onClick: () => openDetail(c),
        },
          el('div', { class: 'list-item__main' },
            el('div', { class: 'list-item__title' }, c.name, debtBadge),
            el('div', { class: 'list-item__meta' },
              `${c.phone || '-'} • level ${c.priceLevel}`),
            c.discountPercent > 0
              ? el('div', { class: 'list-item__meta' }, `Diskon ${c.discountPercent}%`)
              : null,
          ),
          el('div', { class: 'list-item__side' }, icon('chevron-right', { size: 20 })),
        ));
      }
    }

    /* ---------------- Detail ---------------- */

    async function openDetail(c) {
      const content = el('div', null,
        row('Nama', c.name),
        row('Telepon', c.phone || '-'),
        row('Alamat', c.address || '-'),
        row('Level harga', c.priceLevel),
        row('Diskon default', `${c.discountPercent}%`),
        row('Plafon utang', formatRupiah(c.creditLimit)),
        row('Utang saat ini', formatRupiah(c.debt)),
        c.notes ? row('Catatan', c.notes) : null,
      );

      const actions = el('div', { style: { marginTop: '12px' } });

      if (c.debt > 0) {
        actions.appendChild(el('button', {
          class: 'btn btn--warning btn--block',
          type: 'button',
          style: { marginBottom: '8px' },
          onClick: () => { closeModal(); openDebtLedger(c); },
        }, icon('utang', { size: 18 }), 'Riwayat Piutang'));
      }

      actions.appendChild(el('button', {
        class: 'btn btn--block', type: 'button',
        style: { marginBottom: '8px' },
        onClick: () => { closeModal(); openHistory(c); },
      }, icon('receipt', { size: 18 }), 'Riwayat Belanja'));

      actions.appendChild(el('button', {
        class: 'btn btn--block', type: 'button',
        style: { marginBottom: '8px' },
        onClick: () => { closeModal(); openForm(c); },
      }, icon('edit', { size: 18 }), 'Edit'));

      actions.appendChild(el('button', {
        class: 'btn btn--danger btn--block', type: 'button',
        onClick: async () => {
          if (!await confirm({
            title: 'Hapus pelanggan',
            message: `Hapus "${c.name}"?`,
            confirmText: 'Hapus', danger: true,
          })) return;
          try {
            await ctx.repos.customers.softDelete(c.id);
            await logAudit(ctx, {
              action: AUDIT_ACTIONS.CUSTOMER_DELETE,
              details: { customerId: c.id, customerName: c.name },
            });
            closeModal();
            toastSuccess('Pelanggan dihapus');
            await reload();
          } catch (e) { toastError(e.message || 'Gagal menghapus'); }
        },
      }, icon('trash', { size: 18 }), 'Hapus'));

      openModal({
        title: 'Detail Pelanggan',
        content: el('div', null, content, actions),
      });
    }

    /* ---------------- Riwayat belanja ---------------- */

    async function openHistory(c) {
      const sales = await getCustomerSales(ctx, c.id, 50);
      const content = el('div');

      if (sales.length === 0) {
        content.appendChild(el('div', { class: 'empty', style: { padding: '16px' } },
          el('div', { class: 'empty__title' }, 'Belum ada transaksi'),
        ));
      } else {
        for (const s of sales) {
          content.appendChild(el('div', {
            class: 'list-item',
            onClick: () => { closeModal(); openSalePreview(s); },
          },
            el('div', { class: 'list-item__main' },
              el('div', { class: 'list-item__title' }, s.number),
              el('div', { class: 'list-item__meta' },
                `${formatDateTime(s.createdAt)} • ${s.items.length} item`),
            ),
            el('div', { class: 'list-item__side' },
              el('strong', null, formatRupiah(s.total))),
          ));
        }
      }

      openModal({
        title: `Riwayat Belanja — ${c.name}`,
        content,
      });
    }

    /* ---------------- Riwayat piutang ---------------- */

    async function openDebtLedger(c) {
      const ledger = await getDebtLedger(ctx, c.id);
      const content = el('div');

      content.appendChild(el('div', { class: 'card', style: { marginBottom: '12px' } },
        el('div', { class: 'card__row' },
          el('span', null, 'Utang saat ini'),
          el('strong', { style: { color: 'var(--color-warning)' } }, formatRupiah(c.debt)),
        ),
        el('div', { class: 'card__row' },
          el('span', null, 'Plafon'),
          el('strong', null, formatRupiah(c.creditLimit)),
        ),
      ));

      if (ledger.length === 0) {
        content.appendChild(el('div', { class: 'empty', style: { padding: '16px' } },
          el('div', { class: 'empty__title' }, 'Belum ada riwayat piutang'),
        ));
      } else {
        for (const e of ledger) {
          const isCharge = e.kind === 'charge';
          content.appendChild(el('div', { class: 'list-item' },
            el('div', { class: 'list-item__main' },
              el('div', { class: 'list-item__title' },
                isCharge ? `Utang — ${e.sale.number}` : `Bayar — ${e.sale.number}`),
              el('div', { class: 'list-item__meta' }, formatDateTime(e.at)),
              el('div', { class: 'list-item__meta' }, `Saldo: ${formatRupiah(e.balance)}`),
            ),
            el('div', { class: 'list-item__side' },
              el('strong', {
                style: { color: isCharge ? 'var(--color-warning)' : 'var(--color-success)' },
              }, (isCharge ? '+' : '-') + formatRupiah(e.amount)),
            ),
          ));
        }
      }

      const payBtn = el('button', {
        class: 'btn btn--primary btn--block',
        type: 'button',
        style: { marginTop: '12px' },
        onClick: () => { closeModal(); openDebtPayment(c); },
      }, icon('cash', { size: 18 }), 'Bayar Piutang');

      openModal({
        title: `Riwayat Piutang — ${c.name}`,
        content: el('div', null, content, payBtn),
      });
    }

    /* ---------------- Bayar piutang ---------------- */

    function openDebtPayment(c) {
      const numpad = createNumpad({
        allowDecimal: false,
        enterLabel: 'Bayar',
        initial: String(c.debt),
        onEnter: (v) => doPay(v),
      });

      const methodSelect = el('select', { class: 'select' },
        el('option', { value: 'cash' }, 'Tunai'),
        el('option', { value: 'qris' }, 'QRIS'),
        el('option', { value: 'transfer' }, 'Transfer'),
        el('option', { value: 'debit' }, 'Debit'),
      );

      const refInput = el('input', {
        class: 'input', placeholder: 'No. referensi (opsional)',
      });

      const confirmBtn = el('button', {
        class: 'btn btn--primary btn--block',
        type: 'button',
        onClick: () => doPay(numpad.getValue()),
      }, 'Bayar');

      const content = el('div', null,
        el('div', { class: 'card', style: { marginBottom: '12px' } },
          el('div', { class: 'card__row' },
            el('span', null, 'Utang'),
            el('strong', { style: { color: 'var(--color-warning)' } }, formatRupiah(c.debt)),
          ),
        ),
        numpad.root,
        el('div', { style: { height: '8px' } }),
        el('div', { class: 'field' },
          el('label', { class: 'field__label' }, 'Metode'), methodSelect),
        el('div', { class: 'field' },
          el('label', { class: 'field__label' }, 'Referensi'), refInput),
        confirmBtn,
      );

      openModal({ title: 'Bayar Piutang', content });

      async function doPay(valueStr) {
        try {
          const amount = Math.round(Number(valueStr) || 0);
          if (amount <= 0) throw new Error('Nominal harus > 0');
          if (amount > c.debt) throw new Error('Nominal melebihi sisa utang');

          const shift = await getActiveShift(ctx);
          await payCustomerDebt(
            ctx, c.id, amount,
            methodSelect.value, refInput.value.trim(),
            'kasir', shift ? shift.id : '',
          );
          closeModal();
          toastSuccess('Piutang dibayar');
          await reload();
        } catch (e) {
          toastError(e.message || 'Gagal membayar');
        }
      }
    }

    /* ---------------- Preview sale ---------------- */

    function openSalePreview(s) {
      const content = el('div', null,
        row('No', s.number),
        row('Tanggal', formatDateTime(s.createdAt)),
        row('Total', formatRupiah(s.total)),
        row('Status', s.status),
      );

      if (s.items && s.items.length) {
        const itemsEl = el('div', { style: { marginTop: '12px' } });
        for (const it of s.items) {
          itemsEl.appendChild(el('div', { class: 'detail-row' },
            el('span', null, `${it.productName} ${it.qty}${it.unitName}`),
            el('strong', null, formatRupiah(it.total)),
          ));
        }
        content.appendChild(itemsEl);
      }

      openModal({
        title: 'Detail Transaksi',
        content,
      });
    }

    /* ---------------- Form tambah/edit ---------------- */

    function openForm(existing) {
      const nameInput = el('input', { class: 'input', value: existing?.name || '' });
      const phoneInput = el('input', { class: 'input', type: 'tel', value: existing?.phone || '' });
      const addressInput = el('input', { class: 'input', value: existing?.address || '' });

      const levelSelect = el('select', { class: 'select' },
        ...PRICE_LEVELS.map((lv) => el('option', { value: lv }, lv)),
      );
      levelSelect.value = existing?.priceLevel || 'retail';

      const discInput = el('input', {
        class: 'input input--number', type: 'number', min: '0', max: '100', step: 'any',
        value: String(existing?.discountPercent ?? 0),
      });
      const limitInput = el('input', {
        class: 'input input--number', type: 'number', min: '0', step: '1',
        value: String(existing?.creditLimit ?? 0),
      });
      const notesInput = el('textarea', { class: 'textarea', rows: 2 }, existing?.notes || '');

      const saveBtn = el('button', {
        class: 'btn btn--primary btn--block', type: 'button',
        onClick: save,
      }, existing ? 'Simpan' : 'Tambah Pelanggan');

      const content = el('div', null,
        field('Nama *', nameInput),
        field('Telepon', phoneInput),
        field('Alamat', addressInput),
        el('div', { class: 'grid grid--2' },
          field('Level harga', levelSelect),
          field('Diskon default (%)', discInput),
        ),
        field('Plafon utang (Rp)', limitInput),
        field('Catatan', notesInput),
        saveBtn,
      );

      openModal({ title: existing ? 'Edit Pelanggan' : 'Pelanggan Baru', content });

      async function save() {
        try {
          const payload = createCustomer({
            id: existing?.id || '',
            name: nameInput.value.trim(),
            phone: phoneInput.value.trim(),
            address: addressInput.value.trim(),
            priceLevel: levelSelect.value,
            discountPercent: Math.max(0, Math.min(100, Number(discInput.value) || 0)),
            creditLimit: Math.max(0, Math.round(Number(limitInput.value) || 0)),
            debt: existing?.debt || 0,
            notes: notesInput.value.trim(),
            createdAt: existing?.createdAt || 0,
          });
          validateCustomer(payload);
          await ctx.repos.customers.save(payload);

          if (!existing) {
            await logAudit(ctx, {
              action: AUDIT_ACTIONS.CUSTOMER_CREATE,
              details: { customerName: payload.name, phone: payload.phone },
            });
          }

          closeModal();
          toastSuccess('Pelanggan disimpan');
          await reload();
          ctx.cart?.refreshFromDb().catch(() => {});
        } catch (e) {
          toastError(e.message || 'Gagal menyimpan');
        }
      }
    }

    /* ---------------- Helpers ---------------- */

    function row(label, value) {
      return el('div', { class: 'detail-row' },
        el('span', null, label),
        el('strong', { style: { fontWeight: '500' } }, value),
      );
    }

    function field(label, inputNode) {
      return el('div', { class: 'field' },
        el('label', { class: 'field__label' }, label),
        inputNode,
      );
    }

    await reload();
  },
};

export default page;