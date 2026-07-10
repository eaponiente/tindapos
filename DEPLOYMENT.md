# Deploying TindaPOS to Vercel + Supabase

This guide walks through deploying TindaPOS to the cloud.

> **Read this first — the architecture reality.**
> TindaPOS has **two parts**: a **React/Vite frontend** (static site) and a **Laravel 13 / PHP 8.3 backend** (API + database).
>
> - **Vercel** is perfect for the **frontend** (static build). ✅
> - **Supabase** provides the **Postgres database** and (optionally) **file storage** for item images. ✅
> - Vercel does **not** natively run PHP/Laravel. The backend needs a **PHP host**. This guide uses **Railway** (easiest for Laravel) as the recommended option, with Render/Fly.io as alternatives. If you truly want everything on Vercel, see **Appendix B** for the serverless-PHP route and its caveats.

```
                         ┌──────────────────────────┐
   Browser / tablet ───► │  Vercel (frontend)       │   static React PWA
        (PWA)            │  https://tindapos.vercel │   VITE_API_URL ─┐
                         └──────────────────────────┘                 │
                                                                      ▼
                         ┌──────────────────────────┐   ┌──────────────────────────┐
                         │  Railway (backend)       │──►│  Supabase                │
                         │  Laravel API /api/*      │   │  • Postgres (DB_URL)     │
                         │                          │   │  • Storage (item images) │
                         └──────────────────────────┘   └──────────────────────────┘
```

---

## Prerequisites

