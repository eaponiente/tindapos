'use client';

import React, { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { peso, fmtDT } from '@/lib/format';
import { useUI } from './UI';
import type { Category, Employee, Item, PaymentMethod, Sale } from '@/lib/types';

interface SellProps {
  employee: Employee;
  items: Item[];
  categories: Category[];
  reloadItems: () => Promise<void>;
}

interface TicketLine {
  item: Item;
  qty: number;
}

export default function Sell({ employee, items, categories, reloadItems }: SellProps) {
  const { toast, openModal, closeModal } = useUI();
  const [cat, setCat] = useState('All');
  const [search, setSearch] = useState('');
  const [ticket, setTicket] = useState<TicketLine[]>([]);
  const [discountPct, setDiscountPct] = useState(0);
  const [placing, setPlacing] = useState(false);

  const catNames = useMemo(() => ['All', ...categories.map((c) => c.name)], [categories]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      const matchesCat = cat === 'All' || i.category?.name === cat;
      const matchesQ = !q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q);
      return matchesCat && matchesQ;
    });
  }, [items, cat, search]);

  function inTicketQty(itemId: number) {
    return ticket.find((l) => l.item.id === itemId)?.qty || 0;
  }

  function addToTicket(item: Item) {
    if (item.stock - inTicketQty(item.id) <= 0) {
      toast('No more stock for ' + item.name);
      return;
    }
    setTicket((t) => {
      const line = t.find((l) => l.item.id === item.id);
      if (line) return t.map((l) => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l));
      return [...t, { item, qty: 1 }];
    });
  }

  function changeQty(itemId: number, delta: number) {
    setTicket((t) => {
      const line = t.find((l) => l.item.id === itemId);
      if (!line) return t;
      if (delta > 0 && line.qty >= line.item.stock) {
        toast(`Only ${line.item.stock} in stock`);
        return t;
      }
      const nextQty = line.qty + delta;
      if (nextQty <= 0) return t.filter((l) => l.item.id !== itemId);
      return t.map((l) => (l.item.id === itemId ? { ...l, qty: nextQty } : l));
    });
  }

  const subtotal = ticket.reduce((s, l) => s + Number(l.item.price) * l.qty, 0);
  const discount = (subtotal * discountPct) / 100;
  const total = subtotal - discount;

  function askDiscount() {
    let val: string | number = discountPct;
    openModal(
      <>
        <header>
          <h3>Ticket discount</h3>
        </header>
        <div className="bodyPad">
          <div className="field">
            <label>Discount (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              defaultValue={discountPct}
              inputMode="numeric"
              onChange={(e) => (val = e.target.value)}
            />
          </div>
        </div>
        <footer>
          <button className="btn" onClick={closeModal}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              setDiscountPct(Math.min(100, Math.max(0, +val || 0)));
              closeModal();
            }}
          >
            Apply
          </button>
        </footer>
      </>,
    );
  }

  function openPayment() {
    let method: PaymentMethod = 'cash';

    const render = () => {
      const quicks = [
        ...new Set([
          Math.ceil(total),
          Math.ceil(total / 50) * 50,
          Math.ceil(total / 100) * 100,
          Math.ceil(total / 500) * 500,
        ]),
      ];
      openModal(
        <PaymentModal
          total={total}
          method={method}
          quicks={quicks}
          onMethod={(m) => {
            method = m;
            render();
          }}
          onConfirm={(t) => confirmPay(method, t)}
          onCancel={closeModal}
        />,
      );
    };
    render();
  }

  async function confirmPay(method: PaymentMethod, tendered: number) {
    if (method === 'cash' && tendered < total) {
      toast('Cash received is less than the total');
      return;
    }
    setPlacing(true);
    try {
      const sale = await api.createSale({
        employee_id: employee.id,
        discount_pct: discountPct,
        payment_method: method,
        tendered: method === 'cash' ? tendered : total,
        lines: ticket.map((l) => ({ item_id: l.item.id, qty: l.qty })),
      });
      setTicket([]);
      setDiscountPct(0);
      await reloadItems();
      showReceipt(sale);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setPlacing(false);
    }
  }

  function showReceipt(sale: Sale) {
    openModal(
      <>
        <header>
          <h3>Sale complete 🎉</h3>
        </header>
        <div className="bodyPad">
          <pre className="receipt">{receiptText(sale)}</pre>
        </div>
        <footer>
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
        <h2>Sell</h2>
        <div className="grow"></div>
        <input
          className="search"
          placeholder="Search items or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div id="sellBody">
        <div id="catalog">
          <div className="catTabs">
            {catNames.map((c) => (
              <button key={c} className={c === cat ? 'active' : ''} onClick={() => setCat(c)}>
                {c}
              </button>
            ))}
          </div>
          <div id="grid">
            {visibleItems.map((i) => {
              const low = i.stock <= i.low_stock;
              return (
                <button
                  key={i.id}
                  className={'itemCard' + (i.stock <= 0 ? ' out' : '')}
                  onClick={() => addToTicket(i)}
                >
                  {i.image_url ? (
                    <img className="swatch img" src={i.image_url} alt="" />
                  ) : (
                    <div className="swatch" style={{ background: i.color }}>
                      {i.name[0]}
                    </div>
                  )}
                  <div className="cardBody">
                    <div className="nm">{i.name}</div>
                    <div className="pr">
                      <b>{peso(i.price)}</b>
                      <span className={'stk' + (low ? ' low' : '')}>
                        {i.stock <= 0 ? 'Out' : `${i.stock} left`}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <aside id="ticket">
          <header>
            <h3>Current ticket</h3>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>
              {ticket.reduce((s, l) => s + l.qty, 0)} items
            </span>
          </header>
          <div id="ticketLines">
            {ticket.length === 0 && <div className="tEmpty">Tap items to add them to the ticket</div>}
            {ticket.map((l) => (
              <div className="tLine" key={l.item.id}>
                <div className="nm">
                  {l.item.name}
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                    {peso(l.item.price)} each
                  </div>
                </div>
                <div className="qtyBox">
                  <button onClick={() => changeQty(l.item.id, -1)}>−</button>
                  <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>{l.qty}</span>
                  <button onClick={() => changeQty(l.item.id, 1)}>+</button>
                </div>
                <div className="amt">{peso(l.item.price * l.qty)}</div>
              </div>
            ))}
          </div>
          <footer>
            <div className="totRow">
              <span>Subtotal</span>
              <span>{peso(subtotal)}</span>
            </div>
            <div className="totRow">
              <span>Discount {discountPct ? `(${discountPct}%)` : ''}</span>
              <span>{discount ? '−' + peso(discount) : peso(0)}</span>
            </div>
            <div className="totRow grand">
              <span>Total</span>
              <span>{peso(total)}</span>
            </div>
            <button id="chargeBtn" disabled={!ticket.length || placing} onClick={openPayment}>
              {ticket.length ? `Charge ${peso(total)}` : 'Charge'}
            </button>
            <div className="ticketTools">
              <button className="btn small" onClick={askDiscount}>
                Add discount
              </button>
              <button
                className="btn small danger"
                onClick={() => {
                  setTicket([]);
                  setDiscountPct(0);
                }}
              >
                Clear
              </button>
            </div>
          </footer>
        </aside>
      </div>
    </section>
  );
}

export function receiptText(sale: Sale): string {
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
  if (+sale.discount)
    s +=
      `Discount ${sale.discount_pct}%`.padEnd(22) + ('-' + peso(sale.discount)).padStart(10) + '\n';
  s += 'TOTAL'.padEnd(22) + peso(sale.total).padStart(10) + '\n';
  s +=
    (sale.payment_method === 'cash' ? 'Cash' : 'Card').padEnd(22) +
    peso(sale.tendered).padStart(10) +
    '\n';
  if (+sale.change_due) s += 'Change'.padEnd(22) + peso(sale.change_due).padStart(10) + '\n';
  if (sale.refunded) s += '\n*** REFUNDED ***\n';
  s += '--------------------------------\n      Salamat po! Come again';
  return s;
}

interface PaymentModalProps {
  total: number;
  method: PaymentMethod;
  quicks: number[];
  onMethod: (m: PaymentMethod) => void;
  onConfirm: (tendered: number) => void;
  onCancel: () => void;
}

function PaymentModal({ total, method, quicks, onMethod, onConfirm, onCancel }: PaymentModalProps) {
  const [tendered, setTendered] = useState(Math.ceil(total));
  const change = tendered >= total ? tendered - total : 0;
  return (
    <>
      <header>
        <h3>Payment</h3>
      </header>
      <div className="bodyPad">
        <div className="bigTotal">{peso(total)}</div>
        <div className="payBtns">
          <button className={method === 'cash' ? 'sel' : ''} onClick={() => onMethod('cash')}>
            💵 Cash
          </button>
          <button className={method === 'card' ? 'sel' : ''} onClick={() => onMethod('card')}>
            💳 Card / e-wallet
          </button>
        </div>
        {method === 'cash' && (
          <div className="field">
            <label>Cash received</label>
            <input
              type="number"
              inputMode="decimal"
              value={tendered}
              onChange={(e) => setTendered(+e.target.value || 0)}
            />
            <div className="quickCash">
              {quicks.map((v) => (
                <button key={v} onClick={() => setTendered(v)}>
                  {peso(v)}
                </button>
              ))}
            </div>
            <div className="changeDue">{tendered >= total ? `Change due: ${peso(change)}` : ''}</div>
          </div>
        )}
      </div>
      <footer>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn amber" style={{ minWidth: 140 }} onClick={() => onConfirm(tendered)}>
          Complete sale
        </button>
      </footer>
    </>
  );
}
