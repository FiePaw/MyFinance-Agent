# FinTrack — Aplikasi Keuangan Pribadi

Aplikasi manajemen keuangan pribadi berbasis web dengan arsitektur terdistribusi: **VPS** menjalankan website Node.js, **Windows 10** menyimpan database JSON dan terhubung ke VPS via WebSocket (Python). Dilengkapi **Pantauan Investasi Saham IDX** bertenaga Qwen AI, **Resume Laporan AI**, **Tagihan Rutin**, serta **External API** untuk integrasi aplikasi pihak ketiga.

---

## Arsitektur

```
Browser  <-->  VPS (Node.js :9550)  <-->  WebSocket (:9560)  <-->  Windows 10 (Python + JSON)
                                                                           |
                                                                    Qwen AI Server
                                                                  (108.137.15.61:9000)
```

- VPS tidak menyimpan data apapun — hanya meneruskan request
- Windows 10 connect **keluar** ke VPS (tidak perlu public IP di Windows)
- Database berupa file `fintrack_db.json` di Windows 10
- Qwen AI dipanggil langsung dari Python client menggunakan continue session mode

---

## Struktur File

```
fintrack/
├── server.js          # Express server + REST API + External API
├── bridge.js          # WebSocket server (menerima koneksi Python)
├── package.json
├── database.py        # Script Python untuk Windows 10 (database + Qwen AI)
├── views/
│   └── index.html     # SPA — semua halaman
└── public/
    ├── css/style.css  # Desain sky blue / cyan / white
    └── js/app.js      # Frontend logic + Chart.js
```

---

## Instalasi

### VPS (Ubuntu/Debian)

**1. Install Node.js**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**2. Upload folder `fintrack` ke VPS**
```bash
scp -r fintrack/ user@IP_VPS:/home/user/
```

**3. Install dependencies**
```bash
cd fintrack
npm install
```

**4. Buka port di firewall**
```bash
sudo ufw allow 9550    # Website
sudo ufw allow 9560    # WebSocket (hanya perlu diakses Python client)
```

**5. (Opsional) Set API Key untuk External API**
```bash
export EXT_API_KEY="kunci-rahasia-anda"
```
> Jika tidak di-set, default key adalah `fintrack-ext-key`

**6. Jalankan server**
```bash
node server.js
# atau dengan PM2 agar berjalan terus:
npm install -g pm2
pm2 start server.js --name fintrack
pm2 save
pm2 startup
```

---

### Windows 10

**1. Install Python 3.8+**

Download dari https://python.org — centang "Add Python to PATH"

**2. Install library websockets**
```cmd
pip install websockets
```
> Library lain yang digunakan (`urllib`, `json`, `asyncio`) sudah built-in Python — tidak perlu install tambahan.

**3. Konfigurasi `database.py`**

Buka `database.py` dan ubah baris berikut:
```python
VPS_HOST = "IP_VPS_ANDA"   # Ganti dengan IP atau domain VPS kamu
VPS_PORT = 9560             # Harus sama dengan WS_PORT di bridge.js
```

Konfigurasi Qwen AI sudah terpasang dan tidak perlu diubah:
```python
QWEN_BASE = "http://108.137.15.61:9000"
```

**4. Jalankan client**
```cmd
python database.py
```

Output sukses:
```
==================================================
  FinTrack - Database Client
  VPS: 123.45.67.89:9560
  Database: C:\Users\...\fintrack_db.json
  Qwen AI: http://108.137.15.61:9000
  Tekan Ctrl+C untuk berhenti
==================================================
2025-01-01 10:00:00 [INFO] Menghubungkan ke ws://123.45.67.89:9560 ...
2025-01-01 10:00:01 [INFO] Terhubung ke VPS!
```

**5. Opsional — jalankan otomatis saat Windows startup**

Buat file `start_fintrack.bat`:
```bat
@echo off
pythonw "C:\path\ke\database.py"
```
Lalu simpan shortcut-nya ke:
```
shell:startup
```

---

## Akses Website

Buka browser dan akses:
```
http://IP_VPS:9550
```

---

