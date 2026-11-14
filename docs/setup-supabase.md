# Panduan Setup Supabase (Sync)

Aplikasi ini menggunakan **Supabase Storage** (bukan Database) untuk mencadangkan data antar perangkat.

## 1. Buat Proyek
1. Buka [supabase.com](https://supabase.com) dan login.
2. Klik **New Project**, beri nama (misal: `kasir-toko`), dan tentukan password database (abaikan, kita tidak pakai DB).
3. Tunggu proses inisialisasi selesai.

## 2. Buat Bucket Storage
1. Di panel kiri, klik **Storage**.
2. Klik **New Bucket**.
3. Nama bucket: `kasir-db`.
4. **PENTING**: Biarkan toggle **Public** dalam keadaan **MATI** (Private).
5. Klik **Save**.

## 3. Ambil Kunci API
1. Klik ikon **Settings** (gerigi) di panel kiri -> **API**.
2. Salin **Project URL** (contoh: `https://xyz.supabase.co`).
3. Salin **anon public key** (kunci panjang yang dimulai dengan `eyJ...`).

## 4. Konfigurasi di Aplikasi
1. Buka aplikasi Kasir -> menu **Lainnya** -> **Sinkronisasi**.
2. Tempel **URL** dan **Anon Key** di form.
3. Isi Bucket dengan `kasir-db`.
4. Isi Path (contoh: `tokosaya.db`).
5. Centang **Aktifkan auto-sync**.
6. Klik **Simpan Konfigurasi**.
7. Klik **Tes Koneksi**. Jika muncul pesan "Koneksi OK", berarti sudah berhasil.

## 5. Sinkronisasi Manual
- Klik **Sinkron Sekarang** untuk mengunggah dan mengunduh data terbaru dari server.
- Aplikasi akan otomatis melakukan sinkronisasi jika ada koneksi internet dan ada data baru.