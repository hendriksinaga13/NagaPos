/**
 * src/pages/pembayaran.js
 * Pembayaran + validasi serial + integrasi user tracking.
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatRupiah } from '../core/utils.js';
import { openModal, closeModal } from '../ui/components/modal.js';
import { toastError, toastSuccess } from '../ui/components/toast.js';
import { createNumpad } from '../ui/components/numpad.js';
import { finalizeSale } from '../services/sale-service.js';
import { sumPayments, paymentLabel, suggestCashAmounts } from '../services/payment-service.js';
import { getActiveShift } from '../services/shift-service.js';
import { PAYMENT_METHOD, createPayment } from '../models/payment.js';
import { feedbackPaySuccess, feedbackError } from '../core/feedback.js';
import { renderReceiptHtml, generateReceiptText } from '../hardware/receipt.js';
import { getPrinterService } from '../hardware/printer-service.js';
import { broadcastPaymentSuccess } from '../services/cart-broadcast.js';
import { getCurrentUser } from '../services/auth-service.js';
import { navigate } from '../router.js';

let _cleanup = null;

const page = {
  title: 'Pembayaran',
  layout: 'main',
  flush: true,

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Pembayaran');
    ctx.setNavbarBack?.(true);
    const cart = ctx.cart;
    const state = cart.getState();
    if (state.items.length === 0) { root.appendChild(el('div', { class: 'empty' }, el('div', { class: 'empty__title' }, 'Keranjang kosong'), el('div', { style: { marginTop: '16px' } }, el('button', { class: 'btn btn--primary', onClick: () => navigate('/kasir') }, 'Kembali')))); return; }

    const currentUser = getCurrentUser();
    const cashierId = currentUser?.username || currentUser?.id || 'kasir';
    const cashierName = currentUser?.name || 'Kasir';

    const total = state.computed.total;
    const customerId = state.customerId;
    const printerSvc = getPrinterService({ settingsRepo: ctx.repos.settings });
    printerSvc.bindSettings(ctx.settings);
    let activeShift = null;
    try { activeShift = await getActiveShift(ctx); } catch {}
    const payments = [];
    let saving = false;

    // ===== VALIDASI SERIAL =====
    function checkSerials() {
      const missing = [];
      for (const line of state.computed.lines) {
        if (line.trackSerial) {
          const cnt = (line.serials || []).length;
          if (cnt !== line.qty) {
            missing.push({ name: line.productName, qty: line.qty, have: cnt });
          }
        }
      }
      return missing;
    }

    const serialWarning = el('div');
    function renderSerialWarning() {
      clear(serialWarning);
      const missing = checkSerials();
      if (missing.length === 0) return;
      serialWarning.appendChild(el('div', {
        class: 'card',
        style: { background: 'var(--color-danger-soft)', borderColor: 'var(--color-danger)', padding: '10px 12px', fontSize: 'var(--fs-sm)', marginBottom: '12px' },
      },
        el('div', { style: { fontWeight: '700', color: 'var(--color-danger)' } }, '⚠️ Serial/IMEI belum lengkap'),
        ...missing.map((m) => el('div', { style: { marginTop: '4px', fontSize: 'var(--fs-xs)' } },
          `• ${m.name}: ${m.have}/${m.qty} serial dipilih`)),
        el('div', { style: { marginTop: '8px', fontSize: 'var(--fs-xs)' } },
          'Kembali ke kasir untuk memilih serial yang kurang.'),
      ));
    }

    const pageEl = el('div', { class: 'pembayaran-page' });
    const summary = el('div', { class: 'pembayaran-summary card' },
      el('div', { class: 'card__row' }, el('span', null, 'Subtotal'), el('strong', null, formatRupiah(state.computed.subtotal))),
      el('div', { class: 'card__row pembayaran-summary__total' }, el('span', null, 'Total'), el('strong', null, formatRupiah(total))),
    );
    const methodsGrid = el('div', { class: 'pembayaran-methods' },
      methodButton('cash', 'cash', 'Tunai'), methodButton('qris', 'qris', 'QRIS'), methodButton('transfer', 'transfer', 'Transfer'), methodButton('debit', 'card', 'Debit'), methodButton('credit', 'utang', 'Utang'),
    );
    const paymentList = el('div', { class: 'pembayaran-list' });
    const infoBox = el('div', { class: 'pembayaran-info card' });
    const saveBtn = el('button', { class: 'btn btn--primary btn--lg btn--block', onClick: onSave }, 'Simpan Transaksi');

    renderSerialWarning();
    pageEl.append(serialWarning, el('div', { class: 'pembayaran-body' }, summary, el('div', { style: { height: '12px' } }), methodsGrid, paymentList, infoBox), el('div', { class: 'kasir-footer' }, saveBtn));
    root.appendChild(pageEl);

    function methodButton(method, iconName, label) { return el('button', { class: 'pembayaran-method', onClick: () => openPaymentEntry(method) }, icon(iconName, { size: 22 }), el('span', null, label)); }

    function openPaymentEntry(method) {
      const sum = sumPayments(payments);
      const remaining = Math.max(0, total - sum.total);
      const numpad = createNumpad({ allowDecimal: false, enterLabel: 'Tambah', initial: remaining > 0 ? String(remaining) : '', onEnter: (v) => applyPayment(method, v, refInput.value) });
      let suggestionsRow = null;
      if (method === PAYMENT_METHOD.CASH) { suggestionsRow = el('div', { class: 'pembayaran-suggestions' }, ...suggestCashAmounts(remaining > 0 ? remaining : total).map((amt) => el('button', { class: 'chip', onClick: () => numpad.setValue(String(amt)) }, formatRupiah(amt)))); }
      const refInput = el('input', { type: 'text', class: 'input', placeholder: 'Referensi (opsional)' });
      const confirmBtn = el('button', { class: 'btn btn--primary btn--block', onClick: () => applyPayment(method, numpad.getValue(), refInput.value) }, 'Tambah');
      openModal({ title: `Pembayaran ${paymentLabel(method)}`, content: el('div', null, suggestionsRow, numpad.root, el('div', { style: { height: '8px' } }), refInput, el('div', { style: { height: '12px' } }), confirmBtn) });
    }

    async function applyPayment(method, valueStr, ref = '') {
      const amount = Math.max(0, Math.round(Number(valueStr) || 0));
      if (amount <= 0) { toastError('Nominal harus > 0'); feedbackError(); return; }
      if (method === PAYMENT_METHOD.CREDIT && !customerId) { toastError('Pilih pelanggan dulu untuk utang'); feedbackError(); return; }
      payments.push(createPayment({ method, amount, ref: String(ref || '').trim(), paidAt: Date.now() }));
      closeModal(); renderPayments(); feedbackPaySuccess();
    }

    function renderPayments() {
      clear(paymentList);
      if (payments.length === 0) { paymentList.appendChild(el('div', { class: 'empty', style: { padding: '16px' } }, el('div', { class: 'empty__title' }, 'Belum ada pembayaran'))); }
      else { for (let i = 0; i < payments.length; i++) { const p = payments[i]; paymentList.appendChild(el('div', { class: 'cart-item' }, el('div', { class: 'cart-item__info' }, el('div', { class: 'cart-item__name' }, paymentLabel(p.method)), el('div', { class: 'cart-item__meta' }, p.ref || 'Tanpa referensi')), el('div', { class: 'cart-item__right' }, el('div', { class: 'cart-item__price' }, formatRupiah(p.amount)), el('button', { class: 'qty-btn', onClick: () => { payments.splice(i, 1); renderPayments(); } }, icon('trash', { size: 16 }))))); } }
      renderInfo();
    }

    function renderInfo() {
      clear(infoBox);
      const sum = sumPayments(payments);
      infoBox.appendChild(el('div', { class: 'card__row' }, el('span', null, 'Dibayar'), el('strong', null, formatRupiah(sum.total))));
      const covered = sum.nonCredit + sum.credit >= total;
      if (!covered) { infoBox.appendChild(el('div', { class: 'card__row' }, el('span', null, 'Kurang'), el('strong', { style: { color: 'var(--color-danger)' } }, formatRupiah(total - (sum.nonCredit + sum.credit))))); }
      else { infoBox.appendChild(el('div', { class: 'card__row' }, el('span', null, 'Status'), el('strong', { style: { color: 'var(--color-success)' } }, 'Lunas'))); }
      const missingSerials = checkSerials();
      saveBtn.disabled = saving || !covered || missingSerials.length > 0;
    }

    async function onSave() {
      if (saving) return;
      const missing = checkSerials();
      if (missing.length > 0) { toastError('Lengkapi serial/IMEI dulu'); return; }
      saving = true; saveBtn.disabled = true; saveBtn.textContent = 'Menyimpan…';
      try {
        const draft = cart.toSaleDraft(payments);
        const sale = await finalizeSale(draft, ctx, { cashierId, shiftId: activeShift ? activeShift.id : '' });
        broadcastPaymentSuccess({ change: sale.change || 0, debtAmount: sale.debtAmount || 0, total: sale.total || 0 });
        feedbackPaySuccess(); toastSuccess(`Transaksi tersimpan oleh ${cashierName}`);
        await cart.clear();
        await showReceiptDialog(sale);
      } catch (e) { toastError(e.message || 'Gagal simpan'); feedbackError(); }
      finally { saving = false; saveBtn.disabled = false; saveBtn.textContent = 'Simpan Transaksi'; renderInfo(); }
    }

    async function showReceiptDialog(sale) {
      const receiptHtml = renderReceiptHtml(sale, ctx.settings);
      const receiptWrap = el('div', { html: receiptHtml });
      const printBtns = el('div', { style: { display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' } });
      if (printerSvc.state.connected) { printBtns.appendChild(el('button', { class: 'btn btn--primary', style: { flex: '1 1 100%' }, onClick: async () => { try { await printerSvc.printSale(sale); toastSuccess('Struk dikirim'); } catch (e) { toastError(e.message || 'Gagal cetak'); } } }, icon('printer', { size: 18 }), 'Cetak Bluetooth')); }
      if (sale.customerId) {
        const customer = await ctx.repos.customers.get(sale.customerId);
        if (customer && customer.phone) {
          const phone = customer.phone.replace(/^0/, '62').replace(/\D/g, '');
          const text = encodeURIComponent(generateReceiptText(sale, ctx.settings));
          printBtns.appendChild(el('button', { class: 'btn', style: { flex: 1, background: '#25D366', color: '#fff' }, onClick: () => window.open(`https://wa.me/${phone}?text=${text}`, '_blank') }, 'WhatsApp'));
        }
      }
      printBtns.appendChild(el('button', { class: 'btn btn--ghost', style: { flex: 1 }, onClick: () => { try { printerSvc.printViaBrowser(sale); } catch (e) { toastError(e.message || 'Gagal cetak'); } } }, icon('receipt', { size: 18 }), 'Browser'));
      const doneBtn = el('button', { class: 'btn btn--primary btn--block', style: { marginTop: '8px' }, onClick: () => { closeModal(); navigate('/kasir'); } }, 'Selesai & Kembali');
      openModal({ title: 'Transaksi Tersimpan', content: el('div', null, receiptWrap, printBtns, doneBtn), dismissible: false });
    }

    renderPayments();
    _cleanup = () => {};
  },

  unmount() { if (_cleanup) { _cleanup(); _cleanup = null; } closeModal(); },
};
export default page;