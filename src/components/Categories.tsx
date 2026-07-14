'use client';

import React from 'react';
import { api } from '@/lib/api';
import { useUI } from './UI';
import type { Category, Employee } from '@/lib/types';

interface CategoriesProps {
  categories: Category[];
  reloadCategories: () => Promise<void>;
  session: Employee;
}

export default function Categories({ categories, reloadCategories, session }: CategoriesProps) {
  const { toast, openModal, closeModal } = useUI();
  const log = (action: string, detail?: string) =>
    api.logActivity({ actor_id: session.id, actor_name: session.name, action, detail });

  function categoryModal(category: Category | null) {
    const isNew = !category;
    const state = { name: category?.name || '' };
    let error = '';

    const render = () => {
      openModal(
        <>
          <header>
            <h3>{isNew ? 'New category' : 'Edit category'}</h3>
          </header>
          <div className="bodyPad">
            <div className="field">
              <label>Name</label>
              <input
                defaultValue={state.name}
                onChange={(e) => (state.name = e.target.value)}
                autoFocus
              />
            </div>
            {error && <div className="errText">{error}</div>}
          </div>
          <footer>
            {!isNew && (
              <button className="btn danger" onClick={() => deleteConfirmModal(category)}>
                Delete
              </button>
            )}
            <button className="btn" onClick={closeModal}>
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={async () => {
                if (!state.name.trim()) {
                  error = 'Name is required';
                  render();
                  return;
                }
                try {
                  if (isNew) {
                    await api.createCategory({ name: state.name });
                    log('Added category', state.name);
                  } else {
                    await api.updateCategory(category.id, { name: state.name });
                    log('Edited category', state.name);
                  }
                  closeModal();
                  reloadCategories();
                  toast(isNew ? 'Category created' : 'Category saved');
                } catch (e) {
                  error = e instanceof Error ? e.message : 'Something went wrong';
                  render();
                }
              }}
            >
              {isNew ? 'Create category' : 'Save'}
            </button>
          </footer>
        </>,
      );
    };
    render();
  }

  function deleteConfirmModal(category: Category) {
    const count = category.items_count ?? 0;
    openModal(
      <>
        <header>
          <h3>Delete category?</h3>
        </header>
        <div className="bodyPad">
          <p>
            Delete <b>{category.name}</b>?
            {count > 0 && ` ${count} item${count === 1 ? '' : 's'} will become uncategorized.`}
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
                await api.deleteCategory(category.id);
                log('Deleted category', category.name);
                closeModal();
                reloadCategories();
                toast('Category deleted');
              } catch (e) {
                toast(e instanceof Error ? e.message : 'Something went wrong');
              }
            }}
          >
            Delete
          </button>
        </footer>
      </>,
    );
  }

  return (
    <section className="screen">
      <div className="topbar">
        <h2>Categories</h2>
        <div className="grow"></div>
        <button className="btn primary" onClick={() => categoryModal(null)}>
          + New category
        </button>
      </div>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th className="num">Items</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td>
                  <b>{c.name}</b>
                </td>
                <td className="num">{c.items_count ?? 0}</td>
                <td>
                  <button className="btn small" onClick={() => categoryModal(c)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
