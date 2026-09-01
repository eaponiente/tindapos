'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { peso, fmtDT } from '@/lib/format';
import { useUI } from './UI';
import Sell from './Sell';
import { groupRounds, openPayBill, openSessionReceipt } from './sessionKit';
import type { Category, Employee, FloorTable, Item, TableSession } from '@/lib/types';

interface TablesProps {
  employee: Employee;
  branchId: number | null;
  items: Item[];
  categories: Category[];
  reloadItems: () => Promise<void>;
  isOwner: boolean;
}

type Mode = { screen: 'floor' } | { screen: 'panel'; session: TableSession } | { screen: 'order'; session: TableSession };

export default function Tables({ employee, branchId, items, categories, reloadItems, isOwner }: TablesProps) {
  const { toast, openModal, closeModal } = useUI();
  const [floor, setFloor] = useState<FloorTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>({ screen: 'floor' });

  const loadFloor = useCallback(async () => {
    if (!branchId) return;
    try {
      setFloor(await api.floor(branchId));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load the tables');
    } finally {
      setLoading(false);
    }
  }, [branchId, toast]);

  useEffect(() => {
    loadFloor();
  }, [loadFloor]);

  // Keep the floor fresh so a second cashier's changes show up (and freed
  // tables reappear) without a manual refresh — only while viewing the floor.
  useEffect(() => {
    if (mode.screen !== 'floor') return;
    const id = setInterval(loadFloor, 8000);
    const onFocus = () => loadFloor();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [mode.screen, loadFloor]);

  async function openPanel(sessionId: number) {
    try {
      const session = await api.session(sessionId);
      setMode({ screen: 'panel', session });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not open that table');
    }
  }

  async function refreshPanel(sessionId: number) {
    const session = await api.session(sessionId);
    setMode({ screen: 'panel', session });
  }

  // ── Start a new order on an available table ──────────────────────────────
  function startOrder(table: FloorTable) {
    openModal(
      <CustomerCountModal
        tableLabel={String(table.table_number)}
        onCancel={closeModal}
        onConfirm={async (count) => {
          try {
            const { session_id } = await api.openSession({
              branch_id: branchId!,
              table_ids: [table.table_id],
              customer_count: count,
              employee_id: employee.id,
            });
            const session = await api.session(session_id);
            closeModal();
            // Go straight into ordering for the first round.
            setMode({ screen: 'order', session });
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not start the order');
          }
        }}
      />,
    );
  }

  // Leaving the ordering screen. If the session is still empty (they backed out
  // of a brand-new table without ordering), void it so the table frees up.
  async function leaveOrder(session: TableSession) {
    try {
      const fresh = await api.session(session.id);
      if (fresh.items.length === 0 && fresh.status === 'open') {
        await api.voidSession(session.id, employee.id);
        toast(`Table ${fresh.tables_label} released`);
        setMode({ screen: 'floor' });
        loadFloor();
        return;
      }
      setMode({ screen: 'panel', session: fresh });
    } catch {
      setMode({ screen: 'floor' });
      loadFloor();
    }
  }

  // ── Pay bill (shared bill → discount → payment → receipt flow) ────────────
  function payBill(session: TableSession) {
    openPayBill(
      { openModal, closeModal, toast },
      {
        session,
        employeeId: employee.id,
        reloadItems,
        onPaid: (sale) =>
          openSessionReceipt(
            { openModal, closeModal, toast },
            {
              sale,
              title: 'Bill paid 🎉',
              onDone: () => {
                setMode({ screen: 'floor' });
                loadFloor();
              },
            },
          ),
      },
    );
  }

  // ── Combine / Transfer / Separate ────────────────────────────────────────
  function combine(session: TableSession) {
    const available = floor.filter((t) => t.session_id === null);
    if (available.length === 0) {
      toast('No available tables to combine');
      return;
    }
    openModal(
      <TablePickerModal
        title={`Combine with Table ${session.tables_label}`}
        instruction="Pick the free table(s) to join this group:"
        tables={available}
        confirmLabel="Combine tables"
        onCancel={closeModal}
        onConfirm={async (ids) => {
          try {
            const updated = await api.combineTables(session.id, ids, employee.id);
            closeModal();
            setMode({ screen: 'panel', session: updated });
            loadFloor();
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not combine');
          }
        }}
      />,
    );
  }

  function transfer(session: TableSession) {
    const available = floor.filter((t) => t.session_id === null);
    if (available.length === 0) {
      toast('No available tables to move to');
      return;
    }
    openModal(
      <TablePickerModal
        title={`Transfer Table ${session.tables_label}`}
        instruction="Choose the destination table(s). The whole order moves with them:"
        tables={available}
        confirmLabel="Transfer here"
        onCancel={closeModal}
        onConfirm={async (ids) => {
          const labels = available
            .filter((t) => ids.includes(t.table_id))
            .map((t) => t.table_number)
            .join(' + ');
          confirmAction(
            `Transfer Table ${session.tables_label} → Table ${labels}?`,
            async () => {
              try {
                const updated = await api.transferSession(session.id, ids, employee.id);
                closeModal();
                setMode({ screen: 'panel', session: updated });
                loadFloor();
              } catch (e) {
                toast(e instanceof Error ? e.message : 'Could not transfer');
              }
            },
          );
        }}
      />,
    );
  }

  function separate(session: TableSession) {
    if (session.tables.length < 2) {
      toast('This session only has one table');
      return;
    }
    openModal(
      <SeparateModal
        session={session}
        onCancel={closeModal}
        onConfirm={async (releaseIds) => {
          try {
            const updated = await api.separateTables(session.id, releaseIds, employee.id);
            closeModal();
            setMode({ screen: 'panel', session: updated });
            loadFloor();
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not separate');
          }
        }}
      />,
    );
  }

  function cancelSession(session: TableSession) {
    confirmAction(
      `Cancel Table ${session.tables_label} without paying? This clears the order and frees the table${
        session.tables.length > 1 ? 's' : ''
      }.`,
      async () => {
        try {
          await api.voidSession(session.id, employee.id);
          toast(`Table ${session.tables_label} released`);
          setMode({ screen: 'floor' });
          loadFloor();
        } catch (e) {
          toast(e instanceof Error ? e.message : 'Could not cancel the session');
        }
      },
      'Cancel session',
    );
  }

  // Fix a mis-added item on an open table: adjust qty or remove (qty 0).
  async function editItem(sessionId: number, lineId: number, qty: number) {
    try {
      const updated = await api.updateSessionItem(sessionId, lineId, qty, employee.id);
      setMode({ screen: 'panel', session: updated });
      loadFloor();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update the item');
    }
  }

  function confirmAction(message: string, onYes: () => void, yesLabel = 'Confirm') {
    openModal(
      <>
        <header>
          <h3>Please confirm</h3>
        </header>
        <div className="bodyPad">
          <p style={{ margin: 0 }}>{message}</p>
        </div>
        <footer>
          <button className="btn" onClick={closeModal}>
            Go back
          </button>
          <button className="btn primary" onClick={onYes}>
            {yesLabel}
          </button>
        </footer>
      </>,
    );
  }

  // ── Ordering overlay reuses the whole Sell catalog in "add to table" mode ──
  if (mode.screen === 'order') {
    return (
      <Sell
        employee={employee}
        branchId={branchId}
        items={items}
        categories={categories}
        reloadItems={reloadItems}
        isOwner={isOwner}
        session={{
          id: mode.session.id,
          title: `Table ${mode.session.tables_label}`,
          onAdded: () => refreshPanel(mode.session.id),
          onCancel: () => leaveOrder(mode.session),
        }}
      />
    );
  }

  if (mode.screen === 'panel') {
    const s = mode.session;
    const rounds = groupRounds(s);
    return (
      <section className="screen">
        <div className="topbar">
          <button className="btn" onClick={() => { setMode({ screen: 'floor' }); loadFloor(); }}>
            ← Tables
          </button>
          <h2>Table {s.tables_label}</h2>
          <span className="tblPax">👥 {s.customer_count}</span>
          <div className="grow"></div>
          <span className="tblSessionNo">Session #{s.id}</span>
        </div>
        <div className="sessionWrap">
          <div className="sessionOrder">
            {s.items.length === 0 ? (
              <div className="centerNote">No items yet — tap ADD ORDER to start.</div>
            ) : (
              rounds.map((r) => (
                <div className="roundBlock" key={r.round}>
                  <div className="roundHead">
                    Round {r.round}
                    <span>{fmtDT(r.at)}</span>
                  </div>
                  {r.lines.map((l) => (
                    <div className="roundLine" key={l.id}>
                      <span className="q">{l.qty}×</span>
                      <span className="nm">{l.name}</span>
                      <span className="amt">{peso(Number(l.price) * l.qty)}</span>
                      <span className="lineEdit">
                        <button onClick={() => editItem(s.id, l.id, l.qty - 1)} aria-label="Reduce quantity">
                          −
                        </button>
                        <button onClick={() => editItem(s.id, l.id, l.qty + 1)} aria-label="Add one">
                          ＋
                        </button>
                        <button className="rm" onClick={() => editItem(s.id, l.id, 0)} aria-label="Remove item">
                          ✕
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
          <aside className="sessionSide">
            <div className="sessionTotal">
              <span>Total</span>
              <b>{peso(s.total)}</b>
            </div>
            <button className="tblAction add" onClick={() => setMode({ screen: 'order', session: s })}>
              ＋ Add order
            </button>
            <button className="tblAction pay" onClick={() => payBill(s)}>
              💵 Pay bill
            </button>
            <div className="tblActionGrid">
              <button className="tblAction" onClick={() => combine(s)}>
                ⇄ Combine tables
              </button>
              <button className="tblAction" onClick={() => transfer(s)}>
                → Transfer table
              </button>
              <button
                className="tblAction"
                onClick={() => separate(s)}
                disabled={s.tables.length < 2}
              >
                ⇥ Separate tables
              </button>
              <button className="tblAction danger" onClick={() => cancelSession(s)}>
                ✕ Cancel session
              </button>
            </div>
          </aside>
        </div>
      </section>
    );
  }

  // ── Floor plan ────────────────────────────────────────────────────────────
  return (
    <section className="screen">
      <div className="topbar">
        <h2>Tables</h2>
        <div className="grow"></div>
        <div className="floorLegend">
          <span><i className="dot free" /> Available</span>
          <span><i className="dot busy" /> Occupied</span>
          <span><i className="dot pay" /> For payment</span>
        </div>
      </div>
      {loading ? (
        <div className="centerNote">Loading tables…</div>
      ) : (
        <div className="floorGrid">
          {floor.map((t) => {
            const status = t.session_id === null ? 'free' : t.session_status === 'for_payment' ? 'pay' : 'busy';
            const combined = (t.session_tables_label ?? '').includes('+');
            return (
              <button
                key={t.table_id}
                className={'tableCard ' + status}
                onClick={() => (t.session_id ? openPanel(t.session_id) : startOrder(t))}
              >
                <div className="tcTop">
                  <span className="tcNum">
                    {combined ? `Table ${t.session_tables_label}` : `Table ${t.table_number}`}
                  </span>
                  <span className={'tcStatus ' + status}>
                    {status === 'free' ? 'Available' : status === 'pay' ? 'For payment' : 'Occupied'}
                  </span>
                </div>
                {t.session_id ? (
                  <div className="tcBody">
                    <div className="tcTotal">{peso(t.order_total ?? 0)}</div>
                    <div className="tcMeta">👥 {t.customer_count} · {t.item_count ?? 0} items</div>
                  </div>
                ) : (
                  <div className="tcBody">
                    <div className="tcSeats">Seats {t.capacity}</div>
                    <div className="tcTapHint">Tap to start</div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Modals ───────────────────────────────────────────────────────────────────

function CustomerCountModal({
  tableLabel,
  onConfirm,
  onCancel,
}: {
  tableLabel: string;
  onConfirm: (count: number) => void;
  onCancel: () => void;
}) {
  const [count, setCount] = useState(2);
  return (
    <>
      <header>
        <h3>Start order — Table {tableLabel}</h3>
      </header>
      <div className="bodyPad">
        <label style={{ fontWeight: 600, fontSize: 14 }}>Number of customers</label>
        <div className="paxRow">
          <button className="paxBtn" onClick={() => setCount((c) => Math.max(1, c - 1))}>
            −
          </button>
          <span className="paxNum">{count}</span>
          <button className="paxBtn" onClick={() => setCount((c) => c + 1)}>
            ＋
          </button>
        </div>
        <div className="paxQuick">
          {[1, 2, 4, 6, 8, 10].map((n) => (
            <button key={n} className={n === count ? 'sel' : ''} onClick={() => setCount(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <footer>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" onClick={() => onConfirm(count)}>
          Start order
        </button>
      </footer>
    </>
  );
}

function TablePickerModal({
  title,
  instruction,
  tables,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  instruction: string;
  tables: FloorTable[];
  confirmLabel: string;
  onConfirm: (ids: number[]) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <>
      <header>
        <h3>{title}</h3>
      </header>
      <div className="bodyPad">
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 14 }}>{instruction}</p>
        <div className="pickerGrid">
          {tables.map((t) => (
            <button
              key={t.table_id}
              className={'pickCard' + (picked.includes(t.table_id) ? ' sel' : '')}
              onClick={() => toggle(t.table_id)}
            >
              Table {t.table_number}
              <small>Seats {t.capacity}</small>
            </button>
          ))}
        </div>
      </div>
      <footer>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" disabled={picked.length === 0} onClick={() => onConfirm(picked)}>
          {confirmLabel}
        </button>
      </footer>
    </>
  );
}

function SeparateModal({
  session,
  onConfirm,
  onCancel,
}: {
  session: TableSession;
  onConfirm: (releaseIds: number[]) => void;
  onCancel: () => void;
}) {
  const [release, setRelease] = useState<number[]>([]);
  const toggle = (id: number) =>
    setRelease((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const keeping = session.tables.length - release.length;
  return (
    <>
      <header>
        <h3>Separate Table {session.tables_label}</h3>
      </header>
      <div className="bodyPad">
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 14 }}>
          Tap the table(s) to release. The order stays with the tables you keep.
        </p>
        <div className="pickerGrid">
          {session.tables.map((t) => (
            <button
              key={t.table_id}
              className={'pickCard' + (release.includes(t.table_id) ? ' release' : '')}
              onClick={() => toggle(t.table_id)}
            >
              Table {t.table_number}
              <small>{release.includes(t.table_id) ? 'Release' : 'Keep'}</small>
            </button>
          ))}
        </div>
      </div>
      <footer>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={release.length === 0 || keeping < 1}
          onClick={() => onConfirm(release)}
        >
          Release {release.length || ''}
        </button>
      </footer>
    </>
  );
}
