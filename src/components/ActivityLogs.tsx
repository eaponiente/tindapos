'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { fmtDT } from '@/lib/format';
import { useUI } from './UI';
import type { ActivityLog } from '@/lib/types';

export default function ActivityLogs() {
  const { toast } = useUI();
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

  return (
    <section className="screen">
      <div className="topbar">
        <h2>Activity log</h2>
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
