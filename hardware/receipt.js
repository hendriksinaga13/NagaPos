/**
 * src/hardware/receipt.js
 * Susun struk dari `sale` + `settings`.
 * Menampilkan nama produk, qty + satuan, harga per unit, subtotal.
 * 
 * - buildReceiptBytes() → Uint8Array ESC/POS untuk printer Bluetooth
 * - renderReceiptHtml() → HTML untuk preview & fallback print browser
 * - generateReceiptText() → teks untuk WhatsApp
 * 
 * Format per item:
 *   Nama Produk
 *   2 pak (= 24 pcs) × Rp 12.000      Rp 24.000
 *     IMEI: 356938035643809, 356938035643810
 *   Diskon baris                          -Rp 1.000
 */

import { EscPosBuilder, dataUrlToRaster } from './escpos.js';
import { formatRupiah, formatDateTime } from '../core/utils.js';
import { PAYMENT_LABEL } from '../models/payment.js';

/**
 * @param {object} settings
 * @returns {number} 32 atau 48
 */
export function charWidth(settings) {
  return String(settings?.receiptWidth || '58') === '80' ? 48 : 32;
}

/**
 * Format qty × harga dengan info satuan (dan konversi ke base kalau factor > 1).
 * 
 * @param {import('../core/schema.js').SaleItem} it
 * @returns {string}
 */
function formatQtyPrice(it) {
  const qty = Number.isInteger(it.qty) ? String(it.qty) : String(it.qty).replace('.', ',');
  const unitName = it.unitName || 'unit';
  const factor = Number(it.factor) || 1;

  // Kalau unit bukan base (factor > 1), tampilkan konversi ke base
  // Contoh: "2 pak (= 24 pcs)"
  let conversion = '';
  if (factor > 1 && it.qty > 0) {
    const baseQty = it.qty * factor;
    const baseQtyStr = Number.isInteger(baseQty) ? String(baseQty) : String(baseQty).replace('.', ',');
    // Kita tidak tahu nama base unit, jadi pakai "unit" generik atau skip
    // Kalau mau nama base, perlu lookup — skip untuk simplicity
    conversion = ` (= ${baseQtyStr} × faktor)`;
  }

  return `${qty} ${unitName}${conversion} × ${formatRupiah(it.pricePerUnit)}`;
}

/**
 * Format list IMEI/serial untuk ditampilkan di struk.
 * Kalau banyak (>3), tampilkan beberapa + "…dan N lainnya".
 * 
 * @param {string[]} serials
 * @returns {string}
 */
function formatSerials(serials) {
  if (!Array.isArray(serials) || serials.length === 0) return '';
  if (serials.length <= 3) return serials.join(', ');
  return `${serials.slice(0, 3).join(', ')} …dan ${serials.length - 3} lainnya`;
}

/* ===================== ESC/POS ===================== */

/**
 * Bangun buffer ESC/POS untuk satu struk.
 * @param {import('../core/schema.js').Sale} sale
 * @param {object} settings
 * @returns {Promise<Uint8Array>}
 */
