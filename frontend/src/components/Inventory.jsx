import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { peso } from '../utils.js';
import { useUI } from '../UI.jsx';

export default function Inventory({ items, categories, reloadItems, employee }) {
  const { toast, openModal, closeModal } = useUI();
  const [q, setQ] = useState('');
  const [stats, setStats] = useState(null);

  useEffect(() => { api.itemStats().then(setStats).catch(() => {}); }, [items]);

  const filtered = items.filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()) || i.sku.toLowerCase().includes(q.toLowerCase()));

  function itemModal(item) {
    const isNew = !item;
    const state = {
      name: item?.name || '', sku: item?.sku || '', category_id: item?.category_id || categories[0]?.id || '',
      cost: item?.cost ?? '', price: item?.price ?? '', stock: item?.stock ?? 0, low_stock: item?.low_stock ?? 5,
    };
    let imageFile = null;
    let imagePreview = item?.image_url || null;
    let error = '';

    const render = () => {
      openModal(
        <>
          <header><h3>{isNew ? 'New item' : 'Edit item'}</h3></header>
          <div className="bodyPad">
            <div className="imgPreviewRow">
              {imagePreview
                ? <img className="imgPreview" src={imagePreview} alt="" />
                : <div className="imgPreview imgPreviewEmpty">No photo</div>}
              <div className="field" style={{ margin: 0, flex: 1 }}>
                <label>Photo</label>
                <input type="file" accept="image/*" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  imageFile = f;
                  imagePreview = URL.createObjectURL(f);
                  render();
                }} />
              </div>
            </div>
            <div className="field"><label>Name</label><input defaultValue={state.name} onChange={(e) => (state.name = e.target.value)} /></div>
            <div className="fieldRow">
              <div className="field"><label>SKU</label><input defaultValue={state.sku} onChange={(e) => (state.sku = e.target.value)} /></div>
              <div className="field"><label>Category</label>
                <select defaultValue={state.category_id} onChange={(e) => (state.category_id = e.target.value)}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="fieldRow">
              <div className="field"><label>Cost (₱)</label><input type="number" inputMode="decimal" defaultValue={state.cost} onChange={(e) => (state.cost = e.target.value)} /></div>
              <div className="field"><label>Price (₱)</label><input type="number" inputMode="decimal" defaultValue={state.price} onChange={(e) => (state.price = e.target.value)} /></div>
            </div>
            <div className="fieldRow">
              <div className="field"><label>{isNew ? 'Opening stock' : 'Current stock'}</label>
                <input type="number" inputMode="numeric" defaultValue={state.stock} disabled={!isNew} onChange={(e) => (state.stock = e.target.value)} /></div>
              <div className="field"><label>Low-stock alert at</label><input type="number" inputMode="numeric" defaultValue={state.low_stock} onChange={(e) => (state.low_stock = e.target.value)} /></div>
            </div>
            {error && <div className="errText">{error}</div>}
          </div>
          <footer>
            {!isNew && <button className="btn danger" onClick={() => deleteConfirmModal(item)}>Delete</button>}
            <button className="btn" onClick={closeModal}>Cancel</button>
            <button className="btn primary" onClick={async () => {
              if (!state.name.trim()) { error = 'Name is required'; render(); return; }
              const payload = {
                name: state.name, sku: state.sku || state.name.slice(0, 3).toUpperCase() + '-' + Date.now().toString().slice(-4),
                category_id: state.category_id || null, cost: +state.cost || 0, price: +state.price || 0, low_stock: +state.low_stock || 0,
              };
              try {
                const saved = isNew
                  ? await api.createItem({ ...payload, stock: +state.stock || 0, color: randomColor() })
                  : await api.updateItem(item.id, payload);
                if (imageFile) await api.uploadItemImage(saved.id, imageFile);
                closeModal(); reloadItems(); toast(isNew ? 'Item created' : 'Item saved');
              } catch (e) { error = e.message; render(); }
            }}>{isNew ? 'Create item' : 'Save'}</button>
          </footer>
        </>
      );
    };
    render();
  }

  function deleteConfirmModal(item) {
    let pin = '';
    let error = '';

    const render = () => {
      openModal(
        <>
          <header><h3>Delete item?</h3></header>
          <div className="bodyPad">
            <p>Delete <b>{item.name}</b>? This can't be undone. Enter your PIN to confirm.</p>
            <div className="field">
              <label>Your PIN</label>
              <input type="password" inputMode="numeric" maxLength={4} autoFocus
                defaultValue={pin} onChange={(e) => { pin = e.target.value.replace(/\D/g, '').slice(0, 4); if (error) { error = ''; render(); } }} />
            </div>
            {error && <div className="errText">{error}</div>}
          </div>
          <footer>
            <button className="btn" onClick={closeModal}>Cancel</button>
            <button className="btn danger" onClick={async () => {
              if (pin !== employee.pin) { error = 'Incorrect PIN'; render(); return; }
              try { await api.deleteItem(item.id); closeModal(); reloadItems(); toast('Item deleted'); }
              catch (e) { error = e.message; render(); }
            }}>Confirm delete</button>
          </footer>
        </>
      );
    };
    render();
  }

  function adjustModal(item) {
    let reason = 'receive';
    let qty = '';
    let error = '';
    const render = () => {
      openModal(
        <>
          <header><h3>Adjust stock — {item.name}</h3></header>
          <div className="bodyPad">
            <div className="totRow"><span>Currently in stock</span><b>{item.stock}</b></div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Reason</label>
              <select defaultValue={reason} onChange={(e) => (reason = e.target.value)}>
                <option value="receive">Receive delivery (+)</option>
                <option value="recount">Physical recount (set exact)</option>
                <option value="damage">Damage / waste (−)</option>
              </select>
            </div>
            <div className="field"><label>Quantity</label><input type="number" inputMode="numeric" placeholder="0" onChange={(e) => (qty = e.target.value)} /></div>
            {error && <div className="errText">{error}</div>}
          </div>
          <footer>
            <button className="btn" onClick={closeModal}>Cancel</button>
            <button className="btn primary" onClick={async () => {
              const n = +qty;
              if (isNaN(n) || qty === '') { error = 'Enter a quantity'; render(); return; }
              try {
                await api.adjustItem(item.id, { reason, qty: n, employee_id: employee.id });
                closeModal(); reloadItems(); toast('Stock updated');
              } catch (e) { error = e.message; render(); }
            }}>Apply</button>
          </footer>
        </>
      );
    };
    render();
  }

  return (
    <section className="screen">
      <div className="topbar">
        <h2>Inventory</h2>
        <div className="grow"></div>
        <input className="search" placeholder="Search name or SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" onClick={() => itemModal(null)}>+ New item</button>
      </div>
      {stats && (
        <div className="statRow">
          <div className="stat"><div className="lbl">Items</div><div className="val">{stats.count}</div></div>
          <div className="stat"><div className="lbl">Low stock</div><div className="val" style={{ color: stats.low ? 'var(--danger)' : 'inherit' }}>{stats.low}</div></div>
          <div className="stat"><div className="lbl">Out of stock</div><div className="val">{stats.out}</div></div>
          <div className="stat"><div className="lbl">Stock value (cost)</div><div className="val">{peso(stats.stock_value)}</div></div>
        </div>
      )}
      <div className="tableWrap">
        <table>
          <thead><tr><th>Item</th><th>SKU</th><th>Category</th><th className="num">Cost</th><th className="num">Price</th><th className="num">Margin</th><th className="num">In stock</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id}>
                <td><b>{i.name}</b></td>
                <td style={{ color: 'var(--muted)' }}>{i.sku}</td>
                <td>{i.category?.name || '—'}</td>
                <td className="num">{peso(i.cost)}</td>
                <td className="num">{peso(i.price)}</td>
                <td className="num">{i.margin_pct}%</td>
                <td className="num"><b>{i.stock}</b></td>
                <td>{i.status === 'out' ? <span className="pill out">Out</span> : i.status === 'low' ? <span className="pill low">Low</span> : <span className="pill ok">In stock</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn small" onClick={() => adjustModal(i)}>± Stock</button>{' '}
                  <button className="btn small" onClick={() => itemModal(i)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function randomColor() {
  const palette = ['#6B4226', '#4E6E58', '#B4763A', '#4C8FB4', '#8A4B3B', '#7FA23C'];
  return palette[Math.floor(Math.random() * palette.length)];
}
