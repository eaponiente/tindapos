'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { peso } from '@/lib/format';
import { useUI } from './UI';
import type { Employee, Expense, ExpenseCategory, NetIncome } from '@/lib/types';

interface ExpensesProps {
  employee: Employee;
  branchId: number | null;
  isOwner: boolean;
}

const CATS: { key: ExpenseCategory; label: string; emoji: string }[] = [
  { key: 'salary', label: 'Salary', emoji: '💵' },
  { key: 'market', label: 'Market / Ingredients', emoji: '🧺' },
  { key: 'softdrinks', label: 'Softdrinks', emoji: '🥤' },
  { key: 'ice_blocks', label: 'Ice blocks', emoji: '🧊' },
  { key: 'other', label: 'Other expenses', emoji: '🧾' },
];
const catLabel = (k: string) => CATS.find((c) => c.key === k)?.label ?? k;
const catEmoji = (k: string) => CATS.find((c) => c.key === k)?.emoji ?? '🧾';
const payLabel = (m?: string) => (m === 'gcash' ? 'GCash' : m === 'cash' ? 'Cash' : '—');
const srcLabel = (s?: string) => (s === 'employee' ? "Employee's money" : s === 'sales' ? 'From sales' : '—');
const scopeLabel = (s?: string) => (s === 'bank' ? '🏦 Bank / GCash' : 'Daily');

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const prettyDate = (s: string) => {
  try {
    return new Date(`${s}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return s;
  }
};

export default function Expenses({ employee, branchId, isOwner }: ExpensesProps) {
  const { toast, openModal, closeModal } = useUI();
  const today = isoDate(new Date());
  // Opens on Today by default; owners can switch to Month / Range. Managers
  // only ever see Today.
  const [period, setPeriod] = useState<'today' | 'month' | 'range'>('today');
  const [fromStr, setFromStr] = useState(today);
  const [toStr, setToStr] = useState(today);
  const [net, setNet] = useState<NetIncome | null>(null);
  const [list, setList] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const range = useCallback((): { from: string; to: string } => {
    const now = new Date();
    if (!isOwner) return { from: today, to: today }; // managers: today only
    if (period === 'month') return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    if (period === 'range') {
      const a = fromStr <= toStr ? fromStr : toStr;
      const b = fromStr <= toStr ? toStr : fromStr;
      return { from: a, to: b };
    }
    return { from: today, to: today };
  }, [isOwner, period, fromStr, toStr, today]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = range();
      if (isOwner) {
        const [n, xs] = await Promise.all([
          api.netIncome(branchId, from, to),
          api.expenses(branchId, from, to),
        ]);
        setNet(n);
        setList(xs);
      } else {
        // Managers never fetch sales — just today's expense entries.
        setNet(null);
        setList(await api.expenses(branchId, from, to));
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load expenses');
    } finally {
      setLoading(false);
    }
  }, [isOwner, range, branchId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  function addExpense() {
    openModal(
      <ExpenseModal
        defaultDate={today}
        lockDate={!isOwner}
        onCancel={closeModal}
        onSave={async (data) => {
          try {
            await api.createExpense({
              branch_id: branchId!,
              employee_id: employee.id,
              employee_name: employee.name,
              ...data,
            });
            closeModal();
            toast('Expense recorded');
            load();
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not save the expense');
          }
        }}
      />,
    );
  }

  function editExpense(x: Expense) {
    openModal(
      <ExpenseModal
        defaultDate={today}
        initial={{
          category: x.category,
          amount: Number(x.amount),
          payment_method: x.payment_method,
          fund_source: x.fund_source,
          scope: x.scope,
          note: x.note,
          spent_at: x.spent_at,
        }}
        onCancel={closeModal}
        onSave={async (data) => {
          try {
            await api.updateExpense(x.id, data);
            closeModal();
            toast('Expense updated');
            load();
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not update the expense');
          }
        }}
      />,
    );
  }

  function removeExpense(x: Expense) {
    openModal(
      <>
        <header>
          <h3>Delete expense?</h3>
        </header>
        <div className="bodyPad">
          <p style={{ margin: 0 }}>
            Remove <b>{catLabel(x.category)}</b> — <b>{peso(x.amount)}</b>
            {x.note ? ` (${x.note})` : ''} on {prettyDate(x.spent_at)}? This can&apos;t be undone.
          </p>
        </div>
        <footer>
          <button className="btn" onClick={closeModal}>
            Cancel
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              try {
                await api.deleteExpense(x.id);
                closeModal();
                toast('Expense deleted');
                load();
              } catch (e) {
                toast(e instanceof Error ? e.message : 'Could not delete');
              }
            }}
          >
            Delete
          </button>
        </footer>
      </>,
    );
  }

  const sel = (active: boolean) => (active ? 'sel' : '');
  // Daily running costs vs Bank/GCash supply/capital. Only DAILY feeds the daily
  // expense total and net income; Bank/GCash is tracked as its own total.
  const dailyList = list.filter((x) => x.scope !== 'bank');
  const bankList = list.filter((x) => x.scope === 'bank');
  const expensesTotal = dailyList.reduce((a, x) => a + Number(x.amount), 0);
  const bankTotal = bankList.reduce((a, x) => a + Number(x.amount), 0);
  const byCat: Record<string, number> = {};
  for (const x of dailyList) byCat[x.category] = (byCat[x.category] ?? 0) + Number(x.amount);
  const extraCats = Object.keys(byCat).filter((k) => !CATS.some((c) => c.key === k));
  const gcashExp = dailyList.filter((x) => x.payment_method === 'gcash').reduce((a, x) => a + Number(x.amount), 0);
  const cashExp = expensesTotal - gcashExp;
  // Money source split: employee's own money is what the shop owes back.
  const employeeExp = dailyList.filter((x) => x.fund_source === 'employee').reduce((a, x) => a + Number(x.amount), 0);
  const salesExp = expensesTotal - employeeExp;
  // Sales / net income are owner-only. Net income = Sales − Daily expenses only.
  const salesTotal = Number(net?.sales_total ?? 0);
  const netIncome = salesTotal - expensesTotal;

  function openTrend() {
    openModal(<TrendModal branchId={branchId} onClose={closeModal} />, { wide: true });
  }

  async function exportXlsx() {
    try {
      const XLSX = await import('xlsx');
      const { from, to } = range();
      const summary: (string | number)[][] = [
        ['Talabahan sa Calinan — Expenses & Net income'],
        ['Period', `${from} to ${to}`],
        [],
        ['Sales', salesTotal],
        ['Daily expenses', expensesTotal],
        ['Net income', netIncome],
        ['Bank / GCash (separate)', bankTotal],
        [],
        ['Daily by category', ''],
        ...CATS.map((c) => [c.label, Number(byCat[c.key] ?? 0)]),
        ...extraCats.map((k) => [k, Number(byCat[k] ?? 0)]),
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(summary);
      const rows = list.map((x) => ({
        Date: x.spent_at,
        Type: x.scope === 'bank' ? 'Bank/GCash' : 'Daily',
        Category: catLabel(x.category),
        'Paid via': payLabel(x.payment_method),
        'Money from': srcLabel(x.fund_source),
        Note: x.note || '',
        'Recorded by': x.recorded_by_name || '',
        Amount: Number(x.amount),
      }));
      const ws2 = XLSX.utils.json_to_sheet(
        rows.length
          ? rows
          : [{ Date: '', Type: '', Category: '', 'Paid via': '', 'Money from': '', Note: '', 'Recorded by': '', Amount: '' }],
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws1, 'Summary');
      XLSX.utils.book_append_sheet(wb, ws2, 'Expenses');
      XLSX.writeFile(wb, `talabahan-expenses-${from}_to_${to}.xlsx`);
    } catch {
      toast('Could not export the file');
    }
  }

  return (
    <section className="screen">
      <div className="topbar">
        <h2>Expenses</h2>
        <div className="grow"></div>
        {isOwner ? (
          <>
            <div className="payBtns" style={{ marginTop: 0, gridTemplateColumns: '1fr 1fr 1fr', maxWidth: 300 }}>
              <button className={sel(period === 'today')} onClick={() => setPeriod('today')}>
                Today
              </button>
              <button className={sel(period === 'month')} onClick={() => setPeriod('month')}>
                Month
              </button>
              <button className={sel(period === 'range')} onClick={() => setPeriod('range')}>
                Range
              </button>
            </div>
            <button className="btn" onClick={openTrend}>
              📈 Trend
            </button>
            <button className="btn" onClick={exportXlsx}>
              ⬇ Export
            </button>
          </>
        ) : (
          <span className="tblSessionNo">Today&apos;s expenses</span>
        )}
        <button className="btn primary" onClick={addExpense}>
          ＋ Add expense
        </button>
      </div>

      {isOwner && period === 'range' && (
        <div className="fieldRow" style={{ padding: '0 20px' }}>
          <div className="field">
            <label>From</label>
            <input type="date" value={fromStr} max={today} onChange={(e) => e.target.value && setFromStr(e.target.value)} />
          </div>
          <div className="field">
            <label>To</label>
            <input type="date" value={toStr} min={fromStr} max={today} onChange={(e) => e.target.value && setToStr(e.target.value)} />
          </div>
        </div>
      )}

      {/* Net income cross-exam — owner only (managers don't see sales/profit) */}
      {isOwner ? (
        <div className="statRow">
          <div className="stat">
            <div className="lbl">Sales</div>
            <div className="val" style={{ color: 'var(--ok)' }}>{peso(salesTotal)}</div>
          </div>
          <div className="stat">
            <div className="lbl">Daily expenses</div>
            <div className="val" style={{ color: 'var(--danger)' }}>−{peso(expensesTotal)}</div>
          </div>
          <div className="stat" style={{ borderColor: 'var(--gold)', borderWidth: 2 }}>
            <div className="lbl">Net income</div>
            <div className="val" style={{ color: netIncome >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
              {netIncome < 0 ? '−' + peso(-netIncome) : peso(netIncome)}
            </div>
          </div>
          <div className="stat">
            <div className="lbl">🏦 Bank / GCash</div>
            <div className="val" style={{ color: bankTotal ? '#2F6DD0' : 'var(--muted)' }}>
              {peso(bankTotal)}
            </div>
          </div>
        </div>
      ) : (
        <div className="statRow">
          <div className="stat">
            <div className="lbl">Today&apos;s daily expenses</div>
            <div className="val" style={{ color: 'var(--danger)' }}>{peso(expensesTotal)}</div>
          </div>
          {bankTotal > 0 && (
            <div className="stat">
              <div className="lbl">🏦 Bank / GCash</div>
              <div className="val" style={{ color: '#2F6DD0' }}>{peso(bankTotal)}</div>
            </div>
          )}
        </div>
      )}

      <div className="expBody">
        {/* Breakdown by category (daily expenses) */}
        <aside className="expBreakdown">
          <h3>Daily expenses by category</h3>
          {CATS.map((c) => (
            <div className="expCatRow" key={c.key}>
              <span>{c.emoji} {c.label}</span>
              <b>{peso(Number(byCat[c.key] ?? 0))}</b>
            </div>
          ))}
          {extraCats.map((k) => (
            <div className="expCatRow" key={k}>
              <span>🧾 {k}</span>
              <b>{peso(Number(byCat[k] ?? 0))}</b>
            </div>
          ))}
          <div className="expCatRow total">
            <span>Total daily</span>
            <b>{peso(expensesTotal)}</b>
          </div>
          <div className="expCatRow" style={{ color: 'var(--muted)', fontSize: 13 }}>
            <span>💵 Cash</span>
            <b>{peso(cashExp)}</b>
          </div>
          <div className="expCatRow" style={{ color: 'var(--muted)', fontSize: 13 }}>
            <span>GCash</span>
            <b>{peso(gcashExp)}</b>
          </div>
          <div className="expCatRow" style={{ color: 'var(--muted)', fontSize: 13 }}>
            <span>💰 From sales</span>
            <b>{peso(salesExp)}</b>
          </div>
          <div className="expCatRow" style={{ color: employeeExp ? 'var(--danger)' : 'var(--muted)', fontSize: 13 }}>
            <span>🧑 Employee&apos;s money{employeeExp ? ' (owed)' : ''}</span>
            <b>{peso(employeeExp)}</b>
          </div>
          <div
            className="expCatRow"
            style={{ color: '#2F6DD0', fontSize: 13, borderTop: '1px dashed var(--line)', marginTop: 6 }}
          >
            <span>🏦 Bank / GCash (separate)</span>
            <b>{peso(bankTotal)}</b>
          </div>
        </aside>

        {/* Expense entries */}
        <div className="expList">
          {loading ? (
            <div className="centerNote">Loading…</div>
          ) : list.length === 0 ? (
            <div className="centerNote">No expenses for this period yet. Tap “Add expense”.</div>
          ) : (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Paid via</th>
                    <th>Money from</th>
                    <th>Note</th>
                    <th>Recorded by</th>
                    <th className="num">Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((x) => (
                    <tr key={x.id} className={x.scope === 'bank' ? 'bankRow' : ''}>
                      <td>{prettyDate(x.spent_at)}</td>
                      <td>{scopeLabel(x.scope)}</td>
                      <td>{catEmoji(x.category)} {catLabel(x.category)}</td>
                      <td>{payLabel(x.payment_method)}</td>
                      <td>{srcLabel(x.fund_source)}</td>
                      <td>{x.note || '—'}</td>
                      <td>{x.recorded_by_name || '—'}</td>
                      <td className="num"><b>{peso(x.amount)}</b></td>
                      <td>
                        {isOwner && (
                          <span style={{ display: 'inline-flex', gap: 2 }}>
                            <button className="linkEdit" onClick={() => editExpense(x)} aria-label="Edit expense">
                              ✏️
                            </button>
                            <button className="linkDanger" onClick={() => removeExpense(x)} aria-label="Delete expense">
                              🗑
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TrendModal({ branchId, onClose }: { branchId: number | null; onClose: () => void }) {
  const [rows, setRows] = useState<
    { label: string; sales: number; expenses: number; net: number }[] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const months: { label: string; from: string; to: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      months.push({
        label: d.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' }),
        from: isoDate(d),
        to: i === 0 ? isoDate(now) : isoDate(last),
      });
    }
    Promise.all(months.map((m) => api.netIncome(branchId, m.from, m.to)))
      .then((res) => {
        if (cancelled) return;
        setRows(
          months.map((m, i) => {
            const sales = Number(res[i].sales_total);
            const expenses = Number(res[i].expenses_total);
            return { label: m.label, sales, expenses, net: sales - expenses };
          }),
        );
      })
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const maxAbs = rows ? Math.max(1, ...rows.map((r) => Math.abs(r.net))) : 1;

  return (
    <>
      <header>
        <h3>📈 Net income — last 6 months</h3>
      </header>
      <div className="bodyPad">
        {!rows ? (
          <div className="centerNote">Loading…</div>
        ) : (
          <div className="trendWrap">
            {rows.map((r) => (
              <div className="trendRow" key={r.label}>
                <span className="tMonth">{r.label}</span>
                <div className="tBarTrack">
                  <div
                    className="tBar"
                    style={{
                      width: `${(Math.abs(r.net) / maxAbs) * 100}%`,
                      background: r.net >= 0 ? 'var(--ok)' : 'var(--danger)',
                    }}
                  />
                </div>
                <span className="tNet" style={{ color: r.net >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
                  {r.net < 0 ? '−' + peso(-r.net) : peso(r.net)}
                </span>
              </div>
            ))}
            <div className="trendLegend">
              Bar = net income (sales − expenses) per month. Tap a month in the tabs above for detail.
            </div>
          </div>
        )}
      </div>
      <footer>
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </footer>
    </>
  );
}

function ExpenseModal({
  defaultDate,
  lockDate,
  initial,
  onSave,
  onCancel,
}: {
  defaultDate: string;
  lockDate?: boolean;
  initial?: {
    category: string;
    amount: number;
    payment_method?: string;
    fund_source?: string;
    scope?: string;
    note?: string | null;
    spent_at: string;
  };
  onSave: (data: {
    category: string;
    amount: number;
    payment_method: string;
    fund_source: string;
    scope: string;
    note?: string;
    spent_at: string;
  }) => void;
  onCancel: () => void;
}) {
  const editing = !!initial;
  const [scope, setScope] = useState<'daily' | 'bank'>(initial?.scope === 'bank' ? 'bank' : 'daily');
  const [category, setCategory] = useState<ExpenseCategory>((initial?.category as ExpenseCategory) ?? 'market');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [payment, setPayment] = useState<'cash' | 'gcash'>(initial?.payment_method === 'gcash' ? 'gcash' : 'cash');
  const [source, setSource] = useState<'sales' | 'employee'>(initial?.fund_source === 'employee' ? 'employee' : 'sales');
  const [note, setNote] = useState(initial?.note ?? '');
  const [date, setDate] = useState(initial?.spent_at ?? defaultDate);
  const amt = Number(amount);
  const valid = amt > 0;
  return (
    <>
      <header>
        <h3>{editing ? 'Edit expense' : 'Add expense'}</h3>
      </header>
      <div className="bodyPad">
        <label style={{ fontWeight: 600, fontSize: 14 }}>Expense type</label>
        <div className="payBtns" style={{ gridTemplateColumns: '1fr 1fr', margin: '6px 0 12px' }}>
          <button className={scope === 'daily' ? 'sel' : ''} onClick={() => setScope('daily')}>
            📅 Daily
          </button>
          <button className={scope === 'bank' ? 'sel' : ''} onClick={() => setScope('bank')}>
            🏦 Bank / GCash
          </button>
        </div>
        {scope === 'bank' && (
          <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '-6px 2px 12px' }}>
            Kept out of daily expenses & net income — tracked as a separate supply/capital total.
          </p>
        )}
        <label style={{ fontWeight: 600, fontSize: 14 }}>Category</label>
        <div className="payBtns" style={{ gridTemplateColumns: '1fr 1fr', margin: '6px 0 12px' }}>
          {CATS.map((c) => (
            <button key={c.key} className={category === c.key ? 'sel' : ''} onClick={() => setCategory(c.key)}>
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
        <div className="field">
          <label>Amount</label>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            autoFocus
            placeholder="0.00"
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <label style={{ fontWeight: 600, fontSize: 14 }}>Paid via</label>
        <div className="payBtns" style={{ gridTemplateColumns: '1fr 1fr', margin: '6px 0 12px' }}>
          <button className={payment === 'cash' ? 'sel' : ''} onClick={() => setPayment('cash')}>
            💵 Cash
          </button>
          <button className={payment === 'gcash' ? 'sel' : ''} onClick={() => setPayment('gcash')}>
            GCash
          </button>
        </div>
        <label style={{ fontWeight: 600, fontSize: 14 }}>Money came from</label>
        <div className="payBtns" style={{ gridTemplateColumns: '1fr 1fr', margin: '6px 0 12px' }}>
          <button className={source === 'sales' ? 'sel' : ''} onClick={() => setSource('sales')}>
            💰 Sales
          </button>
          <button className={source === 'employee' ? 'sel' : ''} onClick={() => setSource('employee')}>
            🧑 Employee&apos;s money
          </button>
        </div>
        <div className="field">
          <label>Note (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2 sacks rice, supplier name…" />
        </div>
        {!lockDate && (
          <div className="field">
            <label>Date</label>
            <input type="date" value={date} max={defaultDate} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
        )}
      </div>
      <footer>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={!valid}
          onClick={() =>
            onSave({
              category,
              amount: amt,
              payment_method: payment,
              fund_source: source,
              scope,
              note: note.trim() || undefined,
              spent_at: date,
            })
          }
        >
          {editing ? 'Save changes' : 'Save expense'}
        </button>
      </footer>
    </>
  );
}
