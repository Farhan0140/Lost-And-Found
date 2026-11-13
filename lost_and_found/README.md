# SmartFind — Backend (`lost_and_found`)

Node.js + Express 5 API for the SmartFind campus lost-and-found system with OTP smart lockers.
PostgreSQL on Neon with `pgvector`, Google Gemini with up to 10 rotating API keys.

---

## 1. Quick start

```bash
cd lost_and_found
npm install
cp .env.example .env        # then fill it in (see section 2)
npm run setup               # create tables + seed zones, categories, question sets, students, admin, KIOSK-01
npm run dev                 # http://localhost:4000/api/v1/health
```

**API docs (Swagger UI): http://localhost:4000/api/docs** — every endpoint with request/response examples and "Try it out".
The raw OpenAPI 3.1 file is at `/api/docs/openapi.json` (import it into Postman or Insomnia).

`npm run setup` prints the **device secret for KIOSK-01** once — copy it into the ESP32 setup portal.

| Command | What it does |
|---|---|
| `npm run dev` | start with auto-restart on file changes |
| `npm start` | start (production) |
| `npm run migrate` | apply new SQL migrations only |
| `npm run seed` | add missing seed data (safe to repeat) |
| `npm test` | unit tests: the 8 required §8.6 tests, canonicalization, personal-data filter, Gemini failover, API docs cover every route |
| `npm run evaluate` | matching evaluation on the frozen fixtures (precision / recall / F1, threshold sweep, ablation) |
| `npm run list-models` | which Gemini models each key can reach, and whether your `.env` names are valid |
| `npm run generate-question-sets -- laptop tablet` | AI-draft question sets (saved as DRAFT; activate in the dashboard) |
| `npm run create-device -- KIOSK-02 "Library kiosk" 4 B` | register another ESP32 with lockers B1–B4 |
| `npm run verify-audit` | re-check every hash in the audit chain |
| `npm run format` | Prettier (tabs) |

## 2. Environment (`.env`)

See `.env.example` — every variable is explained there. The server **refuses to start** with a readable list if something is wrong:

```
✖ The server cannot start: .env has problems
   ✖ JWT_SECRET  still has the example value
```

Key points:

- **`GEMINI_API_KEY1` … `GEMINI_API_KEY10`** — tried in numeric order; empty slots are skipped.
- **Model fallback lists** — e.g. `GEMINI_MODEL_FOLLOWUPS=gemini-3.1-flash-lite,gemini-2.5-flash`. Model 1 is tried on every key, then model 2 on every key. The embedding model must be **one** model.
- **`AI_TIMEOUT_MS`** = one call; **`AI_STEP_DEADLINE_MS`** = the whole retry chain. When it runs out, the report stays a draft ("Waiting for AI").
- **`ALLOWED_ORIGINS`** — the web client's URL(s), no trailing slash.
- **`API_DOCS_ENABLED`** — Swagger UI at `/api/docs` (default `true`; set `false` to hide it).

## 3. Test accounts (dummy university database)

| Student ID | National ID | Name |
|---|---|---|
| `TEST0001` | `1234567890` | Test Finder |
| `TEST0002` | `1234567891` | Test Owner |
| `2125051001` | `1990000001` | Farhan Nadim |
| … | … | see `src/db/seed-data/universityStudents.js` |

Admin: Student ID `ADMIN001` (from `.env`), password = `ADMIN_PASSWORD`.
National IDs are stored only as HMAC-SHA256; the plain values exist only in that seed file for testing.

## 4. Logs

Every request prints one line; errors explain themselves:

```
14:05:12  HTTP   API   POST  /api/v1/auth/login  200  84ms  user=TEST0001  req=a81c09f2
14:05:13  AI     GEMINI  followups  key #3  gemini-3.1-flash-lite  1.84s  OK
14:05:13  WARN   AI    Key #1 resting for 30.00s — rate limited
14:05:40  ERROR  DATABASE  Could not reach the database server.  hint=Check DATABASE_URL in .env
```

