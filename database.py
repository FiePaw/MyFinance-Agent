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

import websockets

# ===== KONFIGURASI =====
VPS_HOST = "108.137.15.61"       # Ganti dengan IP/domain VPS
VPS_PORT = 9560                  # Harus sama dengan WS_PORT di server Node.js
RECONNECT_DELAY = 5              # Detik sebelum reconnect
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
                if "budgets" not in data:
                    data["budgets"] = []
                if "investments" not in data:
                    data["investments"] = []
                if "bills" not in data:
                    data["bills"] = []
                return data
        except (json.JSONDecodeError, IOError) as e:
            log.error(f"Gagal membaca database: {e}")
    return {"transactions": [], "budgets": [], "investments": [], "bills": []}


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


def handle_get_budgets(_payload: dict, db: dict) -> dict:
    return {"ok": True, "data": db["budgets"]}


def handle_add_budget(payload: dict, db: dict) -> dict:
    budget = payload.get("data")
    if not budget:
        return {"ok": False, "error": "Data anggaran tidak ada"}
    required = ["id", "category", "limit"]
    for f in required:
        if f not in budget:
            return {"ok": False, "error": f"Field '{f}' tidak ada"}
    # Cek duplikat kategori
    existing = [b for b in db["budgets"] if b["category"] == budget["category"]]
    if existing:
        return {"ok": False, "error": f"Anggaran untuk '{budget['category']}' sudah ada"}
    db["budgets"].append(budget)
    if not save_db(db):
        db["budgets"].pop()
        return {"ok": False, "error": "Gagal menyimpan ke database"}
    log.info(f"Anggaran ditambahkan: {budget['category']} - {budget['limit']}")
    return {"ok": True}


def handle_delete_budget(payload: dict, db: dict) -> dict:
    budget_id = payload.get("id")
    if not budget_id:
        return {"ok": False, "error": "ID tidak ada"}
    before = len(db["budgets"])
    db["budgets"] = [b for b in db["budgets"] if b["id"] != budget_id]
    if len(db["budgets"]) == before:
        return {"ok": False, "error": "Anggaran tidak ditemukan"}
    if not save_db(db):
        return {"ok": False, "error": "Gagal menyimpan ke database"}
    log.info(f"Anggaran dihapus: {budget_id}")
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
    if _ai_cache["dashboard"] and (now_ts - _ai_cache["dashboard_ts"]) < 86400:
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
    {{"title": "Judul berita saham IDX", "summary": "Ringkasan singkat", "date": "tanggal", "sentiment": "positif"|"negatif"|"netral"}}
  ],
  "geopolitik_news": [
    {{"title": "Judul berita geopolitik", "summary": "Ringkasan dan dampak ke pasar IDX", "date": "tanggal", "impact": "positif"|"negatif"|"netral"}}
  ],
  "market_summary": "Ringkasan kondisi pasar saham Indonesia hari ini dalam 2-3 kalimat."
}}
Isi dengan data aktual terbaru yang kamu ketahui. top_movers berisi 5 saham, stock_news berisi 4 berita, geopolitik_news berisi 3 berita."""

    try:
        raw = qwen_call(prompt)
        # Bersihkan jika ada markdown fence
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        parsed = json.loads(cleaned.strip())
        _ai_cache["dashboard"] = parsed
        _ai_cache["dashboard_ts"] = now_ts
        return {"ok": True, "data": parsed, "cached": False}
    except Exception as e:
        log.error(f"AI dashboard error: {e}")
        return {"ok": False, "error": str(e)}


def handle_ai_analyze(payload: dict, db: dict) -> dict:
    """Analisa saham spesifik via Qwen."""
    data = payload.get("data", {})
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
    {{"title": "Judul berita terkait {code}", "summary": "ringkasan", "sentiment": "positif"|"negatif"|"netral"}}
  ],
  "updated": "{today_str}"
}}
Harga beli investor: Rp {buy_price}, jumlah saham: {shares} lembar."""

    try:
        raw = qwen_call(prompt)
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        parsed = json.loads(cleaned.strip())
        return {"ok": True, "data": parsed}
    except Exception as e:
        log.error(f"AI analyze error: {e}")
        return {"ok": False, "error": str(e)}


HANDLERS = {
    "ping": handle_ping,
    "get_transactions": handle_get_transactions,
    "add_transaction": handle_add_transaction,
    "delete_transaction": handle_delete_transaction,
    "get_budgets": handle_get_budgets,
    "add_budget": handle_add_budget,
    "delete_budget": handle_delete_budget,
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
    log.info(f"Database dimuat: {len(db['transactions'])} transaksi, {len(db['budgets'])} anggaran")

    while True:
        try:
            log.info(f"Menghubungkan ke {uri} ...")
            async with websockets.connect(
                uri,
                ping_interval=20,
                ping_timeout=10,
                open_timeout=10,
            ) as ws:
                log.info("Terhubung ke VPS!")
                async for raw in ws:
                    # Reload db setiap pesan untuk sinkronisasi (jika diubah manual)
                    db = load_db()
                    response = process_message(raw, db)
                    await ws.send(response)

        except websockets.exceptions.ConnectionRefusedError:
            log.warning(f"Koneksi ditolak. VPS belum siap atau port salah. Mencoba lagi dalam {RECONNECT_DELAY}s...")
        except websockets.exceptions.InvalidURI:
            log.error(f"URI tidak valid: {uri}. Periksa VPS_HOST dan VPS_PORT.")
            break
        except (websockets.exceptions.WebSocketException, OSError) as e:
            log.warning(f"Koneksi terputus: {e}. Mencoba lagi dalam {RECONNECT_DELAY}s...")
        except asyncio.CancelledError:
            log.info("Dihentikan.")
            break
        except Exception as e:
            log.exception(f"Error tidak terduga: {e}")

        await asyncio.sleep(RECONNECT_DELAY)


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