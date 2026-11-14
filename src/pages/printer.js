/**
 * src/pages/printer.js
 * Halaman pengaturan & tes printer Bluetooth BLE.
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { toast, toastSuccess, toastError } from '../ui/components/toast.js';
import { confirm } from '../ui/components/modal.js';
import { saveAppSettings } from '../models/settings.js';
import { getPrinterService } from '../hardware/printer-service.js';
import { renderReceiptHtml } from '../hardware/receipt.js';

const page = {
  title: 'Printer',
  layout: 'main',

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Printer');
    ctx.setNavbarBack?.(true);

    const svc = getPrinterService({ settingsRepo: ctx.repos.settings });
    svc.bindSettings(ctx.settings);

    const pageEl = el('div', { class: 'page' });
    const statusBox = el('div', { class: 'card' });
    const actionsBox = el('div', { class: 'card' });
    const settingsBox = el('div', { class: 'card' });
    const infoBox = el('div', { class: 'card' });

    pageEl.append(
      el('div', { class: 'page__header' },
        el('h2', { class: 'page__title' }, 'Printer'),
      ),
      statusBox, actionsBox, settingsBox, infoBox,
    );
    root.appendChild(pageEl);

    function renderStatus(s) {
      clear(statusBox);
      statusBox.appendChild(el('div', { class: 'card__title' }, 'Status'));
      statusBox.appendChild(el('div', { class: 'card__row' },
        el('span', null, 'Koneksi'),
        el('span', { class: s.connected ? 'chip chip--success' : 'chip chip--danger' },
          s.connected ? 'Terhubung' : 'Terputus',
        ),
      ));
      if (s.deviceName) {
        statusBox.appendChild(el('div', { class: 'card__row' },
          el('span', null, 'Perangkat'),
          el('strong', null, s.deviceName),
        ));
      }
      if (s.lastError) {
        statusBox.appendChild(el('div', {
          class: 'card__row',
          style: { color: 'var(--color-danger)', fontSize: 'var(--fs-sm)' },
        }, s.lastError));
      }
    }

    async function renderActions() {
      clear(actionsBox);
      const state = svc.state;
      actionsBox.appendChild(el('div', { class: 'card__title' }, 'Aksi'));

      if (!state.connected) {
        actionsBox.appendChild(el('button', {
          class: 'btn btn--primary btn--block',
          type: 'button',
          onClick: onConnect,
          style: { marginBottom: '8px' },
        }, icon('bluetooth', { size: 18 }), 'Hubungkan Printer'));
      } else {
        actionsBox.appendChild(el('button', {
          class: 'btn btn--block',
          type: 'button',
          onClick: onTestPrint,
          style: { marginBottom: '8px' },
        }, icon('printer', { size: 18 }), 'Tes Cetak'));

        actionsBox.appendChild(el('button', {
          class: 'btn btn--ghost btn--block',
          type: 'button',
          onClick: onDisconnect,
        }, 'Putuskan'));
      }
    }

    function renderSettings(s) {
      clear(settingsBox);
      settingsBox.appendChild(el('div', { class: 'card__title' }, 'Preferensi'));

      const widthSelect = el('select', { class: 'select' },
        el('option', { value: '58' }, '58 mm (32 karakter)'),
        el('option', { value: '80' }, '80 mm (48 karakter)'),
      );
      widthSelect.value = String(s.receiptWidth || '58');
      widthSelect.addEventListener('change', async () => {
        await saveAppSettings(ctx.repos.settings, { receiptWidth: widthSelect.value });
        await ctx.refreshSettings();
        svc.bindSettings(ctx.settings);
        toastSuccess('Lebar struk disimpan');
      });

      const autoToggle = el('input', {
        type: 'checkbox',
        style: { width: '20px', height: '20px' },
      });
      autoToggle.checked = !!s.printerAutoConnect;
      autoToggle.addEventListener('change', async () => {
        await saveAppSettings(ctx.repos.settings, { printerAutoConnect: autoToggle.checked });
        await ctx.refreshSettings();
        toastSuccess(autoToggle.checked ? 'Auto-reconnect aktif' : 'Auto-reconnect nonaktif');
      });

      settingsBox.appendChild(el('div', { class: 'field' },
        el('label', { class: 'field__label' }, 'Lebar struk'),
        widthSelect,
      ));
      settingsBox.appendChild(el('div', { class: 'card__row' },
        el('span', null, 'Auto-reconnect saat buka app'),
        autoToggle,
      ));
    }

    function renderInfo() {
      clear(infoBox);
      infoBox.appendChild(el('div', { class: 'card__title' }, 'Tentang Bluetooth'));
      infoBox.appendChild(el('p', {
        style: { margin: '0', fontSize: 'var(--fs-sm)', color: 'var(--color-text-muted)' },
      },
        'Web Bluetooth hanya mendukung BLE dan wajib HTTPS/localhost. ' +
        'Printer thermal murah bertipe Bluetooth Classic (SPP) tidak dapat terhubung. ' +
        'Gunakan printer BLE, atau cetak melalui browser (fallback).'
      ));
      infoBox.appendChild(el('button', {
        class: 'btn btn--ghost btn--block',
        type: 'button',
        style: { marginTop: '12px' },
        onClick: () => {
          const demo = buildDemoSale();
          try {
            svc.printViaBrowser(demo);
          } catch (e) {
            toastError(e.message || 'Gagal mencetak');
          }
        },
      }, icon('receipt', { size: 18 }), 'Cetak via Browser (Fallback)'));
    }

    async function onConnect() {
      try {
        await svc.connect();
        toastSuccess('Printer terhubung');
        ctx.settings = await ctx.refreshSettings();
        svc.bindSettings(ctx.settings);
      } catch (e) {
        if (e.name === 'NotFoundError') {
          toast('Dibatalkan', { type: 'warning' });
        } else {
          toastError(e.message || 'Gagal menyambung printer');
        }
      }
    }

    async function onTestPrint() {
      try {
        await svc.testPrint();
        toastSuccess('Tes cetak dikirim');
      } catch (e) {
        toastError(e.message || 'Gagal mencetak');
      }
    }

    async function onDisconnect() {
      if (!await confirm({ title: 'Putuskan Printer', message: 'Yakin memutus koneksi printer?', confirmText: 'Putuskan', danger: true })) return;
      await svc.disconnect();
      toast('Printer diputuskan', { type: 'info' });
    }

    // Re-render saat state berubah.
    const unsub = svc.subscribe((s) => {
      renderStatus(s);
      renderActions();
      ctx.layout?.navbar?.setPrinterState(s.connected);
    });

    renderSettings(ctx.settings);
    renderInfo();

    // Coba auto-reconnect bila belum terhubung.
    if (!svc.state.connected && ctx.settings.printerDeviceId && ctx.settings.printerAutoConnect) {
      svc.autoReconnect().catch(() => {});
    }

    page.unmount = () => { unsub(); };
  },
};

function buildDemoSale() {
  const now = Date.now();
  return {
    id: 'demo', number: 'INV-DEMO', status: 'paid', cashierId: 'tester',
    items: [{ productName: 'Produk Contoh', unitName: 'pcs', factor: 1, qty: 1, pricePerUnit: 10000, subtotal: 10000, discountAmount: 0, total: 10000, note: '' }],
    payments: [{ method: 'cash', amount: 10000, ref: '', paidAt: now }],
    subtotal: 10000, extraDiscount: 0, discountTotal: 0, taxTotal: 0,
    total: 10000, paidTotal: 10000, change: 0, debtAmount: 0,
    createdAt: now, updatedAt: now, deleted: false,
  };
}

export default page;