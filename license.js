<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NagaPos — License Generator (RAHASIA)</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      min-height: 100vh;
      color: #f1f5f9;
      padding: 24px;
    }
    .container { max-width: 880px; margin: 0 auto; }
    .header {
      text-align: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid #334155;
    }
    .warning-badge {
      display: inline-block;
      background: #dc2626;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 4px;
      letter-spacing: 0.1em;
      margin-bottom: 12px;
    }
    h1 { margin: 0 0 8px; font-size: 28px; }
    .subtitle { color: #94a3b8; font-size: 14px; }

    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .card-title {
      font-size: 14px;
      font-weight: 700;
      color: #60a5fa;
      margin-bottom: 16px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 12px;
    }
    @media (max-width: 600px) {
      .form-row { grid-template-columns: 1fr; }
    }

    label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #94a3b8;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    input, select, textarea {
      width: 100%;
      padding: 10px 12px;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      color: #f1f5f9;
      font-size: 14px;
      font-family: inherit;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
    }
    input[readonly] { background: #1e293b; color: #64748b; }
    textarea { resize: vertical; font-family: ui-monospace, monospace; font-size: 12px; }

    button {
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: transform 0.1s, background 0.2s;
      min-height: 44px;
    }
    button:active { transform: scale(0.98); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-primary { background: #3b82f6; color: #fff; }
    .btn-primary:hover { background: #2563eb; }
    .btn-secondary { background: #334155; color: #f1f5f9; }
    .btn-secondary:hover { background: #475569; }
    .btn-danger { background: #dc2626; color: #fff; }
    .btn-danger:hover { background: #b91c1c; }
    .btn-success { background: #16a34a; color: #fff; }
    .btn-success:hover { background: #15803d; }

    .btn-group { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }

    .result-box {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 16px;
      margin-top: 12px;
      font-family: ui-monospace, monospace;
    }
    .license-key {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
      background: #1e293b;
      border-radius: 6px;
      margin-bottom: 8px;
      border-left: 4px solid #16a34a;
    }
    .license-key:last-child { margin-bottom: 0; }
    .key-text {
      font-size: 16px;
      font-weight: 700;
      color: #4ade80;
      letter-spacing: 0.02em;
      word-break: break-all;
    }
    .key-meta {
      font-size: 11px;
      color: #94a3b8;
      margin-top: 2px;
      font-family: system-ui, sans-serif;
    }

    .info-box {
      background: #1e3a8a;
      border-left: 4px solid #3b82f6;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 13px;
      line-height: 1.6;
      margin-bottom: 16px;
    }

    .danger-box {
      background: #7f1d1d;
      border-left: 4px solid #dc2626;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 13px;
      line-height: 1.6;
      margin-bottom: 16px;
    }

    .error-box {
      background: #7f1d1d;
      border: 1px solid #dc2626;
      color: #fecaca;
      padding: 10px 12px;
      border-radius: 6px;
      font-size: 13px;
      margin-top: 8px;
    }
    .error-box:empty { display: none; }

    .output-list {
      max-height: 400px;
      overflow-y: auto;
      margin-top: 12px;
    }

    .stat {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      margin-left: 6px;
    }
    .stat-trial { background: #eab308; color: #000; }
    .stat-basic { background: #3b82f6; color: #fff; }
    .stat-pro { background: #16a34a; color: #fff; }
    .stat-ent { background: #dc2626; color: #fff; }

    .footer {
      text-align: center;
      padding: 24px 0;
      font-size: 11px;
      color: #64748b;
      border-top: 1px solid #334155;
      margin-top: 24px;
    }

    .history-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-top: 8px;
    }
    .history-table th {
      text-align: left;
      padding: 8px;
      background: #0f172a;
      color: #94a3b8;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
    }
    .history-table td {
      padding: 8px;
      border-bottom: 1px solid #334155;
      font-family: ui-monospace, monospace;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="warning-badge">⚠️ DOKUMEN RAHASIA</div>
      <h1>🔑 NagaPos License Generator</h1>
      <div class="subtitle">Tool internal untuk generate kode lisensi — JANGAN dibagikan ke pembeli</div>
    </div>

    <div class="danger-box">
      <strong>⚠️ PERINGATAN:</strong> File ini hanya untuk developer. JANGAN kirim file <code>tools/</code> ke pembeli.
      JANGAN upload ke GitHub/Netlify publik. Jika file ini bocor, siapapun bisa generate lisensi gratis.
    </div>

    <div class="info-box">
      <strong>📖 Cara Pakai:</strong>
      <ol style="margin: 8px 0 0 0; padding-left: 20px;">
        <li>Pilih edisi (BASIC/PRO/ENT)</li>
        <li>Set tanggal expired (misal 1 tahun dari sekarang)</li>
        <li>Generate → copy kode → kirim ke pembeli</li>
        <li>Pembeli masukkan kode di aplikasi (menu Lisensi)</li>
      </ol>
    </div>

    <!-- GENERATOR SINGLE -->
    <div class="card">
      <div class="card-title">🎯 Generate Kode Lisensi</div>

      <div class="form-row">
        <div>
          <label>Edisi</label>
          <select id="edition">
            <option value="BASIC">BASIC — Rp 350.000</option>
            <option value="PRO" selected>PRO — Rp 750.000</option>
            <option value="ENT">ENTERPRISE — Rp 1.500.000</option>
          </select>
        </div>
        <div>
          <label>Berlaku Sampai</label>
          <input type="date" id="expiryDate" />
        </div>
      </div>

      <div id="errorBox" class="error-box"></div>

      <div class="btn-group">
        <button class="btn-primary" id="btnGenerate">🔑 Generate Kode</button>
        <button class="btn-secondary" id="btnCopyLast" disabled>📋 Copy Kode Terakhir</button>
      </div>

      <div id="singleResult" style="display: none;">
        <div class="result-box" id="singleResultBox"></div>
      </div>
    </div>

    <!-- BATCH GENERATOR -->
    <div class="card">
      <div class="card-title">📦 Generate Batch (Banyak Kode Sekaligus)</div>

      <div class="form-row">
        <div>
          <label>Edisi</label>
          <select id="batchEdition">
            <option value="BASIC">BASIC</option>
            <option value="PRO" selected>PRO</option>
            <option value="ENT">ENTERPRISE</option>
          </select>
        </div>
        <div>
          <label>Jumlah Kode</label>
          <input type="number" id="batchCount" value="10" min="1" max="100" />
        </div>
      </div>

      <div class="form-row">
        <div>
          <label>Berlaku Sampai</label>
          <input type="date" id="batchExpiryDate" />
        </div>
        <div>
          <label>Prefix Catatan (opsional)</label>
          <input type="text" id="batchNote" placeholder="Contoh: Toko A, Toko B..." />
        </div>
      </div>

      <div class="btn-group">
        <button class="btn-primary" id="btnBatchGenerate">📦 Generate Batch</button>
        <button class="btn-secondary" id="btnExportCSV" disabled>💾 Export ke CSV</button>
      </div>

      <div id="batchResult" style="display: none;">
        <div class="result-box">
          <div id="batchCount_label" style="margin-bottom: 8px; font-size: 12px; color: #94a3b8;"></div>
          <div class="output-list" id="batchList"></div>
        </div>
      </div>
    </div>

    <!-- MANUAL VERIFY -->
    <div class="card">
      <div class="card-title">🔍 Verifikasi Kode (Manual Check)</div>
      <div>
        <label>Masukkan Kode untuk Verifikasi</label>
        <input type="text" id="verifyInput" placeholder="PRO-20271231-a1b2c3d4" style="text-transform: uppercase;" />
        <div class="btn-group">
          <button class="btn-primary" id="btnVerify">Cek Kode</button>
        </div>
        <div id="verifyResult" style="margin-top: 12px;"></div>
      </div>
    </div>

    <!-- HISTORY -->
    <div class="card">
      <div class="card-title">📜 Riwayat Generate (Session Ini)</div>
      <div id="historyContainer">
        <div style="text-align: center; color: #64748b; padding: 16px; font-size: 13px;">
          Belum ada riwayat. Generate kode untuk memulai.
        </div>
      </div>
    </div>

    <div class="footer">
      NagaPos License Generator v1.0 — Internal Use Only<br>
      © 2026 Hendrik Sinaga. JANGAN disebarluaskan.
    </div>
  </div>

  <script>
    /* ============================================================
       SECRET — HARUS SAMA DENGAN YANG ADA DI src/services/license-service.js
       ============================================================ */
    const _obfuscated = [0x6e, 0x61, 0x67, 0x61, 0x70, 0x6f, 0x73, 0x2d, 0x73, 0x65, 0x63, 0x72, 0x65, 0x74, 0x2d, 0x32, 0x30, 0x32, 0x36];
    function getSecret() { return String.fromCharCode(..._obfuscated); }

    /* ============================================================
       CORE: HMAC & GENERATE
       ============================================================ */

    async function hmacSign(payload) {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(getSecret()),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
      return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    function dateToYYYYMMDD(dateStr) {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}${m}${day}`;
    }

    async function generateLicenseKey(edition, expiryDateStr) {
      const expiryStr = dateToYYYYMMDD(expiryDateStr);
      if (!expiryStr) throw new Error('Tanggal expired tidak valid');

      // Validasi: tidak boleh di masa lalu
      const expiryMs = new Date(expiryDateStr).getTime();
      if (expiryMs < Date.now()) throw new Error('Tanggal expired sudah lewat');

      const payload = `${edition.toUpperCase()}|${expiryStr}`;
      const hmac = await hmacSign(payload);
      const signature = hmac.slice(0, 8);

      return `${edition.toUpperCase()}-${expiryStr}-${signature}`;
    }

    /* ============================================================
       STATE
       ============================================================ */
    let lastKey = '';
    let lastBatch = [];
    let history = [];

    /* ============================================================
       HELPERS
       ============================================================ */
    function showError(msg) {
      const box = document.getElementById('errorBox');
      box.textContent = msg;
    }
    function clearError() {
      document.getElementById('errorBox').textContent = '';
    }
    function formatDate(dateStr) {
      const d = new Date(dateStr);
      return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    }
    function getEditionBadge(edition) {
      const colors = { TRIAL: 'stat-trial', BASIC: 'stat-basic', PRO: 'stat-pro', ENT: 'stat-ent' };
      return `<span class="stat ${colors[edition] || ''}">${edition}</span>`;
    }
    function addHistory(entry) {
      history.unshift(entry);
      if (history.length > 50) history.pop();
      renderHistory();
    }
    function renderHistory() {
      const container = document.getElementById('historyContainer');
      if (history.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #64748b; padding: 16px; font-size: 13px;">Belum ada riwayat.</div>';
        return;
      }
      let html = '<div class="output-list"><table class="history-table"><thead><tr><th>Kode</th><th>Edisi</th><th>Expired</th><th>Waktu</th></tr></thead><tbody>';
      for (const h of history) {
        html += `<tr><td>${h.key}</td><td>${h.edition}</td><td>${h.expiry}</td><td>${h.time}</td></tr>`;
      }
      html += '</tbody></table></div>';
      container.innerHTML = html;
    }

    /* ============================================================
       SINGLE GENERATE
       ============================================================ */
    document.getElementById('btnGenerate').addEventListener('click', async () => {
      clearError();
      const edition = document.getElementById('edition').value;
      const expiryDate = document.getElementById('expiryDate').value;

      if (!expiryDate) { showError('Pilih tanggal expired terlebih dahulu'); return; }

      try {
        const key = await generateLicenseKey(edition, expiryDate);
        lastKey = key;

        const box = document.getElementById('singleResultBox');
        box.innerHTML = `
          <div class="license-key">
            <div>
              <div class="key-text">${key}</div>
              <div class="key-meta">Edisi: ${edition} • Berlaku s/d ${formatDate(expiryDate)}</div>
            </div>
          </div>
        `;
        document.getElementById('singleResult').style.display = 'block';
        document.getElementById('btnCopyLast').disabled = false;

        addHistory({
          key,
          edition,
          expiry: formatDate(expiryDate),
          time: new Date().toLocaleTimeString('id-ID'),
        });
      } catch (e) {
        showError(e.message);
      }
    });

    document.getElementById('btnCopyLast').addEventListener('click', async () => {
      if (!lastKey) return;
      try {
        await navigator.clipboard.writeText(lastKey);
        const btn = document.getElementById('btnCopyLast');
        const orig = btn.textContent;
        btn.textContent = '✅ Tersalin!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      } catch {
        alert('Gagal copy. Salin manual: ' + lastKey);
      }
    });

    /* ============================================================
       BATCH GENERATE
       ============================================================ */
    document.getElementById('btnBatchGenerate').addEventListener('click', async () => {
      const edition = document.getElementById('batchEdition').value;
      const count = parseInt(document.getElementById('batchCount').value, 10) || 1;
      const expiryDate = document.getElementById('batchExpiryDate').value;
      const note = document.getElementById('batchNote').value.trim();

      if (!expiryDate) { alert('Pilih tanggal expired untuk batch'); return; }
      if (count < 1 || count > 100) { alert('Jumlah harus 1-100'); return; }

      try {
        const keys = [];
        for (let i = 0; i < count; i++) {
          // Paksa delay sedikit agar timestamp acak berbeda (tidak strictly perlu karena HMAC deterministik)
          const key = await generateLicenseKey(edition, expiryDate);
          keys.push(key);
        }

        // Karena HMAC deterministik, semua key SAMA untuk (edition, expiry).
        // Untuk batch, kita butuh cara bedakan kode per toko.
        // Solusi: gunakan nonce di payload tapi... untuk sederhana, batch ini
        // menghasilkan kode identik. Kita perlu cara berbeda.
        // ===> Pakai batchNote sebagai bagian signature? TIDAK, karena akan
        //      butuh perubahan di verifier aplikasi.
        // ===> Solusi sementara: generate tanggal expired berbeda per kode (tidak ideal).
        // 
        // MENDING: untuk batch, tanggal expired BISA SAMA semua kode, karena
        // verifier tidak menyimpan riwayat per kode. Setiap toko punya kode
        // yang sama persis, tapi itu OK — pembeli tidak akan tahu.
        //
        // Fallback: generate tetap identical. Ini berarti batch = 1 kode sama.
        
        // CARA BAIK: buat setiap kode berbeda dengan counter di belakang
        // Tapi format regex aplikasi hanya menerima 8 char hex signature.
        // 
        // Solusi FINAL: batch generate dengan tanggal + counter tidak bisa
        // tanpa ubah format. Untuk MVP, batch hanya generate 1 kode.
        // Alternatif: generate kode dengan expiry berbeda per unit (1 hari beda).
        
        // Untuk simplicity: batch generate kode dengan tanggal berbeda
        // (expiry + i hari) — supaya setiap kode unik.
        const baseDate = new Date(expiryDate);
        const batchKeys = [];
        for (let i = 0; i < count; i++) {
          const d = new Date(baseDate);
          d.setDate(d.getDate() + i);
          const ds = d.toISOString().slice(0, 10);
          const key = await generateLicenseKey(edition, ds);
          batchKeys.push({ key, expiry: ds, index: i + 1 });
        }

        lastBatch = batchKeys;

        const listEl = document.getElementById('batchList');
        listEl.innerHTML = '';
        for (const b of batchKeys) {
          const el = document.createElement('div');
          el.className = 'license-key';
          const noteStr = note ? ` • ${note}-${b.index}` : '';
          el.innerHTML = `
            <div>
              <div class="key-text">${b.key}</div>
              <div class="key-meta">${edition} • Exp: ${formatDate(b.expiry)}${noteStr}</div>
            </div>
          `;
          listEl.appendChild(el);
        }

        document.getElementById('batchCount_label').textContent = `✅ ${batchKeys.length} kode digenerate`;
        document.getElementById('batchResult').style.display = 'block';
        document.getElementById('btnExportCSV').disabled = false;

        addHistory({
          key: `[BATCH ${batchKeys.length} kode]`,
          edition,
          expiry: formatDate(expiryDate),
          time: new Date().toLocaleTimeString('id-ID'),
        });
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });

    document.getElementById('btnExportCSV').addEventListener('click', () => {
      if (!lastBatch.length) return;
      const edition = document.getElementById('batchEdition').value;
      const note = document.getElementById('batchNote').value.trim() || 'batch';
      const rows = [['No', 'Kode Lisensi', 'Edisi', 'Expired', 'Catatan']];
      for (const b of lastBatch) {
        rows.push([b.index, b.key, edition, b.expiry, note]);
      }
      const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nagapos-licenses-${Date.now()}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    /* ============================================================
       MANUAL VERIFY
       ============================================================ */
    document.getElementById('btnVerify').addEventListener('click', async () => {
      const input = document.getElementById('verifyInput').value.trim().toUpperCase();
      const resultEl = document.getElementById('verifyResult');

      const regex = /^(TRIAL|BASIC|PRO|ENT)-(\d{8})-([a-f0-9]{8})$/i;
      const m = input.match(regex);
      if (!m) {
        resultEl.innerHTML = '<div class="error-box">❌ Format tidak valid</div>';
        return;
      }

      const [, edition, expiryStr, sig] = m;
      const payload = `${edition}|${expiryStr}`;
      const hmac = await hmacSign(payload);
      const expectedSig = hmac.slice(0, 8);

      const valid = expectedSig === sig;
      const year = Number(expiryStr.slice(0, 4));
      const month = Number(expiryStr.slice(4, 6));
      const day = Number(expiryStr.slice(6, 8));
      const expiryMs = new Date(year, month - 1, day, 23, 59, 59).getTime();
      const expired = Date.now() > expiryMs;

      resultEl.innerHTML = `
        <div class="result-box">
          <div style="margin-bottom: 8px;"><strong>Edisi:</strong> ${edition}</div>
          <div style="margin-bottom: 8px;"><strong>Expired:</strong> ${day}/${month}/${year}</div>
          <div style="margin-bottom: 8px;"><strong>Signature:</strong> ${valid ? '✅ VALID' : '❌ TIDAK VALID'}</div>
          <div style="margin-bottom: 8px;"><strong>Status:</strong> ${expired ? '⚠️ Sudah kedaluwarsa' : '✅ Masih berlaku'}</div>
          ${!valid ? '<div style="color: #f87171; margin-top: 8px; font-size: 12px;">Kode tidak bisa dipakai. Signature tidak cocok.</div>' : ''}
        </div>
      `;
    });

    /* ============================================================
       DEFAULT VALUES
       ============================================================ */
    (function setDefaults() {
      const oneYear = new Date();
      oneYear.setFullYear(oneYear.getFullYear() + 1);
      const dateStr = oneYear.toISOString().slice(0, 10);

      document.getElementById('expiryDate').value = dateStr;
      document.getElementById('batchExpiryDate').value = dateStr;
    })();
  </script>
</body>
</html>