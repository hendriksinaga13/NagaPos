/**
 * src/pages/produk.js
 * CRUD produk + scan barcode di form + search by barcode.
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatRupiah } from '../core/utils.js';
import { openModal, closeModal, confirm } from '../ui/components/modal.js';
import { toastSuccess, toastError, toast } from '../ui/components/toast.js';
import { createSearchBox } from '../ui/components/search-box.js';
import { createScannerView } from '../ui/components/scanner-view.js';
import { BarcodeCameraScanner } from '../hardware/barcode-camera.js';
import { createProduct, validateProduct } from '../models/product.js';
import { createUnit, validateUnit } from '../models/unit.js';
import { recordStockIn } from '../services/inventory-service.js';
import { logAudit } from '../services/audit-service.js';
import { AUDIT_ACTIONS } from '../models/audit-log.js';
import { getSerialStats } from '../services/serial-service.js';
import { getBatchSummary } from '../services/batch-service.js';
import { getNextInternalBarcode, validateBarcode } from '../core/barcode.js';
import { feedbackScanSuccess, feedbackError, primeAudio } from '../core/feedback.js';
import { navigate } from '../router.js';

const page = {
  title: 'Produk',
  layout: 'main',
  flush: true,

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Produk');
    ctx.setNavbarBack?.(false);

    primeAudio();

    /** @type {import('../core/schema.js').Product[]} */
    let products = [];
    /** @type {Map<string, import('../core/schema.js').Unit[]>} */
    let unitsByProduct = new Map();
    /** @type {Map<string, string>} */
    let barcodeMap = new Map(); // barcode → productId

    async function reload() {
      products = await ctx.repos.products.list();
      products.sort((a, b) => a.name.localeCompare(b.name));

      const units = await ctx.repos.units.list();
      unitsByProduct = new Map();
      barcodeMap = new Map();
      for (const u of units) {
        if (!unitsByProduct.has(u.productId)) unitsByProduct.set(u.productId, []);
        unitsByProduct.get(u.productId).push(u);
        if (u.barcode) barcodeMap.set(u.barcode, u.productId);
      }
      render();
    }

    const pageEl = el('div', { class: 'kasir-page' });
    const toolbar = el('div', { class: 'kasir-toolbar' });
    const searchBox = createSearchBox({
      placeholder: 'Cari nama / SKU / barcode / kategori…',
      onInput: () => render(),
    });
    toolbar.appendChild(el('div', { class: 'kasir-toolbar__row' }, searchBox.root));

    const list = el('div', { class: 'kasir-list' });
    const fab = el('button', {
      class: 'fab', type: 'button', 'aria-label': 'Tambah produk',
      onClick: () => openForm(null),
    }, icon('plus', { size: 24 }));

    pageEl.append(toolbar, list);
    root.appendChild(pageEl);
    pageEl.appendChild(fab);

    /* ---------------- Render ---------------- */

    function fmtQty(q) {
      return Number.isInteger(q) ? String(q) : String(q).replace('.', ',');
    }

    function render() {
      clear(list);
      const q = searchBox.value.trim().toLowerCase();

      let filtered;
      if (!q) {
        filtered = products;
      } else {
        const exactBarcodeProductId = barcodeMap.get(q);
        filtered = products.filter((p) => {
          if (exactBarcodeProductId && exactBarcodeProductId === p.id) return true;
          if (p.name.toLowerCase().includes(q)) return true;
          if (p.sku && p.sku.toLowerCase().includes(q)) return true;
          if (p.category && p.category.toLowerCase().includes(q)) return true;
          const units = unitsByProduct.get(p.id) || [];
          for (const u of units) {
            if (u.barcode && u.barcode.toLowerCase().includes(q)) return true;
          }
          return false;
        });
      }

      if (filtered.length === 0) {
        list.appendChild(el('div', { class: 'empty' },
          icon('produk', { size: 48 }),
          el('div', { class: 'empty__title' }, q ? 'Tidak ditemukan' : 'Belum ada produk'),
          el('div', null, q ? 'Coba kata kunci lain.' : 'Tap + untuk menambah produk.'),
        ));
        return;
      }

      for (const p of filtered) list.appendChild(renderItem(p));
    }

    function renderItem(p) {
      const low = Number(p.minStock) > 0 && Number(p.stock) <= Number(p.minStock);
      const inactive = !p.active;
      const meta = [p.sku ? `SKU ${p.sku}` : null, p.category || null]
        .filter(Boolean).join(' • ') || 'Tanpa kategori';

      const tags = [];
      if (p.trackSerial) tags.push(el('span', { class: 'chip chip--info', style: { marginLeft: '6px' } }, 'IMEI'));
      if (p.trackExpiry) tags.push(el('span', { class: 'chip chip--warning', style: { marginLeft: '6px' } }, 'Exp'));

      return el('div', {
        class: `list-item${inactive ? ' list-item--disabled' : ''}`,
        onClick: () => openDetail(p),
      },
        el('div', { class: 'list-item__main' },
          el('div', { class: 'list-item__title' },
            p.name,
            low ? el('span', { class: 'chip chip--warning', style: { marginLeft: '6px' } }, 'Menipis') : null,
            inactive ? el('span', { class: 'chip', style: { marginLeft: '6px' } }, 'Nonaktif') : null,
            ...tags,
          ),
          el('div', { class: 'list-item__meta' }, meta),
          el('div', { class: 'list-item__meta' },
            `Stok ${fmtQty(p.stock)} (min ${fmtQty(p.minStock)}) • HPP ${formatRupiah(p.cost)}`,
          ),
        ),
        el('div', { class: 'list-item__side' }, icon('chevron-right', { size: 20 })),
      );
    }

    /* ---------------- Detail ---------------- */

    async function openDetail(p) {
      const units = unitsByProduct.get(p.id) || [];
      const baseUnit = units.find((u) => u.isBase) || units[0];
      const retailPrice = baseUnit?.prices?.retail || 0;

      let serialStats = null;
      if (p.trackSerial) { try { serialStats = await getSerialStats(ctx, p.id); } catch {} }

      let batchStats = null;
      if (p.trackExpiry) { try { batchStats = await getBatchSummary(ctx, p.id); } catch {} }

      const content = el('div', null,
        row('Nama', p.name),
        p.sku ? row('SKU', p.sku) : null,
        p.category ? row('Kategori', p.category) : null,
        row('Stok', `${fmtQty(p.stock)} ${baseUnit?.name || ''}`),
        row('Stok minimum', fmtQty(p.minStock)),
        row('HPP / base', formatRupiah(p.cost)),
        row('Harga jual retail', formatRupiah(retailPrice)),
        baseUnit?.barcode ? row('Barcode', baseUnit.barcode) : null,
        row('Status', p.active ? 'Aktif' : 'Nonaktif'),
        p.trackSerial ? row('Lacak Serial', `Ya${p.warrantyMonths ? ` • garansi ${p.warrantyMonths} bln` : ''}`) : null,
        serialStats ? row('Serial Tersedia', String(serialStats.in_stock)) : null,
        p.trackExpiry ? row('Lacak Expired', `Ya${p.shelfLifeDays ? ` • simpan ${p.shelfLifeDays} hari` : ''}`) : null,
        batchStats ? row('Batch Aktif', `${batchStats.batchCount} batch, total ${fmtQty(batchStats.totalQtyBase)} base`) : null,
        batchStats && batchStats.earliestExpiry
          ? row('Expired Terdekat', new Date(batchStats.earliestExpiry).toLocaleDateString('id-ID'))
          : null,
      );

      const actions = el('div', { style: { marginTop: '12px' } });
      actions.appendChild(el('button', { class: 'btn btn--block', type: 'button', onClick: () => { closeModal(); openForm(p); } }, icon('edit', { size: 18 }), 'Edit Produk'));
      actions.appendChild(el('button', { class: 'btn btn--primary btn--block', type: 'button', style: { marginTop: '8px' }, onClick: () => { closeModal(); navigate(`/satuan?productId=${p.id}`); } }, icon('stok', { size: 18 }), 'Atur Satuan & Harga'));

      if (p.trackSerial) {
        actions.appendChild(el('button', { class: 'btn btn--warning btn--block', type: 'button', style: { marginTop: '8px' }, onClick: () => { closeModal(); navigate(`/serial-manajemen?productId=${p.id}`); } }, icon('receipt', { size: 18 }), 'Kelola Serial / IMEI'));
      }
      if (p.trackExpiry) {
        actions.appendChild(el('button', { class: 'btn btn--warning btn--block', type: 'button', style: { marginTop: '8px' }, onClick: () => { closeModal(); navigate(`/batch-manajemen?productId=${p.id}`); } }, icon('stok', { size: 18 }), 'Kelola Batch / Expired'));
      }
      if (!p.trackSerial && !p.trackExpiry) {
        actions.appendChild(el('button', { class: 'btn btn--block', type: 'button', style: { marginTop: '8px' }, onClick: () => { closeModal(); navigate(`/barcode-generator?productId=${p.id}`); } }, icon('search', { size: 18 }), 'Buat Label Barcode'));
      }

      actions.appendChild(el('button', {
        class: 'btn btn--danger btn--block', type: 'button', style: { marginTop: '8px' },
        onClick: async () => {
          if (!await confirm({ title: 'Hapus produk', message: `Hapus "${p.name}"?`, confirmText: 'Hapus', danger: true })) return;
          try {
            await ctx.repos.products.softDelete(p.id);
            await logAudit(ctx, { action: AUDIT_ACTIONS.PRODUCT_DELETE, details: { productId: p.id, productName: p.name } });
            closeModal(); toastSuccess('Produk dihapus'); await reload();
            ctx.cart?.refreshFromDb().catch(() => {});
          } catch (e) { toastError(e.message); }
        },
      }, icon('trash', { size: 18 }), 'Hapus'));

      openModal({ title: 'Detail Produk', content: el('div', null, content, actions) });
    }

    function row(label, value) {
      return el('div', { class: 'detail-row' }, el('span', null, label), el('strong', { style: { fontWeight: '500' } }, value));
    }

    /* ---------------- Form tambah/edit ---------------- */

    async function openForm(existing) {
      const isNew = !existing;

      const nameInput = el('input', { class: 'input', value: existing?.name || '', placeholder: 'Nama produk' });
      const skuInput = el('input', { class: 'input', value: existing?.sku || '', placeholder: 'SKU (opsional)' });
      const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];
      const datalistId = `cat-${Date.now()}`;
      const catInput = el('input', { class: 'input', value: existing?.category || '', placeholder: 'Kategori (opsional)', list: datalistId });
      const datalist = el('datalist', { id: datalistId }, ...categories.map((c) => el('option', { value: c })));
      const minStockInput = el('input', { class: 'input input--number', type: 'number', min: '0', step: 'any', value: String(existing?.minStock ?? 0) });
      const costInput = el('input', { class: 'input input--number', type: 'number', min: '0', step: '1', value: String(existing?.cost ?? 0) });
      const notesInput = el('textarea', { class: 'textarea', rows: 2 }, existing?.notes || '');
      const activeToggle = el('input', { type: 'checkbox', style: { width: '22px', height: '22px' } });
      activeToggle.checked = existing ? !!existing.active : true;

      // Serial toggle
      const trackSerialToggle = el('input', { type: 'checkbox', style: { width: '22px', height: '22px' } });
      trackSerialToggle.checked = existing ? !!existing.trackSerial : false;
      const warrantyInput = el('input', { class: 'input input--number', type: 'number', min: '0', step: '1', value: String(existing?.warrantyMonths ?? 0) });
      const warrantyField = el('div', { class: 'field', style: { display: existing?.trackSerial ? 'flex' : 'none' } },
        el('label', { class: 'field__label' }, 'Masa Garansi (bulan)'), warrantyInput);
      trackSerialToggle.addEventListener('change', () => { warrantyField.style.display = trackSerialToggle.checked ? 'flex' : 'none'; });

      // Expiry toggle
      const trackExpiryToggle = el('input', { type: 'checkbox', style: { width: '22px', height: '22px' } });
      trackExpiryToggle.checked = existing ? !!existing.trackExpiry : false;
      const shelfLifeInput = el('input', { class: 'input input--number', type: 'number', min: '0', step: '1', value: String(existing?.shelfLifeDays ?? 0) });
      const shelfLifeField = el('div', { class: 'field', style: { display: existing?.trackExpiry ? 'flex' : 'none' } },
        el('label', { class: 'field__label' }, 'Masa Simpan Default (hari)'), shelfLifeInput,
        el('div', { class: 'field__hint' }, '0 = tidak ada default. Contoh 180 untuk 6 bulan.'));
      trackExpiryToggle.addEventListener('change', () => {
        shelfLifeField.style.display = trackExpiryToggle.checked ? 'flex' : 'none';
        if (initialExpiryField) initialExpiryField.style.display = (isNew && trackExpiryToggle.checked) ? 'flex' : 'none';
      });

      // Product fields
      const baseUnitNameInput = el('input', { class: 'input', value: 'pcs', placeholder: 'pcs, botol, kg…' });
      const retailPriceInput = el('input', { class: 'input input--number', type: 'number', min: '0', step: '1', value: '0' });
      const barcodeInput = el('input', {
        class: 'input',
        placeholder: 'Barcode (opsional, unik)',
        value: existing?.barcode || '',
        autocomplete: 'off',
      });

      // Preload barcode base unit kalau edit
      let existingBarcode = '';
      if (existing) {
        const exUnits = unitsByProduct.get(existing.id) || [];
        const exBase = exUnits.find((u) => u.isBase) || exUnits[0];
        existingBarcode = exBase?.barcode || '';
        barcodeInput.value = existingBarcode;
      }

      const initialStockInput = el('input', { class: 'input input--number', type: 'number', min: '0', step: 'any', value: '0' });
      const initialExpiryInput = el('input', { class: 'input', type: 'date' });
      const initialExpiryField = el('div', { class: 'field', style: { display: 'none' } },
        el('label', { class: 'field__label' }, 'Tanggal Expired Stok Awal'), initialExpiryInput);

      // ===== BARCODE ROW dengan Scan + Generate =====
      const scanBtn = el('button', {
        class: 'btn',
        type: 'button',
        title: 'Scan barcode dengan kamera',
        style: { padding: '0 12px', whiteSpace: 'nowrap' },
        onClick: () => openCameraScan(barcodeInput),
      }, icon('scan', { size: 18 }));

      const genBtn = el('button', {
        class: 'btn',
        type: 'button',
        title: 'Generate barcode internal',
        style: { padding: '0 12px', whiteSpace: 'nowrap' },
        onClick: async () => {
          try {
            const code = await getNextInternalBarcode(ctx);
            barcodeInput.value = code;
            toast(`Barcode dibuat: ${code}`, { type: 'success' });
          } catch (e) {
            toastError(e.message || 'Gagal generate barcode');
          }
        },
      }, icon('plus', { size: 18 }));

      const barcodeRow = el('div', { style: { display: 'flex', gap: '6px', alignItems: 'stretch' } },
        barcodeInput, scanBtn, genBtn,
      );

      const barcodeHint = el('div', { class: 'field__hint' },
        'Tap 📷 untuk scan kamera, atau tap ikon + untuk generate otomatis. External scanner (USB/Bluetooth) juga bisa — tap field ini dulu lalu scan.');

      const saveBtn = el('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: save }, isNew ? 'Tambah Produk' : 'Simpan');

      const content = el('div', null,
        field('Nama *', nameInput),
        field('SKU', skuInput),
        field('Kategori', el('div', null, catInput, datalist)),
        el('div', { class: 'grid grid--2' },
          field('Stok minimum', minStockInput),
          field('HPP / base', costInput),
        ),

        el('div', { class: 'form-section' },
          el('div', { class: 'form-section__title' }, 'Serial / IMEI'),
          el('div', { class: 'card__row', style: { padding: '8px 0' } },
            el('span', null, 'Lacak Serial / IMEI'), trackSerialToggle),
          warrantyField,
        ),

        el('div', { class: 'form-section' },
          el('div', { class: 'form-section__title' }, 'Expired Date (FEFO)'),
          el('div', { class: 'card__row', style: { padding: '8px 0' } },
            el('span', null, 'Lacak Expired Date'), trackExpiryToggle),
          shelfLifeField,
        ),

        isNew ? el('div', { class: 'form-section' },
          el('div', { class: 'form-section__title' }, 'Satuan Dasar & Harga'),
          field('Nama satuan dasar', baseUnitNameInput, 'Contoh: pcs, unit, dus'),
          el('div', { class: 'grid grid--2' },
            field('Harga jual retail *', retailPriceInput),
            field('Stok awal', initialStockInput)),
          initialExpiryField,
          el('div', { class: 'field' },
            el('label', { class: 'field__label' }, 'Barcode'),
            barcodeRow,
            barcodeHint),
        ) : el('div', { class: 'form-section' },
          el('div', { class: 'form-section__title' }, 'Barcode Satuan Dasar'),
          el('div', { class: 'field' },
            el('label', { class: 'field__label' }, 'Barcode'),
            barcodeRow,
            barcodeHint),
        ),

        el('div', { class: 'card__row', style: { padding: '8px 0' } },
          el('span', null, 'Aktif'), activeToggle),
        field('Catatan', notesInput),
        saveBtn,
      );

      openModal({ title: isNew ? 'Produk Baru' : 'Edit Produk', content });

      // Auto focus barcode field untuk memudahkan external scanner
      setTimeout(() => { try { barcodeInput.focus(); } catch {} }, 300);

      async function save() {
        try {
          const payload = createProduct({
            id: existing?.id || '',
            name: nameInput.value.trim(),
            sku: skuInput.value.trim(),
            category: catInput.value.trim(),
            minStock: Number(minStockInput.value) || 0,
            cost: Math.round(Number(costInput.value) || 0),
            notes: notesInput.value.trim(),
            active: activeToggle.checked,
            stock: existing?.stock ?? 0,
            baseUnitId: existing?.baseUnitId || '',
            trackSerial: trackSerialToggle.checked,
            warrantyMonths: Math.max(0, Number(warrantyInput.value) || 0),
            trackExpiry: trackExpiryToggle.checked,
            shelfLifeDays: Math.max(0, Number(shelfLifeInput.value) || 0),
            createdAt: existing?.createdAt || 0,
          });
          validateProduct(payload);

          const barcode = barcodeInput.value.trim() || null;
          if (barcode) {
            try { validateBarcode(barcode); }
            catch (e) { throw new Error('Barcode tidak valid: ' + e.message); }

            const dup = await ctx.repos.units.findByIndex('by_barcode', barcode);
            if (dup && dup.id !== existing?.baseUnitId) {
              throw new Error(`Barcode "${barcode}" sudah dipakai produk lain`);
            }
          }

          if (!isNew) {
            // Edit produk — update produk + barcode base unit
            await ctx.repos.products.save({ ...existing, ...payload });

            const exUnits = unitsByProduct.get(existing.id) || [];
            const exBase = exUnits.find((u) => u.isBase) || exUnits[0];
            if (exBase) {
              await ctx.repos.units.save({ ...exBase, barcode });
            }

            await logAudit(ctx, {
              action: AUDIT_ACTIONS.PRODUCT_UPDATE,
              details: { productId: existing.id, productName: payload.name, barcode },
            });
            closeModal(); toastSuccess('Produk disimpan'); await reload();
            ctx.cart?.refreshFromDb().catch(() => {});
            return;
          }

          // Produk baru
          const retailPrice = Math.max(0, Math.round(Number(retailPriceInput.value) || 0));
          if (retailPrice <= 0) throw new Error('Harga jual retail wajib diisi (> 0)');

          const initialStock = Math.max(0, Number(initialStockInput.value) || 0);
          const initialExpiryTs = initialExpiryInput.value ? new Date(initialExpiryInput.value).getTime() : 0;
          if (payload.trackExpiry && initialStock > 0 && !initialExpiryTs) {
            throw new Error('Tanggal expired stok awal wajib diisi');
          }

          const unitName = baseUnitNameInput.value.trim() || 'pcs';
          const saved = await ctx.repos.products.save(payload);

          const baseUnitPayload = createUnit({
            productId: saved.id, name: unitName, code: unitName, factor: 1, isBase: true,
            barcode, prices: { retail: retailPrice, grosir: 0, member: 0 },
          });
          validateUnit(baseUnitPayload);
          const savedUnit = await ctx.repos.units.save(baseUnitPayload);
          await ctx.repos.products.save({ ...saved, baseUnitId: savedUnit.id });

          if (initialStock > 0 && !payload.trackSerial) {
            try {
              await recordStockIn(ctx, {
                productId: saved.id,
                unitId: savedUnit.id,
                qty: initialStock,
                notes: 'Stok awal',
                expiryDate: initialExpiryTs,
              });
            } catch (e) { console.warn('[produk] stok awal gagal:', e); }
          }

          await logAudit(ctx, {
            action: AUDIT_ACTIONS.PRODUCT_CREATE,
            details: {
              productId: saved.id, productName: payload.name, retailPrice,
              trackSerial: payload.trackSerial, trackExpiry: payload.trackExpiry, barcode,
            },
          });

          closeModal(); toastSuccess('Produk ditambahkan'); await reload();
          ctx.cart?.refreshFromDb().catch(() => {});
        } catch (e) { toastError(e.message); }
      }
    }

    function field(label, inputNode, hint) {
      return el('div', { class: 'field' },
        el('label', { class: 'field__label' }, label),
        inputNode,
        hint ? el('div', { class: 'field__hint' }, hint) : null,
      );
    }

    /* ---------------- Camera Scanner ---------------- */

    /**
     * Buka modal kamera scanner, hasil scan masuk ke inputRef.
     * @param {HTMLInputElement} inputRef
     */
    function openCameraScan(inputRef) {
      const scannerView = createScannerView();
      const statusText = el('div', {
        style: { textAlign: 'center', fontSize: 'var(--fs-sm)', color: 'var(--color-text-muted)', marginTop: '12px' },
      }, 'Arahkan kamera ke barcode');

      /** @type {BarcodeCameraScanner|null} */
      let camScanner = null;

      const modal = openModal({
        title: 'Scan Barcode',
        content: el('div', null, scannerView.root, statusText),
        onClose: () => {
          if (camScanner) { camScanner.stop(); camScanner = null; }
          scannerView.stop();
        },
      });

      camScanner = new BarcodeCameraScanner({
        onDetect: (text) => {
          // Beep + vibrate
          feedbackScanSuccess();
          inputRef.value = text;
          statusText.textContent = `✅ Terdeteksi: ${text}`;

          // Tutup modal setelah delay kecil
          setTimeout(() => {
            if (camScanner) { camScanner.stop(); camScanner = null; }
            closeModal();
            inputRef.focus();
            toastSuccess(`Barcode: ${text}`);
          }, 400);
        },
        onError: (err) => {
          statusText.textContent = err.message || 'Gagal scan';
          feedbackError();
        },
      });

      camScanner.start(scannerView.video).catch((e) => {
        statusText.textContent = e.message || 'Kamera gagal dibuka';
        toastError(e.message || 'Kamera gagal dibuka');
      });
    }

    await reload();
  },
};

export default page;