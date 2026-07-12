// Shared domain types — the single source of truth for both the route
// handlers (what they return) and the client components (what they render).

export type Role = 'cashier' | 'manager' | 'owner';
export type StockStatus = 'ok' | 'low' | 'out';
export type PaymentMethod = 'cash' | 'card';
export type AdjustReason = 'receive' | 'recount' | 'damage';

export interface Branch {
  id: number;
  name: string;
  address?: string | null;
}

export interface Employee {
  id: number;
  name: string;
  pin: string; // shown on owner/manager staff screens, so not hidden
  role: Role;
  branch_id: number | null; // null = owner overseeing all branches
  // employee_overview extras (list endpoint only)
  branch_name?: string | null;
  receipts_count?: number;
  sales_total?: number;
  last_clock_in?: string | null;
}

export interface Category {
  id: number;
  name: string;
  items_count?: number;
}

export interface Item {
  id: number;
  name: string;
  sku: string;
  branch_id: number;
  category_id: number | null;
  cost: number;
  price: number;
  stock: number;
  low_stock: number;
  color: string;
  image: string | null;
  // computed server-side, mirroring the Laravel model accessors
  image_url: string | null;
  margin_pct: number;
  status: StockStatus;
  category?: { id: number; name: string } | null;
}

export interface SaleLine {
  id: number;
  sale_id: number;
  item_id: number | null;
  name: string; // snapshot, survives item edits/deletes
  price: number;
  qty: number;
}

export interface Sale {
  id: number;
  employee_id: number | null;
  branch_id: number | null;
  branch?: { id: number; name: string } | null;
  subtotal: number;
  discount_pct: number;
  discount: number;
  total: number;
  payment_method: PaymentMethod;
  tendered: number;
  change_due: number;
  refunded: boolean;
  created_at: string;
  employee?: { id: number; name: string } | null;
  items: SaleLine[];
}

export interface Shift {
  id: number;
  employee_id: number;
  clock_in: string;
  clock_out: string | null;
  employee?: { id: number; name: string } | null;
}

export interface SalesPage {
  data: Sale[];
  page: number;
  per_page: number;
  total: number;
  has_next: boolean;
}

export interface SaleStats {
  receipts_count: number;
  today_total: number;
  all_time_total: number;
}

export interface ItemStats {
  count: number;
  low: number;
  out: number;
  stock_value: number;
}
