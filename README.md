# TindaPOS — Next.js + Supabase edition

A tablet-friendly point of sale, rebuilt as a single **Next.js (TypeScript)** app backed by **Supabase** (Postgres + Storage). One deploy on Vercel, one database on Supabase — no separate backend server to run.

> The previous Laravel + React/Vite version lives in this repo's git history (`git log`, before the "Convert to Next.js" commit).

## Features

- **Sell screen** — tap-to-add catalog with category tabs, item photos, live stock badges, ticket with per-line quantities, percentage discounts, cash/card payment with quick-cash buttons and change due, printable-style receipt.
- **Unlimited sales history** — paginated (50 per page), search by receipt # or item name, filter by employee, one-tap refunds that return stock.
- **Employee management** — PIN clock-in/out with real shift records, roles (cashier / manager / owner) enforced in the UI, per-employee sales totals, timesheet.
- **Advanced inventory** — categories, cost/price/margin, item photos (Supabase Storage), low/out-of-stock statuses, and a full `stock_adjustments` audit trail for every receive / recount / damage change.
- **Installable PWA** — add to an Android tablet's home screen; standalone display, themed splash.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 App Router, React 19, TypeScript |
| API | Next.js route handlers (`src/app/api/*`) |
| Database | Supabase Postgres — schema + transactional RPCs in `supabase/migrations/` |
| File storage | Supabase Storage (public `item-images` bucket) |
| Hosting | Vercel (one project, frontend + API together) |

Checkout and refunds run inside Postgres functions (`create_sale`, `refund_sale`), so stock validation, decrement, and receipt rows commit atomically — the same guarantees the old Laravel `DB::transaction` gave.

## Local development

1. **Create a Supabase project** at [supabase.com](https://supabase.com), then run in the SQL editor:
   - `supabase/migrations/00001_init.sql` (schema, RPCs, storage bucket)
   - `supabase/seed.sql` (demo data)

2. **Configure env vars:**

   ```bash
   cp .env.example .env.local
   # fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
   # (Project Settings → API — the service role key stays server-side only)
   ```

3. **Run:**

   ```bash
   npm install
   npm run dev
   ```

   Open http://localhost:3000 and log in with a demo PIN:
   **1234** (owner) · **2222** (manager) · **3333** (cashier)

   Change these in **Staff** after your first login.

## Deploying

See [DEPLOYMENT.md](./DEPLOYMENT.md) — Vercel + Supabase, about 10 minutes end to end.

## Project structure

```
src/app/            Next.js App Router — layout, page, PWA manifest
src/app/api/        API route handlers (login, employees, categories, items, sales, shifts)
src/components/     React screens: LockScreen, Sell, History, Inventory, Employees, Categories
src/lib/            Shared types, typed API client, server helpers, validators
supabase/           SQL migrations (schema + RPCs + storage bucket) and seed data
public/icons/       PWA icons
```

## Security model

This is a trusted-device POS, matching the original app: the PIN unlocks the UI and records shifts, and all data access flows through the app's own API routes. The Supabase **service role key is used only server-side** (route handlers); RLS is enabled with no public policies, so the database is unreachable with the anon key. Don't share the deployment URL beyond your staff without adding real authentication in front.
