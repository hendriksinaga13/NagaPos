/**
 * src/pages/kebijakan-privasi.js
 * Halaman Kebijakan Privasi NagaPos.
 * Menjelaskan secara transparan data apa yang disimpan, bagaimana, dan hak pengguna.
 */

import { el } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { APP_INFO } from '../core/constants.js';

const page = {
  title: 'Kebijakan Privasi',
  layout: 'main',

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Kebijakan Privasi');
    ctx.setNavbarBack?.(true);

    const dev = APP_INFO.developer;
    const sup = APP_INFO.support;

    const pageEl = el('div', { class: 'page' });
    root.appendChild(pageEl);

    /* ---------------- Header ---------------- */

    pageEl.appendChild(el('div', { class: 'page__header' },
      el('h2', { class: 'page__title' }, 'Kebijakan Privasi'),
    ));

    pageEl.appendChild(el('div', {
      style: {
        textAlign: 'center',
        fontSize: 'var(--fs-xs)',
        color: 'var(--color-text-muted)',
        marginBottom: '16px',
      },
    },
      `Versi ${APP_INFO.legal.privacyVersion} • Terakhir diperbarui: ${APP_INFO.legal.privacyLastUpdated}`
    ));

    /* ---------------- Hero: Privacy by Design ---------------- */

    pageEl.appendChild(el('div', {
      class: 'card',
      style: {
        background: 'var(--color-success-soft)',
        borderColor: 'var(--color-success)',
        textAlign: 'center',
        padding: '20px',
        marginBottom: '16px',
      },
    },
      el('div', { style: { color: 'var(--color-success)', marginBottom: '8px' } },
        icon('check', { size: 48 })),
      el('div', { style: { fontSize: 'var(--fs-lg)', fontWeight: '700', marginBottom: '8px' } },
        'Privasi Anda Prioritas Kami'),
      el('p', { style: { margin: 0, fontSize: 'var(--fs-sm)', lineHeight: '1.6', color: 'var(--color-text)' } },
        'NagaPos dirancang dengan prinsip "Privacy by Design". Kami TIDAK mengumpulkan, menjual, atau membagikan data pribadi Anda dan data pelanggan Anda kepada pihak ketiga manapun.'),
    ));

    /* ---------------- Sections ---------------- */

    const sections = [
      {
        title: '1. Data yang Kami Simpan',
        content: 'Semua data berikut disimpan SECARA LOKAL pada perangkat Anda menggunakan IndexedDB (database bawaan browser). Data tidak dikirim ke server manapun kecuali Anda mengaktifkan fitur Sinkronisasi:',
        list: [
          'Data produk, kategori, dan stok barang.',
          'Data satuan dan harga (retail, grosir, member).',
          'Data pelanggan (nama, nomor telepon, alamat, catatan).',
          'Data transaksi penjualan, pembayaran, dan utang piutang.',
          'Data Sales Order (SO) dari salesman.',
          'Data shift kasir dan laporan harian.',
          'Pengaturan toko (nama, alamat, logo struk).',
          'PIN Kasir dan PIN Salesman (disimpan terenkripsi di perangkat).',
        ],
      },
      {
        title: '2. Data yang TIDAK Kami Kumpulkan',
        content: 'Kami secara tegas TIDAK mengumpulkan data berikut:',
        list: [
          'Lokasi GPS atau koordinat Anda.',
          'Kontak di buku telepon perangkat.',
          'Riwayat browsing atau aktivitas internet Anda.',
          'Data analitik atau statistik penggunaan aplikasi.',
          'Iklan atau identitas pengiklan.',
          'Data biometrik (sidik jari, wajah, suara).',
          'Nomor IMEI atau identitas perangkat keras lainnya.',
        ],
      },
      {
        title: '3. Penyimpanan Data',
        content: 'Seluruh data Anda tersimpan di dalam perangkat Anda sendiri. Data tetap dapat diakses meskipun Anda sedang offline (tanpa koneksi internet). Jika Anda menghapus aplikasi atau membersihkan data situs di browser, maka data tersebut akan hilang secara permanen. Kami menyarankan Anda untuk melakukan backup rutin melalui menu Sinkronisasi > Unduh Backup.',
      },
      {
        title: '4. Sinkronisasi Opsional (Supabase)',
        content: 'Jika Anda mengaktifkan fitur Sinkronisasi di menu Pengaturan, data Anda akan diunggah ke akun Supabase pribadi milik Anda. Kredensial akun (URL dan Anon Key) dipegang SEPENUHNYA oleh Anda. Pengembang NagaPos tidak memiliki akses, tidak mengetahui, dan tidak dapat membaca data yang tersimpan di akun Supabase Anda.',
        note: true,
        noteText: 'Penting: Jika Anda kehilangan kredensial Supabase, data yang tersinkronisasi tidak dapat dipulihkan oleh kami. Simpan kredensial Anda di tempat yang aman.',
      },
      {
        title: '5. Berbagi Data',
        content: 'Kami TIDAK membagikan data Anda kepada pengiklan, broker data, atau pihak ketiga lainnya. Data Anda hanya dibagikan kepada pihak lain dalam kondisi berikut:',
        list: [
          'Anda secara eksplisit mengirimkannya (misalnya: mengirim struk via WhatsApp kepada pelanggan).',
          'Diwajibkan oleh hukum atau perintah pengadilan yang sah.',
          'Untuk melindungi hak, properti, atau keselamatan pengembang dan pengguna lain.',
        ],
      },
      {
        title: '6. Keamanan Data',
        content: 'Kami menerapkan praktik terbaik untuk menjaga keamanan data Anda:',
        list: [
          'Data disimpan secara lokal di perangkat dan tidak dikirim ke server kami.',
          'PIN disimpan dengan hash dan tidak dapat dibaca sebagai teks biasa.',
          'Komunikasi sinkronisasi ke Supabase menggunakan HTTPS (TLS 1.2+).',
          'Aplikasi menggunakan Service Worker dengan cache yang terisolasi.',
          'Kami menyarankan Anda mengaktifkan kunci layar pada perangkat Anda.',
        ],
      },
      {
        title: '7. Hak Anda',
        content: 'Anda memiliki kendali penuh atas data Anda. Anda berhak untuk:',
        list: [
          'Mengakses semua data Anda kapan saja (melalui menu Laporan, Riwayat, Produk, dan Pelanggan).',
          'Mengekspor (backup) seluruh data ke file .db kapan saja.',
          'Menghapus seluruh data melalui menu Pengaturan > Hapus Data, atau dengan membersihkan data situs di browser.',
          'Memindahkan data ke perangkat lain melalui fitur Restore dari file backup.',
          'Menonaktifkan sinkronisasi kapan saja tanpa menghapus data lokal.',
        ],
      },
      {
        title: '8. Anak-anak',
        content: 'Aplikasi NagaPos tidak ditujukan untuk anak di bawah usia 13 tahun. Kami tidak dengan sengaja mengumpulkan data pribadi anak-anak. Jika Anda mengetahui bahwa anak Anda menggunakan Aplikasi tanpa izin, harap hubungi kami untuk penghapusan data.',
      },
      {
        title: '9. Cookie dan Teknologi Pelacakan',
        content: 'Aplikasi TIDAK menggunakan cookie pelacakan, piksel pelacak, atau teknologi analitik apapun (seperti Google Analytics, Facebook Pixel, atau Mixpanel). Satu-satunya cookie yang kami gunakan adalah cookie esensial untuk Service Worker (agar aplikasi bisa berjalan offline), yang tidak berisi data pribadi.',
      },
      {
        title: '10. Perubahan Kebijakan Privasi',
        content: 'Kebijakan Privasi ini dapat diperbarui sewaktu-waktu untuk mencerminkan perubahan praktik atau regulasi. Versi terbaru akan selalu tersedia di menu Tentang > Kebijakan Privasi. Jika ada perubahan besar, kami akan menampilkan pemberitahuan di dalam aplikasi. Penggunaan berkelanjutan setelah perubahan berarti Anda menyetujui versi yang diperbarui.',
      },
      {
        title: '11. Kontak',
        content: 'Jika Anda memiliki pertanyaan, keluhan, atau permintaan terkait privasi data, silakan hubungi:',
        contact: true,
      },
    ];

    for (const sec of sections) {
      pageEl.appendChild(renderSection(sec));
    }

    /* ---------------- Footer ---------------- */

    pageEl.appendChild(el('div', {
      style: {
        textAlign: 'center',
        padding: '24px 16px',
        color: 'var(--color-text-muted)',
        fontSize: 'var(--fs-xs)',
        lineHeight: '1.6',
      },
    },
      el('div', null, APP_INFO.copyright),
      el('div', null, `NagaPos versi ${APP_INFO.version}`),
    ));

    /* ---------------- Helpers ---------------- */

    function renderSection(sec) {
      const card = el('div', { class: 'card', style: { marginBottom: '12px' } });
      
      card.appendChild(el('h3', {
        style: {
          fontSize: 'var(--fs-md)',
          fontWeight: '700',
          marginBottom: '8px',
          color: 'var(--color-primary)',
        },
      }, sec.title));

      card.appendChild(el('p', {
        style: { margin: 0, fontSize: 'var(--fs-sm)', lineHeight: '1.6', color: 'var(--color-text)' },
      }, sec.content));

      if (sec.list) {
        const ul = el('ul', {
          style: { margin: '8px 0 0 0', paddingLeft: '20px', fontSize: 'var(--fs-sm)', lineHeight: '1.7' },
        });
        for (const item of sec.list) {
          ul.appendChild(el('li', { style: { marginBottom: '4px' } }, item));
        }
        card.appendChild(ul);
      }

      if (sec.note) {
        card.appendChild(el('div', {
          style: {
            marginTop: '12px',
            padding: '10px 12px',
            background: 'var(--color-warning-soft)',
            borderLeft: '3px solid var(--color-warning)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--fs-xs)',
            color: 'var(--color-text)',
          },
        }, sec.noteText));
      }

      if (sec.contact) {
        const contactBox = el('div', {
          style: { marginTop: '12px', padding: '12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
        });
        contactBox.appendChild(el('div', { class: 'detail-row' },
          el('span', null, 'Nama'), el('strong', null, dev.name)));
        contactBox.appendChild(el('div', { class: 'detail-row' },
          el('span', null, 'WhatsApp'), 
          el('a', { href: 'https://wa.me/' + sup.whatsapp, target: '_blank', style: { color: 'var(--color-primary)' } }, dev.phone)));
        contactBox.appendChild(el('div', { class: 'detail-row' },
          el('span', null, 'Email'), 
          el('a', { href: 'mailto:' + sup.email, style: { color: 'var(--color-primary)' } }, sup.email)));
        card.appendChild(contactBox);
      }

      return card;
    }
  },
};

export default page;