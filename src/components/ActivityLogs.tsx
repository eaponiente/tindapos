'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { fmtDT } from '@/lib/format';
import { useUI } from './UI';
import type { ActivityLog } from '@/lib/types';

export default function ActivityLogs() {
  const { toast, openModal, closeModal } = useUI();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .activity()
      .then(setLogs)
      .catch(() => toast('Could not load activity log'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function confirmClear() {
    openModal(
      <>
        <header>
          <h3>Clear activity log?</h3>
        </header>
        <div className="bodyPad">
          <p style={{ margin: 0 }}>
            This permanently deletes all {logs.length}{' '}
            {logs.length === 1 ? 'entry' : 'entries'}. This can&apos;t be undone.
          </p>
        </div>
        <footer>
          <button className="btn" onClick={closeModal}>
            Cancel
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              try {
                await api.clearActivity();
                closeModal();
                setLogs([]);
                toast('Activity log cleared');
              } catch (e) {
                toast(e instanceof Error ? e.message : 'Something went wrong');
              }
            }}
          >
            Clear all
          </button>
        </footer>
      </>,
    );
  }

  return (
    <section className="screen">
      <div className="topbar">
        <h2>Activity log</h2>
        <div className="grow"></div>
        {logs.length > 0 && (
          <button className="btn danger" onClick={confirmClear}>
            Clear log
          </button>
        )}
      </div>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={4} className="centerNote">
                  No activity recorded yet — staff and catalog changes show up here.
                </td>
              </tr>
            )}
            {logs.map((l) => (
              <tr key={l.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDT(l.created_at)}</td>
                <td>{l.actor_name}</td>
                <td>
                  <span className="pill role">{l.action}</span>
                </td>
                <td style={{ color: 'var(--muted)' }}>{l.detail || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
