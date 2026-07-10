import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { peso, fmtDT } from '../utils.js';
import { useUI } from '../UI.jsx';

export default function History({ employees, canManage }) {
  const { toast, openModal, closeModal } = useUI();
  const [q, setQ] = useState('');
  const [empFilter, setEmpFilter] = useState('');
  const [page, setPage] = useState(null); // Laravel paginator object
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        api.sales({ q, employee_id: empFilter }),
        api.saleStats(),
      ]);
      setPage(p);
      setStats(s);
    } catch (e) {
      toast(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [q, empFilter]); // eslint-disable-line

  async function loadMore(url) {
    try {
      const res = await fetch(url.replace(/^https?:\/\/[^/]+/, import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:8000'));
      const more = await res.json();
      setPage((prev) => ({ ...more, data: [...prev.data, ...more.data] }));
    } catch (e) { toast('Could not load more'); }
  }

  function receiptText(sale) {
    let s = '        TINDAPOS STORE\n     Valencia, Bukidnon PH\n';
    s += '--------------------------------\n';
    s += `Receipt #${sale.id}\n${fmtDT(sale.created_at)}\nCashier: ${sale.employee?.name || '—'}\n`;
    s += '--------------------------------\n';
    sale.items.forEach((l) => {
      s += `${l.qty} x ${l.name}\n`;
      s += `  @${peso(l.price)}`.padEnd(22) + peso(l.price * l.qty).padStart(10) + '\n';
    });
    s += '--------------------------------\n';
    s += 'Subtotal'.padEnd(22) + peso(sale.subtotal).padStart(10) + '\n';
    if (+sale.discount) s += `Discount ${sale.discount_pct}%`.padEnd(22) + ('-' + peso(sale.discount)).padStart(10) + '\n';
    s += 'TOTAL'.padEnd(22) + peso(sale.total).padStart(10) + '\n';
    s += (sale.payment_method === 'cash' ? 'Cash' : 'Card').padEnd(22) + peso(sale.tendered).padStart(10) + '\n';
    if (+sale.change_due) s += 'Change'.padEnd(22) + peso(sale.change_due).padStart(10) + '\n';
    if (sale.refunded) s += '\n*** REFUNDED ***\n';
    s += '--------------------------------\n      Salamat po! Come again';
    return s;
  }

  function openReceipt(sale) {
    openModal(
      <>
        <header><h3>Receipt #{sale.id}</h3></header>
        <div className="bodyPad"><pre className="receipt">{receiptText(sale)}</pre></div>
        <footer>
          {!sale.refunded && canManage && (
            <button className="btn danger" onClick={async () => {
              try { await api.refundSale(sale.id); closeModal(); toast(`Receipt #${sale.id} refunded — stock returned`); load(); }
              catch (e) { toast(e.message); }
            }}>Refund</button>
          )}
          <button className="btn primary" onClick={closeModal}>Done</button>
        </footer>
      </>
    );
  }

  return (
    <section className="screen">
      <div className="topbar">
        <h2>Sales history</h2>
        <div className="grow"></div>
        <select className="search" style={{ minWidth: 160 }} value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
          <option value="">All employees</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input className="search" placeholder="Search receipt # or item…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {stats && (
        <div className="statRow">
          <div className="stat"><div className="lbl">Receipts stored</div><div className="val">{stats.receipts_count}</div></div>
          <div className="stat"><div className="lbl">Today's sales</div><div className="val">{peso(stats.today_total)}</div></div>
          <div className="stat"><div className="lbl">All-time sales</div><div className="val">{peso(stats.all_time_total)}</div></div>
        </div>
      )}
      <div className="tableWrap">
        <table>
          <thead><tr><th>Receipt</th><th>Date & time</th><th>Employee</th><th>Items</th><th className="num">Total</th><th></th></tr></thead>
          <tbody>
            {!loading && page?.data.length === 0 && (
              <tr><td colSpan={6} className="centerNote">No sales yet — every receipt you ring up is kept here forever.</td></tr>
            )}
            {page?.data.map((s) => (
              <tr key={s.id} className="rowBtn" onClick={() => openReceipt(s)}>
                <td><b>#{s.id}</b></td>
                <td>{fmtDT(s.created_at)}</td>
                <td>{s.employee?.name || '—'}</td>
                <td>{s.items.reduce((a, l) => a + l.qty, 0)}</td>
                <td className="num"><b>{peso(s.total)}</b></td>
                <td>{s.refunded ? <span className="pill refund">Refunded</span> : <span className="pill ok">{s.payment_method === 'cash' ? 'Cash' : 'Card'}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {page?.next_page_url && (
          <button className="btn loadMore" onClick={() => loadMore(page.next_page_url)}>Load more</button>
        )}
      </div>
    </section>
  );
}
