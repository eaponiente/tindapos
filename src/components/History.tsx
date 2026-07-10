'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { peso, fmtDT } from '@/lib/format';
import { useUI } from './UI';
import { receiptText } from './Sell';
import type { Employee, Sale, SaleStats, SalesPage } from '@/lib/types';

interface HistoryProps {
  employees: Employee[];
  canManage: boolean;
}

export default function History({ employees, canManage }: HistoryProps) {
  const { toast, openModal, closeModal } = useUI();
  const [q, setQ] = useState('');
  const [empFilter, setEmpFilter] = useState('');
  const [page, setPage] = useState<SalesPage | null>(null);
  const [stats, setStats] = useState<SaleStats | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([api.sales({ q, employee_id: empFilter }), api.saleStats()]);
      setPage(p);
      setStats(s);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, empFilter]);

  async function loadMore() {
    if (!page) return;
    try {
      const more = await api.sales({ q, employee_id: empFilter, page: page.page + 1 });
      setPage((prev) => (prev ? { ...more, data: [...prev.data, ...more.data] } : more));
    } catch {
      toast('Could not load more');
    }
  }

  function openReceipt(sale: Sale) {
    openModal(
      <>
        <header>
          <h3>Receipt #{sale.id}</h3>
        </header>
        <div className="bodyPad">
          <pre className="receipt">{receiptText(sale)}</pre>
        </div>
        <footer>
          {!sale.refunded && canManage && (
            <button
              className="btn danger"
              onClick={async () => {
                try {
                  await api.refundSale(sale.id);
                  closeModal();
                  toast(`Receipt #${sale.id} refunded — stock returned`);
                  load();
                } catch (e) {
                  toast(e instanceof Error ? e.message : 'Something went wrong');
                }
              }}
            >
              Refund
            </button>
          )}
          <button className="btn primary" onClick={closeModal}>
            Done
          </button>
        </footer>
      </>,
    );
  }

  return (
    <section className="screen">
      <div className="topbar">
        <h2>Sales history</h2>
        <div className="grow"></div>
        <select
          className="search"
          style={{ minWidth: 160 }}
          value={empFilter}
          onChange={(e) => setEmpFilter(e.target.value)}
        >
          <option value="">All employees</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <input
          className="search"
          placeholder="Search receipt # or item…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {stats && (
        <div className="statRow">
          <div className="stat">
            <div className="lbl">Receipts stored</div>
            <div className="val">{stats.receipts_count}</div>
          </div>
          <div className="stat">
            <div className="lbl">Today&apos;s sales</div>
            <div className="val">{peso(stats.today_total)}</div>
          </div>
          <div className="stat">
            <div className="lbl">All-time sales</div>
            <div className="val">{peso(stats.all_time_total)}</div>
          </div>
        </div>
      )}
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Receipt</th>
              <th>Date &amp; time</th>
              <th>Employee</th>
              <th>Items</th>
              <th className="num">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!loading && page?.data.length === 0 && (
              <tr>
                <td colSpan={6} className="centerNote">
                  No sales yet — every receipt you ring up is kept here forever.
                </td>
              </tr>
            )}
            {page?.data.map((s) => (
              <tr key={s.id} className="rowBtn" onClick={() => openReceipt(s)}>
                <td>
                  <b>#{s.id}</b>
                </td>
                <td>{fmtDT(s.created_at)}</td>
                <td>{s.employee?.name || '—'}</td>
                <td>{s.items.reduce((a, l) => a + l.qty, 0)}</td>
                <td className="num">
                  <b>{peso(s.total)}</b>
                </td>
                <td>
                  {s.refunded ? (
                    <span className="pill refund">Refunded</span>
                  ) : (
                    <span className="pill ok">{s.payment_method === 'cash' ? 'Cash' : 'Card'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {page?.has_next && (
          <button className="btn loadMore" onClick={loadMore}>
            Load more
          </button>
        )}
      </div>
    </section>
  );
}
