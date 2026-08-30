'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { peso, fmtDT } from '@/lib/format';
import { useUI } from './UI';
import type { Category, Employee, Item, PaymentMethod, Sale } from '@/lib/types';

interface SellProps {
  employee: Employee;
  branchId: number | null;
  items: Item[];
  categories: Category[];
  reloadItems: () => Promise<void>;
  isOwner: boolean;
}

interface TicketLine {
  item: Item;
  qty: number;
}

export default function Sell({
  employee,
  branchId,
  items,
  categories,
  reloadItems,
  isOwner,
}: SellProps) {
  const { toast, openModal, closeModal } = useUI();
  const [cat, setCat] = useState('All');
  const [search, setSearch] = useState('');
  const [ticket, setTicket] = useState<TicketLine[]>([]);
  const [discountPct, setDiscountPct] = useState(0);
  const [discountLabel, setDiscountLabel] = useState('');
  const [placing, setPlacing] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [simple, setSimple] = useState(false); // hide photos for faster tapping

  // Remember the cashier's view choice on this device.
  useEffect(() => {
    try {
      setSimple(localStorage.getItem('tindapos:sellSimple') === '1');
    } catch {
      /* storage unavailable — just default to the photo view */
    }
  }, []);

  function toggleSimple() {
    setSimple((v) => {
      const next = !v;
      try {
        localStorage.setItem('tindapos:sellSimple', next ? '1' : '0');
      } catch {
        /* ignore — the toggle still works for this session */
      }
      return next;
    });
  }

  // ── Owner-only: drag to rearrange the product tiles ──────────────────────
  // Works with mouse and touch (pointer events + pointer capture), so it's
  // usable on the shop's tablets. While arranging, tapping a tile reorders
  // instead of adding it to the ticket; the new order is saved per branch.
  const [arranging, setArranging] = useState(false);
  const [arranged, setArranged] = useState<Item[]>([]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const dragIdRef = useRef<number | null>(null);

  function enterArrange() {
    setSearch('');
    setCat('All');
    setArranged(items); // items arrive already in saved position order
    setArranging(true);
  }

  function cancelArrange() {
    setArranging(false);
    setDragId(null);
    dragIdRef.current = null;
  }

  async function saveArrange() {
    setSavingOrder(true);
    try {
      await api.reorderItems(arranged.map((i) => i.id));
      await reloadItems();
      toast('New order saved');
      cancelArrange();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save the new order');
    } finally {
      setSavingOrder(false);
    }
  }

  function onTilePointerDown(e: React.PointerEvent, id: number) {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragIdRef.current = id;
    setDragId(id);
  }

  function onTilePointerMove(e: React.PointerEvent) {
    const dragging = dragIdRef.current;
    if (dragging == null) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const overId = Number(el?.closest<HTMLElement>('[data-item-id]')?.dataset.itemId);
    if (!overId || overId === dragging) return;
    setArranged((arr) => {
      const from = arr.findIndex((i) => i.id === dragging);
      const to = arr.findIndex((i) => i.id === overId);
      if (from < 0 || to < 0 || from === to) return arr;
      // Keep items within their own category section.
      if ((arr[from].category_id ?? null) !== (arr[to].category_id ?? null)) return arr;
      const next = arr.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function onTilePointerUp() {
    dragIdRef.current = null;
    setDragId(null);
  }

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
    openModal(
      <DiscountModal
        subtotal={subtotal}
        onApply={(pct, label) => {
          setDiscountPct(pct);
          setDiscountLabel(label);
          closeModal();
        }}
        onCancel={closeModal}
      />,
    );
  }

  function openPayment() {
    let method: PaymentMethod = 'cash';
    // One key per checkout attempt — reused if the request is retried, so a
    // double-tap or slow-network resend can't create a second sale.
    const saleKey = newIdempotencyKey();

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
          onConfirm={(t) => confirmPay(method, t, saleKey)}
          onCancel={closeModal}
        />,
      );
    };
    render();
  }

  async function confirmPay(method: PaymentMethod, tendered: number, idempotencyKey?: string) {
    if (method === 'cash' && tendered < total) {
      toast('Cash received is less than the total');
      return;
    }
    if (!branchId) {
      toast('No branch selected');
      return;
    }
    setPlacing(true);
    try {
      const sale = await api.createSale({
        employee_id: employee.id,
        branch_id: branchId,
        discount_pct: discountPct,
        payment_method: method,
        tendered: method === 'cash' ? tendered : total,
        lines: ticket.map((l) => ({ item_id: l.item.id, qty: l.qty })),
        idempotency_key: idempotencyKey,
      });
      setTicket([]);
      setDiscountPct(0);
      setDiscountLabel('');
      setTicketOpen(false);
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
          <button className="btn" onClick={closeModal}>
            Done
          </button>
          <button
            className="btn amber"
            onClick={() => {
              if (!printReceipt(sale)) toast('Allow pop-ups to print the receipt');
            }}
          >
            🖨 Print receipt
          </button>
        </footer>
      </>,
    );
  }

  // In the "All" view (not searching) the tiles are grouped under category
  // headings; a specific tab or a search shows a plain flat grid.
  const grouped = cat === 'All' && !search.trim();

  /** Split a list into category sections, following the order the categories
   *  were set up in; uncategorised items come last. */
  function groupItems(list: Item[]): { name: string; items: Item[] }[] {
    const byCat = new Map<string, Item[]>();
    for (const it of list) {
      const key = it.category?.name ?? 'Uncategorized';
      const arr = byCat.get(key);
      if (arr) arr.push(it);
      else byCat.set(key, [it]);
    }
    const ordered: { name: string; items: Item[] }[] = [];
    for (const c of categories) {
      const items = byCat.get(c.name);
      if (items?.length) {
        ordered.push({ name: c.name, items });
        byCat.delete(c.name);
      }
    }
    for (const k of [...byCat.keys()].filter((k) => k !== 'Uncategorized').sort()) {
      ordered.push({ name: k, items: byCat.get(k)! });
    }
    if (byCat.has('Uncategorized')) {
      ordered.push({ name: 'Uncategorized', items: byCat.get('Uncategorized')! });
    }
    return ordered;
  }

  const renderTile = (i: Item) => {
    const low = i.stock <= i.low_stock;
    return (
      <button
        key={i.id}
        data-item-id={i.id}
        className={
          'itemCard' +
          (i.stock <= 0 ? ' out' : '') +
          (arranging ? ' draggable' : '') +
          (dragId === i.id ? ' dragging' : '')
        }
        onClick={arranging ? undefined : () => addToTicket(i)}
        onPointerDown={arranging ? (e) => onTilePointerDown(e, i.id) : undefined}
        onPointerMove={arranging ? onTilePointerMove : undefined}
        onPointerUp={arranging ? onTilePointerUp : undefined}
      >
        {i.status !== 'ok' && (
          <span className={'stockBadge ' + i.status}>{i.status === 'out' ? 'Out' : 'Low'}</span>
        )}
        {!simple &&
          (i.image_url ? (
            <img className="swatch img" src={i.image_url} alt="" />
          ) : (
            <div className="swatch" style={{ background: i.color }}>
              {i.name[0]}
            </div>
          ))}
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
  };

  return (
    <section className="screen">
      <div className="topbar">
        <h2>Sell</h2>
        <div className="grow"></div>
        {arranging ? (
          <>
            <span className="arrangeHint">Drag tiles to reorder</span>
            <button className="btn" onClick={cancelArrange} disabled={savingOrder}>
              Cancel
            </button>
            <button className="btn primary" onClick={saveArrange} disabled={savingOrder}>
              {savingOrder ? 'Saving…' : 'Save order'}
            </button>
          </>
        ) : (
          <>
            <input
              className="search"
              placeholder="Search items or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className={'btn viewToggle' + (simple ? ' active' : '')}
              onClick={toggleSimple}
              aria-pressed={simple}
              title={simple ? 'Show item photos' : 'Simple view — hide photos'}
            >
              {simple ? '🖼 Photos' : '≣ Simple'}
            </button>
            {isOwner && (
              <button className="btn" onClick={enterArrange} title="Rearrange the product tiles">
                ↕ Arrange
              </button>
            )}
          </>
        )}
      </div>
      <div id="sellBody" className={ticketOpen ? 'ticketOpen' : ''}>
        <div id="catalog">
          {arranging ? (
            <div className="arrangeBar">
              Arrange mode — drag a tile to reorder it within its category. Tap <b>Save order</b>{' '}
              when you&apos;re done. The order is saved for this branch and everyone sees it.
            </div>
          ) : (
            <div className="catTabs">
              {catNames.map((c) => (
                <button key={c} className={c === cat ? 'active' : ''} onClick={() => setCat(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
          <div id="grid" className={(simple ? 'simple' : '') + (arranging ? ' arrange' : '')}>
            {grouped
              ? groupItems(arranging ? arranged : visibleItems).map((g) => (
                  <React.Fragment key={g.name}>
                    <div className="catHead">{g.name}</div>
                    {g.items.map(renderTile)}
                  </React.Fragment>
                ))
              : (arranging ? arranged : visibleItems).map(renderTile)}
          </div>
        </div>
        <aside id="ticket">
          <header>
            <h3>Current ticket</h3>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>
              {ticket.reduce((s, l) => s + l.qty, 0)} items
            </span>
            <button
              className="sheetClose"
              onClick={() => setTicketOpen(false)}
              aria-label="Close ticket"
            >
              ✕
            </button>
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
              <span>Discount {discountLabel ? `(${discountLabel})` : ''}</span>
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
                  setDiscountLabel('');
                }}
              >
                Clear
              </button>
            </div>
          </footer>
        </aside>
        {ticket.length > 0 && (
          <button className="ticketPeek" onClick={() => setTicketOpen(true)}>
            <span className="peekCount">
              {ticket.reduce((s, l) => s + l.qty, 0)} item
              {ticket.reduce((s, l) => s + l.qty, 0) === 1 ? '' : 's'}
            </span>
            <span className="peekTotal">{peso(total)}</span>
            <span className="peekGo">View ticket ›</span>
          </button>
        )}
      </div>
    </section>
  );
}

export function receiptText(sale: Sale): string {
  let s = '      TALABAHAN SA CALINAN\n    Calinan, Davao City PH\n';
  s += '--------------------------------\n';
  s += `Receipt #${sale.id}\n${fmtDT(sale.created_at)}\nCashier: ${
    sale.employee?.name || sale.employee_name || '—'
  }\n`;
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
    (sale.payment_method === 'cash' ? 'Cash' : 'GCash').padEnd(22) +
    peso(sale.tendered).padStart(10) +
    '\n';
  if (+sale.change_due) s += 'Change'.padEnd(22) + peso(sale.change_due).padStart(10) + '\n';
  if (sale.refunded) s += '\n*** REFUNDED ***\n';
  s += '--------------------------------\n      Salamat po! Come again';
  return s;
}

/** Opens a print-formatted window with monospace text (receipt / report width)
 *  and fires the browser print dialog. Returns false if a pop-up was blocked. */
export function printDoc(title: string, text: string): boolean {
  const win = window.open('', '_blank', 'width=380,height=640');
  if (!win) return false;
  const body = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
      '<style>@page{margin:6mm;}' +
      "body{font-family:'SF Mono',ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.35;white-space:pre-wrap;margin:0;}" +
      '</style></head><body>' +
      body +
      '</body></html>',
  );
  win.document.close();
  win.focus();
  win.print();
  win.onafterprint = () => win.close();
  return true;
}

/** Print a single receipt. Returns false if a pop-up was blocked. */
export function printReceipt(sale: Sale): boolean {
  return printDoc(`Receipt #${sale.id}`, receiptText(sale));
}

/** Print a rich HTML document (used for the full-width sales report table, which
 *  paginates across pages so every transaction fits). Returns false if blocked. */
export function printHtml(title: string, bodyHtml: string): boolean {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return false;
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>` +
      '@page{size:portrait;margin:12mm;}' +
      "body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#141414;margin:0;}" +
      'h1{font-size:18px;margin:0 0 2px;letter-spacing:-.01em;}' +
      '.sub{color:#555;margin:0 0 12px;font-size:13px;}' +
      'table{width:100%;border-collapse:collapse;}' +
      'th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #dcdcdc;}' +
      'th{background:#f2efe8;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#555;}' +
      'td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;}' +
      'tfoot td{font-weight:700;border-top:2px solid #333;border-bottom:none;}' +
      '.rfd td{color:#b3261e;text-decoration:line-through;}' +
      '.summary{margin-top:16px;}' +
      '.summary .r{display:flex;justify-content:space-between;max-width:320px;padding:3px 0;border-bottom:1px dotted #ccc;}' +
      '.summary .r.total{font-weight:800;border-bottom:none;font-size:15px;margin-top:4px;}' +
      'tr{break-inside:avoid;}' +
      '</style></head><body>' +
      bodyHtml +
      '</body></html>',
  );
  win.document.close();
  win.focus();
  win.print();
  win.onafterprint = () => win.close();
  return true;
}

/** A unique key per checkout attempt (falls back if crypto.randomUUID is absent). */
function newIdempotencyKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

interface PaymentModalProps {
  total: number;
  method: PaymentMethod;
  quicks: number[];
  onMethod: (m: PaymentMethod) => void;
  onConfirm: (tendered: number) => Promise<void> | void;
  onCancel: () => void;
}

interface DiscountModalProps {
  subtotal: number;
  onApply: (pct: number, label: string) => void;
  onCancel: () => void;
}

/** Discount dialog with a BIR-safe Senior/PWD mode (20% on only the seniors'
 *  pro-rata share, optional VAT exemption) and a manual Manager's mode. Both
 *  resolve to a ticket-level percentage, which is what checkout stores. */
function DiscountModal({ subtotal, onApply, onCancel }: DiscountModalProps) {
  const [mode, setMode] = useState<'senior' | 'manager'>('senior');
  const [diners, setDiners] = useState('1');
  const [seniors, setSeniors] = useState('1');
  const [vatExempt, setVatExempt] = useState(false);
  const [mgrKind, setMgrKind] = useState<'pct' | 'amount'>('pct');
  const [mgrValue, setMgrValue] = useState('');

  const D = Math.max(1, parseInt(diners, 10) || 1);
  const K = Math.min(D, Math.max(0, parseInt(seniors, 10) || 0));
  // Per-share reduction: 20% (non-VAT) or 20% + 12% VAT exemption (VAT-registered).
  const seniorRate = vatExempt ? 1 - 0.8 / 1.12 : 0.2;

  let amount = 0;
  let label = '';
  if (mode === 'senior') {
    amount = K > 0 ? (subtotal / D) * K * seniorRate : 0;
    label = `Senior/PWD ${K}/${D}`;
  } else {
    const v = parseFloat(mgrValue) || 0;
    amount = mgrKind === 'pct' ? (subtotal * Math.min(100, Math.max(0, v))) / 100 : Math.max(0, v);
    label = mgrKind === 'pct' ? `Manager ${Math.min(100, Math.max(0, v))}%` : 'Manager';
  }
  amount = Math.min(Math.max(0, amount), subtotal);
  const pct = subtotal > 0 ? (amount / subtotal) * 100 : 0;

  return (
    <>
      <header>
        <h3>Add discount</h3>
      </header>
      <div className="bodyPad">
        <div className="payBtns" style={{ marginTop: 0 }}>
          <button className={mode === 'senior' ? 'sel' : ''} onClick={() => setMode('senior')}>
            🧓 Senior / PWD
          </button>
          <button className={mode === 'manager' ? 'sel' : ''} onClick={() => setMode('manager')}>
            🔑 Manager&apos;s
          </button>
        </div>

        {mode === 'senior' ? (
          <>
            <div className="fieldRow">
              <div className="field">
                <label>Number of diners</label>
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={diners}
                  onChange={(e) => setDiners(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Seniors / PWD</label>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={seniors}
                  onChange={(e) => setSeniors(e.target.value)}
                />
              </div>
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                color: 'var(--muted)',
                fontWeight: 600,
              }}
            >
              <input
                type="checkbox"
                checked={vatExempt}
                onChange={(e) => setVatExempt(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              VAT-registered — also apply 12% VAT exemption
            </label>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '8px 0 0' }}>
              Only the {K} senior/PWD share{K === 1 ? '' : 's'} of the bill get the discount — the
              other {Math.max(0, D - K)} diner{D - K === 1 ? '' : 's'} pay full price.
            </p>
          </>
        ) : (
          <>
            <div className="payBtns" style={{ margin: '0 0 12px' }}>
              <button className={mgrKind === 'pct' ? 'sel' : ''} onClick={() => setMgrKind('pct')}>
                Percent (%)
              </button>
              <button
                className={mgrKind === 'amount' ? 'sel' : ''}
                onClick={() => setMgrKind('amount')}
              >
                Amount (₱)
              </button>
            </div>
            <div className="field">
              <label>{mgrKind === 'pct' ? 'Discount (%)' : 'Discount amount (₱)'}</label>
              <input
                type="number"
                min="0"
                inputMode="decimal"
                value={mgrValue}
                autoFocus
                onChange={(e) => setMgrValue(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="totRow" style={{ marginTop: 10, fontSize: 16 }}>
          <span>Discount</span>
          <b style={{ color: 'var(--danger)' }}>−{peso(amount)}</b>
        </div>
        <div className="totRow grand" style={{ fontSize: 18 }}>
          <span>New total</span>
          <span>{peso(subtotal - amount)}</span>
        </div>
      </div>
      <footer>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" onClick={() => onApply(pct, amount > 0 ? label : '')}>
          Apply discount
        </button>
      </footer>
    </>
  );
}

/** Stylized GCash badge (self-contained SVG so it works offline / under CSP). */
function GcashLogo() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" style={{ display: 'block' }}>
      <rect width="48" height="48" rx="11" fill="#0070E0" />
      <path d="M34 17.5a12 12 0 1 0 0 13" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <path d="M29.5 21a6.5 6.5 0 1 0 0 6" fill="none" stroke="#41C4FF" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

function PaymentModal({ total, method, quicks, onMethod, onConfirm, onCancel }: PaymentModalProps) {
  const [tendered, setTendered] = useState(Math.ceil(total));
  const [submitting, setSubmitting] = useState(false);
  const change = tendered >= total ? tendered - total : 0;
  const cashRef = useRef<HTMLInputElement>(null);

  // Guard against double-taps: once tapped, the button is disabled until the
  // request resolves (it re-enables only if the sale failed, so it can retry).
  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(tendered);
    } finally {
      setSubmitting(false);
    }
  }

  // Put the cursor in the cash field (and select the prefilled amount) so the
  // cashier can just type what the customer handed over.
  useEffect(() => {
    if (method === 'cash') {
      cashRef.current?.focus();
      cashRef.current?.select();
    }
  }, [method]);
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
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}
            >
              <GcashLogo /> GCash
            </span>
          </button>
        </div>
        {method === 'cash' && (
          <div className="field">
            <label>Cash received</label>
            <input
              ref={cashRef}
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
        <button className="btn" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button
          className="btn amber"
          style={{ minWidth: 140 }}
          onClick={submit}
          disabled={submitting}
        >
          {submitting ? 'Processing…' : 'Complete sale'}
        </button>
      </footer>
    </>
  );
}
