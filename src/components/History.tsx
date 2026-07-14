'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { peso, fmtDT } from '@/lib/format';
import { useUI } from './UI';
import { printHtml, printReceipt, receiptText } from './Sell';
import type { Branch, Employee, Sale, SaleStats, SalesPage } from '@/lib/types';

interface HistoryProps {
  employees: Employee[];
  canManage: boolean;
  isOwner: boolean;
  branches: Branch[];
  branchId: number | null; // a non-owner is locked to this branch
}

export default function History({
  employees,
  canManage,
  isOwner,
  branches,
  branchId,
}: HistoryProps) {
  const { toast, openModal, closeModal } = useUI();
  const [q, setQ] = useState('');
  const [empFilter, setEmpFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState(''); // owner only; '' = all branches
  const [page, setPage] = useState<SalesPage | null>(null);
  const [stats, setStats] = useState<SaleStats | null>(null);
  const [loading, setLoading] = useState(true);

  // A manager/cashier is locked to their branch; the owner picks via the filter.
  const scopedBranchId = isOwner ? (branchFilter ? Number(branchFilter) : undefined) : branchId ?? undefined;
  const showBranchColumn = isOwner;

  async function load() {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        api.sales({ q, employee_id: empFilter, branch_id: scopedBranchId }),
        api.saleStats(scopedBranchId ?? null),
      ]);
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
  }, [q, empFilter, branchFilter, branchId]);

  async function loadMore() {
    if (!page) return;
    try {
      const more = await api.sales({
        q,
        employee_id: empFilter,
        branch_id: scopedBranchId,
        page: page.page + 1,
      });
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
          {!sale.refunded && (
            <button className="btn danger" onClick={() => confirmRefund(sale)}>
              Refund
            </button>
          )}
          <button
            className="btn amber"
            onClick={() => {
              if (!printReceipt(sale)) toast('Allow pop-ups to print the receipt');
            }}
          >
            🖨 Print
          </button>
          <button className="btn primary" onClick={closeModal}>
            Done
          </button>
        </footer>
      </>,
    );
  }

  function confirmRefund(sale: Sale) {
    // A cashier can refund, but must enter a manager's or owner's PIN to authorize it.
    const needsPin = !canManage;
    let pin = '';
    let error = '';

    const render = () => {
      openModal(
        <>
          <header>
            <h3>Refund receipt #{sale.id}?</h3>
          </header>
          <div className="bodyPad">
            <p style={{ marginTop: 0 }}>
              This refunds <b>{peso(sale.total)}</b> and returns the items to stock. This can&apos;t
              be undone.
            </p>
            {needsPin && (
              <div className="field">
                <label>Manager or owner PIN required</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  onChange={(e) => (pin = e.target.value)}
                />
              </div>
            )}
            {error && <div className="errText">{error}</div>}
          </div>
          <footer>
            <button className="btn" onClick={() => openReceipt(sale)}>
              Cancel
            </button>
            <button
              className="btn danger"
              onClick={async () => {
                try {
                  if (needsPin) await api.authorizeManager(pin); // throws if not manager/owner
                  await api.refundSale(sale.id);
                  closeModal();
                  toast(`Receipt #${sale.id} refunded — stock returned`);
                  load();
                } catch (e) {
                  error = e instanceof Error ? e.message : 'Something went wrong';
                  render();
                }
              }}
            >
              Confirm refund
            </button>
          </footer>
        </>,
      );
    };
    render();
  }

  function openReports() {
    openModal(<ReportsModal onClose={closeModal} notify={toast} employees={employees} />);
  }

  return (
    <section className="screen">
      <div className="topbar">
        <h2>Sales history</h2>
        <div className="grow"></div>
        {isOwner && (
          <select
            className="search"
            style={{ minWidth: 150 }}
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
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
        <button className="btn" onClick={openReports}>
          🖨 Reports
        </button>
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
          <div className="stat">
            <div className="lbl">Refunds</div>
            <div className="val" style={{ color: stats.refunded_count ? 'var(--danger)' : 'inherit' }}>
              {peso(stats.refunded_total)}
              {stats.refunded_count ? (
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>
                  {' '}
                  ({stats.refunded_count})
                </span>
              ) : null}
            </div>
          </div>
        </div>
      )}
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Receipt</th>
              <th>Date &amp; time</th>
              {showBranchColumn && <th>Branch</th>}
              <th>Employee</th>
              <th>Items</th>
              <th className="num">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!loading && page?.data.length === 0 && (
              <tr>
                <td colSpan={showBranchColumn ? 7 : 6} className="centerNote">
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
                {showBranchColumn && <td>{s.branch?.name || '—'}</td>}
                <td>{s.employee?.name || '—'}</td>
                <td>{s.items.reduce((a, l) => a + l.qty, 0)}</td>
                <td className="num">
                  <b>{peso(s.total)}</b>
                </td>
                <td>
                  {s.refunded ? (
                    <span className="pill refund">Refunded</span>
                  ) : (
                    <span className={'pill ' + (s.payment_method === 'cash' ? 'ok' : 'gcash')}>
                      {s.payment_method === 'cash' ? 'Cash' : 'GCash'}
                    </span>
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

/** Sales come back newest-first, so we page from the top and stop as soon as we
 *  pass the period's start — no date filter needed on the API. */
async function fetchSalesInRange(startMs: number, employeeId?: string): Promise<Sale[]> {
  const out: Sale[] = [];
  let pageNum = 1;
  for (let guard = 0; guard < 200; guard++) {
    const p = await api.sales({ page: pageNum, employee_id: employeeId || undefined });
    for (const s of p.data) {
      if (new Date(s.created_at).getTime() >= startMs) out.push(s);
    }
    const oldest = p.data[p.data.length - 1];
    if (!p.has_next || (oldest && new Date(oldest.created_at).getTime() < startMs)) break;
    pageNum++;
  }
  return out;
}

function esc(t: string): string {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Build a full-width HTML sales report: one row per transaction (so every
 *  receipt for the period fits and paginates), with a totals summary. */
function buildReportHtml(title: string, periodLabel: string, sales: Sale[], scope?: string): string {
  const num = (v: unknown) => Number(v) || 0;
  const chrono = [...sales].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const valid = sales.filter((s) => !s.refunded);
  const refunded = sales.filter((s) => s.refunded);
  const gross = valid.reduce((a, s) => a + num(s.total), 0);
  const cash = valid.filter((s) => s.payment_method === 'cash').reduce((a, s) => a + num(s.total), 0);
  const card = valid.filter((s) => s.payment_method === 'card').reduce((a, s) => a + num(s.total), 0);
  const discounts = valid.reduce((a, s) => a + num(s.discount), 0);
  const itemsSold = valid.reduce((a, s) => a + s.items.reduce((b, l) => b + l.qty, 0), 0);
  const refundedTotal = refunded.reduce((a, s) => a + num(s.total), 0);

  const rows = chrono
    .map((s) => {
      const items = s.items.reduce((a, l) => a + l.qty, 0);
      return (
        `<tr${s.refunded ? ' class="rfd"' : ''}>` +
        `<td>#${s.id}</td>` +
        `<td>${esc(fmtDT(s.created_at))}</td>` +
        `<td>${esc(s.employee?.name || '—')}</td>` +
        `<td class="num">${items}</td>` +
        `<td>${s.payment_method === 'cash' ? 'Cash' : 'GCash'}</td>` +
        `<td class="num">${esc(peso(num(s.total)))}</td>` +
        `<td>${s.refunded ? 'Refunded' : ''}</td>` +
        `</tr>`
      );
    })
    .join('');

  const summaryRow = (label: string, value: string, cls = '') =>
    `<div class="r ${cls}"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;

  let html = '';
  html += `<h1>Talabahan sa Calinan</h1>`;
  html += `<div class="sub">${esc(title)} &mdash; ${esc(periodLabel)}${
    scope ? ' &middot; ' + esc(scope) : ''
  }</div>`;
  html +=
    '<table><thead><tr>' +
    '<th>Receipt</th><th>Date &amp; time</th><th>Cashier</th><th class="num">Items</th>' +
    '<th>Payment</th><th class="num">Total</th><th>Status</th>' +
    '</tr></thead><tbody>' +
    (rows || '<tr><td colspan="7">No transactions for this period.</td></tr>') +
    '</tbody>' +
    `<tfoot><tr><td colspan="5">Total sales — ${valid.length} receipt${valid.length === 1 ? '' : 's'}</td>` +
    `<td class="num">${esc(peso(gross))}</td><td></td></tr></tfoot>` +
    '</table>';
  html += '<div class="summary">';
  html += summaryRow('Items sold', String(itemsSold));
  html += summaryRow('Cash', peso(cash));
  html += summaryRow('GCash', peso(card));
  if (discounts) html += summaryRow('Discounts given', '-' + peso(discounts));
  if (refunded.length) html += summaryRow(`Refunded (${refunded.length})`, '-' + peso(refundedTotal));
  html += summaryRow('Total sales', peso(gross), 'total');
  html += '</div>';
  html += `<div class="sub" style="margin-top:16px">Printed ${esc(fmtDT(new Date().toISOString()))}</div>`;
  return html;
}

function ReportsModal({
  onClose,
  notify,
  employees,
}: {
  onClose: () => void;
  notify: (m: string) => void;
  employees: Employee[];
}) {
  const [busy, setBusy] = useState<'daily' | 'monthly' | null>(null);
  const [empId, setEmpId] = useState('');

  async function run(kind: 'daily' | 'monthly') {
    setBusy(kind);
    try {
      const now = new Date();
      let startMs: number;
      let title: string;
      let period: string;
      if (kind === 'daily') {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        startMs = d.getTime();
        title = 'Daily Sales Report';
        period = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
      } else {
        startMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        title = 'Monthly Sales Report';
        period = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long' });
      }
      const emp = employees.find((e) => String(e.id) === empId);
      const scope = emp ? emp.name : 'All employees';
      const sales = await fetchSalesInRange(startMs, empId);
      if (sales.length === 0) {
        notify(
          `No sales for ${kind === 'daily' ? 'today' : 'this month'}${emp ? ' by ' + emp.name : ''} yet`,
        );
        return;
      }
      if (printHtml(title, buildReportHtml(title, period, sales, scope))) onClose();
      else notify('Allow pop-ups to print the report');
    } catch {
      notify('Could not build the report');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header>
        <h3>Print sales report</h3>
      </header>
      <div className="bodyPad">
        <p style={{ color: 'var(--muted)', marginTop: 0, fontSize: 14 }}>
          Lists every transaction for the period with a totals summary.
        </p>
        <div className="field">
          <label>Employee</label>
          <select value={empId} disabled={!!busy} onChange={(e) => setEmpId(e.target.value)}>
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn" style={{ width: '100%' }} disabled={!!busy} onClick={() => run('daily')}>
            {busy === 'daily' ? 'Preparing…' : '📅 Daily report — today'}
          </button>
          <button
            className="btn"
            style={{ width: '100%' }}
            disabled={!!busy}
            onClick={() => run('monthly')}
          >
            {busy === 'monthly' ? 'Preparing…' : '🗓 Monthly report — this month'}
          </button>
        </div>
      </div>
      <footer>
        <button className="btn" disabled={!!busy} onClick={onClose}>
          Close
        </button>
      </footer>
    </>
  );
}
