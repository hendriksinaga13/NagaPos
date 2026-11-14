/**
 * src/app.js
 * Orkestrasi aplikasi + license bootstrap + route guard + feature gate.
 * 
 * Aturan:
 *  1. Belum login → /login
 *  2. Lisensi locked (trial habis & tak ada kode) → hanya boleh /lisensi & halaman publik
 *  3. Path butuh fitur tertentu & user tidak punya → redirect /lisensi + toast
 *  4. Role check (RBAC) tetap berlaku
 */

import { createMainLayout } from './ui/layouts/main-layout.js';
import { registerRoute, startRouter, currentPath, navigate } from './router.js';
import { loadAppSettings } from './models/settings.js';
import { getCartService, CartService } from './services/cart-service.js';
import { getPrinterService } from './hardware/printer-service.js';
import { SyncManager } from './sync/sync-manager.js';
import { getShortcutManager } from './core/shortcuts.js';
import { closeModal } from './ui/components/modal.js';
import { isLoggedIn, getCurrentUser, canAccess, ensureSeedUser } from './services/auth-service.js';
import { getLicenseState } from './services/license-service.js';
import { FEATURE, hasFeatureInList, EDITION_LABEL } from './models/license.js';
import { USER_ROLES } from './models/user.js';
import { toast } from './ui/components/toast.js';

function applyTheme(theme) {
  const html = document.documentElement;
  html.classList.remove('theme-dark');
  if (theme === 'dark') html.classList.add('theme-dark');
}

function homeFor(role) {
  switch (role) {
    case USER_ROLES.SALESMAN: return '/salesman';
    case USER_ROLES.KASIR: return '/kasir';
    default: return '/kasir';
  }
}

/* ===================== ROUTE ↔ FEATURE MAPPING ===================== */

/**
 * Path yang membutuhkan fitur tertentu.
 * Kalau tidak ada di map = tidak butuh fitur premium (BASIC atau publik).
 */
const ROUTE_FEATURE_MAP = {
  // BASIC features (tidak butuh gate — dimasukkan untuk eksplisit)
  '/kasir': FEATURE.KASIR,
  '/pembayaran': FEATURE.KASIR,
  '/produk': FEATURE.PRODUK,
  '/satuan': FEATURE.PRODUK,
  '/pelanggan': FEATURE.PELANGGAN,
  '/shift': FEATURE.SHIFT,
  '/laporan': FEATURE.LAPORAN,
  '/printer': FEATURE.PRINTER,
  '/barcode-generator': FEATURE.BARCODE_GEN,
  '/customer-display': FEATURE.CUSTOMER_DISPLAY,

  // PRO features
  '/users': FEATURE.MULTI_USER,
  '/audit-log': FEATURE.AUDIT_LOG,
  '/serial-manajemen': FEATURE.SERIAL_IMEI,
  '/batch-manajemen': FEATURE.BATCH_EXPIRY,
  '/monitor-expired': FEATURE.BATCH_EXPIRY,
  '/sales-order': FEATURE.SALES_ORDER,
  '/salesman': FEATURE.SALES_ORDER,
  '/sales-order-baru': FEATURE.SALES_ORDER,

  // ENT features (belum ada halaman, placeholder)
  // '/self-order': FEATURE.SELF_ORDER,
  // '/dashboard': FEATURE.DASHBOARD,
};

/**
 * Route yang SELALU boleh diakses meski lisensi locked.
 */
const LOCKED_MODE_ALLOWED = new Set([
  '/login',
  '/lisensi',
  '/tentang',
  '/syarat-ketentuan',
  '/kebijakan-privasi',
]);

/**
 * Route yang selalu boleh diakses setelah login (tidak kena license gate).
 */
const ALWAYS_ALLOWED = new Set([
  '/tentang',
  '/syarat-ketentuan',
  '/kebijakan-privasi',
  '/lisensi',
  '/customer-display',
]);

/* ===================== START APP ===================== */

