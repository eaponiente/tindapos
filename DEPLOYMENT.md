# Deploying TindaPOS to Vercel + Supabase

The app is a single Next.js (TypeScript) project: the React frontend and the API route handlers deploy together on **Vercel**, and **Supabase** provides the Postgres database and item-photo storage. No other servers are involved.

```
   Browser / tablet ───► Vercel (Next.js: frontend + /api routes) ───► Supabase
        (PWA)                                                          • Postgres
                                                                       • Storage (item photos)
```

## Prerequisites

- This repo on GitHub: `git@github.com:eaponiente/tindapos.git`
- Free accounts on [Supabase](https://supabase.com) and [Vercel](https://vercel.com)

---

## Part 1 — Supabase (database + storage)

### 1.1 Create the project

1. <https://supabase.com/dashboard> → **New project**.
2. Name it `tindapos`, pick a region near your users (e.g. Southeast Asia — Singapore), set a strong database password.
3. Wait ~2 minutes for provisioning.

### 1.2 Run the schema

1. Open **SQL Editor** → **New query**.
2. Paste the contents of [`supabase/migrations/00001_init.sql`](./supabase/migrations/00001_init.sql) and **Run**. This creates:
   - all seven tables (categories, employees, items, sales, sale_items, shifts, stock_adjustments) with RLS enabled;
   - the `create_sale` / `refund_sale` transactional functions and `sales_stats` helper;
   - the `employee_overview` view;
   - the public `item-images` storage bucket (4 MB cap, image MIME types only).

### 1.3 Seed the demo data

Paste and run [`supabase/seed.sql`](./supabase/seed.sql). This creates the demo staff — PIN **1234** (owner), **2222** (manager), **3333** (cashier) — plus 5 categories and 14 items. **Change the PINs before going live** (Staff screen, after first login).

### 1.4 Copy the API credentials

**Project Settings → API**, note down:

- **Project URL** — `https://<ref>.supabase.co`
- **`service_role` secret key** — used only by the server-side route handlers; never sent to the browser.

---

## Part 2 — Vercel

### 2.1 Import the repo

1. <https://vercel.com/new> → Import `eaponiente/tindapos`.
2. Framework preset: **Next.js** (auto-detected). Root directory: repo root (default). No build overrides needed.

### 2.2 Set environment variables

Under **Environment Variables**, add both for Production (and Preview if you use preview deploys):

| Variable | Value |
|---|---|
| `SUPABASE_URL` | your Project URL from step 1.4 |
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key from step 1.4 |

> These are deliberately **not** `NEXT_PUBLIC_` — Next.js keeps them server-side, so the browser can never see the service role key.

### 2.3 Deploy

Click **Deploy**. Vercel builds and gives you `https://tindapos-<something>.vercel.app`.

There is no CORS to configure: the frontend and API share one origin.

---

## Part 3 — Verify end to end

1. Open the deployment URL.
2. Log in with PIN **1234** — this also writes a real clock-in shift.
3. Confirm the Sell screen shows the 14 seeded items (Vercel → Supabase read works).
4. Ring up a test sale (cash → Complete sale) and check that stock decremented and the receipt modal shows (transactional `create_sale` RPC works).
5. Open **History**, tap the receipt, **Refund** it — stock returns.
6. In **Items → Edit**, upload a photo — it should appear on the Sell screen tile (Storage works).
7. In Supabase → **Table Editor**, see the rows in `sales`, `sale_items`, `shifts`, `stock_adjustments`.

### Install on the tablet

Open the URL in Chrome on the tablet → **⋮ → Install app** → launch TindaPOS from the home screen (full-screen standalone PWA).

---

## Ongoing

- **Deploys**: every push to `main` redeploys automatically.
- **Schema changes**: add a new numbered file in `supabase/migrations/` and run it in the SQL editor (or wire up the [Supabase CLI](https://supabase.com/docs/guides/cli) with `supabase db push`).
- **Backups**: Supabase free tier keeps daily backups for 7 days; the Pro plan extends this.
- **Custom domain**: Vercel project → Settings → Domains.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" | Env vars not set on Vercel (Part 2.2). Redeploy after adding them. |
| Login always says "Wrong PIN" | Seed not run (Part 1.3), or you changed the PINs. |
| "Not enough stock for …" on checkout | Working as intended — the `create_sale` function refuses to oversell. Adjust stock in Items → ± Stock. |
| Photo upload fails | `item-images` bucket missing — re-run the storage section at the bottom of `00001_init.sql`. Max 4 MB, image types only. |
| Empty tables / "relation does not exist" | Migration not run in this Supabase project (Part 1.2). |
| Local dev can't connect | `.env.local` missing or has placeholder values — copy `.env.example` and fill in real credentials. |
