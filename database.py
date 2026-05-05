"""
FinTrack - Python Database Client (Windows 10)
Menghubungkan JSON database lokal ke VPS via WebSocket
"""

import asyncio
import json
import os
import uuid
import logging
import sys
import time
import urllib.request
import urllib.parse
from datetime import datetime, date
from pathlib import Path

import re
import websockets

def clean_qwen_json(raw: str) -> str:
    """Bersihkan output Qwen sebelum di-parse JSON."""
    text = raw.strip()

    # 1. Strip markdown fences ```json ... ```
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()

    # 2. Hapus citation markers: [[n]], [[n,m]], [n], 【n】
    text = re.sub(r'\[\[[\d,\s]+\]\]', '', text)
    text = re.sub(r'\[[\d]+\]', '', text)
    text = re.sub(r'【[\d]+】', '', text)

    # 3. Hapus markdown links [text](url) → ganti dengan text saja
    #    Ini menangani kasus Qwen menempel [investor.id](http://...) di dalam nilai string
    text = re.sub(r'\[([^\]]*)\]\(http[^\)]*\)', r'\1', text)

    # 4. Hapus control characters tidak valid (kecuali \t \n \r — akan dihandle di langkah 5)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)

    # 5. Fix newline/tab literal di dalam string JSON value
    #    Strategi: parse karakter per karakter, di dalam string JSON
    #    ganti \n \r \t literal → \\n \\r \\t
    result = []
    in_string = False
    escape_next = False
    for ch in text:
        if escape_next:
            result.append(ch)
            escape_next = False
            continue
        if ch == '\\' and in_string:
            result.append(ch)
            escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
            result.append(ch)
            continue
        if in_string:
            if ch == '\n':
                result.append('\\n')
            elif ch == '\r':
                result.append('\\r')
            elif ch == '\t':
                result.append('\\t')
            else:
                result.append(ch)
        else:
            result.append(ch)

    return ''.join(result)

# ===== KONFIGURASI =====
VPS_HOST = "108.137.15.61"       # Ganti dengan IP/domain VPS
VPS_PORT = 9560                  # Harus sama dengan WS_PORT di server Node.js
RECONNECT_DELAY     = 5          # Detik delay awal sebelum reconnect
RECONNECT_MAX_DELAY = 60         # Batas maksimum delay reconnect (detik)
DB_FILE = Path(__file__).parent / "fintrack_db.json"

# Qwen AI Server
QWEN_BASE = "http://108.137.15.61:9000"
# Cache dashboard AI — refresh setiap 24 jam
_ai_cache = {"dashboard": None, "dashboard_ts": 0}
# Session ID Qwen untuk continue mode (1 session khusus investasi)
_qwen_session_id = None

# ===== LOGGING =====
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(Path(__file__).parent / "fintrack.log", encoding="utf-8"),
    ],
)
log = logging.getLogger("fintrack")


# ===== DATABASE =====
def load_db() -> dict:
    if DB_FILE.exists():
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "transactions" not in data:
                    data["transactions"] = []
                if "investments" not in data:
                    data["investments"] = []
                if "bills" not in data:
                    data["bills"] = []
                if "report_ai" not in data:
                    data["report_ai"] = {}
                return data
        except (json.JSONDecodeError, IOError) as e:
            log.error(f"Gagal membaca database: {e}")
    return {"transactions": [], "investments": [], "bills": [], "report_ai": {}}


def save_db(data: dict) -> bool:
    try:
        tmp = DB_FILE.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        tmp.replace(DB_FILE)
        return True
    except IOError as e:
        log.error(f"Gagal menyimpan database: {e}")
        return False


# ===== HANDLERS =====
def handle_ping(_payload: dict, db: dict) -> dict:
    return {"ok": True, "timestamp": datetime.now().isoformat()}


def handle_get_transactions(_payload: dict, db: dict) -> dict:
    return {"ok": True, "data": db["transactions"]}


