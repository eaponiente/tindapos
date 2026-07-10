import React, { useState } from 'react';
import { api } from '../api.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del'];

export default function LockScreen({ onLogin }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function tryPin(next) {
    setPin(next);
    setError('');
    if (next.length !== 4) return;
    setBusy(true);
    try {
      const { employee, shift_id } = await api.login(next);
      onLogin(employee, shift_id);
    } catch (e) {
      setError(e.message || 'Wrong PIN — try again');
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  function press(k) {
    if (busy) return;
    if (k === 'clear') return tryPin('');
    if (k === 'del') return tryPin(pin.slice(0, -1));
    if (pin.length < 4) tryPin(pin + k);
  }

  return (
    <div id="lockScreen">
      <div className="brand">Tinda<span>POS</span></div>
      <div className="who">{busy ? 'Checking…' : 'Enter your PIN to clock in'}</div>
      <div className="pinDots">
        {[0, 1, 2, 3].map((i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}
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
