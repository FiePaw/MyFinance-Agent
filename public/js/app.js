'use strict';
// ===== STATE =====
const state = {
  transactions: [],
  budgets: [],
  investments: [],
  bills: [],
  dbConnected: false,
};

const CATEGORIES_EXPENSE = ['Makanan','Transport','Belanja','Tagihan','Hiburan','Kesehatan','Pendidikan','Lainnya'];
const CHART_COLORS = ['#06B6D4','#38BDF8','#0EA5E9','#10B981','#F59E0B','#F43F5E','#8B5CF6','#FB923C'];
let cashflowChart = null, categoryChart = null, reportBarChart = null, reportPieChart = null;
let deleteCallback = null;
let allPage = 1; const ALL_PER_PAGE = 15;

// ===== API =====
const API = {
  base: '/api',
  async get(path) {
    const r = await fetch(this.base + path);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async post(path, data) {
    const r = await fetch(this.base + path, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async put(path, data) {
    const r = await fetch(this.base + path, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async del(path) {
    const r = await fetch(this.base + path, { method:'DELETE' });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
};

// ===== UTILS =====
const fmt = n => 'Rp ' + Math.abs(n).toLocaleString('id-ID');
const fmtDate = d => new Date(d).toLocaleDateString('id-ID', {day:'2-digit', month:'short', year:'numeric'});
const fmtShort = d => new Date(d).toLocaleDateString('id-ID', {day:'2-digit', month:'short'});
const nowDate = () => new Date().toISOString().split('T')[0];
const monthKey = d => d.slice(0,7);
const monthLabel = k => { const [y,m] = k.split('-'); const months=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des']; return months[+m-1]+' '+y; };
const getPct = (a,b) => b > 0 ? Math.min(Math.round(a/b*100), 200) : 0;

function showToast(msg, type='success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

function confirm(title, msg, cb) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalMsg').textContent = msg;
  document.getElementById('modalOverlay').classList.add('active');
  deleteCallback = cb;
}

// ===== NAVIGATION =====
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  closeSidebar();

  if (page === 'dashboard') renderDashboard();
  else if (page === 'pemasukan') renderIncomeTable();
  else if (page === 'pengeluaran') renderExpenseTable();
  else if (page === 'laporan') renderReport();
  else if (page === 'transaksi') { allPage = 1; renderAllTable(); }
  else if (page === 'anggaran') renderBudgets();
  else if (page === 'investasi') renderInvestasi();
  else if (page === 'tagihan') renderTagihan();
}

document.querySelectorAll('.nav-item, .see-all').forEach(el => {
  el.addEventListener('click', e => { e.preventDefault(); navigate(el.dataset.page); });
});

// ===== MOBILE SIDEBAR =====
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');
document.getElementById('menuBtn').addEventListener('click', () => {
  sidebar.classList.add('open');
  overlay.classList.add('active');
});
function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
}
overlay.addEventListener('click', closeSidebar);

// ===== MODAL =====
document.getElementById('modalCancel').addEventListener('click', () => {
  document.getElementById('modalOverlay').classList.remove('active');
});
document.getElementById('modalConfirm').addEventListener('click', () => {
  document.getElementById('modalOverlay').classList.remove('active');
  if (deleteCallback) { deleteCallback(); deleteCallback = null; }
});

// ===== DB STATUS =====
function setStatus(connected) {
  state.dbConnected = connected;
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  dot.className = 'status-dot ' + (connected ? 'connected' : 'error');
  txt.textContent = connected ? 'Database Terhubung' : 'Tidak Terhubung';
}

// ===== LOAD DATA =====
async function loadAll() {
  try {
    const [txData, budgetData, statusData, invData, billData] = await Promise.all([
      API.get('/transactions'),
      API.get('/budgets'),
      API.get('/status'),
      API.get('/investments'),
      API.get('/bills'),
    ]);
    state.transactions = txData;
    state.budgets = budgetData;
    state.investments = invData;
    state.bills = billData;
    setStatus(statusData.connected);
    renderDashboard();
    populateMonthFilters();
  } catch (e) {
    setStatus(false);
    showToast('Gagal memuat data: ' + e.message, 'error');
  }
}

function populateMonthFilters() {
  const months = [...new Set(state.transactions.map(t => monthKey(t.date)))].sort().reverse();
  ['filterIncomeMonth','filterExpenseMonth','filterAllMonth'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    el.innerHTML = '<option value="">Semua Bulan</option>';
    months.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = monthLabel(m); el.appendChild(o); });
    el.value = cur;
  });
}

// ===== DASHBOARD =====
function getPeriodTxs(period) {
  const now = new Date();
  const thisM = now.getFullYear()+'-'+(String(now.getMonth()+1).padStart(2,'0'));
  let lastMDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const lastM = lastMDate.getFullYear()+'-'+(String(lastMDate.getMonth()+1).padStart(2,'0'));
  const thisY = String(now.getFullYear());
  if (period === 'thisMonth') return state.transactions.filter(t => monthKey(t.date) === thisM);
  if (period === 'lastMonth') return state.transactions.filter(t => monthKey(t.date) === lastM);
  if (period === 'thisYear') return state.transactions.filter(t => t.date.startsWith(thisY));
  return state.transactions;
}

function renderDashboard() {
  const period = document.getElementById('dashPeriod').value;
  const txs = getPeriodTxs(period);
  const income = txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expense = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const balance = income - expense;
  const savingRate = income > 0 ? Math.round((income-expense)/income*100) : 0;

  document.getElementById('totalBalance').textContent = fmt(balance);
  document.getElementById('totalIncome').textContent = fmt(income);
  document.getElementById('totalExpense').textContent = fmt(expense);
  document.getElementById('savingRate').textContent = savingRate + '%';

  // Date
  document.getElementById('currentDate').textContent = new Date().toLocaleDateString('id-ID', {weekday:'long', year:'numeric', month:'long', day:'numeric'});

  renderCashflowChart();
  renderCategoryChart(txs);
  renderBudgetStatus(txs);
  renderRecentTx(txs);
}

document.getElementById('dashPeriod').addEventListener('change', renderDashboard);

// ===== CASHFLOW CHART =====
function renderCashflowChart() {
  const months = [];
  const now = new Date();
  for (let i=5; i>=0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    months.push(d.getFullYear()+'-'+(String(d.getMonth()+1).padStart(2,'0')));
  }
  const incomes = months.map(m => state.transactions.filter(t=>t.type==='income'&&monthKey(t.date)===m).reduce((s,t)=>s+t.amount,0));
  const expenses = months.map(m => state.transactions.filter(t=>t.type==='expense'&&monthKey(t.date)===m).reduce((s,t)=>s+t.amount,0));
  const labels = months.map(monthLabel);

  const ctx = document.getElementById('cashflowChart').getContext('2d');
  if (cashflowChart) cashflowChart.destroy();
  cashflowChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Pemasukan', data:incomes, backgroundColor:'rgba(6,182,212,0.75)', borderRadius:6, borderSkipped:false },
        { label:'Pengeluaran', data:expenses, backgroundColor:'rgba(244,63,94,0.65)', borderRadius:6, borderSkipped:false },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false} },
      scales:{
        x:{ grid:{display:false}, ticks:{font:{size:11}, color:'#5B8DB8'} },
        y:{ grid:{color:'#E0F7FF'}, ticks:{callback:v=>'Rp'+Math.round(v/1000)+'K', font:{size:10}, color:'#5B8DB8'} }
      }
    }
  });
}