- Every error response has a `requestId` — search the log for it.
- Keys appear only as slot numbers (`#3`). Passwords, national IDs and OTP codes are never logged.
- The ESP32 polls every second; set `LOG_DEVICE_POLLS=true` to see those lines.

## 5. Project structure

```
src/
  server.js                 startup: env → database → migrations → devices → HTTP → sweeper
  docs/                     Swagger / OpenAPI 3.1: builders, shared schemas, examples, paths/*.paths.js
  app.js                    Express app and route mounting
  config/env.js             validated .env  ·  config/rules.js  every timeout, limit and threshold
  db/                       pool, migration runner, migrations/*.sql, seed + seed-data/
  lib/                      logger, errors, crypto (HMAC, OTP hash/encrypt), time
  middleware/               request logger, auth, device auth, validation, error handler
  jobs/                     sweeper (timeouts every 30 s), draft recovery after AI outages
  modules/
    ai/                     key pool, Gemini REST client, failover runner, prompts, PII filter, 4 AI jobs
    auth/                   register, login, rotating refresh tokens, login rate limit
    university/             verifyStudent() — the dummy university check behind one interface
    reports/                drafts → photo extraction → follow-ups → submit; views; embeddings
    matching/               canonicalize (rules v1), scoring, release rule, matching service, views
    otp/                    deposit (30 min) and collection (5 min) OTPs
    lockers/                locker assignment, custody (door + IR confirmation)
    devices/                ESP32 API, in-memory device state, events, kiosk lockout
    notifications/          in-app notifications
    audit/                  hash-chained audit log
    admin/                  admin API (review queue, lockers, devices, university DB, users, zones, question sets, audit)
scripts/                    evaluate, list-models, generate-question-sets, create-device, verify-audit
tests/                      node:test suites + frozen evaluation fixtures
```

## 6. API overview (`/api/v1`)

The full, interactive reference is **Swagger UI at `/api/docs`**:

1. **POST /auth/login** with "Try it out" — Swagger fills in **Authorize** automatically from the response.
2. Every other endpoint is now callable from the page (admin endpoints need the `ADMIN001` login).
3. ESP32 endpoints: **Authorize** → `deviceId` = `KIOSK-01`, `deviceSecret` = the secret printed by `npm run setup`.

How the docs are built (`src/docs/`):

- Request bodies and query parameters are **generated from the same zod schemas the routes validate with**, so they cannot drift.
- Responses use shared schemas (`components.js`) and examples copied from real responses (`examples.js`).
- Each endpoint lists every error code it can return (`errorMessages.js`).
- `tests/openapi.test.js` fails if a route exists in the code but not in the docs (or the other way round). **New endpoint → add it to `src/docs/paths/*.paths.js`.**

Summary:

**Auth** — `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/change-password`

**Meta** — `GET /meta/zones` · `/meta/categories` · `/meta/lockers` · `/meta/rules` · `/meta/question-sets/:categoryId`

**Reports (student)**
| Method | Path | Purpose |
|---|---|---|
| GET | `/reports?tab=drafts\|active\|closed` | my reports |
| POST | `/reports` `{ kind }` | start a draft |
| GET | `/reports/:id` | full view (answers, follow-ups, OTP state, matches) |
| PATCH | `/reports/:id` `{ version, …}` | autosave (409 `VERSION_CONFLICT` if edited elsewhere) |
| POST | `/reports/:id/extract` `{ images }` | AI reads 2–5 photos → category + prefilled answers |
| POST | `/reports/:id/followups/generate` `{ images? }` | AI writes 3–4 follow-up questions (once) |
| PUT | `/reports/:id/followups/answers` | answer them |
| POST | `/reports/:id/submit` | idempotent submit |
| DELETE | `/reports/:id` | discard a draft |
| POST | `/reports/:id/cancel` | cancel |
| POST | `/reports/:id/deposit-otp` | finder: reserve locker + 30-min code (202 = queued) |
| GET | `/reports/:id/otp` | show my active code again |