## Fitur

| Menu | Fitur | Keterangan |
|---|---|---|
| Dashboard | Ringkasan Keuangan | Saldo bersih, pemasukan, pengeluaran, tingkat tabungan |
| Dashboard | Grafik Arus Kas | Bar chart cashflow 6 bulan terakhir |
| Dashboard | Kategori Pengeluaran | Donut chart distribusi pengeluaran |
| Dashboard | Status Anggaran | Progress bar Aman / Hampir / Melebihi |
| Dashboard | Transaksi Terbaru | 6 transaksi terkini |
| Pemasukan | Pencatatan Pemasukan | Tambah/hapus dengan kategori dan tanggal |
| Pengeluaran | Pencatatan Pengeluaran | Tambah/hapus dengan kategori dan tanggal |
| Laporan | Laporan Bulanan | Grafik bar + donut per kategori, tabel transaksi |
| **Laporan** | **Resume AI** | **Analisa keuangan bulanan via Qwen AI — health score, highlights, rekomendasi** |
| Transaksi | Semua Transaksi | Filter jenis, kategori, bulan, rentang tanggal, teks, paginasi |
| Anggaran | Manajemen Anggaran | Atur batas per kategori, progress bar real-time |
| **Investasi** | **Dashboard Pasar IDX** | **IHSG (klik → TradingView), top movers, ringkasan pasar — via Qwen AI** |
| **Investasi** | **Berita Saham IDX** | **4 berita terbaru + link artikel asli — via Qwen AI** |
| **Investasi** | **Berita Geopolitik** | **3 berita geopolitik + dampak ke IDX + link artikel — via Qwen AI** |
| **Investasi** | **Portfolio Saham** | **Pantau saham dalam lot, modal, tanggal beli — klik kode → TradingView** |
| **Investasi** | **Analisa AI per Saham** | **Inline panel: harga est., P/L, rekomendasi, target, stop loss — tersimpan di DB** |
| **Tagihan** | **Tagihan Rutin** | **Catat tagihan bulanan berulang dengan jatuh tempo** |
| **Tagihan** | **Status Jatuh Tempo** | **Indikator hari tersisa, highlight urgent (≤3 hari)** |
| **Tagihan** | **Toggle Aktif/Nonaktif** | **Pause tagihan tanpa menghapusnya** |
| **Tagihan** | **Auto-Debit Badge** | **Tandai tagihan yang sudah auto-debit** |
| Semua | Indikator Koneksi | Status database real-time di sidebar |

---

## Qwen AI — Fitur AI

FinTrack menggunakan Qwen AI Server (`108.137.15.61:9000`) dalam **continue session mode** untuk tiga fitur utama:

### Pantauan Investasi

1. Saat pertama kali menu Investasi dibuka, Python client melakukan **warm-up** dengan system prompt analis saham Indonesia
2. Session ID Qwen disimpan dan digunakan untuk seluruh request berikutnya (**continue mode**)
3. Data dashboard (IHSG, berita, top movers) di-**cache selama 24 jam** — tidak memanggil Qwen setiap refresh
4. Klik tombol **Refresh AI** untuk memaksa fetch data terbaru (bypass cache)
5. Analisa per saham dipanggil on-demand saat tombol **Analisa / AI** diklik di tabel portfolio
6. Hasil analisa **disimpan ke database** per saham — tidak perlu fetch ulang jika sudah tersimpan
7. Klik **Analisa Ulang** untuk regenerate analisa terbaru

### Resume Laporan Bulanan

1. Buka menu **Laporan**, pilih bulan/tahun, klik tombol **Analisa AI**
2. Qwen menganalisa data transaksi bulan tersebut dan menampilkan resume visual:
   - **Health Score** 0–100 dengan indikator warna
   - **Highlights** poin utama keuangan bulan ini
   - **Analisa** pola pengeluaran dan tabungan
   - **Rekomendasi** dan **Peringatan** konkret
   - **Tips** target bulan depan
3. Section AI ter-reset otomatis saat bulan/tahun diganti

### Data yang Diambil Qwen AI

