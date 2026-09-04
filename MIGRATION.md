# Migrating off Google Apps Script

The current primary path (static HTML + Apps Script + Sheet) is easy to host and edit, but Apps Script **cold starts**, **6-minute quotas**, and **manual redeploys** become painful as usage grows.

This document outlines a smoother path while **keeping `public/index.html` as a fallback**.

## Target architecture

```
Browser (same index.html)
    ↓  fetch('/.netlify/functions/api')
Netlify Function (Node)
    ↓
Supabase (Postgres)  — or Firebase Auth + Firestore
```

Optional: keep Google Sheet as a nightly sync / export, not the live DB.

## Why migrate

| Pain today | After migrate |
|------------|---------------|
| Apps Script cold start (1–5s) | Warm serverless / edge |
| Redeploy Web App for every `Code.gs` change | `git push` → Netlify |
| Sheet as DB (racey writes) | Relational rows + RLS |
| Opaque CORS / redirect quirks | Normal JSON APIs |
| MailApp limits | Resend / Postmark / Supabase email |

## Keep the single-file HTML

1. Change only the top config:

```js
const SCRIPT_URL = '/.netlify/functions/api'; // or full Functions URL
const API_URL = SCRIPT_URL;
```

2. Preserve the same contract: `{ action, ...payload }` → `{ success, data?, error? }`.
3. Leave demo mode (`API_URL === ''` or `?demo=1`) for offline QA.
4. Do **not** rewrite UI first — port `routeAction` from `Code.gs` into one Netlify function (or a small Express-style router).

## Suggested Netlify Function sketch

`netlify/functions/api.js`:

- Parse JSON body / query `action`
- Switch on the same action names (`login`, `getUsers`, `placeDinnerOrder`, …)
- Reuse Fiji helpers (`getFijiNow`, dinner/lunch cutoffs) — copy from `Code.gs` into a shared `fiji.js`
- Use Supabase service role on the server; never expose it in the HTML

`netlify.toml` already publishes `public/`. Add:

```toml
[functions]
  directory = "netlify/functions"
```

## Supabase mapping

| Sheet tab | Table |
|-----------|--------|
| Users | `users` (auth.users + profile, or email/password app-managed) |
| Boat Runs / Bookings | `boat_runs`, `boat_bookings` |
| Dinner / Lunch Orders | `dinner_orders`, `lunch_orders` |
| Reminders / Suggestions / Leave | matching tables |
| Alert Emails | `alert_emails` |
| Verification Codes | `verification_codes` (TTL index) |

Enforce role checks (`super_admin`, `admin`, `hod`, …) and admin passcode on the server, same as Apps Script.

## Firebase alternative

- **Auth:** Firebase Auth (email/password) instead of sheet passwords  
- **Data:** Firestore collections mirroring sheet tabs  
- **Functions:** Cloud Functions or still Netlify Functions talking to Firestore  
- Keep cutoffs in UTC+12 helpers identical

## Migration steps (practical)

1. Create Supabase project; create tables + seed superadmin + alert emails.
2. Port `Code.gs` actions → Netlify Function (feature-flag by URL).
3. Point a staging `index.html` at the Function; run parallel with Apps Script.
4. Export Sheet rows → SQL once; verify staff directory + meal cutoffs.
5. Switch production `API_URL`; keep Apps Script deployment for 2 weeks as rollback.
6. Later: split the monolith HTML into modules / a light Vite app if needed — not required for go-live.

## What not to break

- Fiji UTC+12 cutoffs and service dates  
- Staff directory: cache-first + clear error UI + `getVersion`  
- CSV import format and pending `@pcr.com` approvals  
- Admin passcode + role gates on the server  

The HTML UI can remain the product surface for a long time; replacing Apps Script is the high-leverage move.
