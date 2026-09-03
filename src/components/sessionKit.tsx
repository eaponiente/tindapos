'use client';

// Shared session helpers used by both the dine-in Tables screen and the
// take-out/delivery/pick-up Orders screen: the Pay Bill flow (bill summary →
// optional discount → payment → receipt) and round grouping. Keeping this in
// one place means dine-in and order tickets always bill and print identically.

import React from 'react';
import { api } from '@/lib/api';
import { peso } from '@/lib/format';
import { PaymentModal, DiscountModal, receiptText, printThermal } from './Sell';
import type { PaymentMethod, Sale, TableSession } from '@/lib/types';

export type SessionUI = {
  openModal: (node: React.ReactNode, opts?: { wide?: boolean }) => void;
  closeModal: () => void;
  toast: (m: string) => void;
};

const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/** Group a session's items into rounds (with the earliest timestamp per round). */
export function groupRounds(s: TableSession) {
  const map = new Map<number, { round: number; at: string; lines: TableSession['items'] }>();
  for (const l of s.items) {
    const g = map.get(l.round);
    if (g) {
      g.lines.push(l);
      if (l.created_at < g.at) g.at = l.created_at;
    } else {
      map.set(l.round, { round: l.round, at: l.created_at, lines: [l] });
    }
  }
  return [...map.values()].sort((a, b) => a.round - b.round);
}

/** Bill summary → optional Senior/PWD (or manager) discount → payment. On a
 *  successful payment, closes the session (reusing create_sale) and calls
 *  onPaid with the receipt. */
export function openPayBill(
  ui: SessionUI,
  opts: { session: TableSession; employeeId: number; reloadItems: () => Promise<void>; onPaid: (sale: Sale) => void },
) {
  const { session, employeeId, reloadItems, onPaid } = opts;
  if (session.total <= 0) {
    ui.toast('This order has no items to pay for');
    return;
  }
  let pct = 0;
  let label = '';

  const openBill = () => {
    const discount = round2((session.total * pct) / 100);
    const dueTotal = round2(session.total - discount);
    ui.openModal(
      <BillModal
        subtotal={session.total}
        discount={discount}
        discountLabel={label}
        dueTotal={dueTotal}
        onAddDiscount={openDiscount}
        onClearDiscount={() => {
          pct = 0;
          label = '';
          openBill();
        }}
        onProceed={openPay}
        onCancel={ui.closeModal}
      />,
    );
  };

  const openDiscount = () => {
    ui.openModal(
      <DiscountModal
        subtotal={session.total}
        onApply={(p, l) => {
          pct = p;
          label = l;
          openBill();
        }}
        onCancel={openBill}
      />,
    );
  };

  const openPay = () => {
    const dueTotal = round2(session.total - round2((session.total * pct) / 100));
    let method: PaymentMethod = 'cash';
    const renderPay = () => {
      const quicks = [
        ...new Set([
          Math.ceil(dueTotal),
          Math.ceil(dueTotal / 50) * 50,
          Math.ceil(dueTotal / 100) * 100,
          Math.ceil(dueTotal / 500) * 500,
        ]),
      ];
      ui.openModal(
        <PaymentModal
          total={dueTotal}
          method={method}
          quicks={quicks}
          onMethod={(m) => {
            method = m;
            renderPay();
          }}
          onConfirm={async (tendered) => {
            try {
              const sale = await api.closeSession(session.id, {
                payment_method: method,
                tendered: method === 'cash' ? tendered : dueTotal,
                discount_pct: pct,
                employee_id: employeeId,
              });
              await reloadItems();
              onPaid(sale);
            } catch (e) {
              ui.toast(e instanceof Error ? e.message : 'Payment failed');
            }
          }}
          onCancel={openBill}
        />,
      );
    };
    renderPay();
  };

  openBill();
}

/** Receipt modal shown after payment. */
export function openSessionReceipt(ui: SessionUI, opts: { sale: Sale; title: string; onDone: () => void }) {
  ui.openModal(
    <>
      <header>
        <h3>{opts.title}</h3>
      </header>
      <div className="bodyPad">
        <pre className="receipt">{receiptText(opts.sale)}</pre>
      </div>
      <footer>
        <button
          className="btn amber"
          onClick={() => {
            printThermal(opts.sale);
            ui.toast('Sent to thermal printer');
          }}
        >
          🧾 Print receipt
        </button>
        <button
          className="btn primary"
          onClick={() => {
            ui.closeModal();
            opts.onDone();
          }}
        >
          Done
        </button>
      </footer>
    </>,
  );
}

function BillModal({
  subtotal,
  discount,
  discountLabel,
  dueTotal,
  onAddDiscount,
  onClearDiscount,
  onProceed,
  onCancel,
}: {
  subtotal: number;
  discount: number;
  discountLabel: string;
  dueTotal: number;
  onAddDiscount: () => void;
  onClearDiscount: () => void;
  onProceed: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <header>
        <h3>Bill</h3>
      </header>
      <div className="bodyPad">
        <div className="totRow">
          <span>Subtotal</span>
          <span>{peso(subtotal)}</span>
        </div>
        <div className="totRow">
          <span>Discount {discountLabel ? `(${discountLabel})` : ''}</span>
          <span style={{ color: discount ? 'var(--danger)' : 'inherit' }}>
            {discount ? '−' + peso(discount) : peso(0)}
          </span>
        </div>
        <div className="totRow grand" style={{ fontSize: 18 }}>
          <span>Total due</span>
          <span>{peso(dueTotal)}</span>
        </div>
        <div style={{ marginTop: 14 }}>
          {discount ? (
            <button className="btn small" onClick={onClearDiscount}>
              Remove discount
            </button>
          ) : (
            <button className="btn small" onClick={onAddDiscount}>
              🧓 Add Senior / PWD discount
            </button>
          )}
        </div>
      </div>
      <footer>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" onClick={onProceed}>
          Proceed to payment
        </button>
      </footer>
    </>
  );
}
