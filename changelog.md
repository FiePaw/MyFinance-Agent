# CHANGELOG

Semua perubahan penting pada proyek **FinTrack** akan dicatat di file ini.

Format mengikuti prinsip **Semantic Versioning**:

* **MAJOR**: Perubahan besar / breaking changes
* **MINOR**: Penambahan fitur baru
* **PATCH**: Perbaikan bug

---

## [v1.2.1] - 2026-05-05

### 🐛 Fixes

#### `database.py`

* **Perbaikan `clean_qwen_json()` — handle output Qwen yang bermasalah**

  Qwen AI kadang mengembalikan output dengan format tidak valid untuk JSON parser:

  * **Citation markers** seperti `[[55]]`, `[[6]]` di dalam nilai string → dihapus via regex
  * **Markdown hyperlink inline** seperti `[investor.id](http://investor.id)` disisipkan di tengah kalimat → dikonversi ke teks saja
  * **Newline literal** (`\n`) di dalam string JSON value → di-escape menjadi `\\n` via parser karakter per karakter
  * **Control characters tidak valid** (`\x00–\x08`, `\x0b`, `\x0c`, `\x0e–\x1f`) → dihapus

  Fungsi `clean_qwen_json()` kini dipakai di ketiga handler AI:
  * `handle_ai_dashboard()`
  * `handle_ai_analyze()`
  * `handle_ai_report()`

---

### 🔧 Deployment

* Replace file `database.py` di Windows 10
* Restart client:

  ```cmd
  python database.py
  ```

---

## [v1.2.0] - 2026-05-05

### 🚀 Added

#### 📊 Resume Laporan AI (Menu Laporan)

* Tombol **Analisa AI** di header halaman Laporan
* Qwen AI menganalisa data transaksi bulan yang dipilih dan menampilkan resume dengan UI kartu:
  * **Health Score** — lingkaran SVG progress 0–100 dengan warna dinamis (hijau/cyan/kuning/oranye/merah)
  * **Highlights Grid** — 4–5 kartu insight poin utama dengan emoji dan warna per tipe
  * **Analisa 2 kolom** — narasi pengeluaran & tabungan
  * **Rekomendasi & Peringatan** — list dengan dot indicator hijau/merah
  * **Tips Bulan Depan** — card highlight cyan
* Section AI otomatis ter-reset saat bulan/tahun diganti
* Tombol **Analisa Ulang** untuk regenerate

#### 📈 Analisa AI Investasi — Inline & Tersimpan

* Hapus modal popup analisa saham
* Hasil analisa kini tampil **inline** di bawah baris tabel sebagai expandable panel dengan animasi `slideDown`
* Hasil analisa **disimpan ke database** (`fintrack_db.json`) di field `ai_analysis` dan `ai_analysis_at` per saham
* Tombol **Analisa Ulang** untuk regenerate tanpa menutup panel
* Jika analisa sudah tersimpan, panel langsung menampilkan data tanpa fetch ulang ke Qwen
* Tombol aksi di tabel: **AI** (belum ada analisa) → **Analisa** + highlight aktif (sudah ada)

#### 🔗 Integrasi TradingView

* Klik **IHSG card** → buka chart `IDX:COMPOSITE` di TradingView tab baru
* Klik **kode saham** di tabel portfolio → buka chart `IDX:KODE` di TradingView tab baru
* Klik **mover card** di Top Movers → buka chart saham di TradingView tab baru
* Semua elemen clickable dilengkapi cursor pointer + tooltip

#### 📰 Berita Saham dengan Link

* Setiap berita saham IDX dan geopolitik menyertakan field `url` dan `source` dari Qwen AI
* Klik berita → buka artikel di tab baru
* Hover efek: background subtle + geser kanan + judul berubah cyan + ikon external link
* Badge nama media (kontan.co.id, cnbcindonesia.com, dll) ditampilkan di bawah ringkasan
* Berita di panel analisa inline juga mendukung klik ke link

