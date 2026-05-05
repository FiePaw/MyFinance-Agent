'use strict';
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getPythonBridge } = require('./bridge');

const app = express();
const PORT = 9550;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve HTML for all non-API routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));

// ===== STATUS =====
app.get('/api/status', async (req, res) => {
  const bridge = getPythonBridge();
  try {
    const result = await bridge.send({ action: 'ping' });
    res.json({ connected: result.ok === true });
  } catch {
    res.json({ connected: false });
  }
});

// ===== TRANSACTIONS =====
app.get('/api/transactions', async (req, res) => {
  const bridge = getPythonBridge();
  try {
    const result = await bridge.send({ action: 'get_transactions' });
    res.json(result.data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/transactions', async (req, res) => {
  const bridge = getPythonBridge();
  const { type, amount, category, date, description } = req.body;
  if (!type || !amount || !category || !date) return res.status(400).json({ error: 'Field tidak lengkap' });
  const tx = { id: uuidv4(), type, amount: +amount, category, date, description: description || '', created_at: new Date().toISOString() };
  try {
    await bridge.send({ action: 'add_transaction', data: tx });
    res.json(tx);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/transactions/:id', async (req, res) => {
  const bridge = getPythonBridge();
  try {
    await bridge.send({ action: 'delete_transaction', id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== INVESTMENTS =====
app.get('/api/investments', async (req, res) => {
  const bridge = getPythonBridge();
  try {
    const result = await bridge.send({ action: 'get_investments' });
    res.json(result.data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== INVESTMENT AI — HARUS sebelum /:id agar tidak dikira parameter =====
app.post('/api/investments/ai/analyze', async (req, res) => {
  const bridge = getPythonBridge();
  try {
    const result = await bridge.send({ action: 'ai_analyze', data: req.body }, 900000);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/investments/ai/dashboard', async (req, res) => {
  const bridge = getPythonBridge();
  try {
    const result = await bridge.send({ action: 'ai_dashboard', force: !!req.body.force }, 900000);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== INVESTMENTS CRUD /:id =====
app.post('/api/investments', async (req, res) => {
  const bridge = getPythonBridge();
  const { code, name, shares, buy_price, buy_date, notes } = req.body;
  if (!code || !name || !shares || !buy_price || !buy_date)
    return res.status(400).json({ error: 'Field tidak lengkap' });
  const inv = { id: uuidv4(), code: code.toUpperCase(), name, shares: +shares, buy_price: +buy_price, buy_date, notes: notes || '', created_at: new Date().toISOString() };
  try {
    await bridge.send({ action: 'add_investment', data: inv });
    res.json(inv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/investments/:id', async (req, res) => {
  const bridge = getPythonBridge();
  try {
    await bridge.send({ action: 'update_investment', id: req.params.id, data: req.body });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/investments/:id', async (req, res) => {
  const bridge = getPythonBridge();
  try {
    await bridge.send({ action: 'delete_investment', id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== BILLS (Tagihan Rutin) =====
app.get('/api/bills', async (req, res) => {
  const bridge = getPythonBridge();
  try {
    const result = await bridge.send({ action: 'get_bills' });
    res.json(result.data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bills', async (req, res) => {
  const bridge = getPythonBridge();
  const { name, amount, due_day, category, autodebit, notes } = req.body;
  if (!name || !amount || !due_day || !category)
    return res.status(400).json({ error: 'Field tidak lengkap' });
  const bill = { id: uuidv4(), name, amount: +amount, due_day: +due_day, category, autodebit: !!autodebit, notes: notes || '', active: true, created_at: new Date().toISOString() };
  try {
    await bridge.send({ action: 'add_bill', data: bill });
    res.json(bill);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/bills/:id', async (req, res) => {
  const bridge = getPythonBridge();
  try {
    await bridge.send({ action: 'update_bill', id: req.params.id, data: req.body });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/bills/:id', async (req, res) => {
  const bridge = getPythonBridge();
  try {
    await bridge.send({ action: 'delete_bill', id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== REPORT AI =====
app.post('/api/report/ai', async (req, res) => {
  const bridge = getPythonBridge();
  try {
    const result = await bridge.send({ action: 'ai_report', data: req.body }, 900000);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== EXTERNAL / PUBLIC API (for external apps) =====
// Auth via X-API-Key header (simple shared key — set env EXT_API_KEY)
const EXT_API_KEY = process.env.EXT_API_KEY || 'fintrack-ext-key';
function extAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (key !== EXT_API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Summary
app.get('/ext/summary', extAuth, async (req, res) => {
  const bridge = getPythonBridge();
  try {
    const [txRes, invRes, billRes] = await Promise.all([
      bridge.send({ action: 'get_transactions' }),
      bridge.send({ action: 'get_investments' }),
      bridge.send({ action: 'get_bills' }),
    ]);
    res.json({ transactions: txRes.data||[], investments: invRes.data||[], bills: billRes.data||[] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Transactions CRUD (external)
app.get('/ext/transactions', extAuth, async (req, res) => {
  const bridge = getPythonBridge();
  try { const r = await bridge.send({ action: 'get_transactions' }); res.json(r.data||[]); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/ext/transactions', extAuth, async (req, res) => {
  const bridge = getPythonBridge();
  const { type, amount, category, date, description } = req.body;
  if (!type || !amount || !category || !date) return res.status(400).json({ error: 'Field tidak lengkap' });
  const tx = { id: uuidv4(), type, amount: +amount, category, date, description: description||'', created_at: new Date().toISOString() };
  try { await bridge.send({ action: 'add_transaction', data: tx }); res.json(tx); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/ext/transactions/:id', extAuth, async (req, res) => {
  const bridge = getPythonBridge();
  try { await bridge.send({ action: 'delete_transaction', id: req.params.id }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Bills CRUD (external)
app.get('/ext/bills', extAuth, async (req, res) => {
  const bridge = getPythonBridge();
  try { const r = await bridge.send({ action: 'get_bills' }); res.json(r.data||[]); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/ext/bills', extAuth, async (req, res) => {
  const bridge = getPythonBridge();
  const { name, amount, due_day, category, autodebit, notes } = req.body;
  if (!name || !amount || !due_day || !category) return res.status(400).json({ error: 'Field tidak lengkap' });
  const bill = { id: uuidv4(), name, amount: +amount, due_day: +due_day, category, autodebit: !!autodebit, notes: notes||'', active: true, created_at: new Date().toISOString() };
  try { await bridge.send({ action: 'add_bill', data: bill }); res.json(bill); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/ext/bills/:id', extAuth, async (req, res) => {
  const bridge = getPythonBridge();
  try { await bridge.send({ action: 'delete_bill', id: req.params.id }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Investments CRUD (external)
app.get('/ext/investments', extAuth, async (req, res) => {
  const bridge = getPythonBridge();
  try { const r = await bridge.send({ action: 'get_investments' }); res.json(r.data||[]); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/ext/investments', extAuth, async (req, res) => {
  const bridge = getPythonBridge();
  const { code, name, shares, buy_price, buy_date, notes } = req.body;
  if (!code || !name || !shares || !buy_price || !buy_date) return res.status(400).json({ error: 'Field tidak lengkap' });
  const inv = { id: uuidv4(), code: code.toUpperCase(), name, shares: +shares, buy_price: +buy_price, buy_date, notes: notes||'', created_at: new Date().toISOString() };
  try { await bridge.send({ action: 'add_investment', data: inv }); res.json(inv); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/ext/investments/:id', extAuth, async (req, res) => {
  const bridge = getPythonBridge();
  try { await bridge.send({ action: 'delete_investment', id: req.params.id }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`FinTrack server running on port ${PORT}`));