def handle_add_transaction(payload: dict, db: dict) -> dict:
    tx = payload.get("data")
    if not tx:
        return {"ok": False, "error": "Data transaksi tidak ada"}
    required = ["id", "type", "amount", "category", "date"]
    for f in required:
        if f not in tx:
            return {"ok": False, "error": f"Field '{f}' tidak ada"}
    db["transactions"].append(tx)
    if not save_db(db):
        db["transactions"].pop()
        return {"ok": False, "error": "Gagal menyimpan ke database"}
    log.info(f"Transaksi ditambahkan: {tx['type']} {tx['amount']} - {tx['category']}")
    return {"ok": True}


def handle_delete_transaction(payload: dict, db: dict) -> dict:
    tx_id = payload.get("id")
    if not tx_id:
        return {"ok": False, "error": "ID tidak ada"}
    before = len(db["transactions"])
    db["transactions"] = [t for t in db["transactions"] if t["id"] != tx_id]
    if len(db["transactions"]) == before:
        return {"ok": False, "error": "Transaksi tidak ditemukan"}
    if not save_db(db):
        return {"ok": False, "error": "Gagal menyimpan ke database"}
    log.info(f"Transaksi dihapus: {tx_id}")
    return {"ok": True}


# ===== INVESTMENT HANDLERS =====
def handle_get_investments(_payload: dict, db: dict) -> dict:
    return {"ok": True, "data": db["investments"]}


def handle_add_investment(payload: dict, db: dict) -> dict:
    inv = payload.get("data")
    if not inv:
        return {"ok": False, "error": "Data investasi tidak ada"}
    required = ["id", "code", "name", "shares", "buy_price", "buy_date"]
    for f in required:
        if f not in inv:
            return {"ok": False, "error": f"Field '{f}' tidak ada"}
    db["investments"].append(inv)
    if not save_db(db):
        db["investments"].pop()
        return {"ok": False, "error": "Gagal menyimpan ke database"}
    log.info(f"Investasi ditambahkan: {inv['code']} {inv['shares']} lembar")
    return {"ok": True}


def handle_update_investment(payload: dict, db: dict) -> dict:
    inv_id = payload.get("id")
    data = payload.get("data", {})
    for i, inv in enumerate(db["investments"]):
        if inv["id"] == inv_id:
            db["investments"][i].update(data)
            if not save_db(db):
                return {"ok": False, "error": "Gagal menyimpan"}
            return {"ok": True}
    return {"ok": False, "error": "Investasi tidak ditemukan"}


def handle_delete_investment(payload: dict, db: dict) -> dict:
    inv_id = payload.get("id")
    before = len(db["investments"])
    db["investments"] = [i for i in db["investments"] if i["id"] != inv_id]
    if len(db["investments"]) == before:
        return {"ok": False, "error": "Investasi tidak ditemukan"}
    if not save_db(db):
        return {"ok": False, "error": "Gagal menyimpan"}
    log.info(f"Investasi dihapus: {inv_id}")
    return {"ok": True}


# ===== BILL HANDLERS =====
def handle_get_bills(_payload: dict, db: dict) -> dict:
    return {"ok": True, "data": db["bills"]}


def handle_add_bill(payload: dict, db: dict) -> dict:
    bill = payload.get("data")
    if not bill:
        return {"ok": False, "error": "Data tagihan tidak ada"}
    required = ["id", "name", "amount", "due_day", "category"]
    for f in required:
        if f not in bill:
            return {"ok": False, "error": f"Field '{f}' tidak ada"}
    db["bills"].append(bill)
    if not save_db(db):
        db["bills"].pop()
        return {"ok": False, "error": "Gagal menyimpan"}
    log.info(f"Tagihan ditambahkan: {bill['name']} Rp{bill['amount']}")
    return {"ok": True}


def handle_update_bill(payload: dict, db: dict) -> dict:
    bill_id = payload.get("id")
    data = payload.get("data", {})
    for i, bill in enumerate(db["bills"]):
        if bill["id"] == bill_id:
            db["bills"][i].update(data)
            if not save_db(db):
                return {"ok": False, "error": "Gagal menyimpan"}
            return {"ok": True}
    return {"ok": False, "error": "Tagihan tidak ditemukan"}


