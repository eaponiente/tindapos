# TindaPOS — Laravel + React edition

Same point-of-sale app, rebuilt as a proper **Laravel API backend** + **React (Vite) frontend**, installable as a PWA on your Android tablet.

## Before you start: how this is different from the "just a browser" version

The earlier version stored everything with client-side SQLite and needed **no server at all** — truly offline, forever, no network required after the first install.

This version is a real client/server app: **Laravel needs to be running somewhere** (a laptop, an old PC, a Raspberry Pi, or a cheap VPS) and the tablet talks to it over the network. This is the standard way to build something that can later support multiple tablets sharing one set of sales/inventory data, proper user accounts, reporting, etc.

- **If Laravel runs on a computer on your shop's Wi-Fi:** the tablet doesn't need the internet, just the same Wi-Fi/LAN as that computer. This is the recommended setup for a single shop.
- **If Laravel runs on a cloud server:** the tablet needs internet, but you can access it from anywhere and it's easier to back up.
- **If you want zero infrastructure and pure offline:** use the earlier browser-only SQLite version instead — that one has no server at all.

## What's included

- **Unlimited sales history** — paginated API (50 receipts per page, "Load more"), so it stays fast even after years of data. Search by receipt # or item, filter by employee.
- **Employee management** — PIN clock-in/out (writes real shift records), roles (cashier/manager/owner) enforced both in the UI and reasonably in the API, per-employee sales totals, timesheet.
- **Advanced inventory** — categories, cost/price/margin, live stock, low/out-of-stock status, and a `stock_adjustments` audit table for every receive/recount/damage change (who did it, when, before → after).
- **PWA frontend** — installable to the Android home screen; the app shell (UI) is cached for instant loading, while live data always comes fresh from the API.

## 1. Backend setup (Laravel)

```bash
composer create-project laravel/laravel tindapos-backend
cd tindapos-backend
```

Copy the folders from this project's `backend/` into the new Laravel project, merging into the matching folders:
- `app/Models/*` → `app/Models/`
- `app/Http/Controllers/Api/*` → `app/Http/Controllers/Api/`
- `database/migrations/*` → `database/migrations/`
- `database/seeders/DatabaseSeeder.php` → `database/seeders/` (overwrite the default one)
- `routes/api.php` → `routes/` (overwrite; if your Laravel version doesn't have this file yet, run `php artisan install:api` first, which also adds Sanctum)
- `config/cors.php` → `config/` (overwrite)

Then, use SQLite for zero-config setup (fine for a single shop; swap to MySQL/Postgres later if needed):

```bash
touch database/database.sqlite
```

In `.env`, set:
```
DB_CONNECTION=sqlite
```
(remove/comment out the other `DB_*` lines)

Run migrations and seed demo data:
```bash
php artisan migrate --seed
```

Start the server, reachable on your local network:
```bash
php artisan serve --host=0.0.0.0 --port=8000
```

Find the computer's local IP (e.g. `192.168.1.20`) — you'll need it for the frontend. On Windows: `ipconfig`. On Mac/Linux: `ifconfig` or `ip addr`.

## 2. Frontend setup (React + Vite)

```bash
cd frontend
npm install
```

Create a `.env` file in `frontend/`:
```
VITE_API_URL=http://192.168.1.20:8000/api
```
(use the backend computer's actual local IP)

For development:
```bash
npm run dev -- --host
```
Open the printed network URL on the tablet's Chrome browser to test.

For the real install, build it:
```bash
npm run build
npm run preview -- --host
```
This serves the production build; note the network URL it prints (e.g. `http://192.168.1.20:4173`).

> For something more permanent than `preview`, serve the `frontend/dist` folder with any static file server (nginx, Caddy, `serve`, or even Laravel itself via a `public/app` symlink) so it's always available at a stable address.

## 3. Install on the Android tablet

1. Open **Chrome** on the tablet, go to the frontend's network URL.
2. Tap **⋮ → Install app** (or the "Add to Home screen" banner).
3. Launch TindaPOS from the home screen — it opens full-screen like a native app.
4. The **app itself** loads instantly even with a weak connection (it's cached). Actual sales/inventory data needs the tablet to reach the Laravel server on the network.

## Demo PINs

| Role    | PIN  |
|---------|------|
| Owner   | 1234 |
| Manager | 2222 |
| Cashier | 3333 |

Change these in **Staff** after your first login.

## Notes on security

To keep things simple, this build authenticates by PIN only (no passwords/tokens) — matching the original app's "shared tablet, quick PIN" model. That's reasonable for a single trusted device on a private network. If you expose the API beyond your local network, add proper authentication (Laravel Sanctum) before going live, and lock `config/cors.php` down to your real frontend origin instead of `*`.

## Project structure

```
backend/    Laravel API (models, controllers, migrations, seeder, routes)
frontend/   React + Vite PWA (src/components: LockScreen, Sell, History, Inventory, Employees)
```
