/**
 * src/pages/barcode-generator.js
 * Generator & pencetak label barcode untuk produk.
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatRupiah } from '../core/utils.js';
import { openModal, closeModal } from '../ui/components/modal.js';
import { toast, toastSuccess, toastError } from '../ui/components/toast.js';
import { createSearchBox } from '../ui/components/search-box.js';
import { renderBarcodeSVG, getNextInternalBarcode, validateBarcode } from '../core/barcode.js';
import { navigate } from '../router.js';

const page = {
  title: 'Barcode',
  layout: 'main',
  flush: true,

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Generator Barcode');
    ctx.setNavbarBack?.(true);

    /** @type {import('../core/schema.js').Product[]} */
    let products = [];
    /** @type {import('../core/schema.js').Product|null} */
    let selectedProduct = null;
    /** @type {import('../core/schema.js').Unit[]} */
    let units = [];
    /** @type {Map<string, { barcode: string, copies: number }>} */
    const edits = new Map();

    let labelWidth = 50;
    let labelHeight = 30;
    let printMode = 'roll';
    let showName = true;
    let showPrice = true;

    /* ---------------- Layout ---------------- */

    const pageEl = el('div', { class: 'kasir-page' });
    root.appendChild(pageEl);

    const pickerEl = el('div', { class: 'kasir-toolbar' });
    const unitsEl = el('div', { class: 'kasir-list' });
    const printPanel = el('div', { class: 'kasir-footer' });

    pageEl.append(pickerEl, unitsEl, printPanel);

    /* ---------------- Load produk ---------------- */

    async function loadProducts() {
      products = await ctx.repos.products.list();
      products.sort((a, b) => a.name.localeCompare(b.name));
    }
    await loadProducts();

    /* ---------------- Picker produk ---------------- */

    function renderPicker() {
      clear(pickerEl);
      const search = createSearchBox({
        placeholder: 'Cari produk untuk diberikan barcode…',
        onInput: (v) => renderPickerResults(v),
      });
      pickerEl.appendChild(el('div', { class: 'kasir-toolbar__row' }, search.root));

      const listContainer = el('div', { class: 'picker-list' });
      pickerEl.appendChild(listContainer);

      function renderPickerResults(q) {
        clear(listContainer);
        const query = String(q || '').toLowerCase();
        const filtered = query
          ? products.filter((p) => p.name.toLowerCase().includes(query) || (p.sku && p.sku.toLowerCase().includes(query)))
          : products;
        if (!filtered.length) {
          listContainer.appendChild(el('div', { class: 'empty', style: { padding: '12px' } },
            el('div', { class: 'empty__title' }, 'Tidak ditemukan')));
          return;
        }
        for (const p of filtered.slice(0, 20)) {
          listContainer.appendChild(el('div', {
            class: 'list-item',
            onClick: () => selectProduct(p),
          },
            el('div', { class: 'list-item__main' },
              el('div', { class: 'list-item__title' }, p.name),
              el('div', { class: 'list-item__meta' }, p.sku || 'Tanpa SKU'),
            ),
            el('div', { class: 'list-item__side' }, icon('chevron-right', { size: 20 })),
          ));
        }
      }
      renderPickerResults('');
    }

    /* ---------------- Pilih produk ---------------- */

    async function selectProduct(product) {
      selectedProduct = product;
      units = await ctx.repos.units.listByIndex('by_product', product.id);
      units.sort((a, b) => a.factor - b.factor);
      edits.clear();
      renderUnits();
    }

    /* ---------------- Render units ---------------- */

    function renderUnits() {
      clear(unitsEl);
      if (!selectedProduct) { renderPicker(); renderPrintPanel(); return; }

      // Header produk
      unitsEl.appendChild(el('div', { class: 'card', style: { marginBottom: '12px' } },
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          el('div', null,
            el('div', { style: { fontWeight: '700', fontSize: 'var(--fs-md)' } }, selectedProduct.name),
            el('div', { style: { fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)' } },
              selectedProduct.sku || 'Tanpa SKU'),
          ),
          el('button', {
            class: 'btn btn--ghost btn--sm',
            type: 'button',
            onClick: () => { selectedProduct = null; units = []; renderUnits(); },
          }, 'Ganti Produk'),
        ),
      ));

      // Daftar unit
      for (const unit of units) {
        const edit = edits.get(unit.id) || {
          barcode: unit.barcode || '',
          copies: 1,
        };
        edits.set(unit.id, edit);
        unitsEl.appendChild(renderUnitCard(unit, edit));
      }

      renderPrintPanel();
    }

    function renderUnitCard(unit, edit) {
      // Barcode field
      const barcodeInput = el('input', {
        class: 'input input--number',
        type: 'text',
        value: edit.barcode,
        placeholder: 'Belum ada barcode',
        onInput: (e) => {
          edit.barcode = e.target.value.trim();
          updatePreview();
        },
      });

      const generateBtn = el('button', {
        class: 'btn btn--ghost btn--sm',
        type: 'button',
        onClick: async () => {
          try {
            const code = await getNextInternalBarcode(ctx);
            edit.barcode = code;
            barcodeInput.value = code;
            updatePreview();
            toastSuccess(`Barcode dibuat: ${code}`);
          } catch (e) {
            toastError(e.message || 'Gagal generate barcode');
          }
        },
      }, icon('plus', { size: 14 }), 'Generate');

      const saveBtn = el('button', {
        class: 'btn btn--primary btn--sm',
        type: 'button',
        onClick: async () => {
          try {
            const v = edit.barcode.trim();
            if (v) {
              validateBarcode(v);
              const dup = await ctx.repos.units.findByIndex('by_barcode', v);
              if (dup && dup.id !== unit.id) {
                throw new Error(`Barcode "${v}" sudah dipakai unit lain`);
              }
            }
            await ctx.repos.units.save({
              ...unit,
              barcode: v || null,
            });
            unit.barcode = v || null;
            toastSuccess('Barcode disimpan');
          } catch (e) {
            toastError(e.message || 'Gagal menyimpan');
          }
        },
      }, icon('check', { size: 14 }), 'Simpan');

      const copiesInput = el('input', {
        class: 'input input--number',
        type: 'number',
        min: '0',
        max: '100',
        value: String(edit.copies),
        style: { width: '70px', textAlign: 'center' },
        onInput: (e) => {
          edit.copies = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
        },
      });

      const previewBox = el('div', {
        style: {
          marginTop: '8px',
          padding: '8px',
          background: '#fff',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
        },
      });

      function updatePreview() {
        clear(previewBox);
        if (!edit.barcode) {
          previewBox.appendChild(el('div', {
            style: { textAlign: 'center', fontSize: 'var(--fs-xs)', color: '#64748b', padding: '16px' },
          }, 'Barcode belum ada'));
          return;
        }
        try {
          const svg = renderBarcodeSVG(edit.barcode);
          const wrap = el('div', { style: { width: '100%', height: '60px' } });
          wrap.innerHTML = svg;
          previewBox.appendChild(wrap);
          previewBox.appendChild(el('div', {
            style: {
              textAlign: 'center', fontSize: '11px',
              fontFamily: 'ui-monospace,monospace',
              fontWeight: '600', color: '#000', marginTop: '4px',
            },
          }, edit.barcode));
        } catch (e) {
          previewBox.appendChild(el('div', {
            style: { color: 'var(--color-danger)', fontSize: 'var(--fs-xs)' },
          }, e.message));
        }
      }
      updatePreview();

      return el('div', { class: 'card', style: { marginBottom: '12px' } },
        el('div', {
          style: { fontWeight: '700', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' },
        },
          el('span', null, unit.name,
            el('span', { class: 'chip', style: { marginLeft: '6px' } }, `×${unit.factor}`)),
        ),
        el('div', { style: { display: 'flex', gap: '6px', marginBottom: '8px' } },
          barcodeInput, generateBtn, saveBtn,
        ),
        previewBox,
        el('div', {
          style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' },
        },
          el('span', { style: { fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)' } }, 'Cetak'),
          copiesInput,
          el('span', { style: { fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)' } }, 'label'),
        ),
      );
    }

    /* ---------------- Panel cetak ---------------- */

    function renderPrintPanel() {
      clear(printPanel);
      if (!selectedProduct) return;

      const widthInput = el('input', {
        class: 'input input--number', type: 'number', min: '20', max: '120', step: '1',
        value: String(labelWidth), style: { width: '70px', textAlign: 'center' },
        onInput: (e) => { labelWidth = Math.max(20, Math.min(120, parseInt(e.target.value, 10) || 50)); },
      });
      const heightInput = el('input', {
        class: 'input input--number', type: 'number', min: '10', max: '100', step: '1',
        value: String(labelHeight), style: { width: '70px', textAlign: 'center' },
        onInput: (e) => { labelHeight = Math.max(10, Math.min(100, parseInt(e.target.value, 10) || 30)); },
      });

      const nameToggle = el('input', { type: 'checkbox', style: { width: '20px', height: '20px' } });
      nameToggle.checked = showName;
      nameToggle.addEventListener('change', () => { showName = nameToggle.checked; });

      const priceToggle = el('input', { type: 'checkbox', style: { width: '20px', height: '20px' } });
      priceToggle.checked = showPrice;
      priceToggle.addEventListener('change', () => { showPrice = priceToggle.checked; });

      const modeSelect = el('select', { class: 'select' },
        el('option', { value: 'roll' }, 'Roll / Thermal Label'),
        el('option', { value: 'sheet' }, 'Lembar A4 (Stiker)'),
      );
      modeSelect.value = printMode;
      modeSelect.addEventListener('change', () => { printMode = modeSelect.value; });

      printPanel.appendChild(el('div', { style: { marginBottom: '8px' } },
        el('div', { style: { fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)', marginBottom: '4px' } }, 'Ukuran Label (mm)'),
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          widthInput, el('span', null, '×'), heightInput,
        ),
      ));

      printPanel.appendChild(el('div', { style: { marginBottom: '8px' } },
        el('div', { style: { fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)', marginBottom: '4px' } }, 'Mode Cetak'),
        modeSelect,
      ));

      printPanel.appendChild(el('div', {
        style: { display: 'flex', gap: '12px', marginBottom: '8px', fontSize: 'var(--fs-sm)' },
      },
        el('label', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, nameToggle, 'Nama'),
        el('label', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, priceToggle, 'Harga'),
      ));

      printPanel.appendChild(el('button', {
        class: 'btn btn--primary btn--lg btn--block',
        type: 'button',
        onClick: doPrint,
      }, icon('printer', { size: 18 }), 'Cetak Label'));
    }

    /* ---------------- Print ---------------- */

    async function doPrint() {
      if (!selectedProduct) { toastError('Pilih produk dulu'); return; }

      // Kumpulkan label dari semua unit yang punya barcode & copies > 0
      const labels = [];
      for (const unit of units) {
        const edit = edits.get(unit.id);
        if (!edit || !edit.barcode || edit.copies <= 0) continue;

        const price = unit.prices?.retail || 0;
        labels.push({
          svg: renderBarcodeSVG(edit.barcode),
          productName: selectedProduct.name,
          unitName: unit.name,
          barcode: edit.barcode,
          price: price,
          copies: edit.copies,
        });
      }

      if (!labels.length) {
        toastError('Tidak ada label untuk dicetak. Isi barcode & jumlah salinan.');
        return;
      }

      // Bangun DOM cetak
      const printArea = document.createElement('div');
      printArea.id = 'barcode-print-area';

      if (printMode === 'sheet') {
        printArea.style.cssText = `
          display: grid;
          grid-template-columns: repeat(3, ${labelWidth}mm);
          gap: 3mm;
          padding: 5mm;
        `;
      } else {
        printArea.style.cssText = `display: block;`;
      }

      for (const label of labels) {
        for (let i = 0; i < label.copies; i++) {
          const card = document.createElement('div');
          card.className = 'barcode-print-label';
          card.style.cssText = `
            width: ${labelWidth}mm;
            height: ${labelHeight}mm;
            padding: 1mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            background: #fff;
            color: #000;
            box-sizing: border-box;
            page-break-after: always;
            page-break-inside: avoid;
            overflow: hidden;
            ${printMode === 'sheet' ? 'border: 1px dashed #ccc;' : ''}
          `;

          // Nama produk
          if (showName) {
            const nameEl = document.createElement('div');
            nameEl.textContent = label.productName;
            nameEl.style.cssText = 'font-size: 8pt; font-weight: 700; text-align: center; line-height: 1.1; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            card.appendChild(nameEl);
          }

          // Barcode
          const svgWrap = document.createElement('div');
          svgWrap.style.cssText = 'flex: 1; width: 100%; display: flex; align-items: center; justify-content: center; min-height: 0; padding: 0.5mm 0;';
          svgWrap.innerHTML = label.svg;
          card.appendChild(svgWrap);

          // Barcode number + harga
          const bottomEl = document.createElement('div');
          bottomEl.style.cssText = 'width: 100%; display: flex; justify-content: space-between; align-items: center; font-size: 7pt; font-family: monospace;';

          const codeEl = document.createElement('span');
          codeEl.textContent = label.barcode;
          bottomEl.appendChild(codeEl);

          if (showPrice && label.price > 0) {
            const priceEl = document.createElement('span');
            priceEl.textContent = formatRupiah(label.price);
            priceEl.style.cssText = 'font-weight: 700;';
            bottomEl.appendChild(priceEl);
          }

          card.appendChild(bottomEl);
          printArea.appendChild(card);
        }
      }

      // Style untuk print
      const printStyle = document.createElement('style');
      printStyle.id = 'barcode-print-style';
      printStyle.textContent = `
        @media print {
          @page {
            size: ${printMode === 'roll' ? labelWidth + 'mm ' + labelHeight + 'mm' : 'A4'};
            margin: ${printMode === 'roll' ? '0' : '5mm'};
          }
          body * { visibility: hidden !important; }
          #barcode-print-area,
          #barcode-print-area * { visibility: visible !important; }
          #barcode-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
          }
        }
      `;
      document.head.appendChild(printStyle);
      document.body.appendChild(printArea);

      // Trigger print
      await new Promise((r) => setTimeout(r, 100));
      window.print();

      // Cleanup
      setTimeout(() => {
        printArea.remove();
        printStyle.remove();
      }, 800);
    }

    /* ---------------- Init ---------------- */

    renderPicker();

    // Pre-select jika ada ?productId
    const preselect = params?.query?.get?.('productId');
    if (preselect) {
      const p = await ctx.repos.products.get(preselect);
      if (p) {
        await selectProduct(p);
        // Render ulang picker juga, agar saat user ganti produk tetap berfungsi
        clear(unitsEl);
        renderUnits();
      }
    }
  },
};

export default page;