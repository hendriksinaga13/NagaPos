/**
 * src/pages/riwayat.js
 * Riwayat transaksi + tampilkan serial & batch allocations.
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatRupiah, formatDateTime } from '../core/utils.js';
import { openModal, closeModal, confirm } from '../ui/components/modal.js';
import { toastSuccess, toastError } from '../ui/components/toast.js';
import { createSearchBox } from '../ui/components/search-box.js';
import { renderReceiptHtml } from '../hardware/receipt.js';
import { getPrinterService } from '../hardware/printer-service.js';
import { voidSale, returnItems } from '../services/sale-service.js';
import { PAYMENT_LABEL } from '../models/payment.js';

const page = {
  title: 'Riwayat',
  layout: 'main',
  flush: true,

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Riwayat');
    ctx.setNavbarBack?.(true);

    let sales = [];
    let activeTab = 'all';
    const printerSvc = getPrinterService({ settingsRepo: ctx.repos.settings });
    printerSvc.bindSettings(ctx.settings);

    async function reload() {
      sales = await ctx.repos.sales.list();
      sales.sort((a, b) => b.createdAt - a.createdAt);
      sales = sales.slice(0, 300);
      render();
    }

    const pageEl = el('div', { class: 'kasir-page' });
    const tabs = el('div', { class: 'page-tabs' });
    const toolbar = el('div', { class: 'kasir-toolbar' });
    const search = createSearchBox({ placeholder: 'Cari nomor nota / pelanggan…', onInput: () => render() });
    toolbar.appendChild(el('div', { class: 'kasir-toolbar__row' }, search.root));
    const list = el('div', { class: 'kasir-list' });

    function renderTabs() {
      clear(tabs);
      const items = [{ id: 'all', label: 'Semua' }, { id: 'today', label: 'Hari Ini' }, { id: 'month', label: 'Bulan Ini' }];
      for (const it of items) tabs.appendChild(el('button', { class: 'page-tab', 'aria-selected': String(activeTab === it.id), onClick: () => { activeTab = it.id; renderTabs(); render(); } }, it.label));
    }

    function filterByPeriod(s) {
      if (activeTab === 'today') { const start = new Date(); start.setHours(0, 0, 0, 0); return s.createdAt >= start.getTime(); }
      if (activeTab === 'month') { const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); return s.createdAt >= start; }
      return true;
    }

    function render() {
      clear(list);
      const q = search.value.trim().toLowerCase();
      let items = sales.filter(filterByPeriod);
      if (q) items = items.filter((s) => s.number.toLowerCase().includes(q));
      if (items.length === 0) { list.appendChild(el('div', { class: 'empty' }, icon('receipt', { size: 48 }), el('div', { class: 'empty__title' }, 'Belum ada transaksi'))); return; }
      for (const s of items) list.appendChild(renderItem(s));
    }

    function renderItem(s) {
      const isPay = s.isDebtPayment;
      const serialCount = (s.items || []).reduce((sum, it) => sum + (it.serials?.length || 0), 0);
      const batchCount = (s.items || []).reduce((sum, it) => sum + (it.batchAllocations?.length || 0), 0);
      const tags = [];
      if (serialCount > 0) tags.push(el('span', { class: 'chip chip--info', style: { marginLeft: '4px' } }, `${serialCount} IMEI`));
      if (batchCount > 0) tags.push(el('span', { class: 'chip chip--warning', style: { marginLeft: '4px' } }, `${batchCount} batch`));

      const statusChip = s.status === 'void' ? el('span', { class: 'chip chip--danger', style: { marginLeft: '6px' } }, 'VOID')
        : s.status === 'returned' ? el('span', { class: 'chip chip--warning', style: { marginLeft: '6px' } }, 'RETUR')
        : isPay ? el('span', { class: 'chip chip--success', style: { marginLeft: '6px' } }, 'PIUTANG') : null;

      return el('div', { class: 'list-item', onClick: () => openDetail(s) },
        el('div', { class: 'list-item__main' },
          el('div', { class: 'list-item__title' }, s.number, statusChip, ...tags),
          el('div', { class: 'list-item__meta' }, `${formatDateTime(s.createdAt)} • ${isPay ? 'Pembayaran piutang' : s.items.length + ' item'}`),
        ),
        el('div', { class: 'list-item__side', style: { textAlign: 'right' } }, el('strong', null, formatRupiah(s.total))),
      );
    }

    async function openDetail(s) {
      const rows = el('div', null,
        detailRow('No', s.number),
        detailRow('Tanggal', formatDateTime(s.createdAt)),
        detailRow('Kasir', s.cashierId),
        detailRow('Status', s.status),
      );
      if (s.customerId) { const c = await ctx.repos.customers.get(s.customerId); if (c) rows.appendChild(detailRow('Pelanggan', c.name)); }

      if (!s.isDebtPayment && s.items.length) {
        const itemsWrap = el('div', { style: { marginTop: '8px' } });
        for (const it of s.items) {
          itemsWrap.appendChild(el('div', { class: 'detail-row' },
            el('span', null, `${it.productName} ${it.qty}${it.unitName}`),
            el('strong', null, formatRupiah(it.total)),
          ));
          if (it.serials && it.serials.length > 0) {
            itemsWrap.appendChild(el('div', {
              style: { padding: '4px 0 4px 12px', fontFamily: 'ui-monospace,monospace', fontSize: '11px', color: 'var(--color-text-muted)' },
            }, `IMEI: ${it.serials.join(', ')}`));
          }
          if (it.batchAllocations && it.batchAllocations.length > 0) {
            const batchText = it.batchAllocations.map((a) =>
              `${a.batchNumber}${a.expiryDate ? ` (exp ${new Date(a.expiryDate).toLocaleDateString('id-ID')})` : ''} × ${a.qty}`
            ).join(', ');
            itemsWrap.appendChild(el('div', {
              style: { padding: '4px 0 8px 12px', fontSize: '11px', color: 'var(--color-text-muted)' },
            }, `Batch: ${batchText}`));
          }
        }
        rows.appendChild(el('div', { class: 'form-section__title', style: { marginTop: '12px' } }, 'Item'));
        rows.appendChild(itemsWrap);
      }

      if (s.payments && s.payments.length) {
        const payWrap = el('div', { style: { marginTop: '8px' } });
        for (const p of s.payments) payWrap.appendChild(el('div', { class: 'detail-row' }, el('span', null, PAYMENT_LABEL[p.method] || p.method), el('strong', null, formatRupiah(p.amount))));
        rows.appendChild(el('div', { class: 'form-section__title', style: { marginTop: '12px' } }, 'Pembayaran'));
        rows.appendChild(payWrap);
      }

      rows.appendChild(detailRow('Total', formatRupiah(s.total)));
      if (s.change > 0) rows.appendChild(detailRow('Kembalian', formatRupiah(s.change)));
      if (s.debtAmount > 0) rows.appendChild(detailRow('Piutang', formatRupiah(s.debtAmount)));

      const actions = el('div', { style: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' } });
      actions.appendChild(el('button', { class: 'btn btn--primary btn--block', onClick: () => doReprint(s) }, icon('printer', { size: 18 }), 'Cetak Ulang'));
      if (s.status === 'paid' && !s.isDebtPayment) {
        actions.appendChild(el('button', { class: 'btn btn--warning btn--block', onClick: () => doReturn(s) }, icon('receipt', { size: 18 }), 'Retur'));
        actions.appendChild(el('button', { class: 'btn btn--danger btn--block', onClick: () => doVoid(s) }, icon('trash', { size: 18 }), 'Void Transaksi'));
      }
      openModal({ title: 'Detail Transaksi', content: el('div', null, rows, actions) });
    }

    function detailRow(label, value) { return el('div', { class: 'detail-row' }, el('span', null, label), el('strong', { style: { fontWeight: '500' } }, String(value))); }

    function doReprint(sale) {
      const receiptHtml = renderReceiptHtml(sale, ctx.settings);
      const receiptWrap = el('div', { html: receiptHtml });
      const btns = el('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } });
      if (printerSvc.state.connected) btns.appendChild(el('button', { class: 'btn btn--primary', style: { flex: 1 }, onClick: async () => { try { await printerSvc.printSale(sale); toastSuccess('Struk dikirim'); } catch (e) { toastError(e.message); } } }, icon('printer', { size: 18 }), 'BLE'));
      btns.appendChild(el('button', { class: 'btn btn--ghost', style: { flex: 1 }, onClick: () => { try { printerSvc.printViaBrowser(sale); } catch (e) { toastError(e.message); } } }, icon('receipt', { size: 18 }), 'Browser'));
      openModal({ title: 'Struk — ' + sale.number, content: el('div', null, receiptWrap, btns) });
    }

    async function doVoid(sale) {
      const ok = await confirm({ title: 'Void Transaksi', message: `Void ${sale.number}? Stok dikembalikan, batch & IMEI jadi tersedia kembali.`, confirmText: 'Void', danger: true });
      if (!ok) return;
      try { await voidSale(sale.id, ctx, { reason: 'Dibatalkan kasir' }); closeModal(); toastSuccess('Transaksi di-void'); await reload(); ctx.cart?.refreshFromDb().catch(() => {}); }
      catch (e) { toastError(e.message); }
    }

    function doReturn(sale) {
      const returnQtys = sale.items.map(() => 0);
      const rows = sale.items.map((it, i) => {
        const qtyInput = el('input', { class: 'input input--number', type: 'number', min: '0', max: String(it.qty), step: 'any', value: '0', style: { width: '80px', textAlign: 'right' }, onInput: (e) => { returnQtys[i] = Math.max(0, Math.min(it.qty, Number(e.target.value) || 0)); updateTotal(); } });
        const subInfo = [];
        if (it.trackSerial && it.serials) subInfo.push(`IMEI: ${it.serials.join(', ')}`);
        if (it.batchAllocations && it.batchAllocations.length > 0) subInfo.push(`Batch: ${it.batchAllocations.map((a) => a.batchNumber).join(', ')}`);
        return el('div', { class: 'detail-row' },
          el('div', null,
            el('div', null, it.productName),
            el('div', { style: { fontSize: 'var(--fs-xs)', color: 'var(--color-text-muted)' } }, `${it.qty} ${it.unitName} × ${formatRupiah(it.pricePerUnit)}`),
            subInfo.length > 0 ? el('div', { style: { fontSize: '10px', fontFamily: 'ui-monospace,monospace', color: 'var(--color-text-muted)' } }, subInfo.join(' · ')) : null,
          ),
          qtyInput,
        );
      });
      const totalInfo = el('div', { class: 'card__row', style: { marginTop: '12px' } }, el('span', null, 'Refund'), el('strong', null, formatRupiah(0)));
      function updateTotal() {
        let total = 0;
        for (let i = 0; i < returnQtys.length; i++) { const it = sale.items[i]; if (returnQtys[i] > 0) total += Math.round(it.total * (returnQtys[i] / it.qty)); }
        totalInfo.querySelector('strong').textContent = formatRupiah(total);
      }
      const submitBtn = el('button', { class: 'btn btn--warning btn--block', onClick: async () => {
        const lines = [];
        for (let i = 0; i < returnQtys.length; i++) if (returnQtys[i] > 0) lines.push({ lineIndex: i, qty: returnQtys[i] });
        if (!lines.length) { toastError('Isi qty retur minimal 1'); return; }
        const ok = await confirm({ title: 'Proses Retur', message: `Retur ${lines.length} baris?`, confirmText: 'Retur' });
        if (!ok) return;
        try { const res = await returnItems(sale.id, lines, ctx, { reason: 'Retur pelanggan' }); closeModal(); toastSuccess(`Refund ${formatRupiah(res.refundAmount)}`); await reload(); ctx.cart?.refreshFromDb().catch(() => {}); }
        catch (e) { toastError(e.message); }
      } }, 'Proses Retur');
      openModal({ title: `Retur — ${sale.number}`, content: el('div', null, el('div', { style: { marginBottom: '8px', fontSize: 'var(--fs-sm)', color: 'var(--color-text-muted)' } }, 'Isi qty yang dikembalikan per baris.'), ...rows, totalInfo, submitBtn) });
    }

    renderTabs();
    pageEl.append(tabs, toolbar, list);
    root.appendChild(pageEl);
    await reload();
  },
};

export default page;