// ===== CATEGORY CHART =====
function renderCategoryChart(txs) {
  const expenses = txs.filter(t=>t.type==='expense');
  const catMap = {};
  expenses.forEach(t => { catMap[t.category] = (catMap[t.category]||0) + t.amount; });
  const cats = Object.keys(catMap);
  const vals = cats.map(c=>catMap[c]);
  const total = vals.reduce((s,v)=>s+v,0);
  document.getElementById('donutTotal').textContent = fmt(total);

  const ctx = document.getElementById('categoryChart').getContext('2d');
  if (categoryChart) categoryChart.destroy();
  categoryChart = new Chart(ctx, {
    type:'doughnut',
    data:{ labels:cats, datasets:[{ data:vals, backgroundColor:CHART_COLORS.slice(0,cats.length), borderWidth:0, hoverOffset:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'68%', plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>` ${c.label}: ${fmt(c.raw)}`}}} }
  });

  const legend = document.getElementById('donutLegend');
  legend.innerHTML = cats.map((c,i)=>`<div class="donut-legend-item"><div class="donut-legend-dot" style="background:${CHART_COLORS[i]}"></div><span>${c}</span></div>`).join('');
}

// ===== BUDGET STATUS (Dashboard) =====
function renderBudgetStatus(txs) {
  const list = document.getElementById('budgetList');
  const expenses = txs.filter(t=>t.type==='expense');
  if (!state.budgets.length) { list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.82rem">Belum ada anggaran</div>'; return; }
  list.innerHTML = state.budgets.slice(0,5).map(b => {
    const spent = expenses.filter(t=>t.category===b.category).reduce((s,t)=>s+t.amount,0);
    const pct = getPct(spent, b.limit);
    const cls = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
    const statusLabel = pct >= 100 ? 'Melebihi' : pct >= 80 ? 'Hampir' : 'Aman';
    return `<div class="budget-item">
      <div class="budget-item-header">
        <span class="budget-item-name">${b.category}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="budget-item-values">${fmt(spent)} / ${fmt(b.limit)}</span>
          <span class="budget-item-status ${cls}">${statusLabel}</span>
        </div>
      </div>
      <div class="progress-bar"><div class="progress-fill ${cls}" style="width:${Math.min(pct,100)}%"></div></div>
    </div>`;
  }).join('');
}

// ===== RECENT TRANSACTIONS =====
function renderRecentTx(txs) {
  const list = document.getElementById('recentList');
  const sorted = [...txs].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6);
  if (!sorted.length) { list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.82rem">Belum ada transaksi</div>'; return; }
  list.innerHTML = sorted.map(t => `
    <div class="tx-item">
      <div class="tx-icon ${t.type}">
        ${t.type==='income' ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>'}
      </div>
      <div class="tx-info">
        <div class="tx-cat">${t.category}</div>
        <div class="tx-desc">${t.description || '-'}</div>
      </div>
      <div style="text-align:right">
        <div class="tx-amount ${t.type}">${t.type==='income'?'+':'-'}${fmt(t.amount)}</div>
        <div class="tx-date">${fmtShort(t.date)}</div>
      </div>
    </div>
  `).join('');
}

// ===== INCOME TABLE =====
function renderIncomeTable() {
  const search = document.getElementById('searchIncome').value.toLowerCase();
  const month = document.getElementById('filterIncomeMonth').value;
  let txs = state.transactions.filter(t => t.type === 'income');
  if (month) txs = txs.filter(t => monthKey(t.date) === month);
  if (search) txs = txs.filter(t => t.category.toLowerCase().includes(search) || (t.description||'').toLowerCase().includes(search));
  txs = txs.sort((a,b) => new Date(b.date)-new Date(a.date));

  const tbody = document.getElementById('incomeBody');
  const empty = document.getElementById('incomeEmpty');
  if (!txs.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = txs.map(t => `
    <tr>
      <td>${fmtDate(t.date)}</td>
      <td><span class="cat-badge">${t.category}</span></td>
      <td>${t.description || '-'}</td>
      <td class="amount-income">+${fmt(t.amount)}</td>
      <td>
        <button class="action-btn delete" onclick="deleteTransaction('${t.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </td>
    </tr>`).join('');
}

['searchIncome','filterIncomeMonth'].forEach(id => document.getElementById(id)?.addEventListener('input', renderIncomeTable));

// ===== ADD INCOME =====
document.getElementById('btnAddIncome').addEventListener('click', () => {
  document.getElementById('incomeForm').style.display = 'block';
  document.getElementById('incomeDate').value = nowDate();
});
document.getElementById('cancelIncome').addEventListener('click', () => document.getElementById('incomeForm').style.display = 'none');
document.getElementById('saveIncome').addEventListener('click', async () => {
  const amount = +document.getElementById('incomeAmount').value;
  const category = document.getElementById('incomeCategory').value;
  const date = document.getElementById('incomeDate').value;
  const description = document.getElementById('incomeDesc').value;
  if (!amount || amount <= 0) return showToast('Masukkan jumlah yang valid', 'error');
  if (!date) return showToast('Pilih tanggal', 'error');
  try {
    const tx = await API.post('/transactions', { type:'income', amount, category, date, description });
    state.transactions.push(tx);
    document.getElementById('incomeForm').style.display = 'none';
    document.getElementById('incomeAmount').value = '';
    document.getElementById('incomeDesc').value = '';
    renderIncomeTable();
    populateMonthFilters();
    showToast('Pemasukan berhasil ditambahkan');
  } catch(e) { showToast('Gagal menyimpan: '+e.message, 'error'); }
});

// ===== EXPENSE TABLE =====
function renderExpenseTable() {
  const search = document.getElementById('searchExpense').value.toLowerCase();
  const month = document.getElementById('filterExpenseMonth').value;
  const cat = document.getElementById('filterExpenseCategory').value;
  let txs = state.transactions.filter(t => t.type === 'expense');
  if (month) txs = txs.filter(t => monthKey(t.date) === month);
  if (cat) txs = txs.filter(t => t.category === cat);
  if (search) txs = txs.filter(t => t.category.toLowerCase().includes(search) || (t.description||'').toLowerCase().includes(search));
  txs = txs.sort((a,b) => new Date(b.date)-new Date(a.date));

  const tbody = document.getElementById('expenseBody');
  const empty = document.getElementById('expenseEmpty');
  if (!txs.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = txs.map(t => `
    <tr>
      <td>${fmtDate(t.date)}</td>
      <td><span class="cat-badge">${t.category}</span></td>
      <td>${t.description || '-'}</td>
      <td class="amount-expense">-${fmt(t.amount)}</td>
      <td>
        <button class="action-btn delete" onclick="deleteTransaction('${t.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </td>
    </tr>`).join('');
}

['searchExpense','filterExpenseMonth','filterExpenseCategory'].forEach(id => document.getElementById(id)?.addEventListener('input', renderExpenseTable));

// ===== ADD EXPENSE =====
document.getElementById('btnAddExpense').addEventListener('click', () => {
  document.getElementById('expenseForm').style.display = 'block';
  document.getElementById('expenseDate').value = nowDate();
});
document.getElementById('cancelExpense').addEventListener('click', () => document.getElementById('expenseForm').style.display = 'none');
document.getElementById('saveExpense').addEventListener('click', async () => {
  const amount = +document.getElementById('expenseAmount').value;
  const category = document.getElementById('expenseCategory').value;
  const date = document.getElementById('expenseDate').value;
  const description = document.getElementById('expenseDesc').value;
  if (!amount || amount <= 0) return showToast('Masukkan jumlah yang valid', 'error');
  if (!date) return showToast('Pilih tanggal', 'error');
  try {
    const tx = await API.post('/transactions', { type:'expense', amount, category, date, description });
    state.transactions.push(tx);
    document.getElementById('expenseForm').style.display = 'none';
    document.getElementById('expenseAmount').value = '';
    document.getElementById('expenseDesc').value = '';
    renderExpenseTable();
    populateMonthFilters();
    showToast('Pengeluaran berhasil ditambahkan');
  } catch(e) { showToast('Gagal menyimpan: '+e.message, 'error'); }
});

// ===== DELETE TRANSACTION =====
window.deleteTransaction = (id) => {
  confirm('Hapus Transaksi', 'Apakah Anda yakin ingin menghapus transaksi ini?', async () => {
    try {
      await API.del('/transactions/' + id);
      state.transactions = state.transactions.filter(t => t.id !== id);
      renderIncomeTable(); renderExpenseTable(); renderAllTable(); populateMonthFilters();
      showToast('Transaksi berhasil dihapus');
    } catch(e) { showToast('Gagal menghapus: '+e.message, 'error'); }
  });
};

// ===== REPORT =====
function renderReport() {
  const year = +document.getElementById('reportYear').value;
  const month = +document.getElementById('reportMonth').value;
  const monthStr = year+'-'+(String(month).padStart(2,'0'));
  const txs = state.transactions.filter(t => monthKey(t.date) === monthStr);

  const income = txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expense = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const balance = income - expense;
  const saving = income > 0 ? Math.round((income-expense)/income*100) : 0;

  document.getElementById('rptIncome').textContent = fmt(income);
  document.getElementById('rptExpense').textContent = fmt(expense);
  document.getElementById('rptBalance').textContent = fmt(balance);
  document.getElementById('rptSaving').textContent = saving + '%';

  // Bar chart by category
  const catMap = {};
  txs.filter(t=>t.type==='expense').forEach(t => { catMap[t.category] = (catMap[t.category]||0)+t.amount; });
  const cats = Object.keys(catMap);
  const vals = cats.map(c=>catMap[c]);
  const totalExp = vals.reduce((s,v)=>s+v,0);
  document.getElementById('reportDonutTotal').textContent = fmt(totalExp);

  const barCtx = document.getElementById('reportBarChart').getContext('2d');
  if (reportBarChart) reportBarChart.destroy();
  reportBarChart = new Chart(barCtx, {
    type:'bar',
    data:{ labels:cats, datasets:[{ data:vals, backgroundColor:CHART_COLORS.slice(0,cats.length), borderRadius:6, borderSkipped:false }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false}, ticks:{font:{size:11}, color:'#5B8DB8'}}, y:{grid:{color:'#E0F7FF'}, ticks:{callback:v=>'Rp'+Math.round(v/1000)+'K', font:{size:10}, color:'#5B8DB8'}} } }
  });

  const pieCtx = document.getElementById('reportPieChart').getContext('2d');
  if (reportPieChart) reportPieChart.destroy();
  reportPieChart = new Chart(pieCtx, {
    type:'doughnut',
    data:{ labels:cats, datasets:[{ data:vals, backgroundColor:CHART_COLORS.slice(0,cats.length), borderWidth:0, hoverOffset:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'68%', plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>` ${c.label}: ${fmt(c.raw)}`}}} }
  });
  const rLegend = document.getElementById('reportDonutLegend');
  rLegend.innerHTML = cats.map((c,i)=>`<div class="donut-legend-item"><div class="donut-legend-dot" style="background:${CHART_COLORS[i]}"></div><span>${c}</span></div>`).join('');

  // Table
  const sorted = [...txs].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const tbody = document.getElementById('reportBody');
  const empty = document.getElementById('reportEmpty');
  if (!sorted.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = sorted.map(t=>`
    <tr>
      <td>${fmtDate(t.date)}</td>
      <td><span class="type-badge ${t.type}">${t.type==='income'?'Pemasukan':'Pengeluaran'}</span></td>
      <td><span class="cat-badge">${t.category}</span></td>
      <td>${t.description||'-'}</td>
      <td class="${t.type==='income'?'amount-income':'amount-expense'}">${t.type==='income'?'+':'-'}${fmt(t.amount)}</td>
    </tr>`).join('');
}

// init report year/month
function initReportFilters() {
  const yearSel = document.getElementById('reportYear');
  const now = new Date();
  for (let y = now.getFullYear(); y >= now.getFullYear()-3; y--) {
    const o = document.createElement('option'); o.value = y; o.textContent = y; yearSel.appendChild(o);
  }
  yearSel.value = now.getFullYear();
  document.getElementById('reportMonth').value = now.getMonth()+1;
}
['reportYear','reportMonth'].forEach(id => document.getElementById(id)?.addEventListener('change', () => {
  renderReport();
  // Reset AI section saat bulan berubah
  document.getElementById('reportAiSection').style.display = 'none';
  document.getElementById('reportAiContent').innerHTML = '';
}));

// ===== REPORT AI =====
document.getElementById('btnReportAI').addEventListener('click', loadReportAI);

async function loadReportAI() {
  const year = +document.getElementById('reportYear').value;
  const month = +document.getElementById('reportMonth').value;
  const monthStr = year + '-' + String(month).padStart(2, '0');
  const txs = state.transactions.filter(t => monthKey(t.date) === monthStr);

  if (!txs.length) return showToast('Tidak ada transaksi di bulan ini untuk dianalisa', 'error');

  const income = txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const expense = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const balance = income - expense;
  const saving_rate = income > 0 ? Math.round((income - expense) / income * 100) : 0;

  // Top expense categories
  const expCatMap = {};
  txs.filter(t=>t.type==='expense').forEach(t => { expCatMap[t.category] = (expCatMap[t.category]||0) + t.amount; });
  const top_expense_cats = Object.entries(expCatMap).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,amount])=>({name,amount}));

  // Top income categories
  const incCatMap = {};
  txs.filter(t=>t.type==='income').forEach(t => { incCatMap[t.category] = (incCatMap[t.category]||0) + t.amount; });
  const top_income_cats = Object.entries(incCatMap).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name,amount])=>({name,amount}));

  // Budget status bulan ini
  const budgets = state.budgets.map(b => {
    const spent = txs.filter(t=>t.type==='expense'&&t.category===b.category).reduce((s,t)=>s+t.amount,0);
    const pct = b.limit > 0 ? Math.round(spent/b.limit*100) : 0;
    return { category: b.category, pct };
  });

  const months = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const month_label = `${months[month]} ${year}`;

  const section = document.getElementById('reportAiSection');
  const loading = document.getElementById('reportAiLoading');
  const content = document.getElementById('reportAiContent');

  section.style.display = 'block';
  loading.style.display = 'flex';
  content.innerHTML = '';

  // Scroll ke section AI
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const res = await fetch('/api/report/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month_label, income, expense, balance, saving_rate, top_expense_cats, top_income_cats, tx_count: txs.length, budgets })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    loading.style.display = 'none';
    content.innerHTML = renderReportAIContent(data.data, month_label);
  } catch(e) {
    loading.style.display = 'none';
    content.innerHTML = `<div class="report-ai-error">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      Gagal menganalisa: ${e.message}
      <button class="btn-ghost btn-sm" onclick="loadReportAI()">Coba Lagi</button>
    </div>`;
    showToast('Gagal analisa laporan: ' + e.message, 'error');
  }
}