#### 🔄 Force Refresh Cache Dashboard AI

* Tombol **Refresh AI** kini mengirim flag `force: true` → bypass cache 24 jam
* Memastikan prompt terbaru langsung aktif tanpa menunggu cache kedaluwarsa

---

### 🛠 Changed

#### `database.py`

* Tambah `import re`
* Tambah fungsi `clean_qwen_json()` — sanitasi output Qwen sebelum JSON parse
* `handle_ai_dashboard()`:
  * Prompt diperbarui: setiap berita menyertakan field `url` dan `source`
  * Support flag `force` untuk bypass cache 24 jam
* `handle_ai_analyze()`:
  * Menerima field `id` dari payload
  * Hasil analisa disimpan ke `db["investments"][i]["ai_analysis"]` dan `ai_analysis_at`
  * Prompt berita terkait menyertakan field `url` dan `source`
* Tambah `handle_ai_report()` — analisa laporan keuangan bulanan via Qwen
* `HANDLERS` dict — tambah `"ai_report": handle_ai_report`

#### `server.js`

* Route `POST /api/investments/ai/dashboard` — meneruskan flag `force` dari body ke bridge
* Tambah route `POST /api/report/ai` → handler `ai_report`

#### `index.html`

* Halaman **Laporan** — tambah tombol Analisa AI di header + section `#reportAiSection`
* Halaman **Investasi** — hapus elemen modal `#analyzeModal`
* IHSG card — tambah `onclick="openTradingView('IHSG')"` + cursor pointer

#### `app.js`

* Tambah fungsi global `window.openTradingView(code)`
* `renderAiDashboard()` — mover card + berita: onclick TradingView, news-clickable, badge source
* `renderInvestmentTable()` — refactor total: inline expand panel, onclick TradingView di inv-code-badge
* Tambah `expandedAnalysis` Set, `renderAnalysisInlineHTML()`, `toggleAnalysis()`, `reAnalyzeStock()`, `fetchAndSaveAnalysis()`
* Hapus `analyzeStock()`, `renderAnalyzeResult()`, `closeAnalyze` listener (modal lama)
* `loadInvAiDashboard(force)` — support parameter force, Refresh AI kirim `force: true`
* Tambah `loadReportAI()` dan `renderReportAIContent()` — fetch + render UI kartu resume laporan AI
* Listener `reportYear`/`reportMonth` — reset section AI saat bulan berubah

#### `style.css`

* Hapus CSS modal analisa lama
* Tambah ~180 baris CSS Resume Laporan AI: `.report-ai-card`, `.rpt-score-circle`, `.rpt-score-ring`, `.rpt-highlights-grid`, `.rpt-highlight-card`, `.rpt-two-col`, `.rpt-rec-list`, `.rpt-next-tip`
* Tambah CSS Inline Analysis Panel: `.analysis-inline`, `.analysis-row`, `.action-btn.analyze.active`, `@keyframes slideDown`
* Tambah CSS Berita Clickable: `.news-clickable`, `.news-source`, `.news-meta`, `.news-link-icon`

---

### ⚠️ Notes

* Analisa AI dan resume laporan bersifat **estimasi** berdasarkan data transaksi & pengetahuan model Qwen
* URL berita dari Qwen mungkin tidak selalu tepat — jika tidak ditemukan, user diarahkan ke halaman seksi keuangan media tersebut
* Data analisa saham tersimpan di `fintrack_db.json` — backup file ini secara berkala

---

### 🔧 Deployment

| File | Deploy ke |
|---|---|
| `server.js` | VPS |
| `views/index.html` | VPS |
| `public/js/app.js` | VPS |
| `public/css/style.css` | VPS |
| `database.py` | Windows 10 |

```bash
# VPS
pm2 restart fintrack
```

```cmd
# Windows 10
python database.py
```

---

## [v1.1.1] - 2026-05-04

