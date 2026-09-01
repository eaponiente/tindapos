'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { peso, fmtDT } from '@/lib/format';
import { useUI } from './UI';
import Sell, { orderTypeLabel } from './Sell';
import { groupRounds, openPayBill, openSessionReceipt } from './sessionKit';
import type { Category, Employee, FloorTable, Item, OrderTicket, ServiceType, TableSession } from '@/lib/types';

interface OrdersProps {
  employee: Employee;
  branchId: number | null;
  items: Item[];
  categories: Category[];
  reloadItems: () => Promise<void>;
  isOwner: boolean;
}

type Mode =
  | { screen: 'list' }
  | { screen: 'panel'; session: TableSession }
  | { screen: 'order'; session: TableSession };

const TYPE_EMOJI: Record<ServiceType, string> = {
  dine_in: '🍽',
  take_out: '🥡',
  delivery: '🛵',
  pick_up: '🛍',
};

function sessionTitle(s: TableSession): string {
  const t = orderTypeLabel(s.service_type);
  return s.customer_name ? `${t} — ${s.customer_name}` : t;
}

export default function Orders({ employee, branchId, items, categories, reloadItems, isOwner }: OrdersProps) {
  const { toast, openModal, closeModal } = useUI();
  const ui = { openModal, closeModal, toast };
  const [tickets, setTickets] = useState<OrderTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>({ screen: 'list' });

  const loadTickets = useCallback(async () => {
    if (!branchId) return;
    try {
      setTickets(await api.orders(branchId));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }, [branchId, toast]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (mode.screen !== 'list') return;
    const id = setInterval(loadTickets, 8000);
    const onFocus = () => loadTickets();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [mode.screen, loadTickets]);

  async function openPanel(sessionId: number) {
    try {
      setMode({ screen: 'panel', session: await api.session(sessionId) });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not open that order');
    }
  }
  async function refreshPanel(sessionId: number) {
    setMode({ screen: 'panel', session: await api.session(sessionId) });
  }

  function newOrder() {
    openModal(
      <NewOrderModal
        onCancel={closeModal}
        onConfirm={async (data) => {
          try {
            const { session_id } = await api.openOrder({
              branch_id: branchId!,
              employee_id: employee.id,
              ...data,
            });
            const session = await api.session(session_id);
            closeModal();
            setMode({ screen: 'order', session }); // straight into ordering
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not start the order');
          }
        }}
      />,
    );
  }

  // Backed out of a brand-new order without ordering anything → discard it.
  async function leaveOrder(session: TableSession) {
    try {
      const fresh = await api.session(session.id);
      if (fresh.items.length === 0 && fresh.status === 'open') {
        await api.voidSession(session.id, employee.id);
        setMode({ screen: 'list' });
        loadTickets();
        return;
      }
      setMode({ screen: 'panel', session: fresh });
    } catch {
      setMode({ screen: 'list' });
      loadTickets();
    }
  }

  function payBill(session: TableSession) {
    openPayBill(ui, {
      session,
      employeeId: employee.id,
      reloadItems,
      onPaid: (sale) =>
        openSessionReceipt(ui, {
          sale,
          title: 'Bill paid 🎉',
          onDone: () => {
            setMode({ screen: 'list' });
            loadTickets();
          },
        }),
    });
  }

  async function editItem(sessionId: number, lineId: number, qty: number) {
    try {
      setMode({ screen: 'panel', session: await api.updateSessionItem(sessionId, lineId, qty, employee.id) });
      loadTickets();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update the item');
    }
  }

  // Pick-up/take-out customer decided to eat in: seat the order at a table.
  async function seatAtTable(session: TableSession) {
    let free: FloorTable[] = [];
    try {
      free = (await api.floor(branchId!)).filter((t) => t.session_id === null);
    } catch {
      toast('Could not load tables');
      return;
    }
    if (free.length === 0) {
      toast('No available tables right now');
      return;
    }
    openModal(
      <SeatPickerModal
        tables={free}
        onCancel={closeModal}
        onConfirm={async (ids) => {
          try {
            await api.seatOrder(session.id, ids, employee.id);
            closeModal();
            const labels = free
              .filter((t) => ids.includes(t.table_id))
              .map((t) => t.table_number)
              .join(' + ');
            toast(`Seated at Table ${labels} — now on the Tables screen`);
            setMode({ screen: 'list' });
            loadTickets();
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not seat the order');
          }
        }}
      />,
    );
  }

  function cancelOrder(session: TableSession) {
    openModal(
      <>
        <header>
          <h3>Please confirm</h3>
        </header>
        <div className="bodyPad">
          <p style={{ margin: 0 }}>
            Cancel this {orderTypeLabel(session.service_type).toLowerCase()} order without paying? The
            order will be cleared.
          </p>
        </div>
        <footer>
          <button className="btn" onClick={closeModal}>
            Go back
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              try {
                await api.voidSession(session.id, employee.id);
                closeModal();
                setMode({ screen: 'list' });
                loadTickets();
              } catch (e) {
                toast(e instanceof Error ? e.message : 'Could not cancel');
              }
            }}
          >
            Cancel order
          </button>
        </footer>
      </>,
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

  // ── Order ticket panel ────────────────────────────────────────────────────
  if (mode.screen === 'panel') {
    const s = mode.session;
    const rounds = groupRounds(s);
    return (
      <section className="screen">
        <div className="topbar">
          <button className="btn" onClick={() => { setMode({ screen: 'list' }); loadTickets(); }}>
            ← Orders
          </button>
          <h2>
            {TYPE_EMOJI[s.service_type]} {orderTypeLabel(s.service_type)}
          </h2>
          <div className="grow"></div>
          <span className="tblSessionNo">Order #{s.id}</span>
        </div>
        <div className="sessionWrap">
          <div className="sessionOrder">
            {(s.customer_name || s.customer_phone || s.customer_address || s.customer_landmark) && (
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
              {(s.service_type === 'pick_up' || s.service_type === 'take_out') && (
                <button className="tblAction" onClick={() => seatAtTable(s)}>
                  🍽 Dine in
                </button>
              )}
              <button className="tblAction danger" onClick={() => cancelOrder(s)}>
                ✕ Cancel order
              </button>
            </div>
          </aside>
        </div>
      </section>
    );
  }

  // ── Orders list ─────────────────────────────────────────────────────────────
  return (
    <section className="screen">
      <div className="topbar">
        <h2>Orders</h2>
        <div className="grow"></div>
        <button className="btn primary" onClick={newOrder}>
          ＋ New order
        </button>
      </div>
      {loading ? (
        <div className="centerNote">Loading orders…</div>
      ) : tickets.length === 0 ? (
        <div className="centerNote">
          No open take-out, delivery, or pick-up orders. Tap <b>＋ New order</b> to start one.
        </div>
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
    </section>
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
          <input
            value={phone}
            inputMode="tel"
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 0917…"
          />
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

function SeatPickerModal({
  tables,
  onConfirm,
  onCancel,
}: {
  tables: FloorTable[];
  onConfirm: (ids: number[]) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <>
      <header>
        <h3>Seat at table</h3>
      </header>
      <div className="bodyPad">
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 14 }}>
          Pick the table(s) for this order. It becomes a dine-in table and the whole order moves with
          it.
        </p>
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
          Seat here
        </button>
      </footer>
    </>
  );
}