| Data | Isi | Cache |
|---|---|---|
| IHSG | Nilai, perubahan poin & persen, status naik/turun | 24 jam |
| Top Movers | 5 saham penggerak terbesar hari ini | 24 jam |
| Berita Saham IDX | 4 berita terkini + sentimen + link artikel | 24 jam |
| Berita Geopolitik | 3 berita geopolitik + dampak ke IDX + link artikel | 24 jam |
| Ringkasan Pasar | Narasi kondisi pasar hari ini | 24 jam |
| Analisa Saham | Harga est., P/L, rekomendasi, target, stop loss, berita terkait | Per request (tersimpan di DB) |
| Resume Laporan | Health score, highlights, analisa, rekomendasi, tips | Per request |

> ⚠ Data Qwen AI bersifat **estimasi** berdasarkan pengetahuan model. Bukan data real-time dari bursa. Selalu lakukan riset mandiri sebelum keputusan investasi.

---

## Integrasi TradingView

FinTrack terintegrasi dengan TradingView untuk melihat chart saham:

| Elemen | Aksi | Tujuan |
|---|---|---|
| IHSG Card | Klik | `tradingview.com/chart/?symbol=IDX:COMPOSITE` |
| Kode saham di tabel portfolio | Klik | `tradingview.com/chart/?symbol=IDX:KODE` |
| Mover card di Top Movers | Klik | `tradingview.com/chart/?symbol=IDX:KODE` |

Semua chart dibuka di tab baru.

---

## Internal API (Browser → VPS)

Selain External API, VPS menyediakan endpoint internal yang digunakan frontend:

| Method | Endpoint | Keterangan |
|---|---|---|
| `POST` | `/api/investments/ai/analyze` | Analisa saham via Qwen, simpan ke DB |
| `POST` | `/api/investments/ai/dashboard` | Dashboard pasar IDX via Qwen (cache 24 jam) |
| `POST` | `/api/report/ai` | Resume laporan keuangan bulanan via Qwen |

---

## External API

FinTrack menyediakan External API di prefix `/ext/*` untuk integrasi dengan aplikasi luar (mobile app, bot Telegram, automation, dsb.).

### Autentikasi

Semua endpoint `/ext/*` memerlukan header:
```
X-API-Key: fintrack-ext-key
```
> Ganti key default via environment variable `EXT_API_KEY` sebelum menjalankan server.

### Endpoint

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/ext/summary` | Semua data sekaligus (transaksi, anggaran, investasi, tagihan) |
| `GET` | `/ext/transactions` | Daftar semua transaksi |
| `POST` | `/ext/transactions` | Tambah transaksi baru |
| `DELETE` | `/ext/transactions/:id` | Hapus transaksi |
| `GET` | `/ext/budgets` | Daftar semua anggaran |
| `POST` | `/ext/budgets` | Tambah anggaran |
| `DELETE` | `/ext/budgets/:id` | Hapus anggaran |
| `GET` | `/ext/bills` | Daftar semua tagihan rutin |
| `POST` | `/ext/bills` | Tambah tagihan rutin |
| `DELETE` | `/ext/bills/:id` | Hapus tagihan rutin |
| `GET` | `/ext/investments` | Daftar semua investasi |
| `POST` | `/ext/investments` | Tambah investasi |
| `DELETE` | `/ext/investments/:id` | Hapus investasi |

### Contoh Penggunaan

```bash
# Ambil semua data
curl -H "X-API-Key: fintrack-ext-key" http://IP_VPS:9550/ext/summary

# Tambah pengeluaran
curl -H "X-API-Key: fintrack-ext-key" \
     -H "Content-Type: application/json" \
     -X POST \
     -d '{"type":"expense","amount":50000,"category":"Makanan","date":"2025-05-01","description":"Makan siang"}' \
     http://IP_VPS:9550/ext/transactions

# Tambah tagihan rutin
curl -H "X-API-Key: fintrack-ext-key" \
     -H "Content-Type: application/json" \
     -X POST \
     -d '{"name":"Netflix","amount":54000,"due_day":15,"category":"Langganan","autodebit":true}' \
     http://IP_VPS:9550/ext/bills