export async function buildReceiptBytes(sale, settings) {
  const W = charWidth(settings);
  const b = new EscPosBuilder();
  b.init();

  // Logo mono (opsional)
  if (settings.logoMonoDataUrl) {
    const maxPx = W === 48 ? 384 : 256;
    const raster = await dataUrlToRaster(settings.logoMonoDataUrl, { maxWidthPx: maxPx });
    if (raster) {
      b.align('center').raster(raster.bits, raster.widthBytes, raster.heightPx).newline();
    }
  }

  // Header toko
  b.align('center').bold(true).doubleSize(true)
    .line(settings.storeName || 'Toko Saya')
    .doubleSize(false).bold(false);

  if (settings.storeAddress) b.line(settings.storeAddress);
  if (settings.storePhone) b.line(settings.storePhone);
  b.newline();

  // Info nota
  b.align('left')
    .line('-'.repeat(W))
    .columns('No', sale.number, W)
    .columns('Tgl', formatDateTime(sale.createdAt), W)
    .columns('Kasir', sale.cashierId || 'kasir', W);
  b.line('-'.repeat(W));

  // Item
  for (const it of sale.items) {
    // Baris 1: nama produk
    b.line(it.productName);

    // Baris 2: qty + unit + harga ... total
    const qp = formatQtyPrice(it);
    const total = formatRupiah(it.total);

    // Kalau qp + total terlalu panjang, pecah 2 baris
    if (qp.length + total.length + 1 > W) {
      b.align('left').line(qp);
      b.align('right').line(total).align('left');
    } else {
      const pad = Math.max(1, W - qp.length - total.length);
      b.line(qp + ' '.repeat(pad) + total);
    }

    // Baris 3 (opsional): diskon per baris
    if (it.discountAmount > 0) {
      b.align('right').line(`  -diskon ${formatRupiah(it.discountAmount)}`).align('left');
    }

    // Baris 4 (opsional): IMEI/serial
    if (it.serials && it.serials.length > 0) {
      const serialText = formatSerials(it.serials);
      b.line(`  IMEI: ${serialText}`);
    }
  }
  b.line('-'.repeat(W));

  // Ringkasan
  b.columns('Subtotal', formatRupiah(sale.subtotal), W);
  if (sale.discountTotal > 0) b.columns('Diskon', '-' + formatRupiah(sale.discountTotal), W);
  if (sale.taxTotal > 0) b.columns('Pajak', formatRupiah(sale.taxTotal), W);
  b.bold(true).columns('TOTAL', formatRupiah(sale.total), W).bold(false);

  // Ringkasan item (total qty)
  const totalItems = sale.items.reduce((sum, it) => sum + (it.qty || 0), 0);
  const totalItemsStr = Number.isInteger(totalItems) ? String(totalItems) : String(totalItems).replace('.', ',');
  b.columns('Total item', `${totalItemsStr} pcs`, W);

  // Pembayaran
  if (sale.payments && sale.payments.length) {
    b.line('-'.repeat(W));
    for (const p of sale.payments) {
      b.columns(PAYMENT_LABEL[p.method] || p.method, formatRupiah(p.amount), W);
    }
    if (sale.change > 0) b.columns('Kembali', formatRupiah(sale.change), W);
    if (sale.debtAmount > 0) b.columns('Piutang', formatRupiah(sale.debtAmount), W);
  }

  b.line('-'.repeat(W)).newline();

  // Footer
  if (settings.receiptFooter) {
    b.align('center').line(settings.receiptFooter).align('left');
  }
  b.line(`Kasir: ${sale.cashierId || 'kasir'}`);
  b.line(formatDateTime(sale.createdAt));

  b.feed(3).cut();
  return b.build();
}

/* ===================== HTML Preview ===================== */

/**
 * HTML preview (dipakai di modal struk, halaman printer, dan fallback print).
 * @param {import('../core/schema.js').Sale} sale
 * @param {object} settings
 * @returns {string}
 */
export function renderReceiptHtml(sale, settings) {
  const W = charWidth(settings);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const itemRows = sale.items.map((it) => {
    const qty = Number.isInteger(it.qty) ? String(it.qty) : String(it.qty).replace('.', ',');
    const unitName = it.unitName || 'unit';
    const factor = Number(it.factor) || 1;

    // Info konversi kalau factor > 1
    let conversionHtml = '';
    if (factor > 1 && it.qty > 0) {
      const baseQty = it.qty * factor;
      const baseQtyStr = Number.isInteger(baseQty) ? String(baseQty) : String(baseQty).replace('.', ',');
      conversionHtml = ` <span style="color:#666;">(= ${baseQtyStr})</span>`;
    }

    // IMEI/serial
    const serialsHtml = (it.serials && it.serials.length > 0)
      ? `<div class="rs-item__serials" style="font-family:ui-monospace,monospace;font-size:10px;color:#666;padding-left:8px;">
           IMEI: ${esc(formatSerials(it.serials))}
         </div>`
      : '';

    return `
      <div class="rs-item">
        <div class="rs-item__name">${esc(it.productName)}</div>
        <div class="rs-item__line">
          <span>${qty} ${esc(unitName)}${conversionHtml} × ${formatRupiah(it.pricePerUnit)}</span>
          <span>${formatRupiah(it.total)}</span>
        </div>
        ${it.discountAmount > 0 ? `<div class="rs-item__disc">-diskon ${formatRupiah(it.discountAmount)}</div>` : ''}
        ${serialsHtml}
      </div>
    `;
  }).join('');

  const payRows = (sale.payments || []).map((p) => `
    <div class="rs-row"><span>${esc(PAYMENT_LABEL[p.method] || p.method)}</span><span>${formatRupiah(p.amount)}</span></div>
  `).join('');

  // Ringkasan total item
  const totalItems = sale.items.reduce((sum, it) => sum + (it.qty || 0), 0);
  const totalItemsStr = Number.isInteger(totalItems) ? String(totalItems) : String(totalItems).replace('.', ',');

  return `
    <div class="receipt-preview" data-width="${W}" style="--rs-width:${W}ch">
      <div class="rs-center rs-logo">
        ${settings.logoMonoDataUrl ? `<img src="${esc(settings.logoMonoDataUrl)}" alt="" class="rs-logo__img" />` : ''}
        <div class="rs-store">${esc(settings.storeName || 'Toko Saya')}</div>
        ${settings.storeAddress ? `<div class="rs-small">${esc(settings.storeAddress)}</div>` : ''}
        ${settings.storePhone ? `<div class="rs-small">${esc(settings.storePhone)}</div>` : ''}
      </div>
      <div class="rs-hr"></div>
      <div class="rs-row"><span>No</span><span>${esc(sale.number)}</span></div>
      <div class="rs-row"><span>Tgl</span><span>${formatDateTime(sale.createdAt)}</span></div>
      <div class="rs-row"><span>Kasir</span><span>${esc(sale.cashierId || 'kasir')}</span></div>
      <div class="rs-hr"></div>
      ${itemRows}
      <div class="rs-hr"></div>
      <div class="rs-row"><span>Subtotal</span><span>${formatRupiah(sale.subtotal)}</span></div>
      ${sale.discountTotal > 0 ? `<div class="rs-row"><span>Diskon</span><span>-${formatRupiah(sale.discountTotal)}</span></div>` : ''}
      ${sale.taxTotal > 0 ? `<div class="rs-row"><span>Pajak</span><span>${formatRupiah(sale.taxTotal)}</span></div>` : ''}
      <div class="rs-row rs-total"><span>TOTAL</span><span>${formatRupiah(sale.total)}</span></div>
      <div class="rs-row" style="font-size:11px;color:#666;"><span>Total item</span><span>${totalItemsStr} pcs</span></div>
      ${payRows ? `<div class="rs-hr"></div>${payRows}` : ''}
      ${sale.change > 0 ? `<div class="rs-row"><span>Kembali</span><span>${formatRupiah(sale.change)}</span></div>` : ''}
      ${sale.debtAmount > 0 ? `<div class="rs-row"><span>Piutang</span><span>${formatRupiah(sale.debtAmount)}</span></div>` : ''}
      <div class="rs-hr"></div>
      ${settings.receiptFooter ? `<div class="rs-center rs-small">${esc(settings.receiptFooter)}</div>` : ''}
      <div class="rs-center rs-small">${formatDateTime(sale.createdAt)}</div>
    </div>
  `;
}

