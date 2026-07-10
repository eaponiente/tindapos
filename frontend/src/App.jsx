import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { roleRank } from './utils.js';
import { UIProvider, useUI } from './UI.jsx';
import LockScreen from './components/LockScreen.jsx';
import Sell from './components/Sell.jsx';
import History from './components/History.jsx';
import Inventory from './components/Inventory.jsx';
import Employees from './components/Employees.jsx';
import Categories from './components/Categories.jsx';

const TABS = [
  { key: 'sell', label: 'Sell', perm: 0 },
  { key: 'history', label: 'History', perm: 0 },
  { key: 'inventory', label: 'Items', perm: 1 },
  { key: 'categories', label: 'Categories', perm: 1 },
  { key: 'employees', label: 'Staff', perm: 1 },
];

function AppShell() {
  const { toast } = useUI();
  const [session, setSession] = useState(null); // employee record
  const [shiftId, setShiftId] = useState(null);
  const [screen, setScreen] = useState('sell');
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [offline, setOffline] = useState(false);

  const reloadItems = useCallback(async () => {
    try { setItems(await api.items()); setOffline(false); }
    catch (e) { setOffline(true); }
  }, []);
  const reloadEmployees = useCallback(async () => {
    try { setEmployees(await api.employees()); setOffline(false); }
    catch (e) { setOffline(true); }
  }, []);
  const reloadCategories = useCallback(async () => {
    try { setCategories(await api.categories()); setOffline(false); }
    catch (e) { setOffline(true); }
  }, []);

  useEffect(() => {
    if (!session) return;
    reloadItems();
    reloadEmployees();
    reloadCategories();
  }, [session, reloadItems, reloadEmployees, reloadCategories]);

  function handleLogin(employee, shift) {
    setSession(employee);
    setShiftId(shift);
    setScreen('sell');
  }

  async function handleLock() {
    try { await api.logout(session.id); } catch (e) { /* clock-out is best-effort */ }
    setSession(null);
    setShiftId(null);
  }

  if (!session) return <LockScreen onLogin={handleLogin} />;

  const canManage = roleRank(session.role) >= 1;
  const isOwner = roleRank(session.role) >= 2;

  return (
    <div id="app">
      {offline && <div id="offlineBanner">Can't reach the POS server — check the tablet's connection to the shop network.</div>}
      <nav id="rail" style={offline ? { marginTop: 34 } : undefined}>
        <div className="logo">Tinda<b>POS</b></div>
        {TABS.filter((t) => roleRank(session.role) >= t.perm).map((t) => (
          <button key={t.key} className={'tab' + (screen === t.key ? ' active' : '')} onClick={() => setScreen(t.key)}>
            {t.label}
          </button>
        ))}
        <div className="spacer"></div>
        <div className="userChip"><b>{session.name.split(' ')[0]}</b><span>{session.role}</span></div>
        <button className="tab" onClick={handleLock}>Lock</button>
      </nav>
      <main>
        {screen === 'sell' && <Sell employee={session} items={items} categories={categories} reloadItems={reloadItems} />}
        {screen === 'history' && <History employees={employees} canManage={canManage} />}
        {screen === 'inventory' && canManage && <Inventory items={items} categories={categories} reloadItems={reloadItems} employee={session} />}
        {screen === 'categories' && canManage && <Categories categories={categories} reloadCategories={reloadCategories} />}
        {screen === 'employees' && canManage && <Employees employees={employees} reloadEmployees={reloadEmployees} session={session} isOwner={isOwner} />}
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
