'use client';

import React from 'react';
import { api } from '@/lib/api';
import { useUI } from './UI';
import type { Branch } from '@/lib/types';

interface BranchesProps {
  branches: Branch[];
  reloadBranches: () => Promise<void>;
}

export default function Branches({ branches, reloadBranches }: BranchesProps) {
  const { toast, openModal, closeModal } = useUI();

  function branchModal(branch: Branch | null) {
    const isNew = !branch;
    const state = { name: branch?.name || '', address: branch?.address || '' };
    let error = '';

    const render = () => {
      openModal(
        <>
          <header>
            <h3>{isNew ? 'New branch' : 'Edit branch'}</h3>
          </header>
          <div className="bodyPad">
            <div className="field">
              <label>Branch name</label>
              <input
                defaultValue={state.name}
                onChange={(e) => (state.name = e.target.value)}
                autoFocus
              />
            </div>
            <div className="field">
              <label>Address (optional)</label>
              <input defaultValue={state.address} onChange={(e) => (state.address = e.target.value)} />
            </div>
            {error && <div className="errText">{error}</div>}
          </div>
          <footer>
            <button className="btn" onClick={closeModal}>
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={async () => {
                if (!state.name.trim()) {
                  error = 'Branch name is required';
                  render();
                  return;
                }
                try {
                  const payload = { name: state.name.trim(), address: state.address.trim() };
                  if (isNew) await api.createBranch(payload);
                  else await api.updateBranch(branch.id, payload);
                  closeModal();
                  reloadBranches();
                  toast(isNew ? 'Branch created' : 'Branch saved');
                } catch (e) {
                  error = e instanceof Error ? e.message : 'Something went wrong';
                  render();
                }
              }}
            >
              {isNew ? 'Create branch' : 'Save'}
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
        <h2>Branches</h2>
        <div className="grow"></div>
        <button className="btn primary" onClick={() => branchModal(null)}>
          + New branch
        </button>
      </div>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {branches.length === 0 && (
              <tr>
                <td colSpan={3} className="centerNote">
                  No branches yet — add your first location.
                </td>
              </tr>
            )}
            {branches.map((b) => (
              <tr key={b.id}>
                <td>
                  <b>{b.name}</b>
                </td>
                <td style={{ color: 'var(--muted)' }}>{b.address || '—'}</td>
                <td>
                  <button className="btn small" onClick={() => branchModal(b)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 14 }}>
          Each employee is assigned a branch on the Staff screen. Managers and cashiers only see
          their own branch; as owner you can switch branches from the top of the sidebar.
        </p>
      </div>
    </section>
  );
}
