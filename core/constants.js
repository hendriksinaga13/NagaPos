export const APP_INFO = Object.freeze({
  name: 'NagaPos', 
  tagline: 'Aplikasi Kasir Offline-First', 
  version: '1.2.0',
  buildDate: '2026-11-14', 
  license: 'Commercial',
  description: 'Aplikasi kasir offline-first untuk toko, mendukung scan barcode, multi satuan, split payment, dan sinkronisasi.',
  
  developer: { 
    name: 'Hendrik Sinaga', 
    role: 'Pengembang Aplikasi',
    email: 'hendrik@example.com', // GANTI DENGAN EMAIL ASLI ANDA
    phone: '085349441971',
    website: '-',
    city: 'Indonesia',
  },

  support: {
    whatsapp: '6285349441971',
    email: 'hendrik@example.com', // GANTI DENGAN EMAIL ASLI ANDA
    docsUrl: 'docs/panduan-instalasi.md',
  },

  legal: {
    termsVersion: '1.0.0',
    termsLastUpdated: '14 November 2026',
    privacyVersion: '1.0.0',
    privacyLastUpdated: '14 November 2026',
  },

  copyright: '© 2026 Hendrik Sinaga. Semua hak dilindungi.',
  
  features: [
    'Scan barcode kamera & scanner eksternal',
    'Multi satuan & harga per level',
    'Split payment & utang pelanggan',
    'Manajemen stok & opname',
    'Shift kasir & laporan harian',
    'Cetak struk Bluetooth (BLE)',
    'Sinkronisasi Supabase & backup',
    'Offline-first (PWA)',
  ],
});

export const ROLES = Object.freeze({
  KASIR: 'kasir',
  SALESMAN: 'salesman',
});