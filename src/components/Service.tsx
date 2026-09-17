'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { peso, fmtDT } from '@/lib/format';
import { useUI } from './UI';
import Sell, { orderTypeLabel, billText, printThermalText } from './Sell';
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
  employees: Employee[];
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
  employee: '👤',
};

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function schedLabel(t: ServiceType): string {
  return t === 'pick_up' ? 'Pickup' : t === 'delivery' ? 'Deliver by' : 'Ready by';
}

function sessionTitle(s: TableSession): string {
  if (s.service_type === 'dine_in') return `Table ${s.tables_label}`;
  const t = orderTypeLabel(s.service_type);
  return s.customer_name ? `${t} — ${s.customer_name}` : t;
}

export default function Service({
  employee,
  branchId,
  items,
  categories,
  employees,
  reloadItems,
  isOwner,
}: ServiceProps) {
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
  // Tapping a free table asks Dine-in or Reservation first.
  function chooseTableMode(table: FloorTable) {
    openModal(
      <TableStartModal
        tableNumber={table.table_number}
        onCancel={closeModal}
        onDineIn={() => {
          closeModal();
          startTable(table);
        }}
        onReserve={() => openReservation(table)}
      />,
    );
  }

  // Dine-in: start ordering right away; diner count is set afterwards.
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

  // Reservation: capture name + arrival time (holds the table), then order.
  function openReservation(table: FloorTable) {
    openModal(
      <ReservationModal
        tableNumber={table.table_number}
        onCancel={closeModal}
        onConfirm={async ({ name, reserved_at }) => {
          try {
            const { session_id } = await api.openSession({
              branch_id: branchId!,
              table_ids: [table.table_id],
              customer_count: 1,
              employee_id: employee.id,
              customer_name: name,
              reserved_at: reserved_at ?? undefined,
            });
            closeModal();
            setMode({ screen: 'order', session: await api.session(session_id) });
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not reserve the table');
          }
        }}
      />,
    );
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
    // Employees are branch-scoped; owners (no home branch) show everywhere.
    const branchStaff = employees.filter((e) => e.branch_id == null || e.branch_id === branchId);
    openModal(
      <NewOrderModal
        employees={branchStaff}
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
      // Keep empty DINE-IN reservations (they hold the table); discard any other
      // empty session backed out of (incl. empty orders that only have a time).
      const isReservation = fresh.service_type === 'dine_in' && !!fresh.reserved_at;
      if (fresh.items.length === 0 && fresh.status === 'open' && !isReservation) {
        await api.voidSession(session.id, employee.id);
        backToLanding();
        return;
      }
      setMode({ screen: 'panel', session: fresh });
    } catch {
      backToLanding();
    }
  }

  // Automatic employee pricing: for an 👤 Employee session, each line is
  // charged its item's employee_price (when set and lower), and the saving is
  // applied as a discount on the bill. Returns null for non-employee sessions.
  function employeeDiscount(session: TableSession) {
    if (session.service_type !== 'employee') return null;
    const linePrice = (l: TableSession['items'][number]) => {
      const it = items.find((i) => i.id === l.item_id);
      const ep = it?.employee_price;
      return ep != null && Number(ep) < Number(l.price) ? Number(ep) : Number(l.price);
    };
    const regular = session.items.reduce((a, l) => a + Number(l.price) * l.qty, 0);
    const staff = session.items.reduce((a, l) => a + linePrice(l) * l.qty, 0);
    const discount = Math.round((regular - staff) * 100) / 100;
    const pct = regular > 0 ? (discount / regular) * 100 : 0;
    return { regular, staff, discount, pct };
  }

  // Print a provisional bill (guest check) so diners can see what they'll pay,
  // without closing the session. Reflects the automatic employee price.
  function printBill(session: TableSession) {
    if (session.items.length === 0) {
      toast('No items to bill yet');
      return;
    }
    const dine = session.service_type === 'dine_in';
    const ed = employeeDiscount(session);
    const ok = printThermalText(
      billText({
        tableLabel: dine ? session.tables_label : null,
        typeLabel: dine ? null : orderTypeLabel(session.service_type),
        customerName: session.customer_name,
        cashier: employee.name,
        lines: session.items.map((l) => ({ name: l.name, price: Number(l.price), qty: l.qty })),
        subtotal: session.total,
        discount: ed && ed.discount > 0 ? ed.discount : 0,
        discountLabel: 'Employee price',
        total: ed && ed.discount > 0 ? ed.staff : session.total,
      }) + '\n\n\n\n',
    );
    toast(ok ? 'Bill sent to printer' : 'Could not reach the printer');
  }

  // ── Session actions ─────────────────────────────────────────────────────────
  function payBill(session: TableSession) {
    const ed = employeeDiscount(session);
    openPayBill(ui, {
      session,
      employeeId: employee.id,
      reloadItems,
      initialDiscount: ed && ed.discount > 0 ? { pct: ed.pct, label: 'Employee price' } : undefined,
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
    const ed = employeeDiscount(s); // employee price saving, if any
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
            {dine && s.reserved_at && (
              <div className="customerCard">
                <div className="cName">🕒 Reservation · arrives {fmtTime(s.reserved_at)}</div>
                {s.customer_name && <div>{s.customer_name}</div>}
              </div>
            )}
            {!dine && s.reserved_at && (
              <div className="customerCard schedCard">
                <div className="cName">🕒 {schedLabel(s.service_type)} · {fmtTime(s.reserved_at)}</div>
              </div>
            )}
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
            {ed && ed.discount > 0 ? (
              <div className="sessionTotal empPriced">
                <div className="totRow" style={{ color: 'rgba(255,255,255,.8)' }}>
                  <span>Subtotal</span>
                  <span>{peso(ed.regular)}</span>
                </div>
                <div className="totRow" style={{ color: '#8AE0A8' }}>
                  <span>👤 Employee price</span>
                  <span>−{peso(ed.discount)}</span>
                </div>
                <div className="totRow" style={{ fontWeight: 800, fontSize: 20, marginTop: 4 }}>
                  <span>Total</span>
                  <span>{peso(ed.staff)}</span>
                </div>
              </div>
            ) : (
              <div className="sessionTotal">
                <span>Total</span>
                <b>{peso(s.total)}</b>
              </div>
            )}
            <button className="tblAction add" onClick={() => setMode({ screen: 'order', session: s })}>
              ＋ Add order
            </button>
            <button className="tblAction" onClick={() => printBill(s)}>
              🧾 Print bill
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
  // Employee credit tabs are kept out of the food-order list and shown in their
  // own "who owes" section.
  const foodOrders = tickets.filter((t) => t.service_type !== 'employee');
  const empTabs = tickets.filter((t) => t.service_type === 'employee');
  const owed = empTabs.reduce((a, t) => a + t.total, 0);
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
              const status =
                t.session_id === null
                  ? 'free'
                  : t.reserved_at
                    ? 'reserved'
                    : t.session_status === 'for_payment'
                      ? 'pay'
                      : 'busy';
              const combined = (t.session_tables_label ?? '').includes('+');
              return (
                <button
                  key={t.table_id}
                  className={'tableCard ' + status}
                  onClick={() => (t.session_id ? openPanel(t.session_id) : chooseTableMode(t))}
                >
                  <div className="tcTop">
                    <span className="tcNum">
                      {combined ? `Table ${t.session_tables_label}` : `Table ${t.table_number}`}
                    </span>
                    <span className={'tcStatus ' + status}>
                      {status === 'free'
                        ? 'Available'
                        : status === 'reserved'
                          ? 'Reserved'
                          : status === 'pay'
                            ? 'For payment'
                            : 'Occupied'}
                    </span>
                  </div>
                  {status === 'free' ? (
                    <div className="tcBody">
                      <div className="tcSeats">Seats {t.capacity}</div>
                      <div className="tcTapHint">Tap to start</div>
                    </div>
                  ) : status === 'reserved' ? (
                    <div className="tcBody">
                      <div className="tcResv">🕒 {fmtTime(t.reserved_at)}</div>
                      <div className="tcMeta">
                        {t.customer_name || 'Reserved'}
                        {t.item_count ? ` · ${peso(t.order_total ?? 0)}` : ''}
                      </div>
                    </div>
                  ) : (
                    <div className="tcBody">
                      <div className="tcTotal">{peso(t.order_total ?? 0)}</div>
                      <div className="tcMeta">👥 {t.customer_count} · {t.item_count ?? 0} items</div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="svcOrdersHead">
            <h3>Open orders</h3>
            <span className="svcOrdersCount">{foodOrders.length}</span>
            <div className="grow"></div>
            <button className="btn primary" onClick={newOrder}>
              ＋ New order
            </button>
          </div>
          {foodOrders.length === 0 ? (
            <div className="svcOrdersEmpty">No open take-out, delivery, or pick-up orders.</div>
          ) : (
            <div className="orderGrid">
              {foodOrders.map((t) => (
                <button key={t.id} className={'orderCard ' + t.service_type} onClick={() => openPanel(t.id)}>
                  <div className="ocTop">
                    <span className="ocType">
                      {TYPE_EMOJI[t.service_type]} {orderTypeLabel(t.service_type)}
                    </span>
                    <span className="ocNo">#{t.id}</span>
                  </div>
                  <div className="ocName">{t.customer_name || 'Walk-in'}</div>
                  {t.reserved_at && (
                    <div className="ocTime">🕒 {schedLabel(t.service_type)} {fmtTime(t.reserved_at)}</div>
                  )}
                  {t.customer_phone && <div className="ocMeta">📞 {t.customer_phone}</div>}
                  <div className="ocFoot">
                    <span className="ocTotal">{peso(t.total)}</span>
                    <span className="ocItems">{t.item_count} items</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {empTabs.length > 0 && (
            <>
              <div className="svcOrdersHead">
                <h3>👤 Employee tabs</h3>
                <span className="svcOrdersCount">{empTabs.length}</span>
                <div className="grow"></div>
                <span className="empOwed">Unpaid: {peso(owed)}</span>
              </div>
              <div className="orderGrid">
                {empTabs.map((t) => (
                  <button key={t.id} className="orderCard employee" onClick={() => openPanel(t.id)}>
                    <div className="ocTop">
                      <span className="ocType">👤 Employee</span>
                      <span className="ocNo">#{t.id}</span>
                    </div>
                    <div className="ocName">{t.customer_name || 'Employee'}</div>
                    <div className="ocTime">🕒 since {fmtDT(t.opened_at)}</div>
                    <div className="ocFoot">
                      <span className="ocTotal">{peso(t.total)}</span>
                      <span className="ocItems">{t.item_count} items</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
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

function TableStartModal({
  tableNumber,
  onDineIn,
  onReserve,
  onCancel,
}: {
  tableNumber: number;
  onDineIn: () => void;
  onReserve: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <header>
        <h3>Table {tableNumber}</h3>
      </header>
      <div className="bodyPad">
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 14 }}>How is this table being used?</p>
        <div className="startChoice">
          <button className="choiceCard" onClick={onDineIn}>
            <span className="cEmoji">🍽</span>
            <b>Dine-in</b>
            <small>Start ordering now</small>
          </button>
          <button className="choiceCard" onClick={onReserve}>
            <span className="cEmoji">🕒</span>
            <b>Reservation</b>
            <small>Hold the table for later</small>
          </button>
        </div>
      </div>
      <footer>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </footer>
    </>
  );
}

function ReservationModal({
  tableNumber,
  onConfirm,
  onCancel,
}: {
  tableNumber: number;
  onConfirm: (data: { name: string; reserved_at: string | null }) => void;
  onCancel: () => void;
}) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  const defv = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const [name, setName] = useState('');
  const [arrival, setArrival] = useState(defv);
  return (
    <>
      <header>
        <h3>Reserve Table {tableNumber}</h3>
      </header>
      <div className="bodyPad">
        <div className="field">
          <label>Customer name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Juan D." autoFocus />
        </div>
        <div className="field">
          <label>Time of arrival</label>
          <input type="datetime-local" value={arrival} onChange={(e) => setArrival(e.target.value)} />
        </div>
      </div>
      <footer>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={!name.trim()}
          onClick={() =>
            onConfirm({ name: name.trim(), reserved_at: arrival ? new Date(arrival).toISOString() : null })
          }
        >
          Reserve &amp; order
        </button>
      </footer>
    </>
  );
}

function NewOrderModal({
  employees,
  onConfirm,
  onCancel,
}: {
  employees: Employee[];
  onConfirm: (data: {
    service_type: ServiceType;
    customer_name?: string;
    customer_phone?: string;
    customer_address?: string;
    customer_landmark?: string;
    reserved_at?: string;
  }) => void;
  onCancel: () => void;
}) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const soon = new Date(Date.now() + 30 * 60000); // default ~30 min out
  const defTime = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}T${pad(soon.getHours())}:${pad(soon.getMinutes())}`;
  const [type, setType] = useState<ServiceType>('take_out');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [time, setTime] = useState(defTime);
  const [empId, setEmpId] = useState(''); // for employee purchases ('' | id | '__manual__')
  const [manualName, setManualName] = useState('');
  const showAddress = type === 'delivery';
  const isEmployee = type === 'employee';
  const timeLabel = type === 'pick_up' ? 'Pickup time' : type === 'delivery' ? 'Deliver by' : 'Ready by';
  const manual = empId === '__manual__';
  const emp = employees.find((e) => String(e.id) === empId);
  const buyerName = manual ? manualName.trim() : emp?.name;
  return (
    <>
      <header>
        <h3>New order</h3>
      </header>
      <div className="bodyPad">
        <div className="payBtns" style={{ marginTop: 0, gridTemplateColumns: '1fr 1fr' }}>
          <button className={type === 'take_out' ? 'sel' : ''} onClick={() => setType('take_out')}>
            🥡 Take-out
          </button>
          <button className={type === 'delivery' ? 'sel' : ''} onClick={() => setType('delivery')}>
            🛵 Delivery
          </button>
          <button className={type === 'pick_up' ? 'sel' : ''} onClick={() => setType('pick_up')}>
            🛍 Pick-up
          </button>
          <button className={isEmployee ? 'sel' : ''} onClick={() => setType('employee')}>
            👤 Employee
          </button>
        </div>
        {isEmployee ? (
          <>
            <div className="field">
              <label>Which employee?</label>
              <select value={empId} autoFocus onChange={(e) => setEmpId(e.target.value)}>
                <option value="">Select employee…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
                <option value="__manual__">✏️ Enter name manually…</option>
              </select>
            </div>
            {manual && (
              <div className="field">
                <label>Employee name</label>
                <input
                  value={manualName}
                  autoFocus
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Type the employee's name"
                />
              </div>
            )}
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '2px 2px 0' }}>
              Add the items, apply a discount, then Pay bill — or leave it open to settle later.
            </p>
          </>
        ) : (
          <>
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
            <div className="field">
              <label>{timeLabel}</label>
              <input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
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
          disabled={isEmployee && !buyerName}
          onClick={() =>
            isEmployee
              ? onConfirm({ service_type: 'employee', customer_name: buyerName })
              : onConfirm({
                  service_type: type,
                  customer_name: name.trim() || undefined,
                  customer_phone: phone.trim() || undefined,
                  customer_address: address.trim() || undefined,
                  customer_landmark: landmark.trim() || undefined,
                  reserved_at: time ? new Date(time).toISOString() : undefined,
                })
          }
        >
          {isEmployee ? 'Start purchase' : 'Start order'}
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
