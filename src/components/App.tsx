'use client';

import React, { useCallback, useEffect, useState, type ComponentType } from 'react';
import { api } from '@/lib/api';
import { roleRank } from '@/lib/format';
import type { Branch, Category, Employee, Item } from '@/lib/types';
import { UIProvider, useUI } from './UI';
import {
  BranchIcon,
  CategoriesIcon,
  HistoryIcon,
  ItemsIcon,
  LockIcon,
  SellIcon,
  StaffIcon,
} from './Icons';
import LockScreen from './LockScreen';
import Sell from './Sell';
import History from './History';
import Inventory from './Inventory';
import Employees from './Employees';
import Categories from './Categories';
import Branches from './Branches';

type Screen = 'sell' | 'history' | 'inventory' | 'categories' | 'employees' | 'branches';

// Keeps the cashier clocked in across page refreshes. The PIN is already
// treated as non-secret in this app (shown on staff screens), so persisting
// the session here matches the existing trust model.
const SESSION_KEY = 'tindapos:session';

const TABS: { key: Screen; label: string; perm: number; icon: ComponentType }[] = [
  { key: 'sell', label: 'Sell', perm: 0, icon: SellIcon },
  { key: 'history', label: 'History', perm: 0, icon: HistoryIcon },
  { key: 'inventory', label: 'Items', perm: 1, icon: ItemsIcon },
  { key: 'categories', label: 'Categories', perm: 1, icon: CategoriesIcon },
  { key: 'employees', label: 'Staff', perm: 1, icon: StaffIcon },
  { key: 'branches', label: 'Branches', perm: 2, icon: BranchIcon },
];

function AppShell() {
  const { openModal, closeModal } = useUI();
  const [session, setSession] = useState<Employee | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [screen, setScreen] = useState<Screen>('sell');
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  // The branch the user is currently operating in (drives Sell + Inventory).
  const [activeBranchId, setActiveBranchId] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);

  const isOwner = session ? roleRank(session.role) >= 2 : false;

  const reloadItems = useCallback(async () => {
    if (!activeBranchId) {
      setItems([]);
      return;
    }
    try {
      setItems(await api.items('', activeBranchId));
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [activeBranchId]);
  const reloadEmployees = useCallback(async () => {
    if (!session) return;
    // Owner sees every employee; a manager only their own branch's staff.
    const branchFilter = roleRank(session.role) >= 2 ? undefined : session.branch_id ?? undefined;
    try {
      setEmployees(await api.employees(branchFilter));
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [session]);
  const reloadCategories = useCallback(async () => {
    try {
      setCategories(await api.categories());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);
  const reloadBranches = useCallback(async () => {
    try {
      setBranches(await api.branches());
    } catch {
      /* branch list is best-effort */
    }
  }, []);

  // Restore a persisted session on load so a refresh doesn't kick the cashier
  // back to the lock screen. Runs client-side only to avoid an SSR mismatch.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const emp = JSON.parse(raw) as Employee;
        setSession(emp);
        setActiveBranchId(emp.branch_id ?? null);
      }
    } catch {
      /* ignore a corrupted session — user just logs in again */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!session) return;
    reloadBranches();
    reloadEmployees();
    reloadCategories();
  }, [session, reloadBranches, reloadEmployees, reloadCategories]);

  // An owner with no home branch defaults to the first branch once loaded.
  useEffect(() => {
    if (session && activeBranchId == null && branches.length) {
      setActiveBranchId(branches[0].id);
    }
  }, [session, activeBranchId, branches]);

  // (Re)load the active branch's items whenever the branch changes.
  useEffect(() => {
    if (!session || !activeBranchId) return;
    reloadItems();
  }, [session, activeBranchId, reloadItems]);

  function handleLogin(employee: Employee) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(employee));
    } catch {
      /* storage unavailable — session just won't survive a refresh */
    }
    setSession(employee);
    setActiveBranchId(employee.branch_id ?? null);
    setScreen('sell');
  }

  async function handleLock() {
    if (session) {
      try {
        await api.logout(session.id);
      } catch {
        /* clock-out is best-effort */
      }
    }
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    setSession(null);
    setActiveBranchId(null);
  }

  function switchBranchModal() {
    openModal(
      <>
        <header>
          <h3>Switch branch</h3>
        </header>
        <div className="bodyPad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {branches.map((b) => (
            <button
              key={b.id}
              className={'btn' + (b.id === activeBranchId ? ' primary' : '')}
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => {
                setActiveBranchId(b.id);
                closeModal();
              }}
            >
              {b.name}
              {b.address ? ` — ${b.address}` : ''}
            </button>
          ))}
        </div>
        <footer>
          <button className="btn" onClick={closeModal}>
            Close
          </button>
        </footer>
      </>,
    );
  }

  // Hold the first paint until we've checked storage, so a logged-in refresh
  // never flashes the lock screen.
  if (!hydrated) return null;
  if (!session) return <LockScreen onLogin={handleLogin} />;

  const canManage = roleRank(session.role) >= 1;
  const activeBranch = branches.find((b) => b.id === activeBranchId) || null;
  const activeBranchName = activeBranch?.name ?? '…';

  return (
    <div id="app">
      {offline && (
        <div id="offlineBanner">Can&apos;t reach the POS server — check your connection.</div>
      )}
      <nav id="rail" style={offline ? { paddingTop: 44 } : undefined}>
        <div className="logo">
          <span>TALABAHAN</span>
          <span className="sa">SA</span>
          <b>CALINAN</b>
        </div>
        {isOwner ? (
          <button className="branchChip" onClick={switchBranchModal} title="Switch branch">
            <BranchIcon />
            <span>{activeBranchName}</span>
            <small>switch ▾</small>
          </button>
        ) : (
          <div className="branchChip static">
            <BranchIcon />
            <span>{activeBranchName}</span>
          </div>
        )}
        {TABS.filter((t) => roleRank(session.role) >= t.perm).map((t) => (
          <button
            key={t.key}
            className={'tab' + (screen === t.key ? ' active' : '')}
            onClick={() => setScreen(t.key)}
          >
            <t.icon />
            {t.label}
          </button>
        ))}
        <div className="spacer"></div>
        <div className="userChip">
          <b>{session.name.split(' ')[0]}</b>
          <span>{session.role}</span>
        </div>
        <button className="tab" onClick={handleLock}>
          <LockIcon />
          Lock
        </button>
      </nav>
      <main>
        {screen === 'sell' && (
          <Sell
            employee={session}
            branchId={activeBranchId}
            items={items}
            categories={categories}
            reloadItems={reloadItems}
          />
        )}
        {screen === 'history' && (
          <History
            employees={employees}
            canManage={canManage}
            isOwner={isOwner}
            branches={branches}
            branchId={isOwner ? null : session.branch_id}
          />
        )}
        {screen === 'inventory' && canManage && (
          <Inventory
            items={items}
            categories={categories}
            reloadItems={reloadItems}
            employee={session}
            branchId={activeBranchId}
            branchName={activeBranchName}
          />
        )}
        {screen === 'categories' && canManage && (
          <Categories categories={categories} reloadCategories={reloadCategories} />
        )}
        {screen === 'employees' && canManage && (
          <Employees
            employees={employees}
            reloadEmployees={reloadEmployees}
            session={session}
            isOwner={isOwner}
            branches={branches}
          />
        )}
        {screen === 'branches' && isOwner && (
          <Branches branches={branches} reloadBranches={reloadBranches} />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <UIProvider>
      <AppShell />
    </UIProvider>
  );
}
