# Deploying the SmartFind backend on Render

This guide puts the API online at an address like `https://smartfind-api.onrender.com/api/v1`.
The web client (Vercel) and the ESP32 kiosk then use that address.

```
 GitHub repo (Lost-And-Found)
   └── lost_and_found/        ← this backend   → Render  (web service)
   └── lost_and_found_client/ ← web client     → Vercel
   └── Esp32-Firmware/        ← kiosk          → flashed over USB

 Database: PostgreSQL + pgvector on Neon (Render's own free Postgres has no pgvector guarantee)
```

Total time: about 20 minutes.

---

## Before you start

You need:

- [ ] The code pushed to GitHub (`https://github.com/Farhan0140/Lost-And-Found`). Render deploys from GitHub.
- [ ] A **Neon** account (https://neon.tech, free) for the database.
- [ ] A **Render** account (https://render.com, free). Sign in with GitHub, which makes step 3 easier.
- [ ] At least one **Gemini API key** (https://aistudio.google.com/apikey).

Make sure `.env` is **not** on GitHub. It is in `.gitignore`; check with:

```
git ls-files lost_and_found/.env
```

That must print nothing.

---

## Step 1 — Create the database on Neon

1. Neon dashboard → **New Project**.
   - Name: `smartfind`
   - Postgres version: the default (17)
   - Region: **AWS Asia Pacific (Singapore)**, the same region as the Render service in step 3, so every query is fast.
2. When it is created, open **Connect** (or *Connection Details*).
3. Choose:
   - Branch `main`, database `neondb`, role `neondb_owner`
   - **Pooled connection: ON** (the host then contains `-pooler`)
4. Copy the connection string. It looks like:
   ```
   postgresql://neondb_owner:xxxxxxxx@ep-cool-name-123456-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
   Keep `?sslmode=require` at the end. This is your **`DATABASE_URL`**.

You do **not** need to enable `pgvector` by hand. The backend runs `create extension if not exists vector` itself in its first migration, and Neon allows it.

---

## Step 2 — Make the secrets

Run this on your PC **twice**, so you get two different values:

```
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

| Variable | Value |
| --- | --- |
| `JWT_SECRET` | first output |
| `NID_HMAC_KEY` | second output, **must be different** from `JWT_SECRET` |
| `ADMIN_PASSWORD` | a password for the first admin account (8+ characters) |

Save them in a password manager. **Never change `NID_HMAC_KEY` after the first deploy.**
The dummy university table stores national IDs only as HMACs made with this key. With a new key, no student can register until that table is re-created.

---

## Step 3 — Create the web service on Render

1. Render dashboard → **New +** → **Web Service**.
2. **Connect a repository:** pick `Farhan0140/Lost-And-Found`.
   If it is not listed, click *Configure account* and give Render access to the repo.
3. Fill in the form:

| Field | Value |
| --- | --- |
| **Name** | `smartfind-api` (this becomes `https://smartfind-api.onrender.com`; pick another if taken) |
| **Language** | `Node` |
| **Branch** | `main` |
| **Region** | `Singapore (Southeast Asia)` |
| **Root Directory** | `lost_and_found` |
| **Build Command** | `npm ci && npm run setup` |
| **Start Command** | `npm start` |
| **Instance Type** | `Free` |

What these do:

- **Root Directory `lost_and_found`:** the repo holds three projects. This tells Render to build only the backend folder, and to redeploy only when files in it change.
- **Build Command:**
  - `npm ci` installs exactly the versions in `package-lock.json`.
  - `npm run setup` applies the database migrations and then the seed: zones, 20 categories with question sets, the dummy university students, the admin account and the demo kiosk `KIOSK-01`.
  - The seed is safe to run on every deploy: rows that already exist are kept. It runs on Render, so it uses Render's `NID_HMAC_KEY`, the same one the server uses.
- **Start Command `npm start`:** runs `node src/server.js`. On start it checks the database, applies any new migrations, loads the kiosk devices and starts listening.

4. Scroll to **Environment Variables** (or *Advanced → Add Environment Variable*). Add these:

| Key | Value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the Neon string from step 1 |
| `DB_POOL_MAX` | `5` |
| `JWT_SECRET` | from step 2 |
| `NID_HMAC_KEY` | from step 2 |
| `ALLOWED_ORIGINS` | `http://localhost:5173` for now. You change it in step 6. |
| `GEMINI_API_KEY1` | your Gemini key (add `GEMINI_API_KEY2`, `3`, … if you have more) |
| `ADMIN_STUDENT_ID` | `ADMIN001` |
| `ADMIN_EMAIL` | `admin@smartfind.local` (or a real address) |
| `ADMIN_PASSWORD` | from step 2 |
| `APP_TIMEZONE` | `Asia/Dhaka` |

Optional. Leave these out and the defaults from `.env.example` are used:

| Key | When |
| --- | --- |
| `GEMINI_MODEL_FOLLOWUPS`, `GEMINI_MODEL_EXTRACTION`, `GEMINI_MODEL_QUESTIONS`, `GEMINI_MODEL_EMBEDDING` | to use other models |
| `AI_TIMEOUT_MS`, `AI_STEP_DEADLINE_MS` | to change the AI time limits |
| `API_DOCS_ENABLED` | `false` hides Swagger at `/api/docs` |
| `DEVICE_SEED_SECRET` | to choose the secret of `KIOSK-01` yourself (`sfd_` + random text). Otherwise one is generated and shown in the build log (step 4). |

Notes:
- Do **not** set `PORT`. Render sets it and the server uses it.
- `NODE_VERSION=22` pins Node 22. `package.json` only says `>=22`, and without the pin Render could pick a newer major version.

5. In **Advanced → Health Check Path**, enter `/api/v1/health`.
   Render then waits until the API really answers before switching traffic to a new deploy.
6. Click **Deploy Web Service**.

---

## Step 4 — Watch the first deploy

Open the service → **Logs**. A good first deploy shows, in order (each line also starts with the time):

```
==> Running build command 'npm ci && npm run setup'...
added 1xx packages ...
INFO  MIGRATE    Applied 1 migration(s)
INFO  SEED       Campus zones: … ensured
INFO  SEED       Admin account created → log in with Student ID "ADMIN001"

  ┌──────────────────────────────────────────────────────────────
  │  Device created: KIOSK-01 with lockers L1–L4
  │  Device secret:  sfd_xxxxxxxxxxxxxxxxxxxxxxxx
  │  Enter both in the ESP32 setup portal. The secret is shown ONCE.
  └──────────────────────────────────────────────────────────────

INFO  SEED       Done
==> Build successful 🎉
==> Running 'npm start'
INFO  SERVER     Starting SmartFind backend (production)
INFO  DATABASE   Connected to "neondb" (PostgreSQL 17.x) in … ms
INFO  MIGRATE    Database schema is already up to date
INFO  DEVICE     1 device(s) loaded, 0 pending command(s)
INFO  AI         1 Gemini key(s) configured: slots #1
INFO  SERVER     Listening on http://localhost:10000 ...
==> Your service is live 🎉
```

**Copy the device secret now** (`sfd_…`). It appears only on this first deploy. Later deploys print `Device KIOSK-01 already exists (secret unchanged)`.
Lost it? Admin panel → **Lockers → Devices → Rotate secret** makes a new one.

(`localhost:10000` in the log is normal: that is the port inside Render's container.)

### If it fails

| Log message | Fix |
| --- | --- |
| `✖ The server cannot start: .env has problems` + a list | the listed environment variable is missing or wrong (Render → *Environment*) |
| `JWT_SECRET and NID_HMAC_KEY must be different secrets` | make two different values (step 2) |
| `DATABASE_URL must start with postgres://` | you pasted the `psql '…'` command instead of the URL alone |
| `Could not connect` / `ENOTFOUND` / `password authentication failed` | copy the Neon string again (step 1); keep `?sslmode=require` |
| `ADMIN_PASSWORD is empty or shorter than 8 characters — admin account NOT created` | set `ADMIN_PASSWORD`, then *Manual Deploy → Deploy latest commit* |
| `npm ci` complains about `package-lock.json` | run `npm install` locally in `lost_and_found`, commit `package-lock.json`, push |
| Build OK but "Timed out" / health check failing | look further down the log for the real error (usually database or env) |

---

## Step 5 — Check that it works

Replace `smartfind-api` with your service name:

1. **Health:** open https://smartfind-api.onrender.com/api/v1/health in a browser. You get `{"status":"ok","database":"ok","ai":…,"time":…}`. `"database":"unreachable"` (HTTP 503) means `DATABASE_URL` is wrong.
2. **API docs:** https://smartfind-api.onrender.com/api/docs
3. **Admin login:** comes with the web client in step 6 (Student ID `ADMIN001` + `ADMIN_PASSWORD`).

---

## Step 6 — Connect the web client and the kiosk

### Web client (Vercel)

1. Vercel → **Add New → Project** → import the same repo.
   - **Root Directory:** `lost_and_found_client`
   - Framework preset: **Vite** (detected automatically)
   - Environment variable **`VITE_API_URL`** = `https://smartfind-api.onrender.com/api/v1`
2. Deploy. Note the address, e.g. `https://smartfind.vercel.app`.
3. Back on **Render → smartfind-api → Environment**, set:
   ```
   ALLOWED_ORIGINS = https://smartfind.vercel.app
   ```
   Use no trailing slash. For several addresses, separate them with commas, e.g. `https://smartfind.vercel.app,http://localhost:5173` to keep local development working.
   Saving restarts the service.

Without this step the browser blocks every request (a CORS error in the console).

**Live updates check:** open the site, then DevTools → **Network** → filter `live`. One request to `/api/v1/live` stays open (type `eventsource` / `fetch`, status 200, still loading). That is the live stream.
When a kiosk door closes or an item is stored, pages update within about a second, without waiting for a poll. Nothing needs to be configured on Render for it.

### ESP32 kiosk

In the kiosk's setup portal (Wi-Fi `SmartFind-Setup`, see `Esp32-Firmware/README.md`):

| Field | Value |
| --- | --- |
| Server URL | `https://smartfind-api.onrender.com/api/v1` |
| Device ID | `KIOSK-01` |
| Device secret | the `sfd_…` from step 4 |
| Allow insecure connection | **leave unticked**. Render has a real HTTPS certificate. |

"Save & check connection" should show `Server OK: this is "Main locker kiosk (2×2)" with 4 locker(s)`.

---

## Updating later

Push to `main` and Render redeploys by itself (only when something in `lost_and_found/` changed).
New migrations in `src/db/migrations/` are applied during the build and again at start. Existing data is kept.

To deploy by hand: service → **Manual Deploy → Deploy latest commit**.

---

## Things to know about the free plan

- **Sleeping:** a free web service sleeps after 15 minutes without requests. The first request after that takes ~30–60 s.
  While the kiosk is online it polls every second, so the service stays awake. Without the kiosk the first page load can be slow.
  The kiosk itself copes: it keeps retrying until the server answers.
- **750 free hours a month:** that is enough for this one service running all month. A second free service would share the same hours.
- **Live stream:** every open browser tab keeps one connection to `/api/v1/live`. The server pings it every 20 s, so Render does not cut it. After a deploy the tabs reconnect by themselves.
- **One instance only:** the backend keeps kiosk state (online status, pending commands, keypad lockouts) in memory. Do not scale it to more than one instance.
- **No shell on the free plan:** that is why the seed runs in the build command instead of `npm run setup` by hand.
- **Logs** are kept for a limited time on the free plan. Download them from the Logs page if you need them for the report.
- **Neon free tier** pauses the database when idle. The first query after a pause takes ~1 s. That is normal.

---

## Optional: Blueprint (`render.yaml`)

`lost_and_found/render.yaml` describes the same service as code (root directory, commands, health check, variables).
Render looks for a blueprint at the **repo root** by default. With this repo layout, the manual setup above is simpler.
To use it anyway: *New + → Blueprint*, pick the repo, and set the **Blueprint Path** to `lost_and_found/render.yaml`.
Render then asks for every secret marked `sync: false`.
