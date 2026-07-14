'use client';

import React, { useState } from 'react';
import { api } from '@/lib/api';
import type { Employee } from '@/lib/types';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del'] as const;
const MAX_PIN = 6;

export default function LockScreen({ onLogin }: { onLogin: (employee: Employee) => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(value: string) {
    if (value.length < 4 || busy) return;
    setBusy(true);
    try {
      const { employee } = await api.login(value);
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
    setError('');
    if (k === 'clear') return setPin('');
    if (k === 'del') return setPin(pin.slice(0, -1));
    if (pin.length >= MAX_PIN) return;
    const next = pin + k;
    setPin(next);
    if (next.length === MAX_PIN) submit(next); // full 6-digit PIN auto-submits
  }

  return (
    <div id="lockScreen">
      <div className="brand">
        TALABAHAN SA <span>CALINAN</span>
      </div>
      <div className="who">{busy ? 'Checking…' : 'Enter your PIN to clock in'}</div>
      <div className="pinDots">
        {[0, 1, 2, 3, 4, 5].map((i) => (
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
      <button
        className="pinEnter"
        disabled={pin.length < 4 || busy}
        onClick={() => submit(pin)}
      >
        Enter
      </button>
      <div className="lockHint">Enter your 4–6 digit PIN, then press Enter.</div>
    </div>
  );
}
