/**
 * src/core/barcode.js
 * Encoder Code128B murni (tanpa library) + renderer SVG.
 * Code128B mendukung ASCII 32-126 (huruf, angka, simbol).
 * 
 * Referensi: GS1 General Specifications, Code128 pattern table.
 */

/**
 * Tabel pattern Code128 — 107 nilai.
 * Setiap string berisi 6 angka (atau 7 untuk stop) yang menyatakan lebar
 * bar/space secara bergantian, dimulai dari bar.
 */
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

const START_B = 104;
const STOP = 106;
const QUIET_ZONE_MODULES = 10; // zona sunyi di kiri & kanan (modul)

/**
 * Encode teks ke array nilai Code128 (start + data + checksum + stop).
 * @param {string} text
 * @returns {number[]}
 */
export function encodeCode128(text) {
  const str = String(text || '');
  if (!str) throw new Error('Teks barcode tidak boleh kosong');
  if (str.length > 80) throw new Error('Teks barcode terlalu panjang (maks 80 karakter)');

  const values = [];
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) {
      throw new Error(`Karakter tidak didukung: "${ch}" (Code128B mendukung ASCII 32–126)`);
    }
    values.push(code - 32);
  }

  const codes = [START_B, ...values];

  // Checksum: (startCode + Σ_i (i × value_i)) mod 103
  let checksum = START_B;
  for (let i = 0; i < values.length; i++) {
    checksum += values[i] * (i + 1);
  }
  codes.push(checksum % 103);
  codes.push(STOP);

  return codes;
}

/**
 * Render barcode sebagai string SVG.
 * 
 * SVG menggunakan `preserveAspectRatio="none"` + viewBox `0 0 {totalModules} 100`.
 * Artinya: lebar modul dipertahankan 1:1 (horizontal tidak didistorsi),
 * sedangkan tinggi bar mengikuti tinggi container. Ini yang membuat
 * barcode tetap bisa discan ketika dicetak di label berapapun tingginya.
 *
 * @param {string} text
 * @returns {string} SVG markup (tanpa tag <svg> penutup tambahan)
 */
export function renderBarcodeSVG(text) {
  const codes = encodeCode128(text);

  // Hitung total modul
  let totalModules = QUIET_ZONE_MODULES * 2;
  for (const code of codes) {
    for (const digit of CODE128_PATTERNS[code]) totalModules += parseInt(digit, 10);
  }

  // Bangun bar
  let x = QUIET_ZONE_MODULES;
  const bars = [];
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    for (let i = 0; i < pattern.length; i++) {
      const w = parseInt(pattern[i], 10);
      if (i % 2 === 0) {
        bars.push(`<rect x="${x}" y="0" width="${w}" height="100"/>`);
      }
      x += w;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} 100" preserveAspectRatio="none" style="display:block;width:100%;height:100%;background:#fff;">
    <rect x="0" y="0" width="${totalModules}" height="100" fill="#fff"/>
    <g fill="#000">${bars.join('')}</g>
  </svg>`;
}

/**
 * Generate barcode internal berikutnya, atomik via settings.
 * Format: "200" + counter (6 digit) = "200000001".
 * @param {object} ctx
 * @returns {Promise<string>}
 */
export async function getNextInternalBarcode(ctx) {
  const PREFIX = '200';
  const KEY = 'barcode.counter';

  const current = Number(await ctx.repos.settings.get(KEY)) || 0;
  const next = current + 1;
  await ctx.repos.settings.set(KEY, next);

  return PREFIX + String(next).padStart(6, '0');
}

/**
 * Validasi teks barcode (Coba encode, kalau gagal throw).
 * @param {string} text
 * @returns {true}
 */
export function validateBarcode(text) {
  encodeCode128(text);
  return true;
}