# Tambah pantauan saham
curl -H "X-API-Key: fintrack-ext-key" \
     -H "Content-Type: application/json" \
     -X POST \
     -d '{"code":"BBCA","name":"Bank Central Asia Tbk","shares":100,"buy_price":9500,"buy_date":"2025-01-15"}' \
     http://IP_VPS:9550/ext/investments
```

---

## Environment Variables

| Variable | Default | Keterangan |
|---|---|---|
| `PORT` | `9550` | Port HTTP website |
| `WS_PORT` | `9560` | Port WebSocket bridge |
| `EXT_API_KEY` | `fintrack-ext-key` | API Key untuk External API |

Contoh:
```bash
PORT=80 WS_PORT=9000 EXT_API_KEY="rahasia123" node server.js
```

---

## Struktur Database

File `fintrack_db.json` dibuat otomatis di folder yang sama dengan `database.py`:

```json
{
  "transactions": [
    {
      "id": "uuid",
      "type": "income",
      "amount": 5000000,
      "category": "Gaji",
      "date": "2025-01-01",
      "description": "Gaji bulan Januari",
      "created_at": "2025-01-01T10:00:00"
    }
  ],
  "budgets": [
    {
      "id": "uuid",
      "category": "Makanan",
      "limit": 1500000,
      "created_at": "2025-01-01T10:00:00"
    }
  ],
  "investments": [
    {
      "id": "uuid",
      "code": "BBCA",
      "name": "Bank Central Asia Tbk",
      "shares": 100,
      "buy_price": 9500,
      "buy_date": "2025-01-15",
      "notes": "",
      "created_at": "2025-01-15T10:00:00",
      "ai_analysis": { ... },
      "ai_analysis_at": "2025-01-15T10:00:00"
    }
  ],
  "bills": [
    {
      "id": "uuid",
      "name": "Netflix",
      "amount": 54000,
      "due_day": 15,
      "category": "Langganan",
      "autodebit": true,
      "notes": "",
      "active": true,
      "created_at": "2025-01-01T10:00:00"
    }
  ]
}
```

Database dapat di-backup dengan menyalin file `fintrack_db.json`.

---

## Troubleshooting

**Website tidak bisa diakses**
- Pastikan `node server.js` berjalan di VPS
- Cek firewall: `sudo ufw status`
- Pastikan port 9550 terbuka

**Status database "Tidak Terhubung"**
- Pastikan `database.py` berjalan di Windows
- Pastikan `VPS_HOST` di `database.py` sudah benar
- Cek port 9560 tidak diblokir oleh firewall VPS

**Menu Investasi — "Gagal memuat data AI"**
- Pastikan `database.py` berjalan dan terhubung ke VPS
- Pastikan VPS bisa menjangkau `108.137.15.61:9000` (Qwen server)
- Cek log di `fintrack.log` di folder yang sama dengan `database.py`
- Qwen server mungkin timeout — coba klik **Refresh AI** beberapa saat kemudian

**Analisa saham / Resume Laporan gagal parse JSON**
- Qwen AI kadang menyisipkan citation markers atau newline di dalam output JSON
- Sudah ditangani otomatis oleh fungsi `clean_qwen_json()` di `database.py`
- Jika masih gagal, coba klik **Analisa Ulang** / **Analisa AI** kembali
- Cek log `fintrack.log` untuk detail error

**Berita tidak memiliki link / link tidak terbuka**
- Qwen AI mungkin tidak yakin URL persis artikel — link yang ditampilkan adalah halaman seksi keuangan media tersebut
- Data bersifat estimasi, bukan crawl real-time

**Python error `ModuleNotFoundError: No module named 'websockets'`**
```cmd
pip install websockets
```

**External API mengembalikan 401 Unauthorized**
- Pastikan header `X-API-Key` dikirim dengan nilai yang benar
- Cek nilai `EXT_API_KEY` di environment variable server

---

## Catatan Versi

Lihat [CHANGELOG.md](./CHANGELOG.md) untuk riwayat lengkap perubahan.