/* ===================== WhatsApp Text ===================== */

/**
 * Generator teks struk untuk WhatsApp.
 * @param {import('../core/schema.js').Sale} sale
 * @param {object} settings
 * @returns {string}
 */
export function generateReceiptText(sale, settings) {
  const W = 32;
  const line = (l, r) => {
    const pad = Math.max(1, W - l.length - r.length);
    return l + ' '.repeat(pad) + r;
  };

  let text = `*${settings.storeName || 'Toko Saya'}*\n`;
  if (settings.storeAddress) text += `${settings.storeAddress}\n`;
  text += `--------------------------------\n`;
  text += `No  : ${sale.number}\n`;
  text += `Tgl : ${formatDateTime(sale.createdAt)}\n`;
  text += `--------------------------------\n`;

  for (const it of sale.items) {
    const qty = Number.isInteger(it.qty) ? String(it.qty) : String(it.qty).replace('.', ',');
    const unitName = it.unitName || 'unit';

    text += `*${it.productName}*\n`;
    text += line(`  ${qty} ${unitName} × ${formatRupiah(it.pricePerUnit)}`, formatRupiah(it.total)) + '\n';

    if (it.serials && it.serials.length > 0) {
      text += `  _IMEI: ${formatSerials(it.serials)}_\n`;
    }
    if (it.discountAmount > 0) {
      text += `  -diskon ${formatRupiah(it.discountAmount)}\n`;
    }
  }

  text += `--------------------------------\n`;
  text += line('Subtotal', formatRupiah(sale.subtotal)) + '\n';
  if (sale.discountTotal > 0) text += line('Diskon', '-' + formatRupiah(sale.discountTotal)) + '\n';
  if (sale.taxTotal > 0) text += line('Pajak', formatRupiah(sale.taxTotal)) + '\n';
  text += line('*TOTAL*', `*${formatRupiah(sale.total)}*`) + '\n';

  const totalItems = sale.items.reduce((sum, it) => sum + (it.qty || 0), 0);
  const totalItemsStr = Number.isInteger(totalItems) ? String(totalItems) : String(totalItems).replace('.', ',');
  text += line('Total item', `${totalItemsStr} pcs`) + '\n';

  text += `--------------------------------\n`;

  for (const p of sale.payments) {
    text += line(PAYMENT_LABEL[p.method] || p.method, formatRupiah(p.amount)) + '\n';
  }
  if (sale.change > 0) text += line('Kembali', formatRupiah(sale.change)) + '\n';
  if (sale.debtAmount > 0) text += line('Piutang', formatRupiah(sale.debtAmount)) + '\n';

  text += `--------------------------------\n`;
  if (settings.receiptFooter) text += `_${settings.receiptFooter}_\n`;
  text += `Terima kasih telah berbelanja!`;
  return text;
}