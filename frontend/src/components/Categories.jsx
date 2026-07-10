import React from 'react';
import { api } from '../api.js';
import { useUI } from '../UI.jsx';

export default function Categories({ categories, reloadCategories }) {
  const { toast, openModal, closeModal } = useUI();

  function categoryModal(category) {
    const isNew = !category;
    const state = { name: category?.name || '' };
    let error = '';

    const render = () => {
      openModal(
        <>
          <header><h3>{isNew ? 'New category' : 'Edit category'}</h3></header>
          <div className="bodyPad">
            <div className="field"><label>Name</label><input defaultValue={state.name} onChange={(e) => (state.name = e.target.value)} autoFocus /></div>
            {error && <div className="errText">{error}</div>}
          </div>
          <footer>
            {!isNew && <button className="btn danger" onClick={() => deleteConfirmModal(category)}>Delete</button>}
            <button className="btn" onClick={closeModal}>Cancel</button>
            <button className="btn primary" onClick={async () => {
              if (!state.name.trim()) { error = 'Name is required'; render(); return; }
              try {
                if (isNew) await api.createCategory({ name: state.name });
                else await api.updateCategory(category.id, { name: state.name });
                closeModal(); reloadCategories(); toast(isNew ? 'Category created' : 'Category saved');
              } catch (e) { error = e.message; render(); }
            }}>{isNew ? 'Create category' : 'Save'}</button>
          </footer>
        </>
      );
    };
    render();
  }

  function deleteConfirmModal(category) {
    openModal(
      <>
        <header><h3>Delete category?</h3></header>
        <div className="bodyPad">
          <p>
            Delete <b>{category.name}</b>?
            {category.items_count > 0 && ` ${category.items_count} item${category.items_count === 1 ? '' : 's'} will become uncategorized.`}
          </p>
        </div>
        <footer>
          <button className="btn" onClick={closeModal}>Cancel</button>
          <button className="btn danger" onClick={async () => {
            try { await api.deleteCategory(category.id); closeModal(); reloadCategories(); toast('Category deleted'); }
            catch (e) { toast(e.message); }
          }}>Delete</button>
        </footer>
      </>
    );
  }

  return (
    <section className="screen">
      <div className="topbar">
        <h2>Categories</h2>
        <div className="grow"></div>
        <button className="btn primary" onClick={() => categoryModal(null)}>+ New category</button>
      </div>
      <div className="tableWrap">
        <table>
          <thead><tr><th>Name</th><th className="num">Items</th><th></th></tr></thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td><b>{c.name}</b></td>
                <td className="num">{c.items_count ?? 0}</td>
                <td><button className="btn small" onClick={() => categoryModal(c)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