- The repo pushed to GitHub: `git@github.com:eaponiente/tindapos.git` ✅ (already done)
- Accounts (all have free tiers): [Supabase](https://supabase.com), [Vercel](https://vercel.com), [Railway](https://railway.app)
- Locally: `php` 8.3, `composer`, and `openssl` (only needed once, to generate `APP_KEY`)

---

## Part 1 — Supabase (database + storage)

### 1.1 Create the project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Name: `tindapos`. Choose a region close to your users (e.g. Southeast Asia — Singapore). Set a **strong database password** and save it.
3. Wait ~2 minutes for provisioning.

### 1.2 Get the database connection string

1. In the project, go to **Connect** (top bar) → **ORMs / Connection string**.
2. Choose the **Transaction pooler** connection (port `6543`) — best for serverless/short-lived requests. Copy the URI. It looks like:

   ```
   postgresql://postgres.abcdefgh:YOUR-DB-PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
   ```

3. Laravel reads this directly via the `DB_URL` env var (see `config/database.php` — the `pgsql` connection already supports `url`). You will set it on the backend host in Part 2.

   > **Migrations note:** Run migrations against the **direct/session** connection (port `5432`) rather than the transaction pooler, because migrations use features the transaction pooler doesn't support. Keep both strings handy — pooler (`6543`) for the running app, direct (`5432`) for one-off `artisan migrate`.

### 1.3 (Optional) Create a Storage bucket for item images

The app lets you upload item photos (`POST /api/items/{id}/image`). On an ephemeral host these files vanish on redeploy, so store them in Supabase Storage (S3-compatible):

1. Go to **Storage** → **New bucket** → name it `items` → mark it **Public**.
2. Go to **Storage → S3 Connection** (or **Project Settings → Storage**) and note:
   - **Endpoint** — e.g. `https://abcdefgh.storage.supabase.co/storage/v1/s3`
   - **Region** — e.g. `ap-southeast-1`
   - **Access key ID** and **Secret access key** (generate them there)
3. Wiring this into Laravel needs a small code change (the controller currently hardcodes the local `public` disk). See **Appendix A**. If you skip this, image uploads still work on a host with a persistent disk, but not on serverless.

---

## Part 2 — Backend (Laravel API) on Railway

### 2.1 Generate an APP_KEY

Laravel needs an encryption key. Generate one locally:

```bash
cd backend
php artisan key:generate --show
# → base64:XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX=
```

Copy that value (including the `base64:` prefix) — you'll paste it as `APP_KEY`.

### 2.2 Create the Railway service

1. Go to <https://railway.app> → **New Project** → **Deploy from GitHub repo** → select `eaponiente/tindapos`.
2. Railway detects a monorepo. Open the service **Settings** and set:
   - **Root Directory:** `backend`
   - **Build Command:** `composer install --no-dev --optimize-autoloader && php artisan config:cache && php artisan route:cache`
   - **Start Command:** `php artisan migrate --force && php -S 0.0.0.0:$PORT -t public`
     - *(For real traffic, use `php artisan serve` or an nginx+php-fpm buildpack; the built-in PHP server above is fine to get started.)*
3. Ensure a **PHP 8.3** environment. Railway's Nixpacks auto-detects PHP from `composer.json` (`"php": "^8.3"`). If it doesn't, add a `nixpacks.toml` or use the [PHP buildpack](https://railway.app/template).

### 2.3 Set backend environment variables

In the Railway service → **Variables**, add:

| Variable | Value |
|---|---|
| `APP_NAME` | `TindaPOS` |
| `APP_ENV` | `production` |
| `APP_KEY` | `base64:...` (from step 2.1) |
| `APP_DEBUG` | `false` |
| `APP_URL` | your backend URL, e.g. `https://tindapos-backend.up.railway.app` |
| `DB_CONNECTION` | `pgsql` |
| `DB_URL` | the Supabase **pooler** URI from step 1.2 |
| `SESSION_DRIVER` | `database` |
| `CACHE_STORE` | `database` |
| `QUEUE_CONNECTION` | `database` |
| `LOG_CHANNEL` | `stderr` |
| `SANCTUM_STATEFUL_DOMAINS` | your Vercel domain, e.g. `tindapos.vercel.app` |

If you set up Supabase Storage (Part 1.3 + Appendix A), also add:

| Variable | Value |
|---|---|
| `FILESYSTEM_DISK` | `s3` |
| `AWS_ACCESS_KEY_ID` | Supabase S3 access key |
| `AWS_SECRET_ACCESS_KEY` | Supabase S3 secret |
| `AWS_DEFAULT_REGION` | e.g. `ap-southeast-1` |
| `AWS_BUCKET` | `items` |
| `AWS_ENDPOINT` | Supabase S3 endpoint |
| `AWS_USE_PATH_STYLE_ENDPOINT` | `true` |

### 2.4 Deploy and run migrations + seed

1. Trigger the deploy. The start command runs `php artisan migrate --force` automatically.
2. To load the demo data (categories, items, and the login PINs), run the seeder once. In Railway open a shell for the service (or run locally against the **direct** Supabase connection):

   ```bash
   php artisan db:seed --force
   ```

   This creates three logins — **PIN `1234`** (owner Maria Santos), `2222` (manager), `3333` (cashier). Change these in production.

3. Confirm the API is live: visit `https://<your-backend>/up` (Laravel's health check) — it should return `200`.

---

## Part 3 — Frontend on Vercel

### 3.1 Import the project

1. Go to <https://vercel.com/new> → **Import** `eaponiente/tindapos`.
2. Configure:
   - **Root Directory:** `frontend`
   - **Framework Preset:** `Vite`
   - **Build Command:** `npm run build` (default)
   - **Output Directory:** `dist` (default)
   - **Install Command:** `npm install` (default)

### 3.2 Set the frontend environment variable

Under **Environment Variables**, add:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://<your-backend>/api` — e.g. `https://tindapos-backend.up.railway.app/api` |

> `src/api.js` reads `VITE_API_URL` at build time. It **must** include the `/api` suffix and use **https** (Vercel is https, so the browser will block http API calls as mixed content).

### 3.3 Deploy

Click **Deploy**. Vercel builds the Vite PWA and gives you a URL like `https://tindapos.vercel.app`.

> **Changing `VITE_API_URL` later?** Vite inlines env vars at build time, so you must **redeploy** the frontend after changing it (Vercel → Deployments → Redeploy).

---

## Part 4 — Wire the two together (CORS)

The browser will block the frontend → backend calls unless the API allows your Vercel origin.

1. Open `backend/config/cors.php` and lock `allowed_origins` to your real domain:

   ```php
   'allowed_origins' => [
       'https://tindapos.vercel.app',
       // add Vercel preview URLs too if you use them, or use allowed_origins_patterns
   ],
   ```

   To also allow Vercel preview deployments, add a pattern:

   ```php
   'allowed_origins_patterns' => ['/^https:\/\/tindapos-.*\.vercel\.app$/'],
   ```

2. Commit, push — Railway redeploys automatically:

   ```bash
   git add backend/config/cors.php
   git commit -m "Restrict CORS to production frontend origin"
   git push
   ```

---

## Part 5 — Verify end to end

1. Open `https://tindapos.vercel.app`.
2. Log in with PIN **`1234`**.
3. Check that inventory items load (proves Vercel → Railway → Supabase works).
4. Ring up a test sale, then confirm it appears in **History** (proves writes persist to Supabase).
5. In the Supabase dashboard → **Table Editor**, confirm rows in `sales` / `sale_items`.

If any step fails, see **Troubleshooting** below.

---

## Appendix A — Item images via Supabase Storage (optional code change)

The image controller currently hardcodes the local disk:

```php
// backend/app/Http/Controllers/Api/ItemController.php
$item->update(['image' => $request->file('image')->store('items', 'public')]);
Storage::disk('public')->delete($item->image);
```

To use Supabase Storage on a serverless/ephemeral host, make the disk configurable. Replace the three `disk('public')` / `'public'` references with the default disk driver:

```php
$disk = config('filesystems.default');            // 's3' in production
$item->update(['image' => $request->file('image')->store('items', $disk)]);
Storage::disk($disk)->delete($item->image);
```

Then set `FILESYSTEM_DISK=s3` and the `AWS_*` vars from Part 2.3. Uploaded images will land in the public `items` bucket and be served from Supabase's CDN. (The frontend must reference the returned public URL.)

If your backend host has a **persistent disk** (e.g. Railway volume, Fly.io volume), you can skip this and keep `FILESYSTEM_DISK=public` — just run `php artisan storage:link`.

---

## Appendix B — Running the Laravel backend on Vercel (serverless PHP)

You *can* run Laravel on Vercel via a community PHP runtime, but understand the trade-offs before choosing this over Railway:

- **Read-only filesystem** — no local file storage, sessions, or logs on disk. You **must** use Supabase Storage (Appendix A) and set `SESSION_DRIVER=database`, `CACHE_STORE=database`, `LOG_CHANNEL=stderr` (this project already defaults to database drivers ✅).
- **Cold starts** on every invocation and short execution limits — fine for a light POS, rough under load.
- **More moving parts** — a custom `vercel.json` + a serverless entrypoint.

Sketch:

1. Add `vercel-php` to the backend: `composer require --dev vercel-community/php` (or use the `vercel-php@` runtime).
2. Add `backend/vercel.json`:

   ```json
   {
     "functions": { "api/index.php": { "runtime": "vercel-php@0.7.4" } },
     "routes": [{ "src": "/(.*)", "dest": "/api/index.php" }]
   }
   ```

3. Add `backend/api/index.php` that boots `public/index.php`.
4. Create a **second** Vercel project with **Root Directory = `backend`** and the same env vars as Part 2.3.

Because of the caveats above, **Railway/Render/Fly.io remain the recommended hosts for the Laravel API.** Supabase and the Vercel-hosted frontend stay exactly the same either way.

---

## Alternative backend hosts

| Host | Notes |
|---|---|
| **Railway** | Easiest Laravel deploy; used in this guide. Persistent volumes available. |
| **Render** | Free web service; add a `render.yaml` or use the PHP environment. Similar env vars. |
| **Fly.io** | `fly launch` detects Laravel; great for regions near your shop. Volumes for images. |
| **Laravel Cloud / Forge** | First-party; most "Laravel-native," paid. |

All of them pair with **Supabase (Postgres + Storage)** and the **Vercel frontend** identically — only Part 2 changes.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Frontend loads but "Cannot reach the POS server" | `VITE_API_URL` wrong or missing `/api`; backend down. Redeploy frontend after fixing the env var. |
| CORS error in browser console | `config/cors.php` `allowed_origins` doesn't include your Vercel domain (Part 4). |
| Mixed-content blocked | `VITE_API_URL` uses `http://`. It must be `https://`. |
| `SQLSTATE... could not connect` on the backend | Wrong `DB_URL`, or using the pooler (`6543`) for migrations. Use the direct connection (`5432`) for `artisan migrate`. |
| `No application encryption key` | `APP_KEY` not set on the backend host (Part 2.1). |
| Migrations hang / "prepared statement" errors | You're migrating through the transaction pooler. Switch to the direct `5432` connection for migrations. |
| Login fails for PIN 1234 | Seeder not run. `php artisan db:seed --force`. |
| Item image upload fails after redeploy | Ephemeral filesystem. Configure Supabase Storage (Appendix A). |

---

*Generated for the TindaPOS project. Update URLs and origins to match your actual Vercel/Railway/Supabase deployment.*
