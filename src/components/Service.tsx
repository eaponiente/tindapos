'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { peso, fmtDT } from '@/lib/format';
import { useUI } from './UI';
import Sell, { orderTypeLabel } from './Sell';
import { groupRounds, openPayBill, openSessionReceipt } from './sessionKit';
import type {
  Category,
  Employee,
  FloorTable,
  Item,
  OrderTicket,
  ServiceType,
  TableSession,
} from '@/lib/types';

interface ServiceProps {
  employee: Employee;
  branchId: number | null;
  items: Item[];
  categories: Category[];
  reloadItems: () => Promise<void>;
  isOwner: boolean;
}

type Mode =
  | { screen: 'landing' }
  | { screen: 'panel'; session: TableSession }
  | { screen: 'order'; session: TableSession };

const TYPE_EMOJI: Record<ServiceType, string> = {
  dine_in: '🍽',
  take_out: '🥡',
  delivery: '🛵',
  pick_up: '🛍',
};

function sessionTitle(s: TableSession): string {
  if (s.service_type === 'dine_in') return `Table ${s.tables_label}`;
  const t = orderTypeLabel(s.service_type);
  return s.customer_name ? `${t} — ${s.customer_name}` : t;
}

export default function Service({ employee, branchId, items, categories, reloadItems, isOwner }: ServiceProps) {
  const { toast, openModal, closeModal } = useUI();
  const ui = { openModal, closeModal, toast };
  const [floor, setFloor] = useState<FloorTable[]>([]);
  const [tickets, setTickets] = useState<OrderTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>({ screen: 'landing' });

  const loadAll = useCallback(async () => {
    if (!branchId) return;
    try {
      const [f, t] = await Promise.all([api.floor(branchId), api.orders(branchId)]);
      setFloor(f);
      setTickets(t);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load the floor');
    } finally {
      setLoading(false);
    }
  }, [branchId, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (mode.screen !== 'landing') return;
    const id = setInterval(loadAll, 8000);
    const onFocus = () => loadAll();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [mode.screen, loadAll]);

  const backToLanding = () => {
    setMode({ screen: 'landing' });
    loadAll();
  };
  async function openPanel(sessionId: number) {
    try {
      setMode({ screen: 'panel', session: await api.session(sessionId) });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not open that');
    }
  }
  async function refreshPanel(sessionId: number) {
    setMode({ screen: 'panel', session: await api.session(sessionId) });
  }

  // ── Start flows ───────────────────────────────────────────────────────────
  // Tapping a free table starts ordering right away; the diner count is set
  // afterwards from the table panel.
  async function startTable(table: FloorTable) {
    try {
      const { session_id } = await api.openSession({
        branch_id: branchId!,
        table_ids: [table.table_id],
        customer_count: 1,
        employee_id: employee.id,
      });
      setMode({ screen: 'order', session: await api.session(session_id) });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not start the order');
    }
  }

  function editDiners(session: TableSession) {
    openModal(
      <DinerCountModal
        initial={session.customer_count}
        onCancel={closeModal}
        onConfirm={async (count) => {
          try {
            const updated = await api.updateSessionCount(session.id, count);
            closeModal();
            setMode({ screen: 'panel', session: updated });
            loadAll();
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not update the diner count');
          }
        }}
      />,
    );
  }

  function newOrder() {
    openModal(
      <NewOrderModal
        onCancel={closeModal}
        onConfirm={async (data) => {
          try {
            const { session_id } = await api.openOrder({ branch_id: branchId!, employee_id: employee.id, ...data });
            closeModal();
            setMode({ screen: 'order', session: await api.session(session_id) });
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not start the order');
          }
        }}
      />,
    );
  }

  async function leaveOrder(session: TableSession) {
    try {
      const fresh = await api.session(session.id);
      if (fresh.items.length === 0 && fresh.status === 'open') {
        await api.voidSession(session.id, employee.id);
        backToLanding();
        return;
      }
      setMode({ screen: 'panel', session: fresh });
    } catch {
      backToLanding();
    }
  }

  // ── Session actions ─────────────────────────────────────────────────────────
  function payBill(session: TableSession) {
    openPayBill(ui, {
      session,
      employeeId: employee.id,
      reloadItems,
      onPaid: (sale) => openSessionReceipt(ui, { sale, title: 'Bill paid 🎉', onDone: backToLanding }),
    });
  }

  async function editItem(sessionId: number, lineId: number, qty: number) {
    try {
      setMode({ screen: 'panel', session: await api.updateSessionItem(sessionId, lineId, qty, employee.id) });
      loadAll();
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

  // dine-in only
  function combine(session: TableSession) {
    const available = floor.filter((t) => t.session_id === null);
    if (available.length === 0) return toast('No available tables to combine');
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
            loadAll();
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not combine');
          }
        }}
      />,
    );
  }

  function transfer(session: TableSession) {
    const available = floor.filter((t) => t.session_id === null);
    if (available.length === 0) return toast('No available tables to move to');
    openModal(
      <TablePickerModal
        title={`Transfer Table ${session.tables_label}`}
        instruction="Choose the destination table(s). The whole order moves with them:"
        tables={available}
        confirmLabel="Transfer here"
        onCancel={closeModal}
        onConfirm={async (ids) => {
          const labels = available.filter((t) => ids.includes(t.table_id)).map((t) => t.table_number).join(' + ');
          confirmAction(`Transfer Table ${session.tables_label} → Table ${labels}?`, async () => {
            try {
              const updated = await api.transferSession(session.id, ids, employee.id);
              closeModal();
              setMode({ screen: 'panel', session: updated });
              loadAll();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Could not transfer');
            }
          });
        }}
      />,
    );
  }

  function separate(session: TableSession) {
    if (session.tables.length < 2) return toast('This session only has one table');
    openModal(
      <SeparateModal
        session={session}
        onCancel={closeModal}
        onConfirm={async (releaseIds) => {
          try {
            const updated = await api.separateTables(session.id, releaseIds, employee.id);
            closeModal();
            setMode({ screen: 'panel', session: updated });
            loadAll();
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not separate');
          }
        }}
      />,
    );
  }

  // order → dine-in
  async function seatAtTable(session: TableSession) {
    const free = floor.filter((t) => t.session_id === null);
    if (free.length === 0) return toast('No available tables right now');
    openModal(
      <TablePickerModal
        title="Seat at table"
        instruction="Pick the table(s). This order becomes a dine-in table and moves with it."
        tables={free}
        confirmLabel="Seat here"
        onCancel={closeModal}
        onConfirm={async (ids) => {
          try {
            const updated = await api.seatOrder(session.id, ids, employee.id);
            closeModal();
            setMode({ screen: 'panel', session: updated }); // now a dine-in table
            loadAll();
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not seat the order');
          }
        }}
      />,
    );
  }

  function cancelSession(session: TableSession) {
    const dine = session.service_type === 'dine_in';
    confirmAction(
      dine
        ? `Cancel Table ${session.tables_label} without paying? This clears the order and frees the table${
            session.tables.length > 1 ? 's' : ''
          }.`
        : `Cancel this ${orderTypeLabel(session.service_type).toLowerCase()} order without paying? The order will be cleared.`,
      async () => {
        try {
          await api.voidSession(session.id, employee.id);
          closeModal();
          backToLanding();
        } catch (e) {
          toast(e instanceof Error ? e.message : 'Could not cancel');
        }
      },
      dine ? 'Cancel session' : 'Cancel order',
    );
  }

  // ── Ordering overlay (reuses the Sell catalog) ────────────────────────────
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
          title: sessionTitle(mode.session),
          onAdded: () => refreshPanel(mode.session.id),
          onCancel: () => leaveOrder(mode.session),
        }}
      />
    );
  }

  // ── Session panel (tables + orders share this) ────────────────────────────
  if (mode.screen === 'panel') {
    const s = mode.session;
    const dine = s.service_type === 'dine_in';
    const rounds = groupRounds(s);
    const hasCustomer = s.customer_name || s.customer_phone || s.customer_address || s.customer_landmark;
    return (
      <section className="screen">
        <div className="topbar">
          <button className="btn" onClick={backToLanding}>
            ← Service
          </button>
          <h2>
            {dine ? `Table ${s.tables_label}` : `${TYPE_EMOJI[s.service_type]} ${orderTypeLabel(s.service_type)}`}
          </h2>
          {dine && (
            <button className="tblPax editable" onClick={() => editDiners(s)} title="Edit diners">
              👥 {s.customer_count} ✎
            </button>
          )}
          <div className="grow"></div>
          <span className="tblSessionNo">{dine ? 'Session' : 'Order'} #{s.id}</span>
        </div>
        <div className="sessionWrap">
          <div className="sessionOrder">
            {!dine && hasCustomer && (
              <div className="customerCard">
                {s.customer_name && <div className="cName">{s.customer_name}</div>}
                {s.customer_phone && <div>📞 {s.customer_phone}</div>}
                {s.customer_address && <div>📍 {s.customer_address}</div>}
                {s.customer_landmark && <div className="cLand">Landmark: {s.customer_landmark}</div>}
              </div>
            )}
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
              {dine ? (
                <>
                  <button className="tblAction" onClick={() => combine(s)}>
                    ⇄ Combine tables
                  </button>
                  <button className="tblAction" onClick={() => transfer(s)}>
                    → Transfer table
                  </button>
                  <button className="tblAction" onClick={() => separate(s)} disabled={s.tables.length < 2}>
                    ⇥ Separate tables
                  </button>
                </>
              ) : (
                (s.service_type === 'pick_up' || s.service_type === 'take_out') && (
                  <button className="tblAction" onClick={() => seatAtTable(s)}>
                    🍽 Dine in
                  </button>
                )
              )}
              <button className="tblAction danger" onClick={() => cancelSession(s)}>
                ✕ {dine ? 'Cancel session' : 'Cancel order'}
              </button>
            </div>
          </aside>
        </div>
      </section>
    );
  }

  // ── Landing: tables on top, open orders below ─────────────────────────────
  return (
    <section className="screen">
      <div className="topbar">
        <h2>Service</h2>
        <div className="grow"></div>
        <div className="floorLegend">
          <span><i className="dot free" /> Available</span>
          <span><i className="dot busy" /> Occupied</span>
        </div>
      </div>
      {loading ? (
        <div className="centerNote">Loading…</div>
      ) : (
        <div className="serviceScroll">
          <div className="floorGrid">
            {floor.map((t) => {
              const status = t.session_id === null ? 'free' : t.session_status === 'for_payment' ? 'pay' : 'busy';
              const combined = (t.session_tables_label ?? '').includes('+');
              return (
                <button
                  key={t.table_id}
                  className={'tableCard ' + status}
                  onClick={() => (t.session_id ? openPanel(t.session_id) : startTable(t))}
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

          <div className="svcOrdersHead">
            <h3>Open orders</h3>
            <span className="svcOrdersCount">{tickets.length}</span>
            <div className="grow"></div>
            <button className="btn primary" onClick={newOrder}>
              ＋ New order
            </button>
          </div>
          {tickets.length === 0 ? (
            <div className="svcOrdersEmpty">No open take-out, delivery, or pick-up orders.</div>
          ) : (
            <div className="orderGrid">
              {tickets.map((t) => (
                <button key={t.id} className={'orderCard ' + t.service_type} onClick={() => openPanel(t.id)}>
                  <div className="ocTop">
                    <span className="ocType">
                      {TYPE_EMOJI[t.service_type]} {orderTypeLabel(t.service_type)}
                    </span>
                    <span className="ocNo">#{t.id}</span>
                  </div>
                  <div className="ocName">{t.customer_name || 'Walk-in'}</div>
                  {t.customer_phone && <div className="ocMeta">📞 {t.customer_phone}</div>}
                  <div className="ocFoot">
                    <span className="ocTotal">{peso(t.total)}</span>
                    <span className="ocItems">{t.item_count} items</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Modals ───────────────────────────────────────────────────────────────────

function DinerCountModal({
  initial,
  onConfirm,
  onCancel,
}: {
  initial: number;
  onConfirm: (count: number) => void;
  onCancel: () => void;
}) {
  const [count, setCount] = useState(Math.max(1, initial || 1));
  return (
    <>
      <header>
        <h3>Number of diners</h3>
      </header>
      <div className="bodyPad">
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
          Save
        </button>
      </footer>
    </>
  );
}

function NewOrderModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (data: {
    service_type: ServiceType;
    customer_name?: string;
    customer_phone?: string;
    customer_address?: string;
    customer_landmark?: string;
  }) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<ServiceType>('take_out');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const showAddress = type === 'delivery';
  return (
    <>
      <header>
        <h3>New order</h3>
      </header>
      <div className="bodyPad">
        <div className="payBtns" style={{ marginTop: 0, gridTemplateColumns: '1fr 1fr 1fr' }}>
          <button className={type === 'take_out' ? 'sel' : ''} onClick={() => setType('take_out')}>
            🥡 Take-out
          </button>
          <button className={type === 'delivery' ? 'sel' : ''} onClick={() => setType('delivery')}>
            🛵 Delivery
          </button>
          <button className={type === 'pick_up' ? 'sel' : ''} onClick={() => setType('pick_up')}>
            🛍 Pick-up
          </button>
        </div>
        <div className="field">
          <label>Customer name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Juan D." autoFocus />
        </div>
        <div className="field">
          <label>Phone number</label>
          <input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0917…" />
        </div>
        {showAddress && (
          <>
            <div className="field">
              <label>Delivery address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="House #, street, brgy" />
            </div>
            <div className="field">
              <label>Landmark</label>
              <input value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Near…" />
            </div>
          </>
        )}
      </div>
      <footer>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn primary"
          onClick={() =>
            onConfirm({
              service_type: type,
              customer_name: name.trim() || undefined,
              customer_phone: phone.trim() || undefined,
              customer_address: address.trim() || undefined,
              customer_landmark: landmark.trim() || undefined,
            })
          }
        >
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
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
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
  const toggle = (id: number) => setRelease((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
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
