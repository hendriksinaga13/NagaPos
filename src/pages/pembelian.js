/**
 * src/pages/pembelian.js
 * Form pembelian + input expiry per item.
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatRupiah } from '../core/utils.js';
import { openModal, closeModal, confirm } from '../ui/components/modal.js';
import { toastSuccess, toastError } from '../ui/components/toast.js';
import { createSearchBox } from '../ui/components/search-box.js';
import { recordPurchase } from '../services/inventory-service.js';
import { navigate } from '../router.js';

const page = {
  title: 'Pembelian',
  layout: 'main',
  flush: true,

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Pembelian');
    ctx.setNavbarBack?.(true);

    let products = [], units = [], suppliers = [];
    let unitsByProduct = new Map();
    let supplierId = '';
    const lines = [];
    let notes = '';
    let saving = false;

    async function reloadMaster() {
      [products, units, suppliers] = await Promise.all([
        ctx.repos.products.list(),
        ctx.repos.units.list(),
        ctx.repos.suppliers.list(),
      ]);
      products.sort((a, b) => a.name.localeCompare(b.name));
      suppliers.sort((a, b) => a.name.localeCompare(b.name));
      unitsByProduct = new Map();
      for (const u of units) {
        if (!unitsByProduct.has(u.productId)) unitsByProduct.set(u.productId, []);
        unitsByProduct.get(u.productId).push(u);
      }
    }

    const pageEl = el('div', { class: 'kasir-page' });
    root.appendChild(pageEl);

    const supplierLabel = el('span', { class: 'kasir-customer__label' }, 'Tanpa supplier');
    const supplierChip = el('button', { class: 'kasir-customer kasir-customer--empty', type: 'button', onClick: openSupplierPicker },
      icon('stok', { size: 16 }), supplierLabel);

    const notesInput = el('input', { type: 'text', class: 'input', placeholder: 'Catatan pembelian (opsional)', onInput: (e) => { notes = e.target.value; } });

    const toolbar = el('div', { class: 'kasir-toolbar' }, supplierChip, notesInput);
    const list = el('div', { class: 'kasir-list' });
    const totalEl = el('span', { class: 'kasir-total-value' }, formatRupiah(0));
    const saveBtn = el('button', { class: 'btn btn--primary btn--lg btn--block', type: 'button', onClick: onSave }, 'Simpan Pembelian');
    const footer = el('div', { class: 'kasir-footer' }, el('div', { class: 'kasir-total-row' }, el('span', { class: 'kasir-total-label' }, 'Total'), totalEl), saveBtn);
    const fab = el('button', { class: 'fab', type: 'button', 'aria-label': 'Tambah item', onClick: openProductPicker }, icon('plus', { size: 24 }));

    pageEl.append(toolbar, list, footer, fab);

    function fmtDate(ts) {
      if (!ts) return '-';
      return new Date(ts).toLocaleDateString('id-ID');
    }

    function render() {
      clear(list);
      if (lines.length === 0) {
        list.appendChild(el('div', { class: 'empty' }, icon('cash', { size: 48 }), el('div', { class: 'empty__title' }, 'Belum ada item'), el('div', null, 'Tap + untuk menambah produk yang dibeli.')));
      } else {
        for (let i = 0; i < lines.length; i++) {
          const ln = lines[i];
          const p = products.find((x) => x.id === ln.productId);
          const u = units.find((x) => x.id === ln.unitId);
          const subtotal = Math.round(ln.qty * ln.costPerUnit);
          list.appendChild(el('div', { class: 'purchase-item' },
            el('div', null,
              el('div', { class: 'purchase-item__name' }, p?.name || '-'),
              el('div', { class: 'purchase-item__meta' }, `${ln.qty} ${u?.name || ''} × ${formatRupiah(ln.costPerUnit)} = ${formatRupiah(subtotal)}`),
              ln.expiryDate ? el('div', { class: 'purchase-item__meta', style: { color: 'var(--color-warning)' } }, `Exp: ${fmtDate(ln.expiryDate)}`) : null,
            ),
            el('button', { class: 'purchase-item__remove', type: 'button', 'aria-label': 'Hapus', onClick: () => { lines.splice(i, 1); render(); } }, icon('trash', { size: 18 })),
          ));
        }
      }
      const total = lines.reduce((s, l) => s + Math.round(l.qty * l.costPerUnit), 0);
      totalEl.textContent = formatRupiah(total);
      saveBtn.disabled = saving || lines.length === 0;
    }

    function openSupplierPicker() {
      const listEl = el('div', { class: 'picker-list' });
      function item(name, id) {
        return el('div', { class: 'list-item', onClick: () => { supplierId = id; supplierLabel.textContent = name || 'Tanpa supplier'; supplierChip.classList.toggle('kasir-customer--empty', !id); closeModal(); } },
          el('div', { class: 'list-item__main' }, el('div', { class: 'list-item__title' }, name || 'Tanpa supplier')),
          el('div', { class: 'list-item__side' }, icon('chevron-right', { size: 20 })));
      }
      listEl.appendChild(item('Tanpa supplier', ''));
      for (const s of suppliers) listEl.appendChild(item(s.name, s.id));
      openModal({ title: 'Pilih Supplier', content: listEl });
    }

    function openProductPicker() {
      const listEl = el('div', { class: 'picker-list' });
      const search = createSearchBox({ placeholder: 'Cari produk…', autoFocus: true, onInput: (q) => renderList(q.toLowerCase()) });
      function renderList(q) {
        clear(listEl);
        const filtered = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
        if (!filtered.length) { listEl.appendChild(el('div', { class: 'empty', style: { padding: '16px' } }, el('div', { class: 'empty__title' }, 'Tidak ditemukan'))); return; }
        for (const p of filtered) {
          listEl.appendChild(el('div', { class: 'list-item', onClick: () => { closeModal(); openLineEditor(p); } },
            el('div', { class: 'list-item__main' },
              el('div', { class: 'list-item__title' }, p.name, p.trackExpiry ? el('span', { class: 'chip chip--warning', style: { marginLeft: '6px' } }, 'Exp') : null),
              el('div', { class: 'list-item__meta' }, `HPP ${formatRupiah(p.cost)} • stok ${p.stock}`),
            ),
            el('div', { class: 'list-item__side' }, icon('chevron-right', { size: 20 }))));
        }
      }
      renderList('');
      openModal({ title: 'Pilih Produk', content: el('div', null, search.root, listEl) });
    }

    function openLineEditor(product) {
      const productUnits = unitsByProduct.get(product.id) || [];
      if (!productUnits.length) { toastError('Produk belum punya satuan'); return; }
      const baseUnit = productUnits.find((u) => u.isBase) || productUnits[0];

      const unitSelect = el('select', { class: 'select' }, ...productUnits.map((u) => el('option', { value: u.id }, `${u.name} (×${u.factor})`)));
      unitSelect.value = baseUnit.id;

      const qtyInput = el('input', { class: 'input input--number', type: 'number', min: '0', step: 'any', value: '1' });
      const costInput = el('input', { class: 'input input--number', type: 'number', min: '0', step: '1', value: String(baseUnit.prices?.retail || product.cost || 0) });

      let expiryDateInput = null;
      let expiryField = null;
      if (product.trackExpiry) {
        expiryDateInput = el('input', { class: 'input', type: 'date' });
        expiryField = el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Tanggal Expired *'), expiryDateInput,
          el('div', { class: 'field__hint' }, 'Wajib untuk produk yang dilacak expired.'));
      }

      const subtotalInfo = el('div', { class: 'card__row' }, el('span', null, 'Subtotal'), el('strong', null, formatRupiah(0)));
      function updateSubtotal() {
        const q = Number(qtyInput.value) || 0;
        const c = Number(costInput.value) || 0;
        subtotalInfo.querySelector('strong').textContent = formatRupiah(Math.round(q * c));
      }
      qtyInput.addEventListener('input', updateSubtotal);
      costInput.addEventListener('input', updateSubtotal);
      updateSubtotal();

      const saveBtn = el('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: () => {
        const qty = Number(qtyInput.value) || 0;
        const cost = Math.max(0, Math.round(Number(costInput.value) || 0));
        if (qty <= 0) { toastError('Qty harus > 0'); return; }
        let expiryTs = 0;
        if (product.trackExpiry) {
          if (!expiryDateInput.value) { toastError('Tanggal expired wajib diisi'); return; }
          expiryTs = new Date(expiryDateInput.value).getTime();
        }
        lines.push({ productId: product.id, unitId: unitSelect.value, qty, costPerUnit: cost, expiryDate: expiryTs });
        closeModal(); render();
      } }, 'Tambah ke Pembelian');

      openModal({
        title: product.name,
        content: el('div', null,
          el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Satuan'), unitSelect),
          el('div', { class: 'grid grid--2' },
            el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Qty'), qtyInput),
            el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Harga pokok / unit'), costInput),
          ),
          expiryField,
          subtotalInfo,
          el('div', { style: { height: '8px' } }),
          saveBtn,
        ),
      });
    }

    async function onSave() {
      if (saving || lines.length === 0) return;
      const ok = await confirm({ title: 'Simpan Pembelian', message: `Simpan ${lines.length} item? Stok akan ditambahkan otomatis.`, confirmText: 'Simpan' });
      if (!ok) return;
      saving = true; saveBtn.disabled = true; saveBtn.textContent = 'Menyimpan…';
      try {
        const result = await recordPurchase(ctx, { supplierId, items: lines.map((l) => ({ ...l })), notes });
        toastSuccess(`Pembelian tersimpan • ${formatRupiah(result.totalAmount)}`);
        lines.length = 0; notes = ''; notesInput.value = ''; supplierId = '';
        supplierLabel.textContent = 'Tanpa supplier'; supplierChip.classList.add('kasir-customer--empty');
        await reloadMaster(); render();
        ctx.cart?.refreshFromDb().catch(() => {});
      } catch (e) { toastError(e.message || 'Gagal menyimpan pembelian'); }
      finally { saving = false; saveBtn.textContent = 'Simpan Pembelian'; render(); }
    }

    await reloadMaster();
    render();
  },
};

export default page;