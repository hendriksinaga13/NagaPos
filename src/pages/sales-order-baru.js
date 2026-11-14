/**
 * src/pages/sales-order-baru.js
 * Form order salesman — Super Compact Layout.
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatRupiah } from '../core/utils.js';
import { openModal, closeModal, confirm } from '../ui/components/modal.js';
import { toastSuccess, toastError } from '../ui/components/toast.js';
import { createSearchBox } from '../ui/components/search-box.js';
import { saveSO } from '../services/sales-order-service.js';
import { finishVisit, skipVisit } from '../services/visit-service.js';
import { unitPrice } from '../models/unit.js';
import { navigate } from '../router.js';

const page = {
  title: 'Buat Order',
  layout: 'main',
  flush: true,

  async mount(root, params, ctx) {
    const visitCustomerId = params?.query?.get?.('customerId') || null;

    /* ============ STATE ============ */
    let products = [];
    let unitsByProduct = new Map();
    let customerId = null;
    let customerName = 'Pelanggan umum';
    let searchQuery = '';
    let selectedCategory = '';

    // State Qty: Map<productId, { [unitId]: qty }>
    const qtyState = new Map();

    /* ============ LOAD DATA ============ */
    async function loadData() {
      products = await ctx.repos.products.list();
      products = products.filter((p) => p.active);
      products.sort((a, b) => a.name.localeCompare(b.name));

      const units = await ctx.repos.units.list();
      unitsByProduct = new Map();
      for (const u of units) {
        if (!unitsByProduct.has(u.productId)) unitsByProduct.set(u.productId, []);
        unitsByProduct.get(u.productId).push(u);
      }

      if (visitCustomerId) {
        const c = await ctx.repos.customers.get(visitCustomerId);
        if (c) {
          customerId = c.id;
          customerName = c.name;
        }
      }
    }
    await loadData();

    // Set judul Navbar dengan nama pelanggan
    ctx.setNavbarTitle?.(visitCustomerId ? `Order: ${customerName}` : 'Buat Order');
    ctx.setNavbarBack?.(true);

    /* ============ DOM STRUCTURE ============ */
    const pageEl = el('div', {
      class: 'kasir-page',
      style: { display: 'flex', flexDirection: 'column' },
    });

    // Toolbar: Search (Compact)
    const toolbar = el('div', { class: 'so-toolbar' });
    const searchBox = createSearchBox({
      placeholder: 'Cari produk…',
      onInput: (v) => { searchQuery = v.toLowerCase(); renderRows(); },
    });
    toolbar.appendChild(searchBox.root);
    
    // Tombol pelanggan (jika bukan dari kunjungan)
    if (!visitCustomerId) {
      const customerBtn = el('button', {
        class: 'btn btn--ghost btn--sm', type: 'button', style: { padding: '0 8px', height: '34px', flexShrink: 0 },
        onClick: openCustomerPicker
      }, icon('pelanggan', { size: 16 }));
      toolbar.appendChild(customerBtn);
    }
    pageEl.appendChild(toolbar);

    // Filter Kategori (Compact)
    const categories = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
    const filterBar = el('div', { class: 'so-filters' });
    filterBar.appendChild(el('button', {
      class: 'so-chip', type: 'button',
      'aria-pressed': String(selectedCategory === ''),
      onClick: () => { selectedCategory = ''; renderFilters(); renderRows(); },
    }, 'Semua'));
    for (const cat of categories) {
      filterBar.appendChild(el('button', {
        class: 'so-chip', type: 'button',
        'aria-pressed': String(selectedCategory === cat),
        onClick: () => { selectedCategory = cat; renderFilters(); renderRows(); },
      }, cat));
    }
    pageEl.appendChild(filterBar);

    // Header Tabel
    pageEl.appendChild(el('div', { class: 'so-header' },
      el('span', { class: 'so-header__product' }, 'Produk'),
      el('span', null, 'Crt'),
      el('span', null, 'Ls'),
      el('span', null, 'pcs'),
    ));

    // List (Scrollable)
    const listEl = el('div', { class: 'so-list' });
    pageEl.appendChild(listEl);

    // Footer (Compact)
    const countEl = el('span', { class: 'so-footer__count' }, '0 item');
    const totalEl = el('span', { class: 'so-footer__total' }, 'Rp 0');
    const saveBtn = el('button', {
      class: 'btn btn--primary', type: 'button',
      style: { width: '100%', height: '44px', fontSize: '16px' },
      onClick: onSave, disabled: true,
    }, 'Proses Order');

    const skipBtn = visitCustomerId ? el('button', {
      class: 'btn btn--ghost', type: 'button',
      style: { width: '100%', height: '36px', fontSize: '12px', marginTop: '4px' },
      onClick: onSkip,
    }, 'Skip (Tidak Ada Order)') : null;

    pageEl.appendChild(el('div', { class: 'so-footer' },
      el('div', { class: 'so-footer__summary' }, countEl, totalEl),
      saveBtn,
      skipBtn,
    ));

    root.appendChild(pageEl);

    /* ============ HELPERS ============ */
    function renderFilters() {
      const chips = filterBar.querySelectorAll('.so-chip');
      chips.forEach((chip) => {
        const value = chip.textContent === 'Semua' ? '' : chip.textContent;
        chip.setAttribute('aria-pressed', String(value === selectedCategory));
      });
    }

    function getQty(productId, unitId) {
      const map = qtyState.get(productId);
      return map ? (map[unitId] || 0) : 0;
    }

    function setQty(productId, unitId, qty) {
      let map = qtyState.get(productId);
      if (!map) { map = {}; qtyState.set(productId, map); }
      map[unitId] = Math.max(0, qty);
      if (map[unitId] === 0) delete map[unitId];
      if (Object.keys(map).length === 0) qtyState.delete(productId);
    }

    function isRowActive(productId) { return qtyState.has(productId); }

    /* ============ RENDER ROWS ============ */
    function renderRows() {
      clear(listEl);
      let filtered = products;
      if (searchQuery) {
        filtered = filtered.filter((p) =>
          p.name.toLowerCase().includes(searchQuery) ||
          (p.sku && p.sku.toLowerCase().includes(searchQuery))
        );
      }
      if (selectedCategory) filtered = filtered.filter((p) => p.category === selectedCategory);

      if (filtered.length === 0) {
        listEl.appendChild(el('div', { class: 'empty', style: { padding: '24px' } },
          el('div', { class: 'empty__title' }, 'Tidak ditemukan'),
        ));
        return;
      }

      for (const p of filtered) {
        listEl.appendChild(renderProductRow(p));
      }
    }

    function renderProductRow(product) {
      const units = unitsByProduct.get(product.id) || [];
      const baseUnit = units.find((u) => u.isBase) || units[0];
      
      const otherUnits = units
        .filter((u) => u.id !== baseUnit.id)
        .sort((a, b) => b.factor - a.factor);

      const slots = [null, null, baseUnit];
      if (otherUnits[0]) slots[1] = otherUnits[0];
      if (otherUnits[1]) slots[0] = otherUnits[1];

      const rowEl = el('div', {
        class: `so-row${isRowActive(product.id) ? ' so-row--active' : ''}`,
        dataset: { productId: product.id },
      });

      rowEl.appendChild(el('div', { class: 'so-row__info' },
        el('div', { class: 'so-row__name' }, product.name),
        el('div', { class: 'so-row__price' }, formatRupiah(unitPrice(baseUnit, 'retail'))),
      ));

      for (let i = 0; i < 3; i++) {
        const unit = slots[i];
        if (!unit) {
          rowEl.appendChild(el('div', { class: 'so-slot' },
            el('div', { class: 'so-slot__label' }, '-'),
            el('div', { class: 'so-slot--disabled' }),
          ));
          continue;
        }

        const qty = getQty(product.id, unit.id);
        const inputEl = el('input', {
          class: 'so-input', type: 'text', inputmode: 'decimal',
          value: qty > 0 ? String(qty) : '',
          onFocus: (e) => setTimeout(() => { try { e.target.select(); } catch {} }, 10),
          onInput: (e) => {
            const val = Math.max(0, parseFloat(e.target.value.replace(',', '.')) || 0);
            setQty(product.id, unit.id, val);
            updateTotals();
            rowEl.classList.toggle('so-row--active', isRowActive(product.id));
          },
          onBlur: (e) => {
            const v = getQty(product.id, unit.id);
            e.target.value = v > 0 ? String(v) : '';
          }
        });

        rowEl.appendChild(el('div', { class: 'so-slot' },
          el('div', { class: 'so-slot__label' }, unit.name),
          inputEl,
        ));
      }

      return rowEl;
    }

    /* ============ TOTALS ============ */
    function updateTotals() {
      let count = 0;
      let total = 0;
      for (const [productId, map] of qtyState) {
        const units = unitsByProduct.get(productId) || [];
        for (const [unitId, qty] of Object.entries(map)) {
          if (qty <= 0) continue;
          const unit = units.find((u) => u.id === unitId);
          if (!unit) continue;
          count++;
          total += Math.round(qty * unitPrice(unit, 'retail'));
        }
      }
      countEl.textContent = `${count} item`;
      totalEl.textContent = formatRupiah(total);
      saveBtn.disabled = count === 0;
    }

    /* ============ PICKER & SAVE ============ */
    async function openCustomerPicker() {
      const customers = await ctx.repos.customers.list();
      const listContainer = el('div');

      function renderList(filter = '') {
        clear(listContainer);
        const q = String(filter || '').toLowerCase();
        if (!q && customerId) {
          listContainer.appendChild(el('button', {
            class: 'btn btn--ghost btn--block', type: 'button', style: { marginBottom: '8px' },
            onClick: () => {
              customerId = null; customerName = 'Pelanggan umum';
              closeModal();
            },
          }, 'Kosongkan (Pelanggan Umum)'));
        }
        const filtered = customers.filter((c) => !q || c.name.toLowerCase().includes(q));
        for (const c of filtered) {
          listContainer.appendChild(el('div', {
            class: 'cart-item',
            onClick: () => { customerId = c.id; customerName = c.name; closeModal(); },
          }, el('div', { class: 'cart-item__info' }, el('div', { class: 'cart-item__name' }, c.name))));
        }
      }
      const search = createSearchBox({ placeholder: 'Cari…', onInput: (v) => renderList(v) });
      renderList();
      openModal({ title: 'Pilih Pelanggan', content: el('div', null, search.root, listContainer) });
    }

    async function onSave() {
      const selectedItems = [];
      for (const [productId, map] of qtyState) {
        const product = products.find((p) => p.id === productId);
        const units = unitsByProduct.get(productId) || [];
        for (const [unitId, qty] of Object.entries(map)) {
          if (qty <= 0) continue;
          const unit = units.find((u) => u.id === unitId);
          if (!product || !unit) continue;
          const price = unitPrice(unit, 'retail');
          selectedItems.push({
            productId, unitId: unit.id, productName: product.name, unitName: unit.name,
            factor: unit.factor, qty, pricePerUnit: price, total: Math.round(qty * price),
          });
        }
      }

      if (selectedItems.length === 0) return;
      saveBtn.disabled = true; saveBtn.textContent = 'Menyimpan…';

      try {
        const total = selectedItems.reduce((s, i) => s + i.total, 0);
        const saved = await saveSO(ctx, {
          customerId, customerName, items: selectedItems, total,
          status: 'pending', salesmanId: ctx.deviceCode,
        });
        if (visitCustomerId) finishVisit(visitCustomerId, { soId: saved.id, soNumber: saved.number });
        toastSuccess(`SO ${saved.number} tersimpan`);
        navigate('/salesman');
      } catch (e) {
        toastError(e.message || 'Gagal simpan SO');
        saveBtn.disabled = false; saveBtn.textContent = 'Proses Order';
      }
    }

    async function onSkip() {
      const ok = await confirm({ title: 'Tidak Ada Order', message: `Tandai "${customerName}" tidak ada order?`, confirmText: 'Skip' });
      if (!ok) return;
      if (visitCustomerId) skipVisit(visitCustomerId, 'Tidak ada order');
      toastSuccess('Kunjungan selesai');
      navigate('/salesman');
    }

    /* ============ INIT ============ */
    renderRows();
    updateTotals();
  },
};

export default page;