# SmartFind — web client

React web app for **SmartFind**, the campus lost-and-found with AI-assisted descriptions and OTP smart lockers
(final-year project, team TwoByFour, UITS CSE).

Students report found or lost items, finders drop items into an ESP32 locker with a one-time code, owners collect
them with their own code. Admins review uncertain matches and manage lockers, kiosks, users and question sets.

---

## Quick start

```bash
npm install
cp .env.example .env          # set VITE_API_URL if the backend is not on localhost:4000
npm run dev                   # http://localhost:5173
```

The backend (`../lost_and_found`) must be running and must allow this origin:
`ALLOWED_ORIGINS=http://localhost:5173` in the backend's `.env`.

| Script             | What it does                                   |
| ------------------ | ---------------------------------------------- |
| `npm run dev`      | development server with hot reload             |
| `npm run build`    | production build into `dist/`                  |
| `npm run preview`  | serve the production build locally             |
| `npm run format`   | format everything with Prettier (tabs)         |

### Environment

| Variable       | Example                              | Notes                                   |
| -------------- | ------------------------------------ | --------------------------------------- |
| `VITE_API_URL` | `http://localhost:4000/api/v1`       | must end with `/api/v1`, no trailing `/` |

`VITE_*` values are baked into the build — rebuild after changing them.

### Deploying (Vercel)

`vercel.json` already rewrites every path to `index.html` (client-side routing) and caches `/assets/*` forever
(file names contain a content hash). Set `VITE_API_URL` in the Vercel project settings, and add the Vercel URL to
the backend's `ALLOWED_ORIGINS`.

---

## Tech

React 19 · Vite · Tailwind CSS 4 · motion (animations) · three.js + @react-three/fiber (3D lockers) ·
TanStack Query (server data) · React Router · lucide-react (icons) · sonner (toasts) · idb-keyval (IndexedDB)

---

## Folder map

```
src/
├── main.jsx                 providers (router, query client, auth, theme, toasts)
├── App.jsx                  all routes; admin pages are lazy-loaded
├── styles/index.css         design tokens (light + dark), utilities, keyframes
│
├── lib/                     no UI in here
│   ├── api.js               fetch wrapper: tokens, one-at-a-time refresh, ApiError
│   ├── auth.jsx             useAuth(): user, login, register, logout
│   ├── queries.js           every query key + data hook (useReport, useMatch, …)
│   ├── images.js            photo resize (≤1024 px) + metadata removal, in the browser
│   ├── photoStore.js        draft photos in IndexedDB (never uploaded to SmartFind)
│   ├── statuses.js          labels / colours for report, match and locker statuses
│   ├── format.js            dates (campus time zone Asia/Dhaka), countdowns, numbers
│   ├── hooks.js             useCountdown, useDebounced, usePageTitle, usePrevious
│   └── theme.js             dark / light toggle
│
├── components/
│   ├── ui/                  Button, Card, Badge, Form controls, Modal, Tabs, Table, …
│   ├── layout/              top bar, admin sidebar, notification bell, route guards
│   ├── three/               LockerCabinet3D (the 3D kiosk, loaded on demand)
│   ├── LockerScene.jsx      3D view with a 2D fallback when WebGL is missing
│   ├── OtpDisplay.jsx       6-digit code with a countdown ring
│   ├── AiScanner.jsx        "the AI is reading your photos" animations
│   ├── StatusVisuals.jsx    status badge, report timeline, score gauge
│   └── ReportCard.jsx       one row in "My reports"
│
└── pages/
    ├── public/              landing, live lockers, login / register, 404
    ├── student/
    │   ├── Dashboard.jsx    my reports (active · drafts · closed)
    │   ├── NewReport.jsx    found or lost?
    │   ├── ReportPage.jsx   draft → wizard, submitted → timeline + next step
    │   ├── MatchPage.jsx    owner's match view + collection code
    │   ├── editor/          the draft wizard (steps, autosave, answer helpers)
    │   └── report/          DepositPanel (finder's locker code)
    └── admin/               overview, review, reports, lockers, devices, people,
                             question sets, audit log
```

---

## How the important parts work

### The draft wizard (`pages/student/editor/`)

`Photos or manual → Questions → Follow-ups → Review`

- **Photos**: 2–5 photos are resized and re-encoded as JPEG through a `<canvas>` (drops EXIF / GPS), stored in
  IndexedDB, and sent to `POST /reports/:id/extract`. The AI picks the category and pre-fills answers marked
  **AI**. Photos are also sent once to the follow-up step, then deleted from the device on submit.
- **Manual**: pick a category; answer everything yourself.
- **Autosave** (`useDraftAutosave.js`): changes are merged and sent after 700 ms of quiet, one request at a time,
  always with the draft `version`. On `VERSION_CONFLICT` (another tab saved first) it reloads and re-sends.
  Unsent changes are mirrored to `localStorage` and re-sent next time the draft opens. Network / server errors
  retry every 5 s.
- **AI unavailable**: the draft is kept, the page explains what happens next, and the server retries follow-ups
  in the background and sends a notification.

### Locker codes

- Finder: `DepositPanel` → `POST /reports/:id/deposit-otp` (30 min). When all lockers are busy the finder is
  queued and notified later. The page polls every 5 s while a code is active, so it switches to
  "Safe in locker L1" by itself once the kiosk confirms.
- Owner: `MatchPage` → `POST /matches/:id/collect-otp` (5 min — generated at the locker, with a confirmation).

### Session handling (`lib/api.js`)

Refresh tokens are single-use on the server, so when several requests hit an expired access token at once,
exactly one refresh runs and the others wait for it. If the refresh fails the user is signed out and sent to
`/login?next=…`.

### Privacy in the UI

- National IDs are never shown (admins see "Hashed").
- Follow-up answers are shown only to the reporter and admins; owners see only *agree / differs / not compared*
  for a match, never the finder's answers. Finders never learn who the owner is.

---

## Testing it by hand

1. Start the backend with seeded data (`npm run setup` there). The seed creates `ADMIN001` and a kiosk
   `KIOSK-01`; test students are in the university table (e.g. `TEST0001` with national ID `1234567890`) and
   register through **Get started**.
2. Lockers are handed out only while a kiosk is online. Without the ESP32, use the backend's Swagger page
   (`/api/docs`) → *Device* → `hello` / `heartbeat` with the kiosk's ID and secret.
3. Without Gemini API keys, photo reading and follow-up questions show the "AI is taking a short break" state.
   That is expected.
