# Skema Database (IndexedDB)

Database bernama `kasir` (versi 1). Semua tabel (Object Store) memiliki field `id` (string), `createdAt` (timestamp), `updatedAt` (timestamp), dan `deleted` (boolean).

| Nama Store | KeyPath | Deskripsi |
|---|---|---|
| `meta` | `key` | Info internal (versi DB, dll) |
| `settings` | `key` | Pengaturan aplikasi (key-value) |
| `products` | `id` | Data produk, HPP, stok, min stok |
| `units` | `id` | Satuan produk (pcs, dus), harga per level, barcode |
| `customers` | `id` | Data pelanggan, plafon utang, level harga |
| `suppliers` | `id` | Data supplier |
| `discounts` | `id` | Aturan diskon (scope, tipe, masa berlaku) |
| `sales` | `id` | Nota penjualan (termasuk item & pembayaran di dalamnya) |
| `stockMovements` | `id` | Riwayat mutasi stok (masuk, keluar, opname) |
| `shifts` | `id` | Sesi buka/tutup kasir (modal awal, kas akhir) |

**Catatan**: Pembayaran piutang dan void/retur juga disimpan di tabel `sales` dengan penanda khusus.