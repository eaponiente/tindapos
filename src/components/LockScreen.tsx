'use client';

import React, { useState } from 'react';
import { api } from '@/lib/api';
import type { Employee } from '@/lib/types';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del'] as const;

export default function LockScreen({ onLogin }: { onLogin: (employee: Employee) => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function tryPin(next: string) {
    setPin(next);
    setError('');
    if (next.length !== 4) return;
    setBusy(true);
    try {
      const { employee } = await api.login(next);
      onLogin(employee);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Wrong PIN — try again');
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  function press(k: string) {
    if (busy) return;
    if (k === 'clear') return tryPin('');
    if (k === 'del') return tryPin(pin.slice(0, -1));
    if (pin.length < 4) tryPin(pin + k);
  }

  return (
    <div id="lockScreen">
      <div className="brand">
        Tinda<span>POS</span>
      </div>
      <div className="who">{busy ? 'Checking…' : 'Enter your PIN to clock in'}</div>
      <div className="pinDots">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <div id="lockError">{error}</div>
      <div className="pinPad">
        {KEYS.map((k) => (
          <button
            key={k}
            className={k === 'clear' || k === 'del' ? 'ghost' : ''}
            onClick={() => press(k)}
          >
            {k === 'clear' ? 'Clear' : k === 'del' ? '⌫' : k}
          </button>
        ))}
      </div>
      <div className="lockHint">Demo PINs — Owner: 1234 · Manager: 2222 · Cashier: 3333</div>
    </div>
  );
}
