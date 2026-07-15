'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { peso, fmtDT } from '@/lib/format';
import { useUI } from './UI';
import type { Branch, Employee, Role, Shift } from '@/lib/types';

interface EmployeesProps {
  employees: Employee[];
  reloadEmployees: () => Promise<void>;
  session: Employee;
  isOwner: boolean;
  branches: Branch[];
}

export default function Employees({
  employees,
  reloadEmployees,
  session,
  isOwner,
  branches,
}: EmployeesProps) {
  const { toast, openModal, closeModal } = useUI();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const log = (action: string, detail?: string) =>
    api.logActivity({ actor_id: session.id, actor_name: session.name, action, detail });

  useEffect(() => {
    api.shifts().then(setShifts).catch(() => {});
  }, [employees]);

  function empModal(emp: Employee | null) {
    const isNew = !emp;
    const state = {
      name: emp?.name || '',
      role: (emp?.role || 'cashier') as Role,
      pin: emp?.pin || '',
      // Owner assigns any branch; a manager can only add staff to their own branch.
      branch_id: emp?.branch_id ?? (isOwner ? null : session.branch_id ?? null),
    };
    let error = '';
    // Managers may not view an owner's or another manager's PIN — only the owner,
    // the employee's own PIN, new hires, or their own cashiers' PINs are visible.
    const canSeePin =
      isNew || isOwner || emp!.id === session.id || emp!.role === 'cashier';
    // You can never remove yourself, and a manager may not remove an owner.
    const canRemove =
      !isNew && emp!.id !== session.id && (isOwner || emp!.role !== 'owner');

    const render = () => {
      openModal(
        <>
          <header>
            <h3>{isNew ? 'New employee' : 'Edit employee'}</h3>
          </header>
          <div className="bodyPad">
            <div className="field">
              <label>Full name</label>
              <input defaultValue={state.name} onChange={(e) => (state.name = e.target.value)} />
            </div>
            <div className="fieldRow">
              <div className="field">
                <label>Role</label>
                <select defaultValue={state.role} onChange={(e) => (state.role = e.target.value as Role)}>
                  <option value="cashier">Cashier — sell &amp; history only</option>
                  <option value="manager">Manager — + inventory &amp; staff</option>
                  {isOwner && <option value="owner">Owner — full access</option>}
                </select>
              </div>
              <div className="field">
                <label>PIN (4–6 digits)</label>
                {canSeePin ? (
                  <input
                    inputMode="numeric"
                    maxLength={6}
                    defaultValue={state.pin}
                    onChange={(e) => (state.pin = e.target.value)}
                  />
                ) : (
                  <input value="•••••• hidden" disabled readOnly title="Hidden from managers" />
                )}
              </div>
            </div>
            {isOwner && (
              <div className="field">
                <label>Assigned branch</label>
                <select
                  defaultValue={state.branch_id ?? ''}
                  onChange={(e) => (state.branch_id = e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Unassigned (owner — all branches)</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {error && <div className="errText">{error}</div>}
          </div>
          <footer>
            {canRemove && (
              <button
                className="btn danger"
                onClick={async () => {
                  try {
                    await api.deleteEmployee(emp!.id);
                    log('Removed employee', emp!.name);
                    closeModal();
                    reloadEmployees();
                    toast('Employee removed');
                  } catch (e) {
                    toast(e instanceof Error ? e.message : 'Something went wrong');
                  }
                }}
              >
                Remove
              </button>
            )}
            <button className="btn" onClick={closeModal}>
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={async () => {
                if (!state.name.trim() || !/^\d{4,6}$/.test(state.pin)) {
                  error = 'Name and a 4–6 digit PIN are required';
                  render();
                  return;
                }
                try {
                  if (isNew) {
                    await api.createEmployee(state);
                    log('Added employee', `${state.name} — ${state.role}`);
                  } else {
                    await api.updateEmployee(emp.id, state);
                    log('Edited employee', state.name);
                  }
                  closeModal();
                  reloadEmployees();
                  toast(isNew ? 'Employee added' : 'Employee saved');
                } catch (e) {
                  error = e instanceof Error ? e.message : 'Something went wrong';
                  render();
                }
              }}
            >
              {isNew ? 'Add employee' : 'Save'}
            </button>
          </footer>
        </>,
      );
    };
    render();
  }

  return (
    <section className="screen">
      <div className="topbar">
        <h2>Employees</h2>
        <div className="grow"></div>
        <button className="btn primary" onClick={() => empModal(null)}>
          + New employee
        </button>
      </div>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Branch</th>
              <th>PIN</th>
              <th className="num">Sales (all time)</th>
              <th className="num">Receipts</th>
              <th>Last clock-in</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td>
                  <b>{e.name}</b>
                </td>
                <td>
                  <span className="pill role">{e.role}</span>
                </td>
                <td>{e.branch_name || <span style={{ color: 'var(--muted)' }}>All</span>}</td>
                <td style={{ letterSpacing: '.2em' }}>••••</td>
                <td className="num">{peso(e.sales_total || 0)}</td>
                <td className="num">{e.receipts_count || 0}</td>
                <td>{e.last_clock_in ? fmtDT(e.last_clock_in) : '—'}</td>
                <td>
                  <button className="btn small" onClick={() => empModal(e)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 style={{ margin: '22px 0 10px' }}>Timesheet (latest 30 punches)</h3>
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Clock in</th>
              <th>Clock out</th>
              <th className="num">Hours</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((s) => {
              const hrs = s.clock_out
                ? ((new Date(s.clock_out).getTime() - new Date(s.clock_in).getTime()) / 3600000).toFixed(2)
                : null;
              return (
                <tr key={s.id}>
                  <td>{s.employee?.name || '—'}</td>
                  <td>{fmtDT(s.clock_in)}</td>
                  <td>{s.clock_out ? fmtDT(s.clock_out) : <span className="pill ok">Clocked in</span>}</td>
                  <td className="num">{hrs ?? 'on shift'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
