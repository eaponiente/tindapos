// Base URL of the Laravel backend. Set VITE_API_URL in a .env file if the
// API isn't on the same machine (e.g. a shop server on the local network):
//   VITE_API_URL=http://192.168.1.20:8000/api
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:80/api';

async function request(path, options = {}) {
  let res;
  const isForm = options.body instanceof FormData;
  try {
    res = await fetch(BASE + path, {
      headers: isForm ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...options,
    });
  } catch (e) {
    throw new Error('Cannot reach the POS server. Check that it is running and the tablet is on the same network.');
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : null;
  if (!res.ok) {
    const msg = body?.message || Object.values(body?.errors || {}).flat()[0] || 'Something went wrong';
    throw new Error(msg);
  }
  return body;
}

export const api = {
  login: (pin) => request('/login', { method: 'POST', body: JSON.stringify({ pin }) }),
  logout: (employee_id) => request('/logout', { method: 'POST', body: JSON.stringify({ employee_id }) }),

  employees: () => request('/employees'),
  createEmployee: (data) => request('/employees', { method: 'POST', body: JSON.stringify(data) }),
  updateEmployee: (id, data) => request(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEmployee: (id) => request(`/employees/${id}`, { method: 'DELETE' }),
  shifts: () => request('/shifts'),

  categories: () => request('/categories'),
  createCategory: (data) => request('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id, data) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),

  items: (q = '') => request('/items' + (q ? `?q=${encodeURIComponent(q)}` : '')),
  itemStats: () => request('/items/stats'),
  createItem: (data) => request('/items', { method: 'POST', body: JSON.stringify(data) }),
  updateItem: (id, data) => request(`/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteItem: (id) => request(`/items/${id}`, { method: 'DELETE' }),
  adjustItem: (id, data) => request(`/items/${id}/adjust`, { method: 'POST', body: JSON.stringify(data) }),
  uploadItemImage: (id, file) => {
    const fd = new FormData();
    fd.append('image', file);
    return request(`/items/${id}/image`, { method: 'POST', body: fd });
  },

  sales: (params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString();
    return request('/sales' + (qs ? `?${qs}` : ''));
  },
  saleStats: () => request('/sales/stats'),
  createSale: (data) => request('/sales', { method: 'POST', body: JSON.stringify(data) }),
  refundSale: (id) => request(`/sales/${id}/refund`, { method: 'POST' }),
};
