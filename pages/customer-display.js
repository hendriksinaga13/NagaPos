/**
 * src/pages/customer-display.js
 * Layar pelanggan. Menampilkan keranjang & total secara live dari kasir.
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatRupiah } from '../core/utils.js';
import { onCartMessage } from '../services/cart-broadcast.js';

const page = {
  title: 'Layar Pelanggan',
  layout: 'plain',
  flush: true,

  async mount(root, params, ctx) {
    document.body.classList.add('customer-display-mode');
    document.body.style.overflow = 'hidden';

    let cartState = null;
    let thankYou = null;
    let resetTimer = null;

    const pageEl = el('div', { class: 'cd-page' });
    root.appendChild(pageEl);

    function fmtQty(q) {
      return Number.isInteger(q) ? String(q) : String(q).replace('.', ',');
    }

    function renderIdle() {
      const s = ctx.settings;
      return el('div', { class: 'cd-idle' },
        el('img', { src: 'assets/logo/logo.svg', alt: '', class: 'cd-logo' }),
        el('div', { class: 'cd-store' }, s.storeName || 'Toko Saya'),
        s.storeAddress ? el('div', { class: 'cd-store-meta' }, s.storeAddress) : null,
        s.storePhone ? el('div', { class: 'cd-store-meta' }, s.storePhone) : null,
        el('div', { class: 'cd-welcome' }, 'Selamat datang 👋'),
        el('div', { class: 'cd-hint' }, 'Kasir akan segera melayani Anda'),
      );
    }

    function renderCart(state) {
      if (!state || !state.items || state.items.length === 0) return renderIdle();

      const wrap = el('div', { class: 'cd-cart' });
      wrap.appendChild(el('div', { class: 'cd-cart__header' }, 'Rincian Belanja'));

      const itemsEl = el('div', { class: 'cd-items' });
      for (const line of state.computed.lines) {
        itemsEl.appendChild(el('div', { class: 'cd-item' },
          el('div', { class: 'cd-item__main' },
            el('div', { class: 'cd-item__name' }, line.productName),
            el('div', { class: 'cd-item__meta' },
              `${fmtQty(line.qty)} ${line.unitName} × ${formatRupiah(line.pricePerUnit)}`),
          ),
          el('div', { class: 'cd-item__total' }, formatRupiah(line.total)),
        ));
      }
      wrap.appendChild(itemsEl);

      wrap.appendChild(el('div', { class: 'cd-total' },
        el('span', { class: 'cd-total__label' }, 'TOTAL'),
        el('span', { class: 'cd-total__value' }, formatRupiah(state.computed.total)),
      ));

      if (state.computed.totalDiscount > 0) {
        wrap.appendChild(el('div', { class: 'cd-discount' },
          `Anda hemat ${formatRupiah(state.computed.totalDiscount)}`));
      }

      return wrap;
    }

    function renderThankYou(payload) {
      const change = payload.change || 0;
      return el('div', { class: 'cd-thank' },
        el('div', { class: 'cd-thank__icon' }, icon('check', { size: 96 })),
        el('div', { class: 'cd-thank__title' }, 'Terima Kasih!'),
        el('div', { class: 'cd-thank__msg' }, 'Pembayaran berhasil'),
        change > 0
          ? el('div', { class: 'cd-thank__change' },
              el('div', { class: 'cd-thank__change-label' }, 'Kembalian'),
              el('div', { class: 'cd-thank__change-value' }, formatRupiah(change)),
            )
          : null,
        payload.debtAmount > 0
          ? el('div', { class: 'cd-thank__debt' }, `Sisa piutang: ${formatRupiah(payload.debtAmount)}`)
          : null,
        el('div', { class: 'cd-thank__footer' }, ctx.settings.receiptFooter || ''),
      );
    }

    function render() {
      clear(pageEl);
      pageEl.appendChild(thankYou ? renderThankYou(thankYou) : renderCart(cartState));
    }

    const unsubscribe = onCartMessage((msg) => {
      if (!msg || !msg.type) return;

      if (msg.type === 'cart-update') {
        cartState = msg.state;
        if (thankYou) { thankYou = null; if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; } }
        render();
      } else if (msg.type === 'payment-success') {
        thankYou = msg.payload || {};
        cartState = null;
        render();
        if (resetTimer) clearTimeout(resetTimer);
        resetTimer = setTimeout(() => { thankYou = null; render(); }, 8000);
      } else if (msg.type === 'reset') {
        cartState = null;
        thankYou = null;
        if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
        render();
      }
    });

    render();

    try {
      if ('wakeLock' in navigator) { await navigator.wakeLock.request('screen'); }
    } catch {}

    document.addEventListener('click', () => {
      if (!document.fullscreenElement) { document.documentElement.requestFullscreen?.().catch(() => {}); }
    }, { once: true });

    page.unmount = () => {
      unsubscribe();
      document.body.classList.remove('customer-display-mode');
      document.body.style.overflow = '';
      if (resetTimer) clearTimeout(resetTimer);
    };
  },
};

export default page;