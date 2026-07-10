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

const TABS: { key: Screen; label: string; perm: number; icon: ComponentType }[] = [
  { key: 'sell', label: 'Sell', perm: 0, icon: SellIcon },
  { key: 'history', label: 'History', perm: 0, icon: HistoryIcon },
  { key: 'inventory', label: 'Items', perm: 1, icon: ItemsIcon },
  { key: 'categories', label: 'Categories', perm: 1, icon: CategoriesIcon },
  { key: 'employees', label: 'Staff', perm: 1, icon: StaffIcon },
];

function AppShell() {
  const [session, setSession] = useState<Employee | null>(null);
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

  useEffect(() => {
    if (!session) return;
    reloadItems();
    reloadEmployees();
    reloadCategories();
  }, [session, reloadItems, reloadEmployees, reloadCategories]);

  function handleLogin(employee: Employee) {
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
    setSession(null);
  }

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
