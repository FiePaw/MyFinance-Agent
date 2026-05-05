# FinTrack — External API Reference

Dokumentasi lengkap External API FinTrack untuk integrasi dengan aplikasi pihak ketiga seperti mobile app, bot Telegram, automation script, atau sistem lain.

---

## Daftar Isi

1. [Gambaran Umum](#1-gambaran-umum)
2. [Autentikasi](#2-autentikasi)
3. [Base URL & Header](#3-base-url--header)
4. [Response Format](#4-response-format)
5. [HTTP Status Codes](#5-http-status-codes)
6. [Endpoint Reference](#6-endpoint-reference)
   - [Summary](#61-get-extsummary)
   - [Transaksi](#62-transaksi)
   - [Anggaran](#63-anggaran)
   - [Tagihan Rutin](#64-tagihan-rutin)
   - [Investasi](#65-investasi)
7. [Tipe Data & Skema](#7-tipe-data--skema)
8. [Kategori yang Tersedia](#8-kategori-yang-tersedia)
9. [Contoh Penggunaan](#9-contoh-penggunaan)
10. [Catatan & Batasan](#10-catatan--batasan)

---

## 1. Gambaran Umum

External API FinTrack memungkinkan aplikasi luar untuk membaca dan menulis data keuangan secara programatik. Semua endpoint berada di prefix `/ext/*` dan memerlukan autentikasi via header `X-API-Key`.

**Yang bisa dilakukan via External API:**
- Membaca semua data sekaligus (summary)
- Mencatat transaksi pemasukan/pengeluaran
- Mengelola anggaran per kategori
- Mengelola tagihan rutin bulanan
- Mengelola pantauan portofolio saham

**Yang TIDAK tersedia di External API:**
- Analisa AI (hanya tersedia di internal endpoint)
- Update/edit transaksi (hanya add & delete)
- Toggle aktif/nonaktif tagihan (gunakan internal API)

---

## 2. Autentikasi

Semua endpoint `/ext/*` memerlukan header autentikasi:

```
X-API-Key: fintrack-ext-key
```

> **Ganti API Key default** sebelum production dengan mengset environment variable di VPS:
> ```bash
> export EXT_API_KEY="kunci-rahasia-anda-yang-kuat"
> ```
> Jika tidak di-set, default key adalah `fintrack-ext-key`.

### Jika autentikasi gagal:

```json
HTTP/1.1 401 Unauthorized

{
  "error": "Unauthorized"
}
```

---

## 3. Base URL & Header

```
Base URL: http://IP_VPS:9550
```

**Header wajib untuk semua request:**

| Header | Nilai |
|---|---|
| `X-API-Key` | API key yang dikonfigurasi di server |
| `Content-Type` | `application/json` (hanya untuk POST) |

**Contoh request minimal:**
```bash
curl -H "X-API-Key: fintrack-ext-key" http://IP_VPS:9550/ext/summary
```

---

## 4. Response Format

Semua response menggunakan format JSON.

### Response sukses — data array:
```json
[
  { "id": "uuid", "field": "value", ... },
  { "id": "uuid", "field": "value", ... }
]
```

### Response sukses — data tunggal (setelah POST):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "expense",
  "amount": 50000,
  "category": "Makanan",
  "date": "2025-05-01",
  "description": "Makan siang",
  "created_at": "2025-05-01T12:00:00.000Z"
}
```

### Response sukses — operasi delete:
```json
{ "ok": true }
```

### Response error:
```json
{ "error": "Pesan error" }
```

---

## 5. HTTP Status Codes

| Status | Keterangan |
|---|---|
| `200 OK` | Request berhasil |
| `400 Bad Request` | Field wajib tidak lengkap atau format salah |
| `401 Unauthorized` | API Key salah atau tidak dikirim |
| `500 Internal Server Error` | Database tidak terhubung atau error server |

> **Catatan:** Error 500 paling umum terjadi karena `database.py` di Windows 10 tidak berjalan atau koneksi WebSocket terputus.

---

## 6. Endpoint Reference

---

### 6.1 `GET /ext/summary`

Mengambil semua data sekaligus dalam satu request. Cocok untuk sinkronisasi awal atau dashboard eksternal.

**Request:**
```
GET /ext/summary
X-API-Key: fintrack-ext-key
```

**Response:**
```json
{
  "transactions": [ ...array transaksi... ],
  "budgets":      [ ...array anggaran... ],
  "investments":  [ ...array investasi... ],
  "bills":        [ ...array tagihan... ]
}
```

**Contoh:**
```bash
curl -H "X-API-Key: fintrack-ext-key" http://IP_VPS:9550/ext/summary
```

---

### 6.2 Transaksi

Transaksi mencakup semua pemasukan (`income`) dan pengeluaran (`expense`).

---

#### `GET /ext/transactions`

Mengambil semua transaksi, diurutkan berdasarkan waktu pembuatan.

**Request:**
```
GET /ext/transactions
X-API-Key: fintrack-ext-key
```

**Response:** Array of [Transaction Object](#transaction-object)

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "income",
    "amount": 5000000,
    "category": "Gaji",
    "date": "2025-05-01",
    "description": "Gaji bulan Mei",
    "created_at": "2025-05-01T08:00:00.000Z"
  },
  {
    "id": "661f9511-f30c-52e5-b827-557766551111",
    "type": "expense",
    "amount": 50000,
    "category": "Makanan",
    "date": "2025-05-01",
    "description": "Makan siang",
    "created_at": "2025-05-01T12:00:00.000Z"
  }
]
```

---

#### `POST /ext/transactions`

Menambahkan transaksi baru (pemasukan atau pengeluaran).

**Request Body:**

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `type` | `string` | ✅ | `"income"` atau `"expense"` |
| `amount` | `number` | ✅ | Jumlah dalam Rupiah (bilangan bulat positif) |
| `category` | `string` | ✅ | Kategori transaksi (lihat [daftar kategori](#8-kategori-yang-tersedia)) |
| `date` | `string` | ✅ | Format `YYYY-MM-DD` |
| `description` | `string` | ❌ | Keterangan tambahan (opsional, default: `""`) |

**Contoh Request:**
```bash
curl -X POST http://IP_VPS:9550/ext/transactions \
  -H "X-API-Key: fintrack-ext-key" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "expense",
    "amount": 50000,
    "category": "Makanan",
    "date": "2025-05-01",
    "description": "Makan siang warteg"
  }'
```

**Response:** [Transaction Object](#transaction-object) yang baru dibuat

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "expense",
  "amount": 50000,
  "category": "Makanan",
  "date": "2025-05-01",
  "description": "Makan siang warteg",
  "created_at": "2025-05-01T12:00:00.000Z"
}
```

**Error 400** jika field wajib tidak lengkap:
```json
{ "error": "Field tidak lengkap" }
```

---

#### `DELETE /ext/transactions/:id`

Menghapus transaksi berdasarkan ID.

**Request:**
```
DELETE /ext/transactions/550e8400-e29b-41d4-a716-446655440000
X-API-Key: fintrack-ext-key
```

**Response:**
```json
{ "ok": true }
```

> **Catatan:** Tidak ada konfirmasi — hapus bersifat permanen.

---

### 6.3 Anggaran

Anggaran menetapkan batas pengeluaran per kategori per bulan. Satu kategori hanya boleh memiliki satu anggaran.

---

#### `GET /ext/budgets`

Mengambil semua anggaran yang telah dikonfigurasi.

**Response:** Array of [Budget Object](#budget-object)

```json
[
  {
    "id": "772a1600-a41d-63f6-c948-668877662222",
    "category": "Makanan",
    "limit": 1500000,
    "created_at": "2025-05-01T08:00:00.000Z"
  },
  {
    "id": "883b2711-b52e-74g7-d059-779988773333",
    "category": "Transport",
    "limit": 500000,
    "created_at": "2025-05-01T08:00:00.000Z"
  }
]
```

---

#### `POST /ext/budgets`

Menambahkan anggaran baru untuk sebuah kategori.

**Request Body:**

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `category` | `string` | ✅ | Nama kategori (harus unik, belum punya anggaran) |
| `limit` | `number` | ✅ | Batas pengeluaran per bulan dalam Rupiah |

**Contoh Request:**
```bash
curl -X POST http://IP_VPS:9550/ext/budgets \
  -H "X-API-Key: fintrack-ext-key" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "Hiburan",
    "limit": 300000
  }'
```

**Response:** [Budget Object](#budget-object) yang baru dibuat

```json
{
  "id": "994c3822-c63f-85h8-e160-880099884444",
  "category": "Hiburan",
  "limit": 300000,
  "created_at": "2025-05-01T09:00:00.000Z"
}
```

---

#### `DELETE /ext/budgets/:id`

Menghapus anggaran berdasarkan ID.

**Request:**
```
DELETE /ext/budgets/994c3822-c63f-85h8-e160-880099884444
X-API-Key: fintrack-ext-key
```

**Response:**
```json
{ "ok": true }
```

---

### 6.4 Tagihan Rutin

Tagihan rutin adalah pengeluaran bulanan berulang dengan tanggal jatuh tempo tetap, seperti sewa, langganan, atau cicilan.

---

#### `GET /ext/bills`

Mengambil semua tagihan rutin.

**Response:** Array of [Bill Object](#bill-object)

```json
[
  {
    "id": "aa5d4933-d74g-96i9-f271-991100995555",
    "name": "Netflix",
    "amount": 54000,
    "due_day": 15,
    "category": "Langganan",
    "autodebit": true,
    "notes": "Paket standar",
    "active": true,
    "created_at": "2025-01-01T08:00:00.000Z"
  }
]
```

---

#### `POST /ext/bills`

Menambahkan tagihan rutin baru.

**Request Body:**

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `name` | `string` | ✅ | Nama tagihan (contoh: "Netflix", "PLN", "Kost") |
| `amount` | `number` | ✅ | Nominal tagihan dalam Rupiah |
| `due_day` | `number` | ✅ | Tanggal jatuh tempo dalam sebulan (`1`–`31`) |
| `category` | `string` | ✅ | Kategori tagihan |
| `autodebit` | `boolean` | ❌ | `true` jika sudah auto-debit (default: `false`) |
| `notes` | `string` | ❌ | Catatan tambahan (default: `""`) |

> Tagihan baru selalu dibuat dengan status `active: true`.

**Contoh Request:**
```bash
curl -X POST http://IP_VPS:9550/ext/bills \
  -H "X-API-Key: fintrack-ext-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Spotify",
    "amount": 54990,
    "due_day": 20,
    "category": "Langganan",
    "autodebit": true,
    "notes": "Paket premium"
  }'
```

**Response:** [Bill Object](#bill-object) yang baru dibuat

```json
{
  "id": "bb6e5044-e85h-07j0-g382-002211006666",
  "name": "Spotify",
  "amount": 54990,
  "due_day": 20,
  "category": "Langganan",
  "autodebit": true,
  "notes": "Paket premium",
  "active": true,
  "created_at": "2025-05-01T10:00:00.000Z"
}
```

---

#### `DELETE /ext/bills/:id`

Menghapus tagihan rutin berdasarkan ID.

**Request:**
```
DELETE /ext/bills/bb6e5044-e85h-07j0-g382-002211006666
X-API-Key: fintrack-ext-key
```

**Response:**
```json
{ "ok": true }
```

---

### 6.5 Investasi

Portofolio saham IDX yang dipantau. Setiap entri merepresentasikan satu posisi saham dengan harga beli dan jumlah lot.

---

#### `GET /ext/investments`

Mengambil semua entri portofolio saham.

**Response:** Array of [Investment Object](#investment-object)

```json
[
  {
    "id": "cc7f6155-f96i-18k1-h493-113322117777",
    "code": "BBCA",
    "name": "Bank Central Asia Tbk",
    "shares": 100,
    "buy_price": 9500,
    "buy_date": "2025-01-15",
    "notes": "Beli saat koreksi",
    "created_at": "2025-01-15T10:00:00.000Z",
    "ai_analysis": { ... },
    "ai_analysis_at": "2025-05-01T08:00:00.000Z"
  }
]
```

> **Catatan:** Field `ai_analysis` dan `ai_analysis_at` hanya ada jika analisa AI pernah dijalankan untuk saham tersebut dari aplikasi web.

---

#### `POST /ext/investments`

Menambahkan saham baru ke portofolio.

**Request Body:**

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `code` | `string` | ✅ | Kode saham IDX (contoh: `"BBCA"`, `"TLKM"`) — otomatis diubah ke huruf kapital |
| `name` | `string` | ✅ | Nama lengkap perusahaan |
| `shares` | `number` | ✅ | Jumlah lembar saham (1 lot = 100 lembar) |
| `buy_price` | `number` | ✅ | Harga beli per lembar dalam Rupiah |
| `buy_date` | `string` | ✅ | Tanggal beli, format `YYYY-MM-DD` |
| `notes` | `string` | ❌ | Catatan tambahan (default: `""`) |

**Contoh Request:**
```bash
curl -X POST http://IP_VPS:9550/ext/investments \
  -H "X-API-Key: fintrack-ext-key" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "BBCA",
    "name": "Bank Central Asia Tbk",
    "shares": 100,
    "buy_price": 9500,
    "buy_date": "2025-01-15",
    "notes": "Beli saat koreksi"
  }'
```

**Response:** [Investment Object](#investment-object) yang baru dibuat

```json
{
  "id": "cc7f6155-f96i-18k1-h493-113322117777",
  "code": "BBCA",
  "name": "Bank Central Asia Tbk",
  "shares": 100,
  "buy_price": 9500,
  "buy_date": "2025-01-15",
  "notes": "Beli saat koreksi",
  "created_at": "2025-01-15T10:00:00.000Z"
}
```

> **Catatan:** `shares` dalam lembar, bukan lot. Untuk 1 lot = isi `shares: 100`.

---

#### `DELETE /ext/investments/:id`

Menghapus entri saham dari portofolio berdasarkan ID.

**Request:**
```
DELETE /ext/investments/cc7f6155-f96i-18k1-h493-113322117777
X-API-Key: fintrack-ext-key
```

**Response:**
```json
{ "ok": true }
```

---

## 7. Tipe Data & Skema

### Transaction Object

```json
{
  "id":          "string (UUID v4)",
  "type":        "income | expense",
  "amount":      "number (Rupiah, bilangan bulat positif)",
  "category":    "string",
  "date":        "string (YYYY-MM-DD)",
  "description": "string (bisa kosong)",
  "created_at":  "string (ISO 8601 timestamp)"
}
```

### Budget Object

```json
{
  "id":         "string (UUID v4)",
  "category":   "string",
  "limit":      "number (Rupiah per bulan)",
  "created_at": "string (ISO 8601 timestamp)"
}
```

### Bill Object

```json
{
  "id":         "string (UUID v4)",
  "name":       "string (nama tagihan)",
  "amount":     "number (Rupiah per bulan)",
  "due_day":    "number (1–31, tanggal jatuh tempo)",
  "category":   "string",
  "autodebit":  "boolean",
  "notes":      "string (bisa kosong)",
  "active":     "boolean (true = aktif, false = dijeda)",
  "created_at": "string (ISO 8601 timestamp)"
}
```

### Investment Object

```json
{
  "id":              "string (UUID v4)",
  "code":            "string (kode saham IDX, huruf kapital)",
  "name":            "string (nama perusahaan)",
  "shares":          "number (jumlah lembar, bukan lot)",
  "buy_price":       "number (harga beli per lembar, Rupiah)",
  "buy_date":        "string (YYYY-MM-DD)",
  "notes":           "string (bisa kosong)",
  "created_at":      "string (ISO 8601 timestamp)",
  "ai_analysis":     "object | null (hasil analisa AI, jika pernah dijalankan)",
  "ai_analysis_at":  "string | null (ISO 8601, waktu terakhir analisa AI)"
}
```

### Summary Object

```json
{
  "transactions": "Transaction[]",
  "budgets":      "Budget[]",
  "investments":  "Investment[]",
  "bills":        "Bill[]"
}
```

---

## 8. Kategori yang Tersedia

### Kategori Pengeluaran (expense)

| Kategori | Keterangan |
|---|---|
| `Makanan` | Makan, minum, groceries |
| `Transport` | BBM, transportasi umum, parkir |
| `Belanja` | Pakaian, elektronik, kebutuhan rumah |
| `Tagihan` | Listrik, air, internet, telepon |
| `Hiburan` | Bioskop, game, rekreasi |
| `Kesehatan` | Dokter, obat, gym |
| `Pendidikan` | Kursus, buku, biaya sekolah |
| `Lainnya` | Kategori umum |

### Kategori Pemasukan (income)

| Kategori | Keterangan |
|---|---|
| `Gaji` | Gaji bulanan |
| `Freelance` | Pendapatan proyek/freelance |
| `Investasi` | Dividen, keuntungan jual saham |
| `Bisnis` | Pendapatan usaha |
| `Lainnya` | Kategori umum |

### Kategori Tagihan (bills)

| Kategori | Keterangan |
|---|---|
| `Langganan` | Netflix, Spotify, iCloud, dll |
| `Utilitas` | Listrik, air, gas |
| `Internet` | Paket internet, WiFi |
| `Asuransi` | Premi asuransi |
| `Cicilan` | Angsuran KPR, kendaraan |
| `Sewa` | Kost, apartemen, kontrakan |
| `Lainnya` | Kategori umum |

> **Catatan:** Kategori bersifat string bebas — aplikasi tidak memvalidasi apakah kategori ada dalam daftar di atas. Gunakan kategori di luar daftar jika diperlukan.

---

## 9. Contoh Penggunaan

### curl (Linux/macOS/Windows WSL)

```bash
# Ambil semua data sekaligus
curl -H "X-API-Key: fintrack-ext-key" \
     http://IP_VPS:9550/ext/summary

# Catat pemasukan gaji
curl -X POST http://IP_VPS:9550/ext/transactions \
     -H "X-API-Key: fintrack-ext-key" \
     -H "Content-Type: application/json" \
     -d '{"type":"income","amount":8000000,"category":"Gaji","date":"2025-05-01","description":"Gaji Mei 2025"}'

# Catat pengeluaran
curl -X POST http://IP_VPS:9550/ext/transactions \
     -H "X-API-Key: fintrack-ext-key" \
     -H "Content-Type: application/json" \
     -d '{"type":"expense","amount":25000,"category":"Transport","date":"2025-05-01","description":"Grab ke kantor"}'

# Hapus transaksi
curl -X DELETE http://IP_VPS:9550/ext/transactions/550e8400-e29b-41d4-a716-446655440000 \
     -H "X-API-Key: fintrack-ext-key"

# Tambah anggaran
curl -X POST http://IP_VPS:9550/ext/budgets \
     -H "X-API-Key: fintrack-ext-key" \
     -H "Content-Type: application/json" \
     -d '{"category":"Makanan","limit":1500000}'

# Tambah tagihan rutin
curl -X POST http://IP_VPS:9550/ext/bills \
     -H "X-API-Key: fintrack-ext-key" \
     -H "Content-Type: application/json" \
     -d '{"name":"Netflix","amount":54000,"due_day":15,"category":"Langganan","autodebit":true}'

# Tambah saham ke portofolio (5 lot BBRI)
curl -X POST http://IP_VPS:9550/ext/investments \
     -H "X-API-Key: fintrack-ext-key" \
     -H "Content-Type: application/json" \
     -d '{"code":"BBRI","name":"Bank Rakyat Indonesia Tbk","shares":500,"buy_price":4200,"buy_date":"2025-03-10"}'
```

---

### Python

```python
import requests

BASE_URL = "http://IP_VPS:9550"
HEADERS = {
    "X-API-Key": "fintrack-ext-key",
    "Content-Type": "application/json"
}

# Ambil semua data
summary = requests.get(f"{BASE_URL}/ext/summary", headers=HEADERS).json()
print(f"Total transaksi: {len(summary['transactions'])}")
print(f"Total tagihan aktif: {sum(1 for b in summary['bills'] if b['active'])}")

# Catat pengeluaran otomatis
def catat_pengeluaran(amount, category, description, date=None):
    from datetime import date as dt
    payload = {
        "type": "expense",
        "amount": amount,
        "category": category,
        "date": date or dt.today().isoformat(),
        "description": description
    }
    res = requests.post(f"{BASE_URL}/ext/transactions", json=payload, headers=HEADERS)
    return res.json()

# Contoh penggunaan
tx = catat_pengeluaran(50000, "Makanan", "Makan siang")
print(f"Transaksi dibuat: {tx['id']}")

# Hitung total pengeluaran bulan ini
from datetime import datetime
bulan_ini = datetime.now().strftime("%Y-%m")
total_expense = sum(
    t["amount"] for t in summary["transactions"]
    if t["type"] == "expense" and t["date"].startswith(bulan_ini)
)
print(f"Total pengeluaran bulan ini: Rp {total_expense:,}")
```

---

### JavaScript / Node.js

```javascript
const BASE_URL = 'http://IP_VPS:9550';
const HEADERS = {
  'X-API-Key': 'fintrack-ext-key',
  'Content-Type': 'application/json'
};

// Helper fetch wrapper
async function fintrack(method, path, body = null) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

// Contoh penggunaan
const summary = await fintrack('GET', '/ext/summary');
console.log('Jumlah transaksi:', summary.transactions.length);

// Tambah pengeluaran
const tx = await fintrack('POST', '/ext/transactions', {
  type: 'expense',
  amount: 75000,
  category: 'Makanan',
  date: new Date().toISOString().split('T')[0],
  description: 'Makan malam'
});
console.log('Transaksi baru:', tx.id);

// Hapus transaksi
await fintrack('DELETE', `/ext/transactions/${tx.id}`);
```

---

### Bot Telegram (Python + python-telegram-bot)

Contoh command `/catat` untuk bot Telegram yang mencatat pengeluaran:

```python
import requests
from telegram import Update
from telegram.ext import CommandHandler, ContextTypes
from datetime import date

BASE_URL = "http://IP_VPS:9550"
API_KEY = "fintrack-ext-key"

async def catat(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Penggunaan: /catat <jumlah> <kategori> <keterangan>
    Contoh: /catat 25000 Transport Grab ke kantor
    """
    args = context.args
    if len(args) < 3:
        await update.message.reply_text(
            "Format: /catat <jumlah> <kategori> <keterangan>\n"
            "Contoh: /catat 25000 Transport Grab ke kantor"
        )
        return

    try:
        amount = int(args[0])
        category = args[1]
        description = " ".join(args[2:])

        res = requests.post(
            f"{BASE_URL}/ext/transactions",
            json={
                "type": "expense",
                "amount": amount,
                "category": category,
                "date": date.today().isoformat(),
                "description": description
            },
            headers={"X-API-Key": API_KEY, "Content-Type": "application/json"}
        )
        tx = res.json()

        if "error" in tx:
            await update.message.reply_text(f"❌ Gagal: {tx['error']}")
        else:
            await update.message.reply_text(
                f"✅ Pengeluaran dicatat!\n"
                f"💸 Rp {amount:,} — {category}\n"
                f"📝 {description}"
            )
    except Exception as e:
        await update.message.reply_text(f"❌ Error: {str(e)}")
```

---

## 10. Catatan & Batasan

### Keamanan
- API Key disimpan sebagai plain text di environment variable server — jangan commit ke repository publik
- Tidak ada rate limiting bawaan — tambahkan reverse proxy (nginx) jika diperlukan
- Gunakan HTTPS dengan SSL certificate jika server menghadap internet publik

### Konsistensi Data
- `id` transaksi/anggaran/tagihan/investasi menggunakan UUID v4 yang di-generate di VPS saat POST
- `created_at` menggunakan timezone server VPS (biasanya UTC)
- Tidak ada validasi duplikat — satu kategori bisa punya banyak transaksi, tapi anggaran per kategori hanya satu (divalidasi di frontend, bukan API)

### Ketergantungan
- Semua endpoint External API bergantung pada koneksi WebSocket antara VPS dan `database.py` di Windows 10
- Jika `database.py` tidak berjalan atau koneksi terputus, semua endpoint akan mengembalikan `HTTP 500` dengan pesan `"Database tidak terhubung"`
- Pantau status koneksi via: `GET http://IP_VPS:9550/api/status` → `{"connected": true/false}`

### Yang Tidak Tersedia di External API
| Fitur | Tersedia | Alternatif |
|---|---|---|
| Edit/update transaksi | ❌ | Hapus lama, tambah baru |
| Toggle aktif tagihan | ❌ | Gunakan UI web |
| Analisa AI saham | ❌ | Gunakan UI web |
| Resume laporan AI | ❌ | Gunakan UI web |
| Filter transaksi by bulan | ❌ | Filter hasil GET di sisi klien |

---

*Versi dokumen ini sesuai dengan FinTrack v1.2.x. Lihat [CHANGELOG.md](./CHANGELOG.md) untuk riwayat perubahan API.*
