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

export interface ActivityLog {
  id: number;
  actor_id: number | null;
  actor_name: string;
  action: string;
  detail: string | null;
  created_at: string;
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
  position: number; // display order on the Sell grid (owner-arranged)
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
  employee_name?: string | null; // snapshot — survives employee deletion
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
  order_type?: string | null; // 'dine_in' | 'take_out' | 'delivery' | 'pick_up' | null
  table_label?: string | null; // e.g. "3 + 4" for dine-in
  customer_name?: string | null;
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
  refunded_count: number;
  refunded_total: number;
  cash_total: number;
  cash_count: number;
  gcash_total: number;
  gcash_count: number;
}

export interface ItemStats {
  count: number;
  low: number;
  out: number;
  stock_value: number;
}

// ── Restaurant tables & dine-in sessions ────────────────────────────────────
export type TableSessionStatus = 'open' | 'for_payment' | 'closed' | 'void';

/** One physical table on the floor, with its live status derived from any
 *  active session (from the table_floor view). */
export interface FloorTable {
  table_id: number;
  branch_id: number;
  table_number: number;
  capacity: number;
  grid_x: number | null;
  grid_y: number | null;
  // present only when the table is part of an active session
  session_id: number | null;
  session_status: TableSessionStatus | null;
  service_type: ServiceType | null;
  customer_count: number | null;
  customer_name: string | null;
  reserved_at: string | null; // set = reservation (arrival time)
  opened_at: string | null;
  session_tables_label: string | null; // e.g. "3 + 4" for a combined session
  order_total: number | null;
  item_count: number | null;
}

/** A line in a session's running order. */
export interface TableSessionItem {
  id: number;
  session_id: number;
  item_id: number | null;
  name: string;
  price: number;
  qty: number;
  round: number;
  created_at: string;
}

export type ServiceType = 'dine_in' | 'take_out' | 'delivery' | 'pick_up';

/** Full detail of one session — a dine-in table tab OR a take-out/delivery/
 *  pick-up order ticket (no table, with a customer record). */
export interface TableSession {
  id: number;
  branch_id: number;
  customer_count: number;
  status: TableSessionStatus;
  service_type: ServiceType;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_landmark: string | null;
  reserved_at: string | null; // dine-in reservation arrival time (null = walk-in)
  opened_by: number | null;
  opened_by_name: string | null;
  opened_at: string;
  closed_at: string | null;
  sale_id: number | null;
  tables: { table_id: number; table_number: number }[]; // dine-in: occupied tables
  tables_label: string; // e.g. "3 + 4" (empty for non-dine-in)
  items: TableSessionItem[];
  total: number;
}

/** One open non-dine-in order in the Orders list. */
export interface OrderTicket {
  id: number;
  service_type: ServiceType;
  status: TableSessionStatus;
  customer_count: number;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_landmark: string | null;
  opened_at: string;
  total: number;
  item_count: number;
}
