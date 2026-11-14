# Panduan Instalasi PWA Kasir

Karena aplikasi ini murni HTML/JS/CSS dan tidak membutuhkan *build step*, Anda hanya perlu meletakkannya di server statis (atau hosting lokal).

## 1. Menjalankan Secara Lokal
Aplikasi ini **wajib** dijalankan melalui protokol HTTP/HTTPS (bukan `file://`), karena Service Worker, IndexedDB, dan Kamera membutuhkan protokol tersebut.
- Gunakan ekstensi VS Code **Live Server** (Klik kanan `index.html` -> *Open with Live Server*).
- Atau gunakan `python -m http.server 8080` di dalam folder proyek.
- Buka `http://localhost:8080` di Chrome.

## 2. Instalasi ke HP Android (PWA)
1. Pastikan HP dan server berada di jaringan yang sama (atau gunakan hosting seperti GitHub Pages / Netlify).
2. Akses URL aplikasi di **Chrome Android** (misal: `http://192.168.1.10:8080`).
3. Ketuk ikon **Titik Tiga** di pojok kanan atas -> **Tambahkan ke Layar Utama** (Add to Home screen).
4. Aplikasi akan terpasang sebagai PWA dan bisa dibuka tanpa browser (layar penuh).
5. **Catatan**: Web Bluetooth HANYA bekerja pada HTTPS atau `localhost`. Jika ingin menggunakan printer Bluetooth di HP, aplikasi harus di-hosting di HTTPS (misal via Netlify/Vercel).