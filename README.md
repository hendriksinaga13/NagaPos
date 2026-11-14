# 🔐 Tools — Developer Only

Folder ini berisi **tool internal** untuk mengelola lisensi NagaPos.

## ⚠️ PENTING

**JANGAN PERNAH:**

- ❌ Sertakan folder `tools/` di paket yang dikirim ke pembeli
- ❌ Upload folder `tools/` ke GitHub publik
- ❌ Upload `license-generator.html` ke Netlify/Vercel/hosting apapun
- ❌ Bagikan isi `license-generator.html` ke siapapun

Jika file ini sampai ke pembeli, mereka bisa generate lisensi gratis tanpa bayar ke Anda.

---

## 📁 Isi Folder

| File | Fungsi |
|---|---|
| `license-generator.html` | Tool untuk generate kode lisensi (buka di browser lokal) |

---

## 🚀 Cara Pakai License Generator

### Setup Sekali
1. Buka file `tools/license-generator.html` di Chrome/Firefox (klik dua kali)
2. Tool jalan **100% offline** — tidak butuh internet
3. Bookmark sebagai file lokal, atau taruh di desktop

### Generate Kode Setelah Pembeli Bayar
1. Buka `license-generator.html`
2. Pilih edisi:
   - **BASIC** — Rp 350.000
   - **PRO** — Rp 750.000 (rekomendasi)
   - **ENT** — Rp 1.500.000
3. Set tanggal expired (default: 1 tahun dari sekarang)
4. Klik **Generate Kode**
5. Copy kode → kirim ke pembeli via WhatsApp/Email
6. Pembeli masukkan di aplikasi: **Lainnya → Lisensi → Aktivasi**

### Batch Generate (Jual Grosir)
1. Pilih edisi + jumlah kode (misal 10)
2. Generate → dapat 10 kode unik
3. Klik **Export CSV** → simpan sebagai arsip
4. Kirim satu kode per pembeli

---

## 🔄 Kalau Perlu Ganti Secret

Kalau secret dianggap bocor, ikuti langkah ini:

1. Ganti `_obfuscated` array di:
   - `src/services/license-service.js`
   - `tools/license-generator.html` (script di bawah)

2. Konversi string baru ke array hex. Contoh:
   - String: `nagapos-secret-2027`
   - Hex: `0x6e, 0x61, 0x67, 0x61, 0x70, 0x6f, 0x73, 0x2d, 0x73, 0x65, 0x63, 0x72, 0x65, 0x74, 0x2d, 0x32, 0x30, 0x32, 0x37`

3. Generate ulang semua kode lisensi untuk pembeli yang ada (mereka perlu update kode)

**⚠️ Konsekuensi ganti secret:** Semua kode lama tidak valid lagi.

---

## 📊 Harga & Edisi

| Edisi | Harga | Cocok Untuk |
|---|---|---|
| **BASIC** | Rp 350.000 | Warung kecil, toko kelontong |
| **PRO** | Rp 750.000 | Toko sembako, minimarket, konter HP, kafe |
| **ENT** | Rp 1.500.000 | Jaringan toko / franchise |

---

## 💡 Tips Jualan

**Berapa lama masa berlaku yang disarankan?**
- **1 tahun** = standar, banyak yang pilih ini
- **2 tahun** = diskon kecil, lebih menarik
- **Lifetime** = harga 3x dari 1 tahun (set expiry 10 tahun)
- **Bulanan** = Rp 50.000/bulan untuk model langganan

**Tracking penjualan:**
Buat spreadsheet dengan kolom: Tanggal, Nama Pembeli, Kode, Edisi, Expiry, WhatsApp.

**Kalau pembeli komplain kode tidak valid:**
1. Buka **Verifikasi Kode** di generator
2. Paste kode → lihat apakah signature valid
3. Kalau tidak valid → kirim ulang kode yang benar
4. Kalau expired → jual kode baru / perpanjangan

---

## 🔐 Alternatif Keamanan (Masa Depan)

Sistem HMAC simetris ini **cukup aman untuk UMKM**, tapi pembeli teknis bisa reverse-engineer secret dari file `license-service.js`.

Untuk keamanan lebih tinggi (kalau target pasar besar):
- Gunakan **ECDSA** (asymmetric) — private key hanya di generator, public key di aplikasi
- Integrasikan **license server** — butuh server untuk validasi online
- Gunakan **hardware dongle** — overkill untuk aplikasi kasir

Untuk sekarang, HMAC + obfuscation sudah cukup.

---

© 2026 Hendrik Sinaga. Dokumen internal.