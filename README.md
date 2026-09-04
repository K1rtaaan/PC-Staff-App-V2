# PCR Staff App — Paradise Cove Resort Fiji

Mobile-first staff portal for meals, boats, roster/leave, kitchen, suggestions, and staff directory.

**Version:** 2.1.0  
**Primary stack:** single-file HTML (`public/`) + Google Apps Script (`apps-script/`) + Google Sheet  
**Demo mode:** works with empty `API_URL` or `?demo=1` (no backend required)

## Fiji time (critical)

All business cutoffs and service dates use **Fiji wall clock as UTC+12** via `getFijiNow()` on both client and server. **Never** use the phone’s local timezone for ordering cutoffs.

| Meal | Cutoff (Fiji) | Service date |
|------|---------------|--------------|
| Dinner | **8:00 PM today** | **Tomorrow** |
| Lunch / Duty Meal | **10:00 AM** | **Same day** |

### Cutoff examples

Assume Fiji = UTC+12 (offset applied in code):

| Fiji wall clock | Dinner | Lunch |
|-----------------|--------|-------|
| Fri 19:59 | Open for **Sat** dinner | — |
| Fri 20:00 | Closed for Sat dinner | — |
| Sat 09:59 | — | Open for **Sat** lunch |
| Sat 10:00 | — | Closed for Sat lunch |

Helpers: `dinnerCutoffInfo()` / `lunchCutoffInfo()` in `public/index.html` and `apps-script/Code.gs`.

## Quick start (demo, no Apps Script)

```bash
cd public
python3 -m http.server 8080
# open http://localhost:8080/?demo=1
```

Or open `public/index.html` directly (demo auto-enables when `API_URL` is empty).

**Superadmin login:** `it@paradisecoveresortfiji.com` / `21slands`

## Deploy — Apps Script backend

1. Open the Sheet: ID `16RgtupxsReP3_WtzNXvwebnYEmi6nMoASRQgGHEskF4` (or your copy).
2. Extensions → Apps Script → paste `apps-script/Code.gs` (and `appsscript.json` timezone `Pacific/Fiji`).
3. Confirm `SHEET_ID` at the top of `Code.gs`.
4. Deploy → New deployment → **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the Web App URL into `public/index.html`:

```js
const SCRIPT_URL = 'https://script.google.com/macros/s/XXXX/exec';
const API_URL = SCRIPT_URL;
```

6. Call `action=initSheets` once (or first login) to create tabs + seed alert emails + bootstrap superadmin.
7. Health check: POST `{ "action": "getVersion" }` → `{ ok:true, version:"2.1.0", sheetId:"..." }`.

### Redeploy after Code.gs changes

Deploy → Manage deployments → ✏️ Edit → **New version** → Deploy.  
Old URLs keep working only if you update the same deployment.

## Deploy — Netlify (frontend)

1. Drag the `public/` folder onto [Netlify Drop](https://app.netlify.com/drop), **or** connect the repo (`netlify.toml` already sets `publish = "public"`).
2. Set `SCRIPT_URL` / `API_URL` in `index.html` before or after upload.
3. PWA: `manifest.json` + `sw.js` are included (basic offline shell; API calls are never cached).

## Auth & roles

| Role | Notes |
|------|--------|
| `super_admin` | Full access; alert emails; bootstrap `it@paradisecoveresortfiji.com` |
| `admin` | Users + admin actions (passcode) |
| `hod` | Users limited to own department |
| `kitchen` | Kitchen dashboard |
| `boat` | Boat tools |
| `staff` | Standard |

- Admin passcode (server-validated): `paradise2026`
- CSV import: `email,password,firstName,lastName,department,contact` → `active=true`, can login immediately
- `@pcr.com` without import: pending approval (`!active`) until approved
- Non-`@pcr.com`: email verification code via `MailApp` (`requestVerification` / `verifyEmail`)
- Incomplete profile (missing first/last/department) → **Complete Your Profile** modal

## Staff directory troubleshooting

On Users tab open: **cached staff shows instantly** (localStorage), then a fresh fetch runs.

If fetch fails you get an error card with **Try again**, not a blank spinner:

1. Check `SCRIPT_URL` / `API_URL` matches the deployed Web App URL.
2. Redeploy Apps Script as Web App (Execute as Me, Anyone).
3. Open the Web App URL — expect JSON, not Google’s HTML login page.
4. Use `?demo=1` or empty `API_URL` for offline verification.
5. Use More → **Check API health** (`getVersion`).

## Sheet tabs

Users, Boat Runs, Boat Bookings, Dinner Orders, Lunch Orders, Reminders, Suggestions, Leave Requests, Alert Emails, Verification Codes.

Default alert emails (editable, super_admin):

- leanne@paradisecoveresortfiji.com  
- agm@paradisecoveresortfiji.com  
- cesare@paradisecoveresortfiji.com  
- wood.nicolas@gmail.com  
- pranav619kumar@gmail.com  

## API pattern

`POST` JSON body `{ "action": "...", ...payload }` → `{ success, data?, error? }`.  
Content-Type `text/plain` from the browser avoids CORS preflight with Apps Script.

## Repo layout

```
pcr-staff-app/
  public/index.html      # full UI (Tailwind CDN + Font Awesome)
  public/manifest.json
  public/sw.js
  apps-script/Code.gs
  apps-script/appsscript.json
  netlify.toml
  README.md
  MIGRATION.md           # path off Apps Script cold starts
```

## Longer-term hosting

See **MIGRATION.md** for Netlify Functions + Supabase/Firebase while keeping the single-file HTML as a fallback.
