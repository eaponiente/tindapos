'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useUI } from './UI';
import { orderTypeLabel } from './Sell';
import type { Employee, KitchenOrder } from '@/lib/types';

interface KitchenProps {
  employee: Employee;
  branchId: number | null;
}

type Round = { round: number; at: string; items: KitchenOrder['items'] };

/** Group a session's items into rounds (round 1 = the main order, later rounds
 *  are additional orders), each stamped with its earliest item time. */
function toRounds(items: KitchenOrder['items']): Round[] {
  const map = new Map<number, Round>();
  for (const it of items) {
    const r = map.get(it.round);
    if (r) {
      r.items.push(it);
      if (it.created_at < r.at) r.at = it.created_at;
    } else {
      map.set(it.round, { round: it.round, at: it.created_at, items: [it] });
    }
  }
  return [...map.values()].sort((a, b) => a.round - b.round);
}

/** Elapsed time since an ISO timestamp as mm:ss (or h:mm:ss past an hour). */
function elapsed(fromISO: string, now: number): string {
  let s = Math.max(0, Math.floor((now - new Date(fromISO).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** How urgent a table is, from how long it has waited — drives the card accent. */
function urgency(openedAt: string, now: number): 'calm' | 'warn' | 'late' {
  const mins = (now - new Date(openedAt).getTime()) / 60000;
  if (mins >= 20) return 'late';
  if (mins >= 10) return 'warn';
  return 'calm';
}

export default function Kitchen({ employee, branchId }: KitchenProps) {
  const { toast, openModal, closeModal } = useUI();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const busy = useRef<Set<number>>(new Set()); // item ids mid-request (block double taps)

  const load = useCallback(async () => {
    if (!branchId) return;
    try {
      setOrders(await api.kitchen(branchId));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load the kitchen');
    } finally {
      setLoading(false);
    }
  }, [branchId, toast]);

  // Poll for new orders / status changes from other screens.
  useEffect(() => {
    load();
    const id = setInterval(load, 6000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  // Tick the waiting timers once a second (timestamps are server-sourced, so
  // this survives refreshes and never drifts).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function toggleItem(itemId: number, current: string) {
    if (busy.current.has(itemId)) return;
    busy.current.add(itemId);
    const next = current === 'done' ? 'pending' : 'done';
    // Optimistic: flip locally so the tap feels instant.
    setOrders((prev) =>
      prev.map((o) => ({
        ...o,
        items: o.items.map((it) => (it.id === itemId ? { ...it, kitchen_status: next } : it)),
      })),
    );
    try {
      await api.setKitchenItem(itemId, next);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update the item');
      load(); // revert to server truth
    } finally {
      busy.current.delete(itemId);
    }
  }

  function completeTable(order: KitchenOrder, allDone: boolean) {
    const title = order.table_label ? `Table ${order.table_label}` : orderTypeLabel(order.service_type);
    const go = async () => {
      closeModal();
      try {
        await api.kitchenComplete(order.session_id, employee.id);
        setOrders((prev) => prev.filter((o) => o.session_id !== order.session_id));
        toast(`${title} completed`);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not complete the table');
        load();
      }
    };
    if (allDone) {
      go();
      return;
    }
    openModal(
      <>
        <header>
          <h3>Complete {title}?</h3>
        </header>
        <div className="bodyPad">
          <p style={{ marginTop: 0 }}>
            There are still <b>unfinished items</b> for this table. Mark it completed anyway?
          </p>
        </div>
        <footer>
          <button className="btn" onClick={closeModal}>
            Keep cooking
          </button>
          <button className="btn danger" onClick={go}>
            Complete anyway
          </button>
        </footer>
      </>,
    );
  }

  if (loading) {
    return (
      <section className="screen kitchenScreen">
        <div className="topbar">
          <h2>Kitchen</h2>
        </div>
        <div className="centerNote">Loading…</div>
      </section>
    );
  }

  return (
    <section className="screen kitchenScreen">
      <div className="topbar">
        <h2>Kitchen</h2>
        <span className="kcCount">{orders.length} active</span>
        <div className="grow"></div>
        <span className="kcLegend">
          <i className="dot free" /> On time <i className="dot warn" /> 10 min <i className="dot busy" /> 20 min
        </span>
      </div>

      {orders.length === 0 ? (
        <div className="kitchenEmpty">
          <div className="keMark">🍽</div>
          <p>All caught up — no orders waiting.</p>
        </div>
      ) : (
        <div className="kitchenGrid">
          {orders.map((o, idx) => {
            const queue = idx + 1; // position in line — oldest (longest waiting) is #1
            const rounds = toRounds(o.items);
            const total = o.items.length;
            const done = o.items.filter((i) => i.kitchen_status === 'done').length;
            const allDone = total > 0 && done === total;
            const status = done === 0 ? 'new' : allDone ? 'ready' : 'preparing';
            const u = urgency(o.opened_at, now);
            const heading = o.table_label
              ? `TABLE ${o.table_label}`
              : orderTypeLabel(o.service_type).toUpperCase();
            return (
              <div className={`kcCard ${u}`} key={o.session_id}>
                <div className="kcHead">
                  <div className="kcHeadMain">
                    <div className="kcQueue" title="Queue position (oldest order first)">
                      <small>QUEUE</small>
                      <b>{queue}</b>
                    </div>
                    <div className="kcHeadText">
                      <span className="kcTable">{heading}</span>
                      <span className="kcOrderNo">Order #{o.session_id}</span>
                    </div>
                  </div>
                  <div className="kcHeadSide">
                    <span className={`kcStatus ${status}`}>
                      {status === 'new' ? 'NEW' : status === 'ready' ? 'READY' : 'PREPARING'}
                    </span>
                    <span className="kcTimer">⏱ {elapsed(o.opened_at, now)}</span>
                  </div>
                </div>
                {o.customer_name && <div className="kcCustomer">{o.customer_name}</div>}

                {rounds.map((r) => (
                  <div className="kcRound" key={r.round}>
                    {r.round > 1 && (
                      <div className="kcRoundHead">
                        <span>＋ Additional order</span>
                        <span className="kcRoundTime">waiting {elapsed(r.at, now)}</span>
                      </div>
                    )}
                    {r.items.map((it) => {
                      const d = it.kitchen_status === 'done';
                      return (
                        <button
                          key={it.id}
                          className={'kcItem' + (d ? ' done' : '')}
                          onClick={() => toggleItem(it.id, it.kitchen_status)}
                        >
                          <span className="kcCheck">{d ? '☑' : '☐'}</span>
                          <span className="kcQty">{it.qty}×</span>
                          <span className="kcName">{it.name}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}

                <button
                  className={'kcComplete' + (allDone ? ' ready' : '')}
                  onClick={() => completeTable(o, allDone)}
                >
                  {allDone ? '✓ TABLE COMPLETED' : `TABLE COMPLETED (${done}/${total})`}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
