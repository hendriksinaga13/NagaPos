/**
 * src/pages/syarat-ketentuan.js
 * Halaman Syarat & Ketentuan penggunaan NagaPos.
 */

import { el } from '../ui/dom.js';
import { icon } from '../ui/icon.js';
import { APP_INFO } from '../core/constants.js';

const page = {
  title: 'Syarat & Ketentuan',
  layout: 'main',

  async mount(root, params, ctx) {
    ctx.setNavbarTitle?.('Syarat & Ketentuan');
    ctx.setNavbarBack?.(true);

    const dev = APP_INFO.developer;
    const sup = APP_INFO.support;

    const pageEl = el('div', { class: 'page' });
    root.appendChild(pageEl);

    /* ---------------- Header ---------------- */

    pageEl.appendChild(el('div', { class: 'page__header' },
      el('h2', { class: 'page__title' }, 'Syarat & Ketentuan'),
    ));

    pageEl.appendChild(el('div', {
      style: {
        textAlign: 'center',
        fontSize: 'var(--fs-xs)',
        color: 'var(--color-text-muted)',
        marginBottom: '16px',
      },
    },
      `Versi ${APP_INFO.legal.termsVersion} • Terakhir diperbarui: ${APP_INFO.legal.termsLastUpdated}`
    ));

    /* ---------------- Sections ---------------- */

    const sections = [
      {
        title: '1. Penerimaan Syarat',
        content: 'Dengan mengunduh, menginstal, atau menggunakan aplikasi NagaPos ("Aplikasi"), Anda menyatakan telah membaca, memahami, dan menyetujui untuk terikat pada Syarat dan Ketentuan ini. Jika Anda tidak setuju dengan salah satu ketentuan, mohon untuk tidak menggunakan Aplikasi.',
      },
      {
        title: '2. Deskripsi Layanan',
        content: 'NagaPos adalah aplikasi kasir (Point of Sale) berbasis web (Progressive Web App) yang dirancang untuk membantu pengelolaan transaksi penjualan, stok barang, data pelanggan, dan laporan keuangan untuk usaha mikro, kecil, dan menengah (UMKM). Aplikasi berjalan secara offline-first dan dapat disinkronkan ke penyimpanan awan milik pengguna sendiri.',
      },
      {
        title: '3. Lisensi Penggunaan',
        content: 'Anda diberikan lisensi terbatas, non-eksklusif, tidak dapat dialihkan, dan dapat dicabut untuk menggunakan Aplikasi untuk keperluan bisnis Anda sendiri. Anda TIDAK diperkenankan untuk:',
        list: [
          'Menjual kembali, menyewakan, atau mendistribusikan ulang Aplikasi tanpa izin tertulis dari pengembang.',
          'Memodifikasi, mendekompilasi, atau merekayasa balik kode sumber Aplikasi.',
          'Menghapus atau mengubah pemberitahuan hak cipta dan merek dagang.',
          'Menggunakan Aplikasi untuk kegiatan ilegal atau melanggar hukum yang berlaku di Indonesia.',
        ],
      },
      {
        title: '4. Akun dan Keamanan',
        content: 'Anda bertanggung jawab penuh atas keamanan perangkat Anda dan PIN yang digunakan untuk mengakses Aplikasi. PIN disimpan terenkripsi secara lokal pada perangkat Anda dan TIDAK dikirim ke server manapun. Kelalaian dalam menjaga kerahasiaan PIN menjadi tanggung jawab Anda sepenuhnya. Pengembang tidak bertanggung jawab atas akses tidak sah yang disebabkan oleh kelalaian pengguna.',
      },
      {
        title: '5. Data dan Cadangan',
        content: 'Aplikasi menyimpan semua data secara lokal pada perangkat Anda (melalui IndexedDB). Pengembang TIDAK memiliki akses ke data transaksi Anda kecuali Anda secara sukarela mengaktifkan fitur sinkronisasi ke akun Supabase milik Anda sendiri. Anda bertanggung jawab untuk melakukan pencadangan (backup) data secara berkala menggunakan fitur yang tersedia di menu Sinkronisasi. Pengembang tidak bertanggung jawab atas kehilangan data akibat:',
        list: [
          'Kerusakan perangkat keras (HP rusak, hilang, atau terbakar).',
          'Penghapusan data browser secara tidak sengaja (clear cache, hapus data situs).',
          'Kelalaian pengguna dalam melakukan backup.',
          'Force majeure (bencana alam, kerusuhan, dan lain sebagainya).',
        ],
      },
      {
        title: '6. Batasan Tanggung Jawab',
        content: 'Aplikasi disediakan "sebagaimana adanya" (as-is) tanpa jaminan apapun, baik tersurat maupun tersirat, termasuk namun tidak terbatas pada jaminan kelayakan untuk tujuan tertentu. Sejauh diizinkan oleh hukum yang berlaku, Pengembang tidak bertanggung jawab atas:',
        list: [
          'Kerugian finansial langsung maupun tidak langsung akibat penggunaan Aplikasi.',
          'Kehilangan keuntungan (lost profit) atau kehilangan data.',
          'Ketidakcocokan dengan perangkat keras tertentu (termasuk printer Bluetooth tipe Classic/SPP yang tidak didukung).',
          'Gangguan layanan pihak ketiga (Supabase, hosting, atau penyedia internet).',
        ],
      },
      {
        title: '7. Pembaruan Aplikasi',
        content: 'Pengembang dapat merilis pembaruan Aplikasi dari waktu ke waktu. Pembaruan dapat mengubah fitur, tampilan, atau fungsi tertentu. Penggunaan berkelanjutan setelah pembaruan dirilis berarti Anda menyetujui perubahan tersebut. Pengembang tidak berkewajiban mempertahankan fitur lama yang telah dihapus.',
      },
      {
        title: '8. Hak Kekayaan Intelektual',
        content: 'Nama "NagaPos", logo, kode sumber, desain antarmuka, dan seluruh aset visual di dalam Aplikasi adalah milik Hendrik Sinaga dan dilindungi oleh Undang-Undang Hak Cipta Republik Indonesia. Segala bentuk penggunaan tanpa izin tertulis merupakan pelanggaran hukum.',
      },
      {
        title: '9. Penghentian',
        content: 'Pengembang berhak menghentikan atau menangguhkan akses Anda ke Aplikasi jika terjadi pelanggaran terhadap Syarat dan Ketentuan ini. Setelah penghentian, Anda tetap bertanggung jawab atas kewajiban yang telah timbul sebelumnya.',
      },
      {
        title: '10. Perubahan Syarat',
        content: 'Pengembang dapat mengubah Syarat dan Ketentuan ini kapan saja tanpa pemberitahuan sebelumnya. Versi terbaru akan selalu tersedia di dalam Aplikasi pada menu "Tentang > Syarat & Ketentuan". Penggunaan berkelanjutan setelah perubahan berarti Anda menyetujui versi yang diperbarui.',
      },
      {
        title: '11. Hukum yang Berlaku',
        content: 'Syarat dan Ketentuan ini diatur oleh dan ditafsirkan sesuai dengan hukum Republik Indonesia. Setiap perselisihan yang timbul akan diselesaikan secara musyawarah terlebih dahulu, dan jika tidak tercapai kesepakatan, akan diselesaikan melalui pengadilan yang berwenang di Indonesia.',
      },
      {
        title: '12. Kontak',
        content: 'Untuk pertanyaan, keluhan, atau klarifikasi mengenai Syarat dan Ketentuan ini, silakan hubungi:',
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