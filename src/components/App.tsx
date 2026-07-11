'use client';

import React, { useCallback, useEffect, useState, type ComponentType } from 'react';
import { api } from '@/lib/api';
import { roleRank } from '@/lib/format';
import type { Category, Employee, Item } from '@/lib/types';
import { UIProvider } from './UI';
import { CategoriesIcon, HistoryIcon, ItemsIcon, LockIcon, SellIcon, StaffIcon } from './Icons';
import LockScreen from './LockScreen';
import Sell from './Sell';
import History from './History';
import Inventory from './Inventory';
import Employees from './Employees';
import Categories from './Categories';

type Screen = 'sell' | 'history' | 'inventory' | 'categories' | 'employees';

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
];

function AppShell() {
  const [session, setSession] = useState<Employee | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [screen, setScreen] = useState<Screen>('sell');
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [offline, setOffline] = useState(false);

  const reloadItems = useCallback(async () => {
    try {
      setItems(await api.items());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);
  const reloadEmployees = useCallback(async () => {
    try {
      setEmployees(await api.employees());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);
  const reloadCategories = useCallback(async () => {
    try {
      setCategories(await api.categories());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  // Restore a persisted session on load so a refresh doesn't kick the cashier
  // back to the lock screen. Runs client-side only to avoid an SSR mismatch.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) setSession(JSON.parse(raw) as Employee);
    } catch {
      /* ignore a corrupted session — user just logs in again */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!session) return;
    reloadItems();
    reloadEmployees();
    reloadCategories();
  }, [session, reloadItems, reloadEmployees, reloadCategories]);

  function handleLogin(employee: Employee) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(employee));
    } catch {
      /* storage unavailable — session just won't survive a refresh */
    }
    setSession(employee);
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
  }

  // Hold the first paint until we've checked storage, so a logged-in refresh
  // never flashes the lock screen.
  if (!hydrated) return null;
  if (!session) return <LockScreen onLogin={handleLogin} />;

  const canManage = roleRank(session.role) >= 1;
  const isOwner = roleRank(session.role) >= 2;

  return (
    <div id="app">
      {offline && (
        <div id="offlineBanner">Can&apos;t reach the POS server — check your connection.</div>
      )}
      <nav id="rail" style={offline ? { paddingTop: 44 } : undefined}>
        <div className="logo">
          Tinda<b>POS</b>
        </div>
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
          <Sell employee={session} items={items} categories={categories} reloadItems={reloadItems} />
        )}
        {screen === 'history' && <History employees={employees} canManage={canManage} />}
        {screen === 'inventory' && canManage && (
          <Inventory items={items} categories={categories} reloadItems={reloadItems} employee={session} />
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
          />
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