### 🐛 Fixes

#### `server.js`

* **Perbaikan urutan route Express (critical bug)**

  * Route:

    ```
    /api/investments/:id
    ```

    sebelumnya didefinisikan sebelum:

    ```
    /api/investments/ai/dashboard
    /api/investments/ai/analyze
    ```
  * Akibat:

    * String `ai` terbaca sebagai parameter `:id`
    * Request masuk ke handler yang salah
    * Endpoint AI tidak bisa diakses (terutama POST)
  * ✅ Solusi:

    * Memindahkan route:

      * `/api/investments/ai/analyze`
      * `/api/investments/ai/dashboard`
    * Didefinisikan sebelum `/api/investments/:id`

* **Perbaikan method API (POST vs GET mismatch)**

  * Sebelumnya:

    * `app.js` → **POST**
    * `server.js` → **GET**
  * ✅ Sekarang:

    * Keduanya menggunakan **POST**

---

### 🔧 Deployment

* Replace file `server.js` di VPS
* Restart server:

  ```bash
  pm2 restart fintrack
  ```

  atau:

  ```bash
  node server.js
  ```


---

## [v1.1.0] - 2026-05-04

### 🚀 Added

#### 📈 Investasi (AI Powered)

* Halaman **Pantauan Investasi**
* Integrasi Qwen AI untuk:

  * IHSG, top movers, berita saham IDX, berita geopolitik
  * Analisa saham (estimasi harga, P/L, rekomendasi, target price, stop loss)
* Cache dashboard AI selama **24 jam**
* Continue session mode (efisiensi request AI)

#### 💳 Tagihan Rutin

* Fitur manajemen tagihan bulanan
* Mendukung:

  * Tambah/hapus tagihan
  * Toggle aktif/nonaktif
  * Auto-debit badge
  * Indikator jatuh tempo (≤3 hari)

#### 🌐 External API

* Endpoint `/ext/*` dengan autentikasi `X-API-Key`
* Mendukung akses:

  * Transaksi
  * Anggaran
  * Investasi
  * Tagihan

---

### 🛠 Changed

#### `database.py`

* Tambah `urllib.request`, `time`, `datetime`
* Tambah config `QWEN_BASE` + session Qwen
* Update `load_db()` → tambah `investments`, `bills`
* Tambah handler CRUD:

  * Investment
  * Bills
* Tambah integrasi AI:

  * `qwen_warmup()`
  * `qwen_call()`
* Tambah fitur:

  * `handle_ai_dashboard()` (cache 24 jam)
  * `handle_ai_analyze()`

#### `server.js`

* Tambah routes:

  * `/api/investments` (CRUD)
  * `/api/investments/ai/*`
  * `/api/bills` (CRUD + toggle)
* Tambah External API `/ext/*`

#### `index.html`

* Tambah menu:

  * Investasi
  * Tagihan
* Tambah halaman:

  * Pantauan Investasi (AI dashboard + portfolio + modal analisa)
  * Tagihan Rutin (summary + grid + toggle)

#### `app.js`

* State diperluas: `investments`, `bills`
* Tambah method `PUT`
* `loadAll()` fetch 5 endpoint
* Logic investasi lengkap (CRUD + AI)
* Logic tagihan lengkap (CRUD + summary)

#### `style.css`

* ~413 baris CSS baru
* Styling:

  * IHSG card
  * Movers
  * News
  * Modal AI
  * Grid tagihan
  * Badge autodebit

---

### ⚠️ Notes

* Data AI bersifat **estimasi**, bukan real-time bursa
* Disarankan tetap melakukan riset sebelum keputusan investasi

---

## [v1.0.0] - Initial Release

### 🎉 Initial Features

* Manajemen transaksi (pemasukan & pengeluaran)
* Dashboard keuangan
* Laporan bulanan
* Sistem anggaran
* Arsitektur terdistribusi (VPS + WebSocket + Windows client)