/**
 * src/services/sales-order-service.js
 * Logika bisnis Sales Order + export/import via file.
 */

import { newId, nextDocNumber } from '../core/id.js';
import { createSalesOrder } from '../models/sales-order.js';

/* ============ EXISTING ============ */

export async function saveSO(ctx, soData) {
  const number = soData.number || await nextDocNumber(ctx.db, { prefix: 'SO', kind: 'so' });
  const so = createSalesOrder({
    ...soData,
    id: soData.id || newId(),
    number,
    createdAt: soData.createdAt || Date.now(),
  });
  await ctx.repos.salesOrders.save(so);
  return so;
}

export async function markSOProcessed(ctx, soId) {
  const so = await ctx.repos.salesOrders.get(soId);
  if (!so) throw new Error('SO tidak ditemukan');
  await ctx.repos.salesOrders.patch(soId, { status: 'processed' });
}

export async function processSOToCart(ctx, so) {
  await ctx.cart.clear();
  let added = 0;
  for (const item of so.items) {
    try {
      await ctx.cart.addProduct(item.productId, item.unitId, item.qty);
      added++;
    } catch (e) {
      console.warn('Produk di SO tidak ditemukan:', item.productName);
    }
  }
  if (added === 0) throw new Error('Semua produk di SO tidak tersedia.');
  if (so.customerId) await ctx.cart.setCustomer(so.customerId);
  await markSOProcessed(ctx, so.id);
  return true;
}

/* ============ EXPORT SO (SALESMAN → KASIR) ============ */

/**
 * Export SO pending sebagai file JSON untuk dikirim ke kasir.
 * @param {object} ctx
 * @returns {Promise<{ data: object, filename: string }>}
 */
export async function exportPendingSOs(ctx) {
  const all = await ctx.repos.salesOrders.list();
  const pending = all.filter((o) => o.status === 'pending');

  if (pending.length === 0) {
    throw new Error('Tidak ada SO pending untuk diexport');
  }

  pending.sort((a, b) => a.createdAt - b.createdAt);

  const deviceCode = ctx.deviceCode || 'SALES';
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const filename = `SO-${deviceCode}-${dateKey}.json`;

  const data = {
    format: 'kasir-sales-orders',
    version: 1,
    exportedAt: Date.now(),
    deviceCode,
    storeCode: ctx.settings?.storeCode || '',
    orders: pending.map((o) => ({
      id: o.id,
      number: o.number,
      customerId: o.customerId,
      customerName: o.customerName,
      items: o.items,
      total: o.total,
      notes: o.notes,
      status: o.status,
      salesmanId: o.salesmanId,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    })),
  };

  return { data, filename };
}

/**
 * Download SO sebagai file JSON.
 * @param {{ data: object, filename: string }} exportResult
 */
export function downloadSOFile({ data, filename }) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Generate SO sebagai teks WhatsApp (untuk copy-paste atau share via WA).
 * @param {object} data
 * @returns {string}
 */
export function generateSOText(data) {
  const fmt = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
  const date = new Date(data.exportedAt).toLocaleString('id-ID');

  let text = `*📦 SALES ORDER*\n`;
  text += `Dari: ${data.deviceCode}\n`;
  text += `Tanggal: ${date}\n`;
  text += `Jumlah SO: ${data.orders.length}\n\n`;

  for (const so of data.orders) {
    text += `*${so.number}*\n`;
    text += `Pelanggan: ${so.customerName || 'Umum'}\n`;
    for (const it of so.items) {
      const qty = Number.isInteger(it.qty) ? it.qty : String(it.qty).replace('.', ',');
      text += `• ${it.productName} ${qty} ${it.unitName} × ${fmt(it.pricePerUnit)} = ${fmt(it.total)}\n`;
    }
    text += `*Total: ${fmt(so.total)}*\n`;
    if (so.notes) text += `Catatan: ${so.notes}\n`;
    text += `\n`;
  }

  text += `---\n`;
  text += `_Data lengkap dikirim via file .json_\n`;
  return text;
}

/* ============ IMPORT SO (KASIR) ============ */

/**
 * Import SO dari file JSON yang dikirim salesman.
 * Dedupe by SO id — kalau sudah ada, skip.
 * @param {object} ctx
 * @param {object} data
 * @returns {Promise<{ imported: number, skipped: number }>}
 */
export async function importSOsFromFile(ctx, data) {
  if (!data || data.format !== 'kasir-sales-orders') {
    throw new Error('Format file SO tidak valid. Pastikan file .json dari salesman.');
  }
  if (!Array.isArray(data.orders)) {
    throw new Error('File tidak berisi daftar pesanan');
  }

  let imported = 0;
  let skipped = 0;

  for (const so of data.orders) {
    if (!so.id) { skipped++; continue; }
    const existing = await ctx.repos.salesOrders.get(so.id);
    if (existing) { skipped++; continue; }

    await ctx.repos.salesOrders.save({
      ...so,
      status: so.status || 'pending',
      synced: true,
      deleted: false,
    });
    imported++;
  }

  return { imported, skipped };
}

/**
 * Read file JSON SO dari File API.
 * @param {File} file
 * @returns {Promise<object>}
 */
export async function readSOFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}