function renderReportAIContent(d, month_label) {
  const scoreColor = { green:'#10B981', cyan:'#06B6D4', yellow:'#F59E0B', orange:'#FB923C', red:'#F43F5E' }[d.health_color] || '#06B6D4';
  const scoreBg   = { green:'rgba(16,185,129,0.1)', cyan:'rgba(6,182,212,0.1)', yellow:'rgba(245,158,11,0.1)', orange:'rgba(251,146,60,0.1)', red:'rgba(244,63,94,0.1)' }[d.health_color] || 'rgba(6,182,212,0.1)';

  const highlightHTML = (d.highlights||[]).map(h => {
    const iconColor = h.type === 'positive' ? '#10B981' : h.type === 'negative' ? '#F43F5E' : '#06B6D4';
    return `<div class="rpt-highlight-card" style="border-color:${iconColor}20">
      <div class="rpt-hl-icon" style="color:${iconColor}">${h.icon || '📊'}</div>
      <div class="rpt-hl-body">
        <div class="rpt-hl-label">${h.label}</div>
        <div class="rpt-hl-value" style="color:${iconColor}">${h.value}</div>
      </div>
    </div>`;
  }).join('');

  const recHTML = (d.recommendations||[]).map(r => `
    <div class="rpt-rec-item">
      <div class="rpt-rec-dot positive"></div>
      <div><div class="rpt-rec-title">${r.title}</div><div class="rpt-rec-detail">${r.detail}</div></div>
    </div>`).join('');

  const warnHTML = (d.warnings||[]).map(w => `
    <div class="rpt-rec-item">
      <div class="rpt-rec-dot negative"></div>
      <div><div class="rpt-rec-title">${w.title}</div><div class="rpt-rec-detail">${w.detail}</div></div>
    </div>`).join('');

  return `
    <div class="report-ai-card">
      <div class="rpt-ai-header">
        <div class="rpt-ai-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Resume AI — ${month_label}
        </div>
        <button class="btn-ghost btn-sm" onclick="loadReportAI()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Analisa Ulang
        </button>
      </div>

      <!-- Health Score + Summary -->
      <div class="rpt-health-row">
        <div class="rpt-score-circle" style="--score-color:${scoreColor};--score-bg:${scoreBg}">
          <div class="rpt-score-inner">
            <div class="rpt-score-num" style="color:${scoreColor}">${d.health_score}</div>
            <div class="rpt-score-label">/ 100</div>
          </div>
          <svg class="rpt-score-ring" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="${scoreColor}20" stroke-width="10"/>
            <circle cx="60" cy="60" r="52" fill="none" stroke="${scoreColor}" stroke-width="10"
              stroke-dasharray="${Math.round(d.health_score * 3.267)} 326.7"
              stroke-dashoffset="81.7" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="rpt-health-right">
          <div class="rpt-health-label" style="color:${scoreColor}">${d.health_label}</div>
          <p class="rpt-summary-text">${d.summary}</p>
        </div>
      </div>

      <!-- Highlights -->
      <div class="rpt-section-title">📌 Poin Utama</div>
      <div class="rpt-highlights-grid">${highlightHTML}</div>

      <!-- Analysis -->
      <div class="rpt-two-col">
        <div class="rpt-analysis-block">
          <div class="rpt-section-title">💸 Analisa Pengeluaran</div>
          <p class="rpt-analysis-text">${d.spending_analysis || '-'}</p>
        </div>
        <div class="rpt-analysis-block">
          <div class="rpt-section-title">💰 Analisa Tabungan</div>
          <p class="rpt-analysis-text">${d.saving_analysis || '-'}</p>
        </div>
      </div>

      <!-- Recommendations & Warnings -->
      <div class="rpt-two-col">
        ${recHTML ? `<div class="rpt-analysis-block">
          <div class="rpt-section-title">✅ Rekomendasi</div>
          <div class="rpt-rec-list">${recHTML}</div>
        </div>` : ''}
        ${warnHTML ? `<div class="rpt-analysis-block">
          <div class="rpt-section-title">⚠️ Perhatian</div>
          <div class="rpt-rec-list">${warnHTML}</div>
        </div>` : ''}
      </div>

      <!-- Next Month Tips -->
      ${d.next_month_tips ? `
      <div class="rpt-next-tip">
        <div class="rpt-section-title">🎯 Target Bulan Depan</div>
        <p class="rpt-analysis-text">${d.next_month_tips}</p>
      </div>` : ''}

      <div class="ai-disclaimer">⚠ Analisa bersifat estimasi berdasarkan data transaksi yang dimasukkan. Bukan saran keuangan profesional.</div>
    </div>
  `;
}

