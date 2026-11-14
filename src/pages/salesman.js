/**
 * src/pages/salesman.js
 */

import { el, clear } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { formatRupiah, formatDateTime } from '../core/utils.js';
import { confirm } from '../ui/components/modal.js';
import { toastSuccess, toastError, toast } from '../ui/components/toast.js';
import { importOwnerDb } from '../services/backup-service.js';
import {
  exportPendingSOs, downloadSOFile, generateSOText,
} from '../services/sales-order-service.js';
import {
  getVisitState, startDay, endDay, startVisit, skipVisit,
  getVisitStatus, getVisitSummary, markDayFinished, isDayFinished,
} from '../services/visit-service.js';
import { openProductViewer } from '../ui/components/product-viewer.js';
import { openCustomerViewer } from '../ui/components/customer-viewer.js';
import { openSOHistoryViewer } from '../ui/components/so-history-viewer.js';
import { getCurrentUser } from '../services/auth-service.js';
import { createScannerView } from '../ui/components/scanner-view.js';
import { BarcodeCameraScanner } from '../hardware/barcode-camera.js';
import { feedbackScanSuccess, feedbackError, primeAudio } from '../core/feedback.js';
import { navigate } from '../router.js';

const page = {
  title: 'Salesman',
  layout: 'main',
  flush: true,

  async mount(root, params, ctx) {
    try {
      primeAudio();

      const user = getCurrentUser();
      const salesmanName = user ? user.name : 'Salesman';
      ctx.setNavbarTitle?.(salesmanName);
      ctx.setNavbarBack?.(false);

      if (ctx.layout && ctx.layout.bottomNav) {
        ctx.layout.bottomNav.root.style.display = 'none';
        document.body.style.paddingBottom = '0';
      }

      const today = new Date().toISOString().slice(0, 10);
      const lastUnlock = localStorage.getItem('salesman_last_unlock');
      if (lastUnlock !== today) {
        showLockScreen(root, ctx, today);
        return;
      }

      const customers = await ctx.repos.customers.list();
      customers.sort((a, b) => a.name.localeCompare(b.name));

      if (customers.length === 0) {
        renderImportFirst(root, ctx);
        return;
      }

      const stats = await calculateStats(ctx);
      renderDashboard(root, ctx, customers, stats);
    } catch (err) {
      console.error('[salesman] mount error:', err);
      root.innerHTML = '';
      root.appendChild(el('div', { class: 'page-error', style: { padding: '24px' } },
        el('h2', null, 'Gagal memuat dashboard'),
        el('p', null, err?.message || 'Terjadi kesalahan sistem'),
        el('button', { class: 'btn btn--primary', style: { marginTop: '16px' }, onClick: () => location.reload() }, 'Muat Ulang')
      ));
    }
  },

  unmount() {
    if (this.ctx && this.ctx.layout && this.ctx.layout.bottomNav) {
      this.ctx.layout.bottomNav.root.style.display = '';
    }
  }
};

/* ===================== KALKULASI STATISTIK ===================== */

async function calculateStats(ctx) {
  try {
    const allSOs = await ctx.repos.salesOrders.list();
    const mySOs = allSOs.filter(so => so.salesmanId === ctx.deviceCode && so.status !== 'cancelled');

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - (24 * 3600 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let stats = {
      today: { count: 0, revenue: 0 },
      yesterday: { count: 0, revenue: 0 },
      month: { count: 0, revenue: 0 }
    };

    for (const so of mySOs) {
      const t = so.createdAt;
      if (t >= monthStart) {
        stats.month.count++;
        stats.month.revenue += so.total;
        if (t >= todayStart) {
          stats.today.count++;
          stats.today.revenue += so.total;
        } else if (t >= yesterdayStart && t < todayStart) {
          stats.yesterday.count++;
          stats.yesterday.revenue += so.total;
        }
      }
    }
    return stats;
  } catch (e) {
    console.warn('[salesman] gagal hitung statistik', e);
    return { today: { count: 0, revenue: 0 }, yesterday: { count: 0, revenue: 0 }, month: { count: 0, revenue: 0 } };
  }
}

/* ===================== RENDERING DASHBOARD ===================== */

function renderDashboard(root, ctx, customers, stats) {
  const pageEl = el('div', { class: 'kasir-page', style: { background: 'var(--color-bg)' } });

  const finished = isDayFinished();
  const visitState = getVisitState();
  const summary = getVisitSummary(customers);
  const storeName = ctx.settings?.storeName || 'Toko';

  pageEl.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' },
  },
    el('div', { style: { fontSize: 'var(--fs-sm)', fontWeight: '700' } }, storeName),
    el('div', { style: { display: 'flex', gap: '8px' } },
      el('button', {
        class: 'btn btn--primary btn--sm', type: 'button', style: { height: '28px', padding: '0 8px', fontSize: '11px' },
        onClick: () => openStoreScanner(ctx, customers, visitState),
      }, icon('scan', { size: 12 }), 'Scan Toko'),
      el('button', {
        class: 'btn btn--ghost btn--sm', type: 'button', style: { height: '28px', padding: '0 8px', fontSize: '11px' },
        onClick: () => openImportDialog(ctx),
      }, icon('sync', { size: 12 }), 'Import')
    )
  ));

  const achRow = el('div', {
    style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' },
  });
  
  const createStat = (label, val, isActive) => el('div', {
    style: { padding: '8px 4px', textAlign: 'center', borderRight: '1px solid var(--color-border)' }
  },
    el('div', { style: { fontSize: '9px', color: 'var(--color-text-muted)', fontWeight: '700' } }, label),
    el('div', { style: { fontSize: '13px', fontWeight: '800', color: isActive ? 'var(--color-primary)' : 'var(--color-text)' } }, formatRupiah(val).replace('Rp ', '')),
    el('div', { style: { fontSize: '9px', color: 'var(--color-text-muted)' } }, `${isActive ? stats.today.count : label === 'KEMARIN' ? stats.yesterday.count : stats.month.count} trx`)
  );

  achRow.appendChild(createStat('HARI INI', stats.today.revenue, true));
  achRow.appendChild(createStat('KEMARIN', stats.yesterday.revenue, false));
  achRow.appendChild(createStat('BULAN INI', stats.month.revenue, false));
  pageEl.appendChild(achRow);

  if (finished) {
    pageEl.appendChild(el('div', {
      style: { background: 'var(--color-success-soft)', padding: '10px 16px', borderBottom: '1px solid var(--color-success)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    },
      el('div', { style: { fontWeight: '700', color: 'var(--color-success)', fontSize: 'var(--fs-sm)' } }, '✅ Tugas Selesai'),
      el('button', {
        class: 'btn btn--sm btn--ghost', type: 'button', style: { height: '28px', padding: '0 8px', fontSize: '11px' },
        onClick: () => { import('../services/auth-service.js').then(m => { m.logout(); navigate('/login'); }).catch(err => console.warn(err)); },
      }, 'Logout')
    ));
  } else if (!visitState) {
    pageEl.appendChild(el('div', { style: { padding: '12px 16px', background: 'var(--color-surface)' } },
      el('button', {
        class: 'btn btn--primary btn--block', type: 'button', style: { height: '44px', fontSize: '15px', fontWeight: '800' },
        onClick: () => { startDay(); toastSuccess('Mulai jalan!'); location.reload(); },
      }, '🚀 MULAI JALAN')
    ));
  } else {
    pageEl.appendChild(el('div', {
      style: { background: 'var(--color-primary-soft)', padding: '8px 16px', borderBottom: '1px solid var(--color-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    },
      el('div', { style: { fontWeight: '700', color: 'var(--color-primary)', fontSize: '12px' } }, '🟢 Sedang Jalan'),
      el('div', { style: { fontSize: '11px', color: 'var(--color-text-muted)' } }, `${summary.done} selesai / ${summary.total} toko`)
    ));
  }

  const actionRow = el('div', {
    style: { display: 'flex', gap: '6px', padding: '10px 16px', overflowX: 'auto', background: 'var(--color-bg)' },
  });
  actionRow.appendChild(smallBtn('Produk', icon('produk', { size: 14 }), () => openProductViewer(ctx)));
  actionRow.appendChild(smallBtn('Pelanggan', icon('pelanggan', { size: 14 }), () => openCustomerViewer(ctx)));
  actionRow.appendChild(smallBtn('Riwayat SO', icon('receipt', { size: 14 }), () => openSOHistoryViewer(ctx)));
  pageEl.appendChild(actionRow);

  pageEl.appendChild(el('div', {
    style: { fontSize: '10px', fontWeight: '700', color: 'var(--color-text-muted)', textTransform: 'uppercase', padding: '4px 16px 6px', background: 'var(--color-bg)' },
  }, 'Daftar Toko Kunjungan'));

  const listEl = el('div', { style: { background: 'var(--color-surface)' } });
  pageEl.appendChild(listEl);

  const sorted = [...customers].sort((a, b) => {
    const sa = getVisitStatus(a.id);
    const sb = getVisitStatus(b.id);
    const prioA = sa?.status === 'in_progress' ? 0 : sa?.status === 'done' ? 2 : 1;
    const prioB = sb?.status === 'in_progress' ? 0 : sb?.status === 'done' ? 2 : 1;
    if (prioA !== prioB) return prioA - prioB;
    return a.name.localeCompare(b.name);
  });

  for (const customer of sorted) {
    listEl.appendChild(renderCustomerRow(customer, ctx, finished, visitState));
  }

  if (!finished) {
    const bottomActions = el('div', { style: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' } });
    if (visitState) {
      bottomActions.appendChild(el('button', {
        class: 'btn btn--primary btn--block', type: 'button', style: { height: '40px', fontSize: '14px' },
        onClick: () => openExportSO(ctx),
      }, icon('receipt', { size: 16 }), `Export SO (Kirim ke Kasir)`));
    }
    bottomActions.appendChild(el('button', {
      class: 'btn btn--danger btn--block', type: 'button', style: { height: '40px', fontSize: '14px' },
      onClick: () => doFinishDay(ctx),
    }, icon('check', { size: 16 }), 'Selesai Tugas (Kunci)'));
    pageEl.appendChild(bottomActions);
  }

  root.appendChild(pageEl);
}

function renderCustomerRow(customer, ctx, finished, visitState) {
  const visit = getVisitStatus(customer.id);
  const status = visit?.status || 'pending';

  let badge, iconEl;
  if (status === 'done') {
    badge = el('span', { style: { fontSize: '9px', color: 'var(--color-success)', fontWeight: '700' } }, visit.soNumber ? 'ADA SO' : 'SELESAI');
    iconEl = el('div', { style: { width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-success)' } });
  } else if (status === 'in_progress') {
    badge = el('span', { style: { fontSize: '9px', color: 'var(--color-warning)', fontWeight: '700' } }, 'BERLANGSUNG');
    iconEl = el('div', { style: { width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-warning)' } });
  } else {
    badge = null;
    iconEl = el('div', { style: { width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-border)' } });
  }

  const isClickable = !finished;

  return el('div', {
    style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: '1px solid var(--color-border)', opacity: isClickable ? 1 : 0.6 },
    onClick: () => {
      if (!isClickable) { toast('Tugas sudah selesai.', { type: 'info' }); return; }
      if (!visitState) { toast('Klik MULAI JALAN dulu.', { type: 'warning' }); return; }
      openVisitActions(customer, ctx);
    },
  },
    iconEl,
    el('div', { style: { flex: 1, minWidth: 0 } },
      el('div', { style: { fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, customer.name),
      el('div', { style: { fontSize: '10px', color: 'var(--color-text-muted)' } }, customer.phone || customer.address || '-'),
    ),
    badge ? el('div', { style: { marginRight: '4px' } }, badge) : null,
    icon('chevron-right', { size: 16, className: 'text-muted' })
  );
}

function openVisitActions(customer, ctx) {
  const visit = getVisitStatus(customer.id);

  const content = el('div', null,
    el('div', { class: 'detail-row' }, el('span', null, 'Nama'), el('strong', null, customer.name)),
    el('div', { class: 'detail-row' }, el('span', null, 'Telepon'), el('span', null, customer.phone || '-')),
    el('div', { class: 'detail-row' }, el('span', null, 'Alamat'), el('span', null, customer.address || '-')),
    el('div', { class: 'detail-row' }, el('span', null, 'Plafon Utang'), el('span', null, formatRupiah(customer.creditLimit))),
    el('div', { class: 'detail-row' }, el('span', null, 'Utang Saat Ini'), el('strong', { style: { color: customer.debt > 0 ? 'var(--color-warning)' : undefined } }, formatRupiah(customer.debt))),
    visit?.status === 'done' && visit.soNumber ? el('div', { class: 'detail-row' }, el('span', null, 'SO Hari Ini'), el('strong', null, visit.soNumber)) : null,
  );

  const actions = el('div', { style: { marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' } });

  actions.appendChild(el('button', {
    class: 'btn btn--primary btn--block', type: 'button', style: { minHeight: '48px', fontSize: '14px' },
    onClick: () => {
      startVisit(customer.id);
      navigate(`/sales-order-baru?customerId=${customer.id}`);
    },
  }, icon('kasir', { size: 18 }), visit?.status === 'in_progress' ? 'Lanjut Kunjungan' : 'Mulai Kunjungan'));

  if (visit?.status !== 'done') {
    actions.appendChild(el('button', {
      class: 'btn btn--block', type: 'button', style: { minHeight: '40px', fontSize: '13px' },
      onClick: async () => {
        const ok = await confirm({ title: 'Tidak Ada Order', message: `Tandai "${customer.name}" tidak ada order?`, confirmText: 'Ya, Skip' });
        if (!ok) return;
        skipVisit(customer.id, 'Tidak ada order');
        toastSuccess('Selesai');
        location.reload();
      },
    }, 'Tandai Tidak Ada Order'));
  }

  import('../ui/components/modal.js').then(({ openModal }) => {
    openModal({ title: customer.name, content: el('div', null, content, actions) });
  }).catch(err => console.warn(err));
}

function smallBtn(label, iconEl, handler) {
  return el('button', {
    class: 'btn btn--ghost', type: 'button',
    style: { flexShrink: 0, flexDirection: 'row', gap: '4px', height: '32px', padding: '0 12px', fontSize: '12px', borderRadius: '16px' },
    onClick: handler,
  }, iconEl, label);
}

/* ===================== SCANNER TOKO ===================== */

function openStoreScanner(ctx, customers, visitState) {
  if (isDayFinished()) {
    toast('Tugas hari ini sudah selesai.', { type: 'info' });
    return;
  }
  if (!visitState) {
    toast('Klik MULAI JALAN terlebih dahulu di atas.', { type: 'warning' });
    return;
  }

  const scannerView = createScannerView();
  const statusText = el('div', { style: { textAlign: 'center', marginTop: '12px', fontSize: '12px', color: 'var(--color-text-muted)' } }, 'Arahkan kamera ke barcode toko');
  
  let camScanner = null;
  import('../ui/components/modal.js').then(({ openModal, closeModal }) => {
    openModal({
      title: 'Scan Toko',
      content: el('div', null, scannerView.root, statusText),
      onClose: () => { if (camScanner) camScanner.stop(); scannerView.stop(); }
    });

    camScanner = new BarcodeCameraScanner({
      onDetect: (text) => {
        const cleanText = text.trim();
        const customer = customers.find(c => 
          (c.barcode && c.barcode.toLowerCase() === cleanText.toLowerCase()) || 
          c.id === cleanText || 
          (c.phone && c.phone === cleanText)
        );

        if (customer) {
          feedbackScanSuccess();
          statusText.textContent = `✅ Toko ditemukan: ${customer.name}`;
          statusText.style.color = 'var(--color-success)';
          
          setTimeout(() => {
            if (camScanner) camScanner.stop();
            closeModal();
            
            const v = getVisitStatus(customer.id);
            if (v?.status === 'done') {
               toast(`Kunjungan ${customer.name} sudah selesai hari ini.`, {type: 'info'});
               return;
            }
            
            startVisit(customer.id);
            navigate(`/sales-order-baru?customerId=${customer.id}`);
          }, 600);
        } else {
          feedbackError();
          statusText.textContent = `❌ Toko tidak dikenali: ${cleanText}`;
          statusText.style.color = 'var(--color-danger)';
          if (navigator.vibrate) navigator.vibrate(200);
        }
      },
      onError: (err) => { 
        statusText.textContent = err?.message || 'Gagal scan';
        statusText.style.color = 'var(--color-danger)';
      }
    });

    camScanner.start(scannerView.video).catch(err => {
      statusText.textContent = err?.message || 'Gagal buka kamera';
      toastError('Gagal buka kamera');
    });
  }).catch(err => console.warn(err));
}

/* ===================== AKSI ===================== */

function openImportDialog(ctx) {
  const fileInput = el('input', { type: 'file', accept: '.db,.json,application/json,application/octet-stream', style: { display: 'none' }, onChange: handleFileSelected });
  document.body.appendChild(fileInput);
  fileInput.click();
  
  async function handleFileSelected(e) {
    const file = e.target.files?.[0]; 
    fileInput.remove(); 
    if (!file) return;
    
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    const ok = await confirm({ title: 'Import Data', message: `File: ${file.name} (${sizeMB} MB)\nLanjutkan?`, confirmText: 'Import' });
    if (!ok) return;
    
    // Tampilkan Loading Overlay
    const { openModal, closeModal } = await import('../ui/components/modal.js');
    const loaderText = el('div', { style: { textAlign: 'center', padding: '20px' } },
      el('div', { class: 'spinner', style: { width: '40px', height: '40px', border: '4px solid #ccc', borderTopColor: 'var(--color-primary)', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' } }),
      el('div', { style: { fontWeight: '700' } }, 'Mengimpor data...'),
      el('div', { style: { fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '8px' } }, 'Jangan tutup aplikasi.')
    );
    openModal({ title: 'Mohon Tunggu', content: loaderText, dismissible: false });

    // Delay agar modal ter-render sebelum proses berat
    await new Promise(r => setTimeout(r, 100));

    try {
      const result = await importOwnerDb(ctx, file);
      
      loaderText.innerHTML = `
        <div style="text-align:center; padding:20px; color: var(--color-success)">
          <div style="font-size:40px; margin-bottom:10px;">✅</div>
          <div style="font-weight:700; font-size:18px;">Import Berhasil!</div>
          <div style="font-size:14px; margin-top:8px;">Masuk: ${result.imported} data</div>
          <div style="font-size:12px; color:gray;">Dilewati: ${result.skipped} data (duplikat)</div>
          <button id="btn-reload" class="btn btn--primary btn--block" style="margin-top:20px">Muat Ulang Aplikasi</button>
        </div>
      `;
      
      loaderText.querySelector('#btn-reload').addEventListener('click', () => {
        location.reload();
      });

    } catch (err) { 
      loaderText.innerHTML = `
        <div style="text-align:center; padding:20px; color: var(--color-danger)">
          <div style="font-size:40px; margin-bottom:10px;">❌</div>
          <div style="font-weight:700; font-size:16px;">Gagal Import</div>
          <div style="font-size:13px; margin-top:8px;">${err?.message || 'File rusak atau memori penuh.'}</div>
          <button id="btn-close" class="btn btn--ghost btn--block" style="margin-top:20px">Tutup</button>
        </div>
      `;
      loaderText.querySelector('#btn-close').addEventListener('click', closeModal);
    }
  }
}

async function openExportSO(ctx) {
  try {
    const result = await exportPendingSOs(ctx);
    const { data, filename } = result;
    const text = generateSOText(data);

    const content = el('div', null,
      el('div', { style: { background: 'var(--color-primary-soft)', padding: '12px', borderRadius: 'var(--radius-md)', marginBottom: '12px', fontSize: 'var(--fs-sm)' } },
        el('div', { style: { fontWeight: '700' } }, `📦 ${data.orders.length} SO siap dikirim`),
        el('div', { style: { color: 'var(--color-text-muted)' } }, `Total: ${formatRupiah(data.orders.reduce((s, o) => s + o.total, 0))}`),
      ),
      el('button', { class: 'btn btn--primary btn--block', style: { marginBottom: '8px' }, onClick: () => { downloadSOFile(result); toastSuccess('Terunduh.'); } }, 'Unduh File (.json)'),
      el('button', { class: 'btn btn--block', style: { marginBottom: '8px', background: '#25D366', color: '#fff' }, onClick: () => { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank'); } }, 'Kirim via WhatsApp'),
    );
    const { openModal } = await import('../ui/components/modal.js');
    openModal({ title: 'Export Sales Order', content });
  } catch (e) { toastError(e?.message || 'Gagal export'); }
}

async function doFinishDay(ctx) {
  const ok = await confirm({ title: 'Selesai Tugas', message: 'Aplikasi akan DIKUNCI dan logout. Lanjutkan?', confirmText: 'Ya, Kunci', danger: true });
  if (!ok) return;
  endDay(); markDayFinished(); toastSuccess('Tugas selesai. Aplikasi dikunci.');
  const { logout } = await import('../services/auth-service.js');
  logout(); setTimeout(() => { navigate('/login'); }, 1200);
}

function showLockScreen(root, ctx, today) {
  const screen = el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: '24px', textAlign: 'center', background: 'var(--color-bg)' } },
    icon('utang', { size: 64, className: 'text-muted' }),
    el('h1', { style: { fontSize: '20px', marginTop: '16px' } }, 'Aplikasi Terkunci'),
    el('p', { style: { color: 'var(--color-text-muted)', marginBottom: '24px', fontSize: '13px' } }, 'Silakan buka kunci untuk memulai.'),
    el('button', { class: 'btn btn--primary btn--lg btn--block', onClick: () => { localStorage.setItem('salesman_last_unlock', today); toastSuccess('Selamat bekerja!'); setTimeout(() => location.reload(), 800); } }, icon('check', { size: 18 }), 'Buka Kunci'),
  );
  root.appendChild(screen);
}

function renderImportFirst(root, ctx) {
  const pageEl = el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', padding: '24px', textAlign: 'center' } });
  pageEl.appendChild(el('img', { src: 'assets/logo/logo.svg', width: 96, alt: 'Logo' }));
  pageEl.appendChild(el('h1', { style: { fontSize: '20px', marginTop: '16px' } }, 'Selamat Datang'));
  pageEl.appendChild(el('p', { style: { color: 'var(--color-text-muted)', marginBottom: '24px', maxWidth: '320px', fontSize: '13px' } }, 'Import file data dari Owner terlebih dahulu.'));
  pageEl.appendChild(el('button', { class: 'btn btn--primary btn--lg btn--block', style: { maxWidth: '320px' }, onClick: () => openImportDialog(ctx) }, icon('sync', { size: 18 }), 'Import Data Owner'));
  root.appendChild(pageEl);
}

export default page;