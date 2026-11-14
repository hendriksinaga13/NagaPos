
---

### Checklist Uji Coba (Smoke Test)

Setelah semua file ditimpa, lakukan hal berikut:
1. **Hapus cache Service Worker** (Unregister + Clear Storage). Buka aplikasi.
2. Buka **Lainnya -> Pengaturan**. Isi **PIN Kasir** dengan `1234`, lalu simpan.
3. Aplikasi akan meminta login ulang. Masukkan `1234`.
4. **Tambah Produk**: Buka menu Produk, tambah produk baru, isi harga retail (misal: 10000).
5. **Kasir**: Cari produk, tambahkan ke keranjang. Tombol **Bayar** akan aktif.
6. **Pembayaran**: Lakukan pembayaran (tunai, QRIS, atau split). Simpan.
7. **Struk**: Muncul preview. Coba klik "Browser" (fallback print) atau "Cetak" jika printer BLE terhubung.
8. **Stok**: Cek menu Stok -> Mutasi, pastikan stok berkurang setelah transaksi.
9. **Pelanggan & Utang**: Tambah pelanggan dengan plafon utang, pilih di kasir, bayar pakai metode "Utang". Cek menu Pelanggan -> Riwayat Piutang -> Bayar Piutang.
10. **Laporan**: Cek menu Laporan -> Hari Ini, pastikan omzet & laba sesuai.
11. **Sync**: Buka menu Sinkronisasi, isi Supabase, klik "Sinkron Sekarang".
12. **Void/Retur**: Buka Riwayat, coba Void transaksi, pastikan stok kembali.

---

### Penutup

Aplikasi kasir offline-first ini sekarang **lengkap dan siap pakai**. Seluruh fitur mulai dari scan barcode, multi-satuan, diskon bertingkat, shift kasir, cetak Bluetooth (BLE), hingga sinkronisasi Supabase telah terintegrasi.

Jika ada bug atau perilaku tak terduga selama pengujian, silakan kirimkan log dari console beserta langkah reproduksinya. Selamat menggunakan!