def handle_delete_bill(payload: dict, db: dict) -> dict:
    bill_id = payload.get("id")
    before = len(db["bills"])
    db["bills"] = [b for b in db["bills"] if b["id"] != bill_id]
    if len(db["bills"]) == before:
        return {"ok": False, "error": "Tagihan tidak ditemukan"}
    if not save_db(db):
        return {"ok": False, "error": "Gagal menyimpan"}
    log.info(f"Tagihan dihapus: {bill_id}")
    return {"ok": True}


# ===== QWEN AI HELPERS =====
def qwen_call(prompt: str, use_session: bool = True) -> str:
    """Panggil Qwen server. Gunakan continue mode setelah warm-up."""
    global _qwen_session_id
    headers_req = {"Content-Type": "application/json"}
    if use_session and _qwen_session_id:
        headers_req["X-Session-ID"] = _qwen_session_id

    body = json.dumps({
        "model": "qwen",
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "think_mode": "thinking"
    }).encode()

    req = urllib.request.Request(
        f"{QWEN_BASE}/v1/chat/completions",
        data=body,
        headers=headers_req,
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            raw = json.loads(resp.read().decode())
            # Simpan/perbarui session ID untuk continue mode
            new_sid = raw.get("x_meta", {}).get("session_id") or resp.headers.get("X-Session-ID")
            if new_sid:
                _qwen_session_id = new_sid
            return raw["choices"][0]["message"]["content"]
    except Exception as e:
        log.error(f"Qwen error: {e}")
        raise


def qwen_warmup():
    """Warm-up session dengan system prompt investasi Indonesia."""
    global _qwen_session_id
    if _qwen_session_id:
        return  # sudah warm-up
    system_prompt = (
        "Instruction: in this chat Always using internet or web browser for some new data"
        "Kamu adalah analis keuangan dan investasi saham Indonesia yang berpengalaman. "
        "Kamu memiliki akses ke informasi terkini tentang Bursa Efek Indonesia (BEI/IDX), "
        "IHSG, saham-saham Indonesia, berita ekonomi, dan geopolitik global yang mempengaruhi pasar Indonesia. "
        "Selalu jawab dalam Bahasa Indonesia. "
        "Saat diminta data harga saham atau IHSG, berikan estimasi terkini berdasarkan pengetahuanmu beserta disclaimer. "
        "Format jawaban JSON bila diminta JSON."
    )
    try:
        qwen_call(system_prompt, use_session=False)
        log.info(f"Qwen warm-up selesai. Session: {_qwen_session_id}")
    except Exception as e:
        log.warning(f"Qwen warm-up gagal: {e}")


def handle_ai_dashboard(_payload: dict, db: dict) -> dict:
    """Ambil dashboard AI: IHSG, berita saham IDX, geopolitik. Cache 24 jam."""
    global _ai_cache
    now_ts = time.time()
    force_refresh = _payload.get("force", False)
    if not force_refresh and _ai_cache["dashboard"] and (now_ts - _ai_cache["dashboard_ts"]) < 86400:
        return {"ok": True, "data": _ai_cache["dashboard"], "cached": True}

    qwen_warmup()
    today_str = date.today().strftime("%d %B %Y")
    prompt = f"""Tanggal hari ini: {today_str}.
Berikan data berikut dalam format JSON yang valid (tanpa markdown, hanya JSON murni):
{{
  "ihsg": {{
    "value": <angka IHSG terkini estimasi>,
    "change": <perubahan poin>,
    "change_pct": <perubahan persen>,
    "status": "naik" | "turun" | "flat",
    "updated": "{today_str}"
  }},
  "top_movers": [
    {{"code": "KODE", "name": "Nama Perusahaan", "price": 0, "change_pct": 0.0, "direction": "up"|"down"}}
  ],
  "stock_news": [
    {{"title": "Judul berita saham IDX", "summary": "Ringkasan singkat", "date": "tanggal", "sentiment": "positif"|"negatif"|"netral", "url": "https://url-berita-asli.com/artikel", "source": "Nama Media"}}
  ],
  "geopolitik_news": [
    {{"title": "Judul berita geopolitik", "summary": "Ringkasan dan dampak ke pasar IDX", "date": "tanggal", "impact": "positif"|"negatif"|"netral", "url": "https://url-berita-asli.com/artikel", "source": "Nama Media"}}
  ],
  "market_summary": "Ringkasan kondisi pasar saham Indonesia hari ini dalam 2-3 kalimat."
}}
Isi dengan data aktual terbaru yang kamu ketahui. top_movers berisi 5 saham, stock_news berisi 4 berita, geopolitik_news berisi 3 berita.
Untuk setiap berita, sertakan url artikel asli dari media keuangan terpercaya seperti kontan.co.id, bisnis.com, cnbcindonesia.com, detik.com/finance, atau reuters.com. Jika tidak yakin URL persis, berikan URL halaman utama seksi keuangan media tersebut."""

    try:
        raw = qwen_call(prompt)
        parsed = json.loads(clean_qwen_json(raw))
        _ai_cache["dashboard"] = parsed
        _ai_cache["dashboard_ts"] = now_ts
        return {"ok": True, "data": parsed, "cached": False}
    except Exception as e:
        log.error(f"AI dashboard error: {e}")
        return {"ok": False, "error": str(e)}


def handle_ai_analyze(payload: dict, db: dict) -> dict:
    """Analisa saham spesifik via Qwen. Simpan hasil ke DB di field ai_analysis."""
    data = payload.get("data", {})
    inv_id = data.get("id", "")
    code = data.get("code", "")
    name = data.get("name", "")
    shares = data.get("shares", 0)
    buy_price = data.get("buy_price", 0)

    qwen_warmup()
    today_str = date.today().strftime("%d %B %Y")
    prompt = f"""Tanggal hari ini: {today_str}.
Analisa saham berikut dan berikan respons dalam format JSON murni (tanpa markdown):
{{
  "code": "{code}",
  "name": "{name}",
  "current_price": <estimasi harga terkini>,
  "price_change": <perubahan harga dari {buy_price}>,
  "price_change_pct": <persen perubahan>,
  "profit_loss": <untung/rugi untuk {shares} lembar saham dengan harga beli {buy_price}>,
  "recommendation": "BELI" | "TAHAN" | "JUAL",
  "target_price": <target harga 1 bulan ke depan>,
  "stop_loss": <harga stop loss yang disarankan>,
  "risk_level": "Rendah" | "Sedang" | "Tinggi",
  "analysis": "Analisa fundamental dan teknikal singkat dalam 3-4 kalimat",
  "catalysts": ["faktor positif 1", "faktor positif 2"],
  "risks": ["risiko 1", "risiko 2"],
  "news": [
    {{"title": "Judul berita terkait {code}", "summary": "ringkasan", "sentiment": "positif"|"negatif"|"netral", "url": "https://url-berita-asli.com/artikel", "source": "Nama Media"}}
  ],
  "updated": "{today_str}"
}}
Harga beli investor: Rp {buy_price}, jumlah saham: {shares} lembar.
Untuk setiap berita terkait, sertakan url artikel asli dari media keuangan terpercaya (kontan.co.id, bisnis.com, cnbcindonesia.com, detik.com/finance, reuters.com). Jika tidak yakin URL persis, gunakan URL seksi keuangan media tersebut."""

    try:
        raw = qwen_call(prompt)
        parsed = json.loads(clean_qwen_json(raw))

        # Simpan hasil analisa ke record investasi di DB
        if inv_id:
            for i, inv in enumerate(db["investments"]):
                if inv["id"] == inv_id:
                    db["investments"][i]["ai_analysis"] = parsed
                    db["investments"][i]["ai_analysis_at"] = datetime.now().isoformat()
                    save_db(db)
                    log.info(f"Analisa AI disimpan untuk {code} ({inv_id})")
                    break

        return {"ok": True, "data": parsed}
    except Exception as e:
        log.error(f"AI analyze error: {e}")
        return {"ok": False, "error": str(e)}


def handle_ai_report(payload: dict, db: dict) -> dict:
    """Analisa laporan keuangan bulanan via Qwen AI. Simpan hasil ke DB per bulan."""
    data = payload.get("data", {})
    month_label = data.get("month_label", "")
    month_key   = data.get("month_key", "")      # format YYYY-MM
    force       = data.get("force", False)
    income = data.get("income", 0)
    expense = data.get("expense", 0)
    balance = data.get("balance", 0)
    saving_rate = data.get("saving_rate", 0)
    top_expense_cats = data.get("top_expense_cats", [])
    top_income_cats = data.get("top_income_cats", [])
    tx_count = data.get("tx_count", 0)

    # Pastikan key report_ai ada di DB
    if "report_ai" not in db:
        db["report_ai"] = {}

    # Return cached jika sudah ada dan tidak force
    if not force and month_key and month_key in db["report_ai"]:
        cached = db["report_ai"][month_key]
        log.info(f"AI report cache hit: {month_key}")
        return {"ok": True, "data": cached["result"], "cached": True, "analyzed_at": cached.get("analyzed_at")}

    qwen_warmup()
    today_str = date.today().strftime("%d %B %Y")

    cats_str = ", ".join([f"{c['name']} (Rp{c['amount']:,})" for c in top_expense_cats]) or "Tidak ada"
    income_str = ", ".join([f"{c['name']} (Rp{c['amount']:,})" for c in top_income_cats]) or "Tidak ada"

    prompt = f"""Tanggal hari ini: {today_str}.
Analisa laporan keuangan pribadi berikut untuk bulan {month_label} dan berikan respons dalam format JSON murni (tanpa markdown):
{{
  "health_score": <skor kesehatan keuangan 0-100>,
  "health_label": "Sangat Baik" | "Baik" | "Cukup" | "Perlu Perhatian" | "Kritis",
  "health_color": "green" | "cyan" | "yellow" | "orange" | "red",
  "summary": "Ringkasan kondisi keuangan bulan ini dalam 2-3 kalimat.",
  "highlights": [
    {{"icon": "emoji", "label": "Judul insight", "value": "nilai atau info penting", "type": "positive"|"negative"|"neutral"}}
  ],
  "spending_analysis": "Analisa pola pengeluaran terbesar dan apakah wajar dalam 2-3 kalimat.",
  "saving_analysis": "Analisa tingkat tabungan dan apakah sudah cukup dalam 1-2 kalimat.",
  "recommendations": [
    {{"title": "Judul rekomendasi", "detail": "Penjelasan singkat apa yang perlu dilakukan"}}
  ],
  "warnings": [
    {{"title": "Judul peringatan", "detail": "Penjelasan risiko atau hal yang perlu diwaspadai"}}
  ],
  "next_month_tips": "Tips atau target keuangan untuk bulan depan dalam 1-2 kalimat."
}}

Data keuangan bulan {month_label}:
- Total Pemasukan: Rp{income:,}
- Total Pengeluaran: Rp{expense:,}
- Saldo Bersih: Rp{balance:,}
- Tingkat Tabungan: {saving_rate}%
- Jumlah Transaksi: {tx_count}
- Pengeluaran terbesar per kategori: {cats_str}
- Sumber pemasukan: {income_str}

Berikan highlights 4-5 poin penting, recommendations 2-3 poin, warnings 0-2 poin (hanya jika ada yang perlu diwaspadai)."""

    try:
        raw = qwen_call(prompt)
        parsed = json.loads(clean_qwen_json(raw))
        log.info(f"AI report selesai untuk {month_label}: score={parsed.get('health_score')}")

        # Simpan ke DB
        if month_key:
            db["report_ai"][month_key] = {
                "result": parsed,
                "analyzed_at": datetime.now().isoformat()
            }
            save_db(db)
            log.info(f"AI report disimpan: {month_key}")

        return {"ok": True, "data": parsed, "cached": False, "analyzed_at": datetime.now().isoformat()}
    except Exception as e:
        log.error(f"AI report error: {e}")
        return {"ok": False, "error": str(e)}


HANDLERS = {
    "ping": handle_ping,
    "get_transactions": handle_get_transactions,
    "add_transaction": handle_add_transaction,
    "delete_transaction": handle_delete_transaction,
    # Investments
    "get_investments": handle_get_investments,
    "add_investment": handle_add_investment,
    "update_investment": handle_update_investment,
    "delete_investment": handle_delete_investment,
    # Bills
    "get_bills": handle_get_bills,
    "add_bill": handle_add_bill,
    "update_bill": handle_update_bill,
    "delete_bill": handle_delete_bill,
    # AI
    "ai_dashboard": handle_ai_dashboard,
    "ai_analyze": handle_ai_analyze,
    "ai_report": handle_ai_report,
}


# ===== PROCESS MESSAGE =====
def process_message(raw: str, db: dict) -> str:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return json.dumps({"ok": False, "error": "JSON tidak valid", "req_id": ""})

    req_id = payload.get("req_id", "")
    action = payload.get("action", "")
    handler = HANDLERS.get(action)

    if not handler:
        response = {"ok": False, "error": f"Action '{action}' tidak dikenal", "req_id": req_id}
    else:
        try:
            result = handler(payload, db)
            result["req_id"] = req_id
            response = result
        except Exception as e:
            log.exception(f"Error menjalankan action '{action}': {e}")
            response = {"ok": False, "error": str(e), "req_id": req_id}

    return json.dumps(response, ensure_ascii=False)


# ===== WEBSOCKET CLIENT =====
async def connect_and_serve():
    uri = f"ws://{VPS_HOST}:{VPS_PORT}"
    db = load_db()
    log.info(f"Database dimuat: {len(db['transactions'])} transaksi, {len(db['investments'])} investasi")

    delay = RECONNECT_DELAY  # delay saat ini (akan naik eksponensial jika gagal terus)

    while True:
        try:
            log.info(f"Menghubungkan ke {uri} ...")
            async with websockets.connect(
                uri,
                ping_interval=20,
                ping_timeout=10,
                open_timeout=10,
                close_timeout=5,
            ) as ws:
                log.info("Terhubung ke VPS!")
                delay = RECONNECT_DELAY  # reset delay setelah berhasil konek

                async for raw in ws:
                    # Reload db setiap pesan agar sinkron jika file diubah manual
                    db = load_db()
                    try:
                        response = process_message(raw, db)
                        await ws.send(response)
                    except Exception as e:
                        log.error(f"Error memproses pesan: {e}")
                        # Tetap lanjut, jangan putuskan koneksi hanya karena 1 pesan error

        except asyncio.CancelledError:
            log.info("Dihentikan oleh sistem.")
            break

        except websockets.exceptions.InvalidURI:
            log.error(f"URI tidak valid: {uri}. Periksa VPS_HOST dan VPS_PORT.")
            break  # URI salah → tidak ada gunanya retry

        except websockets.exceptions.ConnectionClosedError as e:
            # Koneksi putus tiba-tiba tanpa close frame (misal: VPS crash, network drop)
            log.warning(f"Koneksi terputus tiba-tiba (no close frame): {e}")

        except websockets.exceptions.ConnectionClosedOK:
            # Koneksi ditutup dengan normal oleh VPS (misal: server restart)
            log.info("Koneksi ditutup oleh VPS (normal close).")

        except (ConnectionRefusedError, OSError) as e:
            # Built-in Python error: VPS belum siap, port tertutup, atau network down
            log.warning(f"Koneksi ditolak / network error: {type(e).__name__}: {e}")

        except websockets.exceptions.WebSocketException as e:
            log.warning(f"Koneksi WebSocket error: {type(e).__name__}: {e}")

        except Exception as e:
            log.exception(f"Error tidak terduga: {e}")

        # Exponential backoff: 5s → 10s → 20s → 40s → max 60s
        log.info(f"Mencoba reconnect dalam {delay}s...")
        await asyncio.sleep(delay)
        delay = min(delay * 2, RECONNECT_MAX_DELAY)


# ===== ENTRY POINT =====
if __name__ == "__main__":
    print("=" * 50)
    print("  FinTrack - Database Client")
    print(f"  VPS: {VPS_HOST}:{VPS_PORT}")
    print(f"  Database: {DB_FILE}")
    print(f"  Qwen AI: {QWEN_BASE}")
    print("  Tekan Ctrl+C untuk berhenti")
    print("=" * 50)

    try:
        asyncio.run(connect_and_serve())
    except KeyboardInterrupt:
        print("\nDihentikan oleh pengguna.")