// ===== ALL TRANSACTIONS =====
function renderAllTable() {
  const search = document.getElementById('searchAll').value.toLowerCase();
  const type = document.getElementById('filterAllType').value;
  const cat = document.getElementById('filterAllCategory').value;
  const month = document.getElementById('filterAllMonth').value;
  const dateFrom = document.getElementById('filterDateFrom').value;
  const dateTo = document.getElementById('filterDateTo').value;

  let txs = [...state.transactions];
  if (type) txs = txs.filter(t=>t.type===type);
  if (cat) txs = txs.filter(t=>t.category===cat);
  if (month) txs = txs.filter(t=>monthKey(t.date)===month);
  if (dateFrom) txs = txs.filter(t=>t.date>=dateFrom);
  if (dateTo) txs = txs.filter(t=>t.date<=dateTo);
  if (search) txs = txs.filter(t=>t.category.toLowerCase().includes(search)||(t.description||'').toLowerCase().includes(search));
  txs = txs.sort((a,b)=>new Date(b.date)-new Date(a.date));

  const total = txs.length;
  const pages = Math.max(1, Math.ceil(total/ALL_PER_PAGE));
  if (allPage > pages) allPage = pages;
  const slice = txs.slice((allPage-1)*ALL_PER_PAGE, allPage*ALL_PER_PAGE);

  const tbody = document.getElementById('allBody');
  const empty = document.getElementById('allEmpty');
  if (!slice.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; renderPagination(0,1); return; }
  empty.style.display = 'none';
  tbody.innerHTML = slice.map(t=>`
    <tr>
      <td>${fmtDate(t.date)}</td>
      <td><span class="type-badge ${t.type}">${t.type==='income'?'Pemasukan':'Pengeluaran'}</span></td>
      <td><span class="cat-badge">${t.category}</span></td>
      <td>${t.description||'-'}</td>
      <td class="${t.type==='income'?'amount-income':'amount-expense'}">${t.type==='income'?'+':'-'}${fmt(t.amount)}</td>
    </tr>`).join('');
  renderPagination(pages, allPage);

  // populate all category filter
  const catSel = document.getElementById('filterAllCategory');
  const allCats = [...new Set(state.transactions.map(t=>t.category))].sort();
  const curCat = catSel.value;
  catSel.innerHTML = '<option value="">Semua Kategori</option>';
  allCats.forEach(c=>{ const o=document.createElement('option'); o.value=c; o.textContent=c; catSel.appendChild(o); });
  catSel.value = curCat;
}

