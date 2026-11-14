/**
 * src/pages/kasir.js
 * Halaman kasir + serial picker untuk IMEI.
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatRupiah } from '../core/utils.js';
import { openModal, closeModal } from '../ui/components/modal.js';
import { toastError, toastSuccess, toast } from '../ui/components/toast.js';
import { createSearchBox } from '../ui/components/search-box.js';
import { createScannerView } from '../ui/components/scanner-view.js';
import { BarcodeCameraScanner } from '../hardware/barcode-camera.js';
import { KeyboardWedgeScanner } from '../hardware/barcode-keyboard.js';
import { feedbackScanSuccess, feedbackError, feedbackNewOrder, primeAudio } from '../core/feedback.js';
import { unitPrice } from '../models/unit.js';
import { navigate } from '../router.js';
import { broadcastCartState, openCustomerDisplay } from '../services/cart-broadcast.js';
import { syncSOs } from '../sync/sales-order-sync.js';
import { getShortcutManager } from '../core/shortcuts.js';
import { getAvailableSerials, findSerialByCode } from '../services/serial-service.js';

let _cleanup = null;
let soPollInterval = null;

const page = {
  title: 'Kasir',
  layout: 'main',
  flush: true,

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Kasir');
    ctx.setNavbarBack?.(false);
    if (!ctx.cart) { root.appendChild(el('div', { class: 'empty' }, el('div', { class: 'empty__title' }, 'Keranjang error. Muat ulang.'))); return; }

    primeAudio();
    const cart = ctx.cart;
    try { await cart.refreshFromDb(); } catch (e) {}

    let productCache = [];
    let unitsByProduct = new Map();

    async function reloadProducts() {
      try {
        productCache = await ctx.repos.products.list();
        const units = await ctx.repos.units.list();
        unitsByProduct = new Map();
        for (const u of units) {
          if (!unitsByProduct.has(u.productId)) unitsByProduct.set(u.productId, []);
          unitsByProduct.get(u.productId).push(u);
        }
      } catch { productCache = []; unitsByProduct = new Map(); }
    }
    await reloadProducts();

    const pageEl = el('div', { class: 'kasir-page' });
    const searchBox = createSearchBox({ placeholder: 'Cari produk atau scan…', onInput: (v) => renderSearchResults(v) });
    const scanBtn = el('button', { class: 'icon-btn', onClick: openCameraScanner }, icon('scan', { size: 22 }));
    const displayBtn = el('button', { class: 'icon-btn', onClick: openCustomerScreen }, icon('screen', { size: 22 }));
    const customerChip = el('button', { class: 'kasir-customer kasir-customer--empty', onClick: openCustomerPicker },
      icon('pelanggan', { size: 16 }), el('span', { class: 'kasir-customer__label' }, 'Pelanggan umum'));

    const toolbar = el('div', { class: 'kasir-toolbar' },
      el('div', { class: 'kasir-toolbar__row' }, searchBox.root, displayBtn, scanBtn), customerChip);

    const listEl = el('div', { class: 'kasir-list' });
    const totalEl = el('span', { class: 'kasir-total-value' }, formatRupiah(0));
    const discountBadge = el('span', { class: 'chip chip--danger', hidden: true });
    const payBtn = el('button', { class: 'btn btn--primary btn--lg btn--block', disabled: true, onClick: () => navigate('/pembayaran') }, 'Bayar');

    const footer = el('div', { class: 'kasir-footer' },
      el('div', { class: 'kasir-total-row' },
        el('div', { class: 'row', style: { gap: '8px' } }, el('span', { class: 'kasir-total-label' }, 'Total'), discountBadge),
        totalEl,
      ),
      payBtn,
    );

    pageEl.append(toolbar, listEl, footer);
    root.appendChild(pageEl);

    function fmtQty(q) { return Number.isInteger(q) ? String(q) : String(q).replace('.', ','); }

    function renderCart(state) {
      clear(listEl);
      if (state.items.length === 0) {
        listEl.appendChild(el('div', { class: 'empty' }, icon('kasir', { size: 48 }), el('div', { class: 'empty__title' }, 'Keranjang kosong'), el('div', null, 'Scan barcode atau cari produk.')));
      } else {
        for (const line of state.computed.lines) {
          listEl.appendChild(el('div', { class: 'cart-item', onClick: () => openItemEditor(line) },
            el('div', { class: 'cart-item__info' },
              el('div', { class: 'cart-item__name' },
                line.productName,
                line.trackSerial ? el('span', { class: 'chip chip--info', style: { marginLeft: '6px' } }, 'IMEI') : null,
              ),
              el('div', { class: 'cart-item__meta' },
                `${fmtQty(line.qty)} ${line.unitName} × ${formatRupiah(line.pricePerUnit)}`),
              line.trackSerial && line.serials && line.serials.length > 0
                ? el('div', { class: 'cart-item__meta', style: { fontFamily: 'ui-monospace,monospace', fontSize: '11px' } },
                    line.serials.join(', '))
                : null,
            ),
            el('div', { class: 'cart-item__right' }, el('div', { class: 'cart-item__price' }, formatRupiah(line.total)))));
        }
      }
      totalEl.textContent = formatRupiah(state.computed.total);
      if (state.computed.totalDiscount > 0) { discountBadge.hidden = false; discountBadge.textContent = '-' + formatRupiah(state.computed.totalDiscount); } else discountBadge.hidden = true;
      payBtn.disabled = state.items.length === 0 || state.computed.total <= 0;
    }

    let knownCustomerId = null; let knownCustomerLabel = 'Pelanggan umum';
    async function renderCustomer(state) {
      const id = state.customerId;
      if (id === knownCustomerId) { customerChip.querySelector('.kasir-customer__label').textContent = knownCustomerLabel; customerChip.classList.toggle('kasir-customer--empty', !id); return; }
      knownCustomerId = id;
      if (!id) knownCustomerLabel = 'Pelanggan umum';
      else { try { const c = await ctx.repos.customers.get(id); knownCustomerLabel = c ? `${c.name}${c.priceLevel !== 'retail' ? ' • ' + c.priceLevel : ''}` : 'Pelanggan umum'; } catch { knownCustomerLabel = 'Pelanggan umum'; } }
      if (cart.getState().customerId !== id) return;
      customerChip.querySelector('.kasir-customer__label').textContent = knownCustomerLabel;
      customerChip.classList.toggle('kasir-customer--empty', !id);
    }

    async function openCustomerPicker() {
      const customers = await ctx.repos.customers.list();
      const listContainer = el('div');
      function renderList(filter = '') {
        clear(listContainer);
        const q = String(filter || '').toLowerCase();
        if (cart.getState().customerId) listContainer.appendChild(el('button', { class: 'btn btn--ghost btn--block', style: { marginBottom: '8px' }, onClick: async () => { await cart.setCustomer(null); closeModal(); } }, 'Kosongkan (pelanggan umum)'));
        const filtered = customers.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)));
        if (filtered.length === 0) { listContainer.appendChild(el('div', { class: 'empty', style: { padding: '16px' } }, el('div', { class: 'empty__title' }, 'Tidak ada pelanggan'))); return; }
        for (const c of filtered) listContainer.appendChild(el('div', { class: 'cart-item', onClick: async () => { await cart.setCustomer(c.id); closeModal(); toastSuccess(`Pelanggan: ${c.name}`); } }, el('div', { class: 'cart-item__info' }, el('div', { class: 'cart-item__name' }, c.name), el('div', { class: 'cart-item__meta' }, `${c.priceLevel}`)), el('div', { class: 'cart-item__right' }, icon('chevron-right', { size: 20 }))));
      }
      const search = createSearchBox({ placeholder: 'Cari…', onInput: (v) => renderList(v) });
      renderList(); openModal({ title: 'Pilih Pelanggan', content: el('div', null, search.root, listContainer) });
    }

    /* ============ Item Editor ============ */

    function openItemEditor(line) {
      // Produk dengan serial → buka serial picker
      if (line.trackSerial) {
        const product = productCache.find((p) => p.id === line.productId);
        const units = unitsByProduct.get(line.productId) || [];
        const unit = units.find((u) => u.id === line.unitId);
        if (product && unit) { openSerialPicker(product, unit, line); return; }
      }

      // Produk biasa → qty editor
      const qtyInput = el('input', { type: 'text', inputmode: 'decimal', class: 'input input--number', value: String(line.qty), style: { textAlign: 'center', fontSize: 'var(--fs-2xl)', fontWeight: '700' } });
      const minusBtn = el('button', { class: 'btn', onClick: () => { const v = parseFloat(qtyInput.value.replace(',', '.')) || 0; qtyInput.value = String(Math.max(0, v - 1)); } }, '-1');
      const plusBtn = el('button', { class: 'btn', onClick: () => { const v = parseFloat(qtyInput.value.replace(',', '.')) || 0; qtyInput.value = String(v + 1); } }, '+1');
      const saveBtn = el('button', { class: 'btn btn--primary btn--block', onClick: () => { const v = parseFloat(qtyInput.value.replace(',', '.')) || 0; if (v <= 0) cart.removeItem(line.lineId); else cart.setQty(line.lineId, v); closeModal(); } }, 'Simpan');
      const deleteBtn = el('button', { class: 'btn btn--danger btn--block', style: { marginTop: '8px' }, onClick: () => { cart.removeItem(line.lineId); closeModal(); } }, icon('trash', { size: 18 }), 'Hapus item');
      openModal({ title: line.productName, content: el('div', null, el('div', { style: { marginBottom: '12px', color: 'var(--color-text-muted)', fontSize: 'var(--fs-sm)' } }, `${formatRupiah(line.pricePerUnit)} / ${line.unitName}`), el('div', { class: 'field' }, el('label', { class: 'field__label' }, 'Jumlah'), qtyInput), el('div', { class: 'row', style: { gap: '8px', marginBottom: '12px' } }, minusBtn, plusBtn), saveBtn, deleteBtn) });
    }

    /* ============ SERIAL PICKER ============ */

    async function openSerialPicker(product, unit, existingLine = null) {
      const available = await getAvailableSerials(ctx, product.id, unit.id);
      const currentSerials = existingLine ? [...(existingLine.serials || [])] : [];
      const selected = new Set(currentSerials);
      const listContainer = el('div');
      const info = el('div', { style: { padding: '8px 12px', fontSize: 'var(--fs-sm)', color: 'var(--color-text-muted)' } });
      const confirmBtn = el('button', { class: 'btn btn--primary btn--block' });

      // Kumpulkan semua serial = available + current (kalau edit)
      const currentObjs = [];
      for (const s of currentSerials) {
        const obj = await findSerialByCode(ctx, s);
        if (obj) currentObjs.push(obj);
      }
      const allSerials = [...currentObjs, ...available.filter((a) => !currentSerials.includes(a.serial))];

      function updateInfo() {
        info.textContent = `${selected.size} serial dipilih (dari ${allSerials.length} tersedia)`;
      }
      updateInfo();

      function renderList(filter = '') {
        clear(listContainer);
        const q = String(filter || '').toLowerCase();
        const filtered = allSerials.filter((s) => !q || s.serial.toLowerCase().includes(q));

        if (filtered.length === 0) {
          listContainer.appendChild(el('div', { class: 'empty', style: { padding: '16px' } },
            el('div', { class: 'empty__title' }, allSerials.length === 0 ? 'Tidak ada serial tersedia' : 'Tidak ditemukan'),
            allSerials.length === 0 ? el('div', null, 'Tambahkan serial dulu di menu Produk → Kelola Serial') : null,
          ));
          return;
        }

        for (const s of filtered) {
          const isSelected = selected.has(s.serial);
          listContainer.appendChild(el('div', {
            class: 'cart-item',
            onClick: () => {
              if (isSelected) selected.delete(s.serial);
              else selected.add(s.serial);
              updateInfo();
              renderList(search.value);
            },
          },
            el('div', { style: { width: '24px', height: '24px', borderRadius: '4px', border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`, background: isSelected ? 'var(--color-primary)' : 'transparent', display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0 } },
              isSelected ? icon('check', { size: 16 }) : null),
            el('div', { class: 'cart-item__info' },
              el('div', { class: 'cart-item__name', style: { fontFamily: 'ui-monospace,monospace' } }, s.serial),
              s.purchasePrice ? el('div', { class: 'cart-item__meta' }, `HPP ${formatRupiah(s.purchasePrice)}`) : null,
            ),
          ));
        }
      }

      const search = createSearchBox({ placeholder: 'Cari serial / IMEI…', onInput: (v) => renderList(v) });
      renderList('');

      function updateConfirmBtn() {
        const label = existingLine
          ? `Simpan (${selected.size} serial)`
          : `Tambah (${selected.size} serial)`;
        confirmBtn.textContent = label;
        confirmBtn.disabled = selected.size === 0;
      }
      updateConfirmBtn();
      const origUpdate = updateInfo;
      // Override updateInfo to also refresh button
      const newUpdateInfo = () => { origUpdate(); updateConfirmBtn(); };
      // re-render after toggling
      const origRenderList = renderList;
      const wrappedRenderList = (v) => {
        origRenderList(v);
        updateConfirmBtn();
      };

      confirmBtn.addEventListener('click', async () => {
        if (selected.size === 0) return;
        const serials = [...selected];
        try {
          if (existingLine) {
            await cart.setSerials(existingLine.lineId, serials);
          } else {
            await cart.addProduct(product.id, unit.id, serials.length, serials);
          }
          closeModal();
          feedbackScanSuccess();
          toastSuccess(`${product.name} (${serials.length} serial) ditambahkan`);
          searchBox.value = '';
          searchActive = false;
          renderAll(cart.getState());
        } catch (e) { toastError(e.message); }
      });

      const deleteBtn = existingLine
        ? el('button', { class: 'btn btn--danger btn--block', style: { marginTop: '8px' }, onClick: () => { cart.removeItem(existingLine.lineId); closeModal(); } }, icon('trash', { size: 18 }), 'Hapus dari keranjang')
        : null;

      openModal({
        title: `${product.name} — Pilih Serial`,
        content: el('div', null,
          info,
          el('div', { style: { height: '4px' } }),
          search.root,
          listContainer,
          el('div', { style: { marginTop: '12px' } }, confirmBtn),
          deleteBtn,
        ),
      });

      // Trigger initial state
      updateConfirmBtn();
    }

    /* ============ SEARCH ============ */

    let searchActive = false;
    function renderSearchResults(value) {
      const q = String(value || '').trim().toLowerCase();
      if (!q) { searchActive = false; renderAll(cart.getState()); return; }
      searchActive = true; clear(listEl);
      const matches = productCache.filter((p) => p.active && (p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q)))).slice(0, 30);
      if (matches.length === 0) { listEl.appendChild(el('div', { class: 'empty' }, icon('search', { size: 48 }), el('div', { class: 'empty__title' }, 'Tidak ditemukan'))); return; }
      for (const p of matches) listEl.appendChild(renderSearchItem(p));
    }

    function renderSearchItem(product) {
      const units = unitsByProduct.get(product.id) || [];
      const baseUnit = units.find((u) => u.isBase) || units[0];
      const price = baseUnit ? unitPrice(baseUnit, 'retail') : 0;
      return el('div', { class: 'cart-item', onClick: () => pickAndAdd(product, units) },
        el('div', { class: 'cart-item__info' },
          el('div', { class: 'cart-item__name' }, product.name,
            product.trackSerial ? el('span', { class: 'chip chip--info', style: { marginLeft: '6px' } }, 'IMEI') : null),
          el('div', { class: 'cart-item__meta' }, `${formatRupiah(price)} / ${baseUnit?.name || 'unit'} • stok ${fmtQty(product.stock)}`),
        ),
        el('div', { class: 'cart-item__right' }, icon('plus', { size: 22 })));
    }

    async function pickAndAdd(product, units) {
      if (!units || units.length === 0) { toastError('Produk belum punya satuan'); return; }
      if (units.length === 1) {
        const unit = units[0];
        if (product.trackSerial) { openSerialPicker(product, unit); return; }
        await doAdd(product, unit);
      } else {
        openUnitPicker(product, units);
      }
    }

    async function doAdd(product, unit) {
      try {
        if (product.trackSerial) { openSerialPicker(product, unit); return; }
        await cart.addProduct(product.id, unit.id, 1);
        feedbackScanSuccess();
        toastSuccess(`${product.name} ditambahkan`);
        searchBox.value = '';
        searchActive = false;
        renderAll(cart.getState());
      } catch (e) { toastError(e.message); }
    }

    function openUnitPicker(product, units) {
      openModal({ title: product.name, content: el('div', null, ...units.map((u) => el('div', { class: 'cart-item', onClick: async () => { closeModal(); if (product.trackSerial) openSerialPicker(product, u); else await doAdd(product, u); } },
        el('div', { class: 'cart-item__info' },
          el('div', { class: 'cart-item__name' }, u.name),
          el('div', { class: 'cart-item__meta' }, `×${u.factor} • ${formatRupiah(unitPrice(u, 'retail'))}`)),
        el('div', { class: 'cart-item__right' }, icon('chevron-right', { size: 20 }))))) });
    }

    /* ============ SCAN ============ */

    let cameraScanner = null;
    function openCameraScanner() {
      const scannerView = createScannerView(); const statusText = el('div', { style: { textAlign: 'center', fontSize: 'var(--fs-sm)', color: 'var(--color-text-muted)', marginTop: '12px' } }, 'Arahkan kamera ke barcode');
      openModal({ title: 'Scan Barcode', content: el('div', null, scannerView.root, statusText), onClose: () => { if (cameraScanner) { cameraScanner.stop(); cameraScanner = null; } scannerView.stop(); } });
      cameraScanner = new BarcodeCameraScanner({ onDetect: async (text) => { feedbackScanSuccess(); statusText.textContent = `Terdeteksi: ${text}`; await handleScan(text); setTimeout(() => closeModal(), 250); }, onError: (e) => { statusText.textContent = e.message; } });
      cameraScanner.start(scannerView.video).catch((e) => { statusText.textContent = e.message; toastError(e.message); });
    }

    async function handleScan(code) {
      const trimmed = String(code || '').trim(); if (!trimmed) return;

      // Cek dulu: apakah ini serial/IMEI?
      try {
        const serial = await findSerialByCode(ctx, trimmed);
        if (serial && serial.status === 'in_stock') {
          const product = productCache.find((p) => p.id === serial.productId);
          const units = unitsByProduct.get(product?.id) || [];
          const unit = units.find((u) => u.id === serial.unitId);
          if (product && unit) {
            const existingLine = cart.getState().computed.lines.find((l) => l.productId === product.id && l.unitId === unit.id && l.trackSerial);
            const existingSerials = existingLine ? existingLine.serials : [];
            if (existingSerials.includes(trimmed)) { toastError('Serial sudah ada di keranjang'); return; }
            await cart.addProduct(product.id, unit.id, 1, [trimmed]);
            feedbackScanSuccess();
            toastSuccess(`${product.name} • ${trimmed}`);
            searchBox.value = '';
            searchActive = false;
            renderAll(cart.getState());
            return;
          }
        }
      } catch (e) { /* lanjut ke barcode */ }

      // Fallback: barcode biasa
      try { const unit = await ctx.repos.units.findByIndex('by_barcode', trimmed); if (unit) { const product = await ctx.repos.products.get(unit.productId); if (product && product.active) { await doAdd(product, unit); return; } } } catch (e) {}
      try { const product = await ctx.repos.products.findByIndex('by_sku', trimmed); if (product && product.active) { const units = unitsByProduct.get(product.id) || []; if (units.length === 1) { await doAdd(product, units[0]); return; } if (units.length > 1) { openUnitPicker(product, units); return; } } } catch (e) {}
      feedbackError(); toastError(`"${trimmed}" tidak dikenali (bukan barcode / serial)`);
    }

    async function openCustomerScreen() { const r = await openCustomerDisplay(); if (!r.ok) toastError(r.reason || 'Gagal'); else toastSuccess('Layar pelanggan dibuka'); }

    const wedge = new KeyboardWedgeScanner({ onScan: (code) => handleScan(code), thresholdMs: 50, minLength: 4 });
    wedge.attach();

    function renderAll(state) { renderCart(state); renderCustomer(state); }

    const unsubscribe = cart.subscribe((state) => {
      if (!searchActive) renderCart(state);
      else { totalEl.textContent = formatRupiah(state.computed.total); payBtn.disabled = state.items.length === 0 || state.computed.total <= 0; }
      renderCustomer(state); broadcastCartState(state);
    });

    const sc = getShortcutManager();
    const scDisposers = sc.registerMany([
      { key: 'f2', label: 'Fokus pencarian', group: 'Kasir', handler: () => searchBox.focus() },
      { key: 'f3', label: 'Scan kamera', group: 'Kasir', handler: () => openCameraScanner() },
      { key: 'f4', label: 'Pilih pelanggan', group: 'Kasir', handler: () => openCustomerPicker() },
      { key: 'f9', label: 'Layar pelanggan', group: 'Kasir', handler: () => openCustomerScreen() },
      { key: 'alt+p', label: 'Pembayaran', group: 'Kasir', handler: () => { if (!payBtn.disabled) navigate('/pembayaran'); } },
    ]);

    soPollInterval = setInterval(async () => {
      if (!ctx.sync || !ctx.sync.enabled || navigator.onLine === false) return;
      try { const res = await syncSOs(ctx, true); if (res.downloaded > 0) { feedbackNewOrder(); toast(`🔔 ${res.downloaded} Pesanan Baru Masuk!`, { type: 'success', duration: 5000 }); } } catch (e) {}
    }, 30000);

    _cleanup = () => { unsubscribe(); wedge.detach(); scDisposers.forEach((fn) => fn()); if (cameraScanner) { cameraScanner.stop(); cameraScanner = null; } if (soPollInterval) clearInterval(soPollInterval); };
  },

  unmount() { if (_cleanup) { _cleanup(); _cleanup = null; } closeModal(); },
};
export default page;