**Matches (owner)** — `GET /matches/:id` (band + flags only) · `POST /matches/:id/collect-otp` (5-min code) · `GET /matches/:id/otp`

**Notifications** — `GET /notifications` · `GET /notifications/unread-count` · `POST /notifications/:id/read` · `POST /notifications/read-all`

**Admin** (`/admin`, admin role) — `overview` · `ai/health` · `matches` (review queue, approve/reject) · `reports` · `overflow` · `lockers` (force-open, confirm-emptied, clear-unresolved, maintenance) · `devices` · `university-students` (CRUD) · `users` (role, status, reset password) · `zones` · `question-sets` (draft, AI-generate, edit, activate) · `audit` (list, verify, head). Every decision requires `{ reason }`.

**Device** (ESP32; headers `X-Device-Id`, `X-Device-Secret`)
| Method | Path | When |
|---|---|---|
| POST | `/device/hello` | setup portal "Check Connection" and at boot |
| GET | `/device/poll` | every 1 s (answered from memory) |
| POST | `/device/heartbeat` | every 30 s |
| POST | `/device/otp/verify` `{ code }` | keypad # pressed |
| POST | `/device/events` `{ bootId, events }` | door/IR/servo events, batched, re-sendable |
| POST | `/device/commands/:id/ack` | after executing a force-open |

Device events: `boot`, `unlocked`, `locked`, `door_opened`, `door_closed`, `item_detected`, `item_removed`, **`door_closed_settled { itemPresent }`** (IR stable for 3 s after the door closed — this is what marks an item stored or collected), `door_open_too_long`, `error`.

## 7. Decisions made in REVIEW_ANSWERS.md (all defaults)

- **4 lockers** (2×2) on one ESP32; the schema supports any number.
- **OTP rules (D3):** finder 30 min / 5 codes (then *abandoned*, admin can grant 5 more); owner 5 min / 5 codes (then admin review); 72 h hold; codes re-viewable by the same user (AES-GCM copy) and verified by HMAC.
- **Drafts:** a report is a server row from the first step; 7-day expiry (warning at day 6); 10 per day, 3 unfinished max; photos stay in the browser; manual-path drafts auto-complete when AI returns.
- **AI failover:** key rotation + optional model fallback (no second provider); photos sent inline (the Files API breaks key rotation).
- **Follow-up comparability:** follow-up options must use codes from the aspect's frozen value list, so two different AI-written questions about the same aspect are compared exactly.
- **Multiple admins**, server-side sweeper every 30 s, admin password reset (no email).

## 8. Evaluation (frozen fixtures, `npm run evaluate`)

40 hand-written pairs: 30 for tuning (12 true matches, 12 near-misses, 6 non-matches) + 10 held out. The cosine term is dropped (no frozen embeddings yet).

| Set | Auto-release precision | Recall | F1 |
|---|---|---|---|
| Evaluation (30) | 1.000 | 0.917 | 0.957 |
| Held-out (10) | 1.000 | 1.000 | 1.000 |

- NM08 (identical bags, keychain vs none) is **vetoed** by the release rule (follow-up conflict) → review.
- TM04 (a true match where the owner forgot the wrist strap) goes to **review** — the rule is deliberately conservative.
- On score alone the worst true match (0.842) and best near-miss (0.821) are only 0.02 apart; the **release rule** is what separates them. Rule-based auto line would be 0.831; 0.85 is kept until real data is collected.

**Honest caveats:** the fixtures are written by the team (now including stand-in follow-up answers), so results are in-sample. Replace the stand-ins with frozen real AI generations once the system is used, and add frozen embeddings to measure the cosine term.

## 9. Deploying on Render

`render.yaml` is included. Enter secrets in the Render dashboard, set `ALLOWED_ORIGINS` to your Vercel URL (no trailing slash), then run `npm run setup` once from the Render shell (or locally against the Neon URL).