function renderPagination(pages, cur) {
  const pg = document.getElementById('pagination');
  if (pages <= 1) { pg.innerHTML = ''; return; }
  let html = '';
  for (let i=1; i<=pages; i++) {
    html += `<button class="page-btn${i===cur?' active':''}" onclick="goPage(${i})">${i}</button>`;
  }
  pg.innerHTML = html;
}
window.goPage = (p) => { allPage = p; renderAllTable(); };
['searchAll','filterAllType','filterAllCategory','filterAllMonth','filterDateFrom','filterDateTo'].forEach(id=>document.getElementById(id)?.addEventListener('input',()=>{allPage=1;renderAllTable();}));

// ===== BUDGETS =====
function renderBudgets() {
  const grid = document.getElementById('budgetGrid');
  const empty = document.getElementById('budgetEmpty');
  const now = new Date();
  const monthStr = now.getFullYear()+'-'+(String(now.getMonth()+1).padStart(2,'0'));
  const monthTxs = state.transactions.filter(t=>t.type==='expense'&&monthKey(t.date)===monthStr);

  if (!state.budgets.length) { grid.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  grid.innerHTML = state.budgets.map(b => {
    const spent = monthTxs.filter(t=>t.category===b.category).reduce((s,t)=>s+t.amount,0);
    const pct = getPct(spent, b.limit);
    const cls = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
    const remaining = b.limit - spent;
    return `<div class="budget-card-item${pct>=100?' over-budget':''}">
      <div class="budget-card-header">
        <span class="budget-card-name">${b.category}</span>
        <button class="budget-card-delete" onclick="deleteBudget('${b.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
      <div class="budget-card-amounts">
        <span class="budget-spent ${cls}">${fmt(spent)}</span>
        <span class="budget-limit-text">/ ${fmt(b.limit)}</span>
      </div>
      <div class="budget-card-progress">
        <div class="progress-bar"><div class="progress-fill ${cls}" style="width:${Math.min(pct,100)}%"></div></div>
      </div>
      <div class="budget-card-footer">
        <span class="budget-remaining">${remaining >= 0 ? 'Sisa: '+fmt(remaining) : 'Lebih: '+fmt(Math.abs(remaining))}</span>
        <span class="budget-pct" style="color:${cls==='over'?'#DC2626':cls==='warn'?'#D97706':'#059669'}">${pct}%</span>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('btnAddBudget').addEventListener('click', () => document.getElementById('budgetForm').style.display = 'block');
document.getElementById('cancelBudget').addEventListener('click', () => document.getElementById('budgetForm').style.display = 'none');
document.getElementById('saveBudget').addEventListener('click', async () => {
  const category = document.getElementById('budgetCategory').value;
  const limit = +document.getElementById('budgetLimit').value;
  if (!limit || limit <= 0) return showToast('Masukkan batas anggaran yang valid', 'error');
  if (state.budgets.find(b=>b.category===category)) return showToast('Anggaran untuk kategori ini sudah ada', 'error');
  try {
    const budget = await API.post('/budgets', { category, limit });
    state.budgets.push(budget);
    document.getElementById('budgetForm').style.display = 'none';
    document.getElementById('budgetLimit').value = '';
    renderBudgets();
    showToast('Anggaran berhasil ditambahkan');
  } catch(e) { showToast('Gagal menyimpan: '+e.message, 'error'); }
});

window.deleteBudget = (id) => {
  confirm('Hapus Anggaran', 'Apakah Anda yakin ingin menghapus anggaran ini?', async () => {
    try {
      await API.del('/budgets/' + id);
      state.budgets = state.budgets.filter(b=>b.id!==id);
      renderBudgets();
      showToast('Anggaran berhasil dihapus');
    } catch(e) { showToast('Gagal menghapus: '+e.message, 'error'); }
  });
};

// ===== INIT =====
initReportFilters();
loadAll();
// Poll status every 30s
setInterval(async () => {
  try {
    const s = await API.get('/status');
    setStatus(s.connected);
  } catch { setStatus(false); }
}, 30000);

// ===== INVESTASI =====
let invAiLoaded = false;

function renderInvestasi() {
  renderInvestmentTable();
  if (!invAiLoaded) loadInvAiDashboard();
}

// --- AI Dashboard ---
window.loadInvAiDashboard = async function(force = false) {
  const loading = document.getElementById('invAiLoading');
  const content = document.getElementById('invAiContent');
  const error = document.getElementById('invAiError');
  loading.style.display = 'flex'; content.style.display = 'none'; error.style.display = 'none';
  try {
    const res = await fetch('/api/investments/ai/dashboard', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ force }) });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Gagal');
    renderAiDashboard(data.data);
    loading.style.display = 'none'; content.style.display = 'block';
    invAiLoaded = true;
  } catch(e) {
    loading.style.display = 'none';
    error.style.display = 'flex';
    document.getElementById('invAiErrorMsg').textContent = 'Gagal memuat data AI: ' + e.message;
  }
};

document.getElementById('btnRefreshDashboard').addEventListener('click', () => {
  invAiLoaded = false;
  loadInvAiDashboard(true);
});

function renderAiDashboard(d) {
  // IHSG
  const ihsg = d.ihsg || {};
  document.getElementById('ihsgValue').textContent = ihsg.value ? ihsg.value.toLocaleString('id-ID') : '-';
  const chEl = document.getElementById('ihsgChange');
  const chg = ihsg.change_pct || 0;
  chEl.textContent = `${chg >= 0 ? '+' : ''}${chg}% (${ihsg.change >= 0 ? '+' : ''}${(ihsg.change||0).toLocaleString('id-ID')})`;
  chEl.className = 'ihsg-change ' + (ihsg.status === 'naik' ? 'up' : ihsg.status === 'turun' ? 'dn' : '');
  document.getElementById('ihsgDate').textContent = ihsg.updated || '';

  // Market summary
  document.getElementById('marketSummaryText').textContent = d.market_summary || '-';

  // Top movers
  const movers = d.top_movers || [];
  document.getElementById('topMoversRow').innerHTML = movers.map(m => `
    <div class="mover-card ${m.direction === 'up' ? 'up' : 'dn'}" onclick="openTradingView('${m.code}')" title="Lihat chart ${m.code} di TradingView" style="cursor:pointer">
      <div class="mover-code">${m.code}</div>
      <div class="mover-name">${m.name}</div>
      <div class="mover-price">Rp ${(m.price||0).toLocaleString('id-ID')}</div>
      <div class="mover-change">${m.direction === 'up' ? '▲' : '▼'} ${Math.abs(m.change_pct||0)}%</div>
    </div>`).join('');

  // Stock news
  const sNews = d.stock_news || [];
  document.getElementById('stockNewsList').innerHTML = sNews.map(n => {
    const hasUrl = n.url && n.url.startsWith('http');
    const sourceTag = n.source ? `<span class="news-source">${n.source}</span>` : '';
    const linkIcon = hasUrl ? `<svg class="news-link-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>` : '';
    return `<div class="news-item ${hasUrl ? 'news-clickable' : ''}" ${hasUrl ? `onclick="window.open('${n.url}','_blank')" title="Buka berita di tab baru"` : ''}>
      <div class="news-sentiment ${n.sentiment}">${n.sentiment === 'positif' ? '▲' : n.sentiment === 'negatif' ? '▼' : '●'}</div>
      <div class="news-body">
        <div class="news-title">${n.title} ${linkIcon}</div>
        <div class="news-summary">${n.summary}</div>
        <div class="news-meta">${sourceTag}<span class="news-date">${n.date}</span></div>
      </div>
    </div>`;
  }).join('');

  // Geopolitik news
  const gNews = d.geopolitik_news || [];
  document.getElementById('geopolitikNewsList').innerHTML = gNews.map(n => {
    const hasUrl = n.url && n.url.startsWith('http');
    const sourceTag = n.source ? `<span class="news-source">${n.source}</span>` : '';
    const linkIcon = hasUrl ? `<svg class="news-link-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>` : '';
    return `<div class="news-item ${hasUrl ? 'news-clickable' : ''}" ${hasUrl ? `onclick="window.open('${n.url}','_blank')" title="Buka berita di tab baru"` : ''}>
      <div class="news-sentiment ${n.impact}">${n.impact === 'positif' ? '▲' : n.impact === 'negatif' ? '▼' : '●'}</div>
      <div class="news-body">
        <div class="news-title">${n.title} ${linkIcon}</div>
        <div class="news-summary">${n.summary}</div>
        <div class="news-meta">${sourceTag}<span class="news-date">${n.date}</span></div>
      </div>
    </div>`;
  }).join('');
}

// --- TradingView Helper ---
window.openTradingView = function(code) {
  const symbol = (code === 'IHSG' || code === 'COMPOSITE')
    ? 'IDX:COMPOSITE'
    : `IDX:${code}`;
  window.open(`https://www.tradingview.com/chart/?symbol=${symbol}`, '_blank');
};

// State expand analisa per saham
const expandedAnalysis = new Set();

// --- Investment Table ---
function renderInvestmentTable() {
  const tbody = document.getElementById('investmentBody');
  const empty = document.getElementById('investmentEmpty');
  const inv = state.investments;
  if (!inv.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; document.getElementById('portfolioTotal').textContent = ''; return; }
  empty.style.display = 'none';
  const totalModal = inv.reduce((s, i) => s + i.shares * i.buy_price, 0);
  document.getElementById('portfolioTotal').innerHTML = `Modal Total: <strong>${fmt(totalModal)}</strong>`;

  let rows = '';
  inv.forEach(i => {
    const modal = i.shares * i.buy_price;
    const isExpanded = expandedAnalysis.has(i.id);
    const hasAnalysis = !!i.ai_analysis;
    rows += `<tr>
      <td><span class="inv-code-badge" onclick="openTradingView('${i.code}')" title="Lihat chart ${i.code} di TradingView" style="cursor:pointer">${i.code}</span></td>
      <td>${i.name}</td>
      <td>${i.shares / 100} lot <small>(${i.shares.toLocaleString('id-ID')} lbr)</small></td>
      <td>${fmt(i.buy_price)}</td>
      <td>${fmt(modal)}</td>
      <td>${fmtDate(i.buy_date)}</td>
      <td style="display:flex;gap:6px">
        <button class="action-btn analyze ${isExpanded ? 'active' : ''}" onclick="toggleAnalysis('${i.id}')" title="${hasAnalysis ? 'Lihat / Sembunyikan Analisa' : 'Analisa AI'}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          ${hasAnalysis ? 'Analisa' : 'AI'}
        </button>
        <button class="action-btn delete" onclick="deleteInvestment('${i.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </td>
    </tr>`;
    if (isExpanded) {
      rows += `<tr class="analysis-row" id="analysis-row-${i.id}">
        <td colspan="7" style="padding:0">
          <div class="analysis-inline" id="analysis-inline-${i.id}">
            ${renderAnalysisInlineHTML(i)}
          </div>
        </td>
      </tr>`;
    }
  });
  tbody.innerHTML = rows;
}

function renderAnalysisInlineHTML(inv) {
  const d = inv.ai_analysis;
  const analyzedAt = inv.ai_analysis_at ? `<span style="font-size:0.75rem;color:var(--text-muted)">Dianalisa: ${new Date(inv.ai_analysis_at).toLocaleString('id-ID')}</span>` : '';
  if (!d) {
    return `<div class="analysis-inline-empty">
      <div class="ai-spinner"></div>
      <span>Qwen AI sedang menganalisa <strong>${inv.code}</strong>...</span>
    </div>`;
  }
  const plVal = d.profit_loss || 0;
  const plClass = plVal >= 0 ? 'positive' : 'negative';
  const recClass = { 'BELI': 'rec-buy', 'TAHAN': 'rec-hold', 'JUAL': 'rec-sell' }[d.recommendation] || '';
  return `
    <div class="analysis-inline-header">
      <span class="analysis-inline-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Analisa AI — ${inv.code}
      </span>
      <div style="display:flex;align-items:center;gap:10px">
        ${analyzedAt}
        <button class="btn-ghost btn-sm" onclick="reAnalyzeStock('${inv.id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Analisa Ulang
        </button>
      </div>
    </div>
    <div class="analyze-grid">
      <div class="analyze-card">
        <div class="a-label">Harga Saat Ini (Est.)</div>
        <div class="a-value">${fmt(d.current_price || 0)}</div>
        <div class="a-sub ${(d.price_change_pct||0) >= 0 ? 'pos' : 'neg'}">${(d.price_change_pct||0) >= 0 ? '▲' : '▼'} ${Math.abs(d.price_change_pct || 0)}%</div>
      </div>
      <div class="analyze-card">
        <div class="a-label">Untung / Rugi</div>
        <div class="a-value ${plClass}">${plVal >= 0 ? '+' : ''}${fmt(plVal)}</div>
        <div class="a-sub">dari modal ${fmt(inv.shares * inv.buy_price)}</div>
      </div>
      <div class="analyze-card">
        <div class="a-label">Rekomendasi</div>
        <div class="a-value rec ${recClass}">${d.recommendation}</div>
        <div class="a-sub">Risk: ${d.risk_level}</div>
      </div>
      <div class="analyze-card">
        <div class="a-label">Target / Stop Loss</div>
        <div class="a-value">${fmt(d.target_price || 0)}</div>
        <div class="a-sub neg">SL: ${fmt(d.stop_loss || 0)}</div>
      </div>
    </div>
    <div class="analyze-analysis">
      <div class="a-sec-title">Analisa</div>
      <p>${d.analysis || '-'}</p>
    </div>
    <div class="analyze-two-col">
      <div>
        <div class="a-sec-title positive">✓ Katalis Positif</div>
        <ul>${(d.catalysts||[]).map(c=>`<li>${c}</li>`).join('')}</ul>
      </div>
      <div>
        <div class="a-sec-title negative">✗ Risiko</div>
        <ul>${(d.risks||[]).map(r=>`<li>${r}</li>`).join('')}</ul>
      </div>
    </div>
    ${(d.news||[]).length ? `
    <div class="a-sec-title" style="margin-top:16px">Berita Terkait</div>
    ${d.news.map(n => {
      const hasUrl = n.url && n.url.startsWith('http');
      const sourceTag = n.source ? `<span class="news-source">${n.source}</span>` : '';
      const linkIcon = hasUrl ? `<svg class="news-link-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>` : '';
      return `<div class="news-item ${hasUrl ? 'news-clickable' : ''}" ${hasUrl ? `onclick="window.open('${n.url}','_blank')" title="Buka berita di tab baru"` : ''}>
        <div class="news-sentiment ${n.sentiment}">${n.sentiment==='positif'?'▲':n.sentiment==='negatif'?'▼':'●'}</div>
        <div class="news-body">
          <div class="news-title">${n.title} ${linkIcon}</div>
          <div class="news-summary">${n.summary}</div>
          <div class="news-meta">${sourceTag}</div>
        </div>
      </div>`;
    }).join('')}` : ''}
    <div class="ai-disclaimer">⚠ Data bersifat estimasi AI. Bukan saran investasi resmi.</div>
  `;
}

// Toggle expand/collapse analisa inline
window.toggleAnalysis = async function(id) {
  const inv = state.investments.find(i => i.id === id);
  if (!inv) return;

  if (expandedAnalysis.has(id)) {
    expandedAnalysis.delete(id);
    renderInvestmentTable();
    return;
  }

  expandedAnalysis.add(id);
  renderInvestmentTable();

  // Jika belum ada analisa tersimpan, langsung fetch sekarang
  if (!inv.ai_analysis) {
    await fetchAndSaveAnalysis(id);
  }
};

// Regenerate / analisa ulang
window.reAnalyzeStock = async function(id) {
  const inv = state.investments.find(i => i.id === id);
  if (!inv) return;
  // Tampilkan loading state inline
  inv.ai_analysis = null;
  inv.ai_analysis_at = null;
  const container = document.getElementById(`analysis-inline-${id}`);
  if (container) container.innerHTML = renderAnalysisInlineHTML(inv);
  await fetchAndSaveAnalysis(id);
};

async function fetchAndSaveAnalysis(id) {
  const inv = state.investments.find(i => i.id === id);
  if (!inv) return;
  try {
    const res = await fetch('/api/investments/ai/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inv.id, code: inv.code, name: inv.name, shares: inv.shares, buy_price: inv.buy_price })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    // Update state lokal
    inv.ai_analysis = data.data;
    inv.ai_analysis_at = new Date().toISOString();
    // Re-render hanya panel analisa (tidak re-render seluruh tabel agar tidak flicker)
    const container = document.getElementById(`analysis-inline-${id}`);
    if (container) container.innerHTML = renderAnalysisInlineHTML(inv);
    showToast(`Analisa ${inv.code} selesai`);
  } catch(e) {
    const container = document.getElementById(`analysis-inline-${id}`);
    if (container) container.innerHTML = `<div class="analysis-inline-error">Gagal analisa: ${e.message} <button class="btn-ghost btn-sm" onclick="reAnalyzeStock('${id}')">Coba Lagi</button></div>`;
    showToast('Gagal analisa: ' + e.message, 'error');
  }
}

// --- Add Investment ---
document.getElementById('btnAddInvestment').addEventListener('click', () => {
  document.getElementById('investmentForm').style.display = 'block';
  document.getElementById('invBuyDate').value = nowDate();
});
document.getElementById('cancelInvestment').addEventListener('click', () => document.getElementById('investmentForm').style.display = 'none');
document.getElementById('saveInvestment').addEventListener('click', async () => {
  const code = document.getElementById('invCode').value.trim().toUpperCase();
  const name = document.getElementById('invName').value.trim();
  const lot = +document.getElementById('invLot').value;
  const buy_price = +document.getElementById('invBuyPrice').value;
  const buy_date = document.getElementById('invBuyDate').value;
  const notes = document.getElementById('invNotes').value;
  if (!code || !name) return showToast('Kode dan nama wajib diisi', 'error');
  if (!lot || lot < 1) return showToast('Jumlah lot minimal 1', 'error');
  if (!buy_price || buy_price <= 0) return showToast('Harga beli tidak valid', 'error');
  if (!buy_date) return showToast('Pilih tanggal beli', 'error');
  try {
    const inv = await API.post('/investments', { code, name, shares: lot * 100, buy_price, buy_date, notes });
    state.investments.push(inv);
    document.getElementById('investmentForm').style.display = 'none';
    ['invCode','invName','invLot','invBuyPrice','invNotes'].forEach(id => document.getElementById(id).value = '');
    renderInvestmentTable();
    showToast('Saham berhasil ditambahkan');
  } catch(e) { showToast('Gagal: ' + e.message, 'error'); }
});

// --- Delete Investment ---
window.deleteInvestment = (id) => {
  confirm('Hapus Saham', 'Apakah Anda yakin ingin menghapus saham ini?', async () => {
    try {
      await API.del('/investments/' + id);
      state.investments = state.investments.filter(i => i.id !== id);
      renderInvestmentTable();
      showToast('Saham berhasil dihapus');
    } catch(e) { showToast('Gagal: ' + e.message, 'error'); }
  });
};

// ===== TAGIHAN RUTIN =====
function renderTagihan() {
  renderBillSummary();
  renderBillGrid();
}

function renderBillSummary() {
  const active = state.bills.filter(b => b.active !== false);
  const total = active.reduce((s, b) => s + b.amount, 0);
  document.getElementById('billTotalMonthly').textContent = fmt(total);
  document.getElementById('billActiveCount').textContent = active.length;

  // Next due
  const today = new Date().getDate();
  const sorted = [...active].sort((a, b) => {
    const da = a.due_day >= today ? a.due_day - today : a.due_day + 31 - today;
    const db = b.due_day >= today ? b.due_day - today : b.due_day + 31 - today;
    return da - db;
  });
  document.getElementById('billNextDue').textContent = sorted.length ? `${sorted[0].name} (tgl ${sorted[0].due_day})` : '-';
}

function renderBillGrid() {
  const grid = document.getElementById('billGrid');
  const empty = document.getElementById('billEmpty');
  if (!state.bills.length) { grid.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  const today = new Date().getDate();
  grid.innerHTML = state.bills.map(b => {
    const daysLeft = b.due_day >= today ? b.due_day - today : b.due_day + 31 - today;
    const urgent = daysLeft <= 3;
    const statusClass = !b.active ? 'bill-inactive' : urgent ? 'bill-urgent' : 'bill-ok';
    const statusLabel = !b.active ? 'Nonaktif' : urgent ? `${daysLeft} hari lagi` : `${daysLeft} hari lagi`;
    return `<div class="bill-item ${statusClass}">
      <div class="bill-item-header">
        <div>
          <div class="bill-item-name">${b.name}</div>
          <div class="bill-item-cat"><span class="cat-badge">${b.category}</span>${b.autodebit ? '<span class="autodebit-badge">Auto-Debit</span>' : ''}</div>
        </div>
        <div class="bill-item-actions">
          <button class="action-btn ${b.active !== false ? 'pause' : 'play'}" onclick="toggleBill('${b.id}')" title="${b.active !== false ? 'Nonaktifkan' : 'Aktifkan'}">
            ${b.active !== false
              ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
              : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
            }
          </button>
          <button class="action-btn delete" onclick="deleteBillItem('${b.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
      <div class="bill-amount">${fmt(b.amount)}<span class="bill-period">/bulan</span></div>
      <div class="bill-due">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        Jatuh tempo tgl ${b.due_day} &nbsp;•&nbsp; <span class="${urgent && b.active !== false ? 'text-urgent' : ''}">${statusLabel}</span>
      </div>
      ${b.notes ? `<div class="bill-notes">${b.notes}</div>` : ''}
    </div>`;
  }).join('');
}

// --- Add Bill ---
document.getElementById('btnAddBill').addEventListener('click', () => document.getElementById('billForm').style.display = 'block');
document.getElementById('cancelBill').addEventListener('click', () => document.getElementById('billForm').style.display = 'none');
document.getElementById('saveBill').addEventListener('click', async () => {
  const name = document.getElementById('billName').value.trim();
  const amount = +document.getElementById('billAmount').value;
  const category = document.getElementById('billCategory').value;
  const due_day = +document.getElementById('billDueDay').value;
  const autodebit = document.getElementById('billAutodebit').value === 'true';
  const notes = document.getElementById('billNotes').value;
  if (!name) return showToast('Nama tagihan wajib diisi', 'error');
  if (!amount || amount <= 0) return showToast('Jumlah tidak valid', 'error');
  if (!due_day || due_day < 1 || due_day > 31) return showToast('Tanggal jatuh tempo 1-31', 'error');
  try {
    const bill = await API.post('/bills', { name, amount, due_day, category, autodebit, notes });
    state.bills.push(bill);
    document.getElementById('billForm').style.display = 'none';
    ['billName','billAmount','billDueDay','billNotes'].forEach(id => document.getElementById(id).value = '');
    renderTagihan();
    showToast('Tagihan berhasil ditambahkan');
  } catch(e) { showToast('Gagal: ' + e.message, 'error'); }
});

// --- Toggle Bill Active ---
window.toggleBill = async (id) => {
  const b = state.bills.find(b => b.id === id);
  if (!b) return;
  try {
    await API.put('/bills/' + id, { active: !b.active });
    b.active = !b.active;
    renderTagihan();
    showToast(b.active ? 'Tagihan diaktifkan' : 'Tagihan dinonaktifkan');
  } catch(e) { showToast('Gagal: ' + e.message, 'error'); }
};

// --- Delete Bill ---
window.deleteBillItem = (id) => {
  confirm('Hapus Tagihan', 'Apakah Anda yakin ingin menghapus tagihan ini?', async () => {
    try {
      await API.del('/bills/' + id);
      state.bills = state.bills.filter(b => b.id !== id);
      renderTagihan();
      showToast('Tagihan berhasil dihapus');
    } catch(e) { showToast('Gagal: ' + e.message, 'error'); }
  });
};