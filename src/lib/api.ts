// Typed client for the app's own /api routes. Same origin as the frontend,
// so there is no base URL to configure and no CORS to worry about.
import type {
  AdjustReason,
  Branch,
  Category,
  Employee,
  Item,
  ItemStats,
  PaymentMethod,
  Sale,
  SaleStats,
  SalesPage,
  Shift,
} from './types';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  const isForm = options.body instanceof FormData;
  try {
    res = await fetch('/api' + path, {
      headers: isForm
        ? { Accept: 'application/json' }
        : { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...options,
    });
  } catch {
    throw new Error('Cannot reach the POS server. Check your connection.');
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new Error(body?.message || 'Something went wrong');
  }
  return body as T;
}

export interface SalePayload {
  employee_id: number;
  branch_id: number;
  discount_pct: number;
  payment_method: PaymentMethod;
  tendered: number;
  lines: { item_id: number; qty: number }[];
}

/** Appends the branch filter to a query string when a branch is given. */
function branchQ(branchId?: number | null): string {
  return branchId ? `branch_id=${branchId}` : '';
}

export const api = {
  login: (pin: string) =>
    request<{ employee: Employee; shift_id: number }>('/login', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),
  logout: (employee_id: number) =>
    request<{ ok: true }>('/logout', { method: 'POST', body: JSON.stringify({ employee_id }) }),

  branches: () => request<Branch[]>('/branches'),
  createBranch: (data: { name: string; address?: string }) =>
    request<Branch>('/branches', { method: 'POST', body: JSON.stringify(data) }),
  updateBranch: (id: number, data: { name: string; address?: string }) =>
    request<Branch>(`/branches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  employees: (branchId?: number | null) =>
    request<Employee[]>('/employees' + (branchId ? `?branch_id=${branchId}` : '')),
  createEmployee: (data: Pick<Employee, 'name' | 'pin' | 'role' | 'branch_id'>) =>
    request<Employee>('/employees', { method: 'POST', body: JSON.stringify(data) }),
  updateEmployee: (id: number, data: Pick<Employee, 'name' | 'pin' | 'role' | 'branch_id'>) =>
    request<Employee>(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEmployee: (id: number) => request<{ ok: true }>(`/employees/${id}`, { method: 'DELETE' }),
  shifts: () => request<Shift[]>('/shifts'),

  categories: () => request<Category[]>('/categories'),
  createCategory: (data: { name: string }) =>
    request<Category>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: number, data: { name: string }) =>
    request<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id: number) => request<{ ok: true }>(`/categories/${id}`, { method: 'DELETE' }),

  items: (q = '', branchId?: number | null) => {
    const parts = [q ? `q=${encodeURIComponent(q)}` : '', branchQ(branchId)].filter(Boolean);
    return request<Item[]>('/items' + (parts.length ? `?${parts.join('&')}` : ''));
  },
  itemStats: (branchId?: number | null) =>
    request<ItemStats>('/items/stats' + (branchId ? `?branch_id=${branchId}` : '')),
  createItem: (data: Partial<Item>) =>
    request<Item>('/items', { method: 'POST', body: JSON.stringify(data) }),
  updateItem: (id: number, data: Partial<Item>) =>
    request<Item>(`/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteItem: (id: number) => request<{ ok: true }>(`/items/${id}`, { method: 'DELETE' }),
  adjustItem: (id: number, data: { reason: AdjustReason; qty: number; employee_id: number }) =>
    request<Item>(`/items/${id}/adjust`, { method: 'POST', body: JSON.stringify(data) }),
  uploadItemImage: (id: number, file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return request<Item>(`/items/${id}/image`, { method: 'POST', body: fd });
  },

  sales: (
    params: {
      q?: string;
      employee_id?: string | number;
      branch_id?: string | number;
      page?: number;
    } = {},
  ) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ),
    ).toString();
    return request<SalesPage>('/sales' + (qs ? `?${qs}` : ''));
  },
  saleStats: (branchId?: number | null) =>
    request<SaleStats>('/sales/stats' + (branchId ? `?branch_id=${branchId}` : '')),
  createSale: (data: SalePayload) =>
    request<Sale>('/sales', { method: 'POST', body: JSON.stringify(data) }),
  refundSale: (id: number) => request<Sale>(`/sales/${id}/refund`, { method: 'POST' }),
};
