const CACHE_NAME = 'kasir-v40';
const CACHE_PREFIX = 'kasir-';

const PRECACHE_URLS = [
  './', './index.html', './manifest.webmanifest',
  './css/base.css', './css/layout.css', './css/components.css',
  './css/kasir.css', './css/pages.css', './css/receipt-preview.css',
  './css/dark.css', './css/print.css', './css/customer-display.css',
  './assets/logo/logo.svg', './assets/logo/logo-mark.svg',
  './assets/logo/logo-mono.svg', './assets/icons/sprite.svg',
  './src/main.js', './src/app.js', './src/router.js',
  './src/core/db.js', './src/core/schema.js', './src/core/repository.js',
  './src/core/dbfile.js', './src/core/id.js', './src/core/utils.js',
  './src/core/feedback.js', './src/core/constants.js', './src/core/shortcuts.js',
  './src/core/barcode.js', './src/core/crypto-util.js',
  './src/models/product.js', './src/models/unit.js', './src/models/price.js',
  './src/models/discount.js', './src/models/customer.js',
  './src/models/supplier.js', './src/models/sale.js', './src/models/payment.js',
  './src/models/stock.js', './src/models/shift.js', './src/models/settings.js',
  './src/models/sales-order.js', './src/models/audit-log.js', './src/models/user.js',
  './src/models/serial-number.js', './src/models/batch.js', './src/models/license.js',
  './src/services/pricing-service.js', './src/services/discount-service.js',
  './src/services/payment-service.js', './src/services/cart-service.js',
  './src/services/sale-service.js', './src/services/inventory-service.js',
  './src/services/customer-service.js', './src/services/shift-service.js',
  './src/services/report-service.js', './src/services/backup-service.js',
  './src/services/cart-broadcast.js', './src/services/sales-order-service.js',
  './src/services/audit-service.js', './src/services/auth-service.js',
  './src/services/serial-service.js', './src/services/batch-service.js',
  './src/services/self-order-service.js', './src/services/license-service.js',
  './src/sync/supabase.js', './src/sync/sync-queue.js',
  './src/sync/conflict.js', './src/sync/sync-manager.js',
  './src/sync/sales-order-sync.js', './src/sync/self-order-sync.js',
  './src/hardware/barcode-camera.js', './src/hardware/barcode-keyboard.js',
  './src/hardware/bluetooth.js', './src/hardware/escpos.js',
  './src/hardware/receipt.js', './src/hardware/printer-service.js',
  './src/ui/dom.js', './src/ui/icon.js', './src/ui/logo.js',
  './src/ui/components/navbar.js', './src/ui/components/modal.js',
  './src/ui/components/toast.js', './src/ui/components/numpad.js',
  './src/ui/components/table.js', './src/ui/components/search-box.js',
  './src/ui/components/scanner-view.js', './src/ui/components/locked-overlay.js',
  './src/ui/layouts/main-layout.js', './src/ui/layouts/bottom-nav.js',
  './src/pages/_stub.js', './src/pages/login.js',
  './src/pages/kasir.js', './src/pages/pembayaran.js',
  './src/pages/riwayat.js', './src/pages/produk.js',
  './src/pages/satuan.js', './src/pages/diskon.js',
  './src/pages/inventori.js', './src/pages/pelanggan.js',
  './src/pages/supplier.js', './src/pages/pembelian.js',
  './src/pages/laporan.js', './src/pages/shift.js',
  './src/pages/printer.js', './src/pages/sinkron.js',
  './src/pages/pengaturan.js', './src/pages/lainnya.js',
  './src/pages/customer-display.js', './src/pages/tentang.js',
  './src/pages/sales-order.js', './src/pages/sales-order-baru.js',
  './src/pages/salesman.js',
  './src/pages/syarat-ketentuan.js', './src/pages/kebijakan-privasi.js',
  './src/pages/barcode-generator.js', './src/pages/audit-log.js',
  './src/pages/users.js', './src/pages/serial-manajemen.js',
  './src/pages/monitor-expired.js', './src/pages/batch-manajemen.js',
  './src/pages/lisensi.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      try { const res = await fetch(url, { cache: 'reload' }); if (res.ok) await cache.put(url, res.clone()); } catch (err) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(fetch(req).then((res) => { const clone = res.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)); return res; }).catch(() => caches.match(req)));
    return;
  }
  if (req.mode === 'navigate') { event.respondWith(handleNavigation(req)); return; }
  event.respondWith(handleStatic(req));
});

async function handleNavigation(req) {
  try { const fresh = await fetch(req); const cache = await caches.open(CACHE_NAME); cache.put(req, fresh.clone()); return fresh; }
  catch { const cache = await caches.open(CACHE_NAME); return (await cache.match(req)) || (await cache.match('./index.html')) || Response.error(); }
}

async function handleStatic(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;
  try { const fresh = await fetch(req); if (fresh.ok) cache.put(req, fresh.clone()); return fresh; }
  catch { return new Response('', { status: 504, statusText: 'Offline' }); }
}

self.addEventListener('message', (event) => { if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting(); });