export async function startApp(baseCtx) {
  let settings = {};
  try { settings = await loadAppSettings(baseCtx.repos.settings); }
  catch (e) { console.warn('[app] gagal baca settings', e); }
  applyTheme(settings.theme || 'auto');

  const layout = createMainLayout();
  const appRoot = document.getElementById('app');
  appRoot.innerHTML = '';
  appRoot.appendChild(layout.root);

  const ctx = {
    ...baseCtx, settings, layout, applyTheme,
    setNavbarTitle: (t) => layout.setTitle(t),
    setNavbarBack: (show) => layout.navbar.setBackVisible(!!show),
    refreshSettings: async () => {
      settings = await loadAppSettings(baseCtx.repos.settings);
      applyTheme(settings.theme || 'auto');
      ctx.settings = settings;
      if (ctx.printer) ctx.printer.bindSettings(settings);
      if (ctx.sync) ctx.sync.reload(settings);
      try { ctx.license = await getLicenseState(ctx); } catch {}
      return settings;
    },
  };

  const isCustomerDisplay = currentPath() === '/customer-display';

  try { await ensureSeedUser(ctx); } catch (e) { console.warn('[app] seed user gagal', e); }

  // ===== BOOTSTRAP LICENSE =====
  try {
    ctx.license = await getLicenseState(ctx);
    console.log(
      '%c[app] license:',
      'color:#2563eb',
      ctx.license.status,
      '| edition:', ctx.license.edition,
      '| daysLeft:', ctx.license.daysLeft,
      ctx.license.isLocked ? '| 🔒 LOCKED' : '',
    );
  } catch (e) {
    console.warn('[app] gagal load license:', e);
    ctx.license = {
      status: 'trial', edition: 'TRIAL', features: ['*'], daysLeft: 14,
      isTrial: true, isExpired: false, isLocked: false,
      expiry: Date.now() + 14 * 86400000, key: '',
    };
  }

  // ===== INIT SERVICES =====
  if (!isCustomerDisplay) {
    try { ctx.cart = await getCartService(ctx); } catch (e) { ctx.cart = null; }
    try {
      ctx.printer = getPrinterService({ settingsRepo: baseCtx.repos.settings });
      ctx.printer.bindSettings(settings);
      ctx.printer.subscribe((s) => layout.navbar.setPrinterState(s.connected));
    } catch (e) {}
    try {
      ctx.sync = new SyncManager({ db: ctx.db, repos: ctx.repos, settings });
      ctx.sync.init();
      ctx.sync.subscribe((s) => {
        const state = s.syncing ? 'syncing' : s.state === 'error' ? 'error' : s.enabled ? 'idle' : 'off';
        layout.navbar.setSyncState(state);
      });
    } catch (e) {}
    window.__kasirOnConnectivity = (online) => layout.navbar.setOnline(online);
    window.__kasirOnConnectivity(navigator.onLine !== false);
  }

  /* ===================== ROUTES ===================== */

  registerRoute('/login', () => import('./pages/login.js'));
  registerRoute('/salesman', () => import('./pages/salesman.js'));
  registerRoute('/sales-order-baru', () => import('./pages/sales-order-baru.js'));
  registerRoute('/kasir', () => import('./pages/kasir.js'));
  registerRoute('/pembayaran', () => import('./pages/pembayaran.js'));
  registerRoute('/riwayat', () => import('./pages/riwayat.js'));
  registerRoute('/produk', () => import('./pages/produk.js'));
  registerRoute('/satuan', () => import('./pages/satuan.js'));
  registerRoute('/diskon', () => import('./pages/diskon.js'));
  registerRoute('/inventori', () => import('./pages/inventori.js'));
  registerRoute('/pelanggan', () => import('./pages/pelanggan.js'));
  registerRoute('/supplier', () => import('./pages/supplier.js'));
  registerRoute('/pembelian', () => import('./pages/pembelian.js'));
  registerRoute('/laporan', () => import('./pages/laporan.js'));
  registerRoute('/shift', () => import('./pages/shift.js'));
  registerRoute('/printer', () => import('./pages/printer.js'));
  registerRoute('/sinkron', () => import('./pages/sinkron.js'));
  registerRoute('/pengaturan', () => import('./pages/pengaturan.js'));
  registerRoute('/lainnya', () => import('./pages/lainnya.js'));
  registerRoute('/customer-display', () => import('./pages/customer-display.js'));
  registerRoute('/tentang', () => import('./pages/tentang.js'));
  registerRoute('/syarat-ketentuan', () => import('./pages/syarat-ketentuan.js'));
  registerRoute('/kebijakan-privasi', () => import('./pages/kebijakan-privasi.js'));
  registerRoute('/sales-order', () => import('./pages/sales-order.js'));
  registerRoute('/barcode-generator', () => import('./pages/barcode-generator.js'));
  registerRoute('/audit-log', () => import('./pages/audit-log.js'));
  registerRoute('/users', () => import('./pages/users.js'));
  registerRoute('/serial-manajemen', () => import('./pages/serial-manajemen.js'));
  registerRoute('/monitor-expired', () => import('./pages/monitor-expired.js'));
  registerRoute('/batch-manajemen', () => import('./pages/batch-manajemen.js'));
  registerRoute('/lisensi', () => import('./pages/lisensi.js'));

  /* ===================== ROUTE GUARD ===================== */

  function guard() {
    const path = currentPath();

    // 1. Customer display bebas
    if (path === '/customer-display') return;

    // 2. Belum login → /login
    if (!isLoggedIn()) {
      if (path !== '/login') navigate('/login');
      return;
    }

    const user = getCurrentUser();
    if (!user) { navigate('/login'); return; }

    // 3. Sudah login & buka /login → redirect home
    if (path === '/login') {
      navigate(homeFor(user.role));
      return;
    }

    // 4. ALWAYS ALLOWED (tentang, lisensi, dll)
    if (ALWAYS_ALLOWED.has(path)) return;

    // 5. LICENSE LOCKED MODE — trial habis & grace habis
    if (ctx.license && ctx.license.isLocked) {
      if (!LOCKED_MODE_ALLOWED.has(path)) {
        toast('Lisensi habis. Aktivasi untuk melanjutkan.', { type: 'error', duration: 5000 });
        navigate('/lisensi');
        return;
      }
    }

    // 6. FEATURE GATE — path butuh fitur yang tidak dimiliki
    const requiredFeature = ROUTE_FEATURE_MAP[path];
    if (requiredFeature && ctx.license) {
      const has = hasFeatureInList(ctx.license.features, requiredFeature);
      if (!has) {
        const edition = ctx.license.isTrial ? 'TRIAL (sudah berakhir)' : EDITION_LABEL[ctx.license.edition] || 'BASIC';
        toast(
          `Fitur ini butuh edisi PRO. Lisensi Anda: ${edition}.`,
          { type: 'warning', duration: 5000 },
        );
        navigate('/lisensi');
        return;
      }
    }

    // 7. ROLE check (RBAC)
    if (!canAccess(path)) {
      toast('Akses ditolak untuk role Anda', { type: 'error' });
      navigate(homeFor(user.role));
    }
  }

  window.addEventListener('hashchange', guard);

  /* ===================== SHORTCUTS ===================== */

  if (!isCustomerDisplay) {
    const sc = getShortcutManager();
    sc.attach();
    sc.registerMany([
      { key: 'esc', label: 'Tutup modal / dialog', group: 'Umum', handler: () => closeModal() },
      { key: 'alt+1', label: 'Buka Kasir', group: 'Navigasi', handler: () => navigate('/kasir') },
      { key: 'alt+2', label: 'Buka Produk', group: 'Navigasi', handler: () => navigate('/produk') },
      { key: 'alt+3', label: 'Buka Inventori', group: 'Navigasi', handler: () => navigate('/inventori') },
      { key: 'alt+4', label: 'Buka Pelanggan', group: 'Navigasi', handler: () => navigate('/pelanggan') },
      { key: 'alt+5', label: 'Buka Sales Order', group: 'Navigasi', handler: () => navigate('/sales-order') },
      { key: 'alt+6', label: 'Buka Riwayat', group: 'Navigasi', handler: () => navigate('/riwayat') },
      { key: 'alt+7', label: 'Buka Laporan', group: 'Navigasi', handler: () => navigate('/laporan') },
      { key: 'alt+8', label: 'Buka Pengaturan', group: 'Navigasi', handler: () => navigate('/pengaturan') },
      { key: 'alt+9', label: 'Buka Lainnya', group: 'Navigasi', handler: () => navigate('/lainnya') },
      { key: '?', label: 'Tampilkan bantuan ini', group: 'Bantuan', handler: () => {} },
    ]);
  }

  guard();
  await startRouter(layout.outlet, ctx);
}