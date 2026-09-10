# PCR Staff App V2 Polish — Changelog

Version **2.5.2**. Revert any item later by asking for its ID (e.g. “revert C7”).

## Visual / brand

| ID | Change |
|----|--------|
| C1 | Dark-only resort night theme: page bg `#0a1628`, accent teal `#0d9488`, text slate-100, system UI sans |
| C2 | Hand-rolled shadcn-style utility classes: `.ui-btn`, `.ui-card`, `.ui-input`, `.ui-badge` |
| C3 | CSS animations: fade-in, float, pulse-soft, teal meal-open glow |
| C4 | Lucide CDN + optional framer-motion via esm.sh (home tiles use CSS stagger; FA icons retained) |
| C5 | App icon: copied `pcr-logo.png` (+ `golden-logo.jpg`, `aerial-resort.jpg`) into `public/assets/` |
| C6 | `manifest.json` + apple-touch-icon / favicon → `assets/pcr-logo.png`; theme/background `#0a1628` |
| C7 | Login hero + home hero use resort photos with night gradient overlays; aerial on home card |

## Auth / register (Netlify-inspired)

| ID | Change |
|----|--------|
| C8 | Login \| Register tabs (replaces “Create an account” link panel) |
| C9 | Registration: first/last, contact, **fixed department `<select>`** (F&B, Bar, Kitchen, Boatman, Porters, Kids Club, BR Kitchen, Donu Kitchen, Housekeeping, Grounds, Spa, Maintenance, Management, IT/Office, Other) |
| C10 | Village staff yes/no + roster pattern 5/2 \| 16/6 \| 24/8 |
| C11 | Password + confirm; optional profile photo (preview + sessionStorage) |
| C12 | Default `@pcr.com` email checkbox (firstname.l@pcr.com) + pending-approval messaging |
| C13 | Backend `register()` stores `roster` + `village`; profile modal uses department select |

## Home / navigation UX

| ID | Change |
|----|--------|
| C14 | Home dashboard: hero welcome, dinner/lunch cutoff cards with glow when open, horizontal page chips (Dashboard/Meals/Boat/My Bookings/My Schedule/Admin) |
| C15 | Quick-action tiles restyled (Netlify/V3-inspired labels + gradient accents + stagger fade-in) |
| C16 | Reminders & suggestions shortcut card on home |
| C17 | Bottom nav unchanged (Home/Meals/Boat/Schedule/More); Admin reachable from home/more when role allows |

## Admin passcodes

| ID | Change |
|----|--------|
| C18 | Replaced `paradise2026` with dual passcodes: **SUPER `2026`**, **ADMIN `2025`** (frontend + Code.gs + demo mode) |
| C19 | `requirePasscode(p, level)` — `admin` accepts 2025|2026; `super` requires 2026 |
| C20 | Super-only: alert emails, delete users, role promotion to admin/hod/super_admin |
| C21 | Admin page unlock UI: 2025 = limited (directory/kitchen/boat); 2026 = full including alert emails; re-lock / upgrade |

## Version / deploy hygiene

| ID | Change |
|----|--------|
| C22 | `APP_VERSION` → `2.4.0` (public/index.html + apps-script/Code.gs) |
| C23 | Service worker cache bumped to `pcr-staff-v2.4.0` |


## Logo / dinner kitchen (2.5.0)

| ID | Change |
|----|--------|
| C24 | Primary brand mark → `public/assets/golden-logo.jpg` (login header, app header, home hero, favicon/apple-touch/manifest); pcr-logo retained as asset fallback only |
| C25 | Seed weekly dinner menus (Fiji weekday 0=Sun…6=Sat) into sheet `Dinner Menus`; `initializeSheets` + seed if empty; meals dinner picker loads tomorrow’s items via `getDinnerMenus` |
| C26 | Admin → **Kitchen** sub-tab after unlock; superadmin+2026 CRUD menu items (`saveDinnerMenuItem` / `deleteDinnerMenuItem`); admin 2025 view stats/prep/late approve only |
| C27 | Printable/downloadable Dinner Prep List (golden logo, totals, per-item Given out blanks, sections by menu item, chef/HOD signatures); auto snapshot after 8:30pm Fiji into `Dinner Prep Snapshots` |
| C28 | Dinner approval workflow: `pending`/`approved`/`late_pending`/`late_approved`; auto-approve waves 12:00 / 17:00 / 19:00 FJT via `processDinnerWorkflow`; after 20:00 late + `approveLateDinnerOrder` (admin/super) |
| C29 | Kitchen stats on Admin Kitchen tab + kitchen dashboard: tomorrow totals, per-item, late, approved vs pending, last 7 days |
| C30 | New registration always `role=staff` with basic access only (meals, boat, suggestions like/dislike, leave, edit profile+photo). Staff UI/API gated off Admin, Kitchen menu CRUD, Staff Directory, alert emails |
| C31 | `APP_VERSION` → `2.5.0` (public/index.html + apps-script/Code.gs); SW cache `pcr-staff-v2.5.0` |

## Intentionally preserved

- Live `SCRIPT_URL` (production Apps Script `/exec`)
- GET-based `api()` (POST breaks phones)
- Fiji UTC+12 cutoffs, staff directory robustness, alert email list, superadmin `it@paradisecoveresortfiji.com` / `21slands`
- V2 Sheet ID `1ToLFeO3-jL7-7gBQnd-kkSe-1BpLcUxLacDaPW6YidM`
- No changes to `/workspace/pcr-staff-app-v3` or Netlify reference folder


## Dinner / Lunch split (2.5.1)

| ID | Change |
|----|--------|
| C32 | Separate **Lunch** tab: bottom nav `Home \| Dinner \| Lunch \| Boat \| More` (Schedule under More); home quick tiles + chips split Dinner vs Lunch; `renderDinner` / `renderLunch` replace combined `renderMeals`; lunch copy books before **10:00am Fiji same day**; closed UI shows “Lunch ordering closed at 10am Fiji” with **no** late lunch button; kitchen dashboard lunch tally/counts for today visible for chefs |
| C33 | Late request flow is **dinner-only** (missed 8pm Fiji cutoff for tomorrow); dinner closed UI: “Submit late dinner request” + admin approval note (2025/2026). Staff UI never calls `placeLunchOrder` with `allowLate`; backend/demo reject lunch after 10am unless admin explicitly passes `allowLate`+passcode; staff cannot late-order lunch. `APP_VERSION` → **2.5.1**; SW cache `pcr-staff-v2.5.1` |


## Dashboard / reminders / suggestions (2.5.2)

| ID | Change |
|----|--------|
| C34 | Home layout: sticky header + **primary tab bar under banner/header** (Home/Dinner/Lunch/Boat/More); remove fixed bottom-of-viewport nav from home flow; **Reminders** slideshow card (priority first, ~4s rotate); **Suggestions** card (approved, most likes first, no author); then Dinner/Lunch status; quick tiles Boat/My Bookings/My Schedule (+ privileged only); remove Reminders/Suggestions tiles, old reminders panel, and horizontal page chips |
| C35 | Broadcast reminders for all staff; only admin/superadmin `addReminder`/`deleteReminder` (passcode 2025|2026); fields `priority`, `important`, `audience=all`; `getReminders` returns active undoned sorted important/high first; staff page read-only |
| C36 | Suggestions start `status=pending`; staff `getSuggestions` only approved/legacy-open and anonymous (no author); admin sees pending+approved with author; `approveSuggestion`/`rejectSuggestion` + passcode; sort by likes desc; staff submit + like/dislike approved; demo seed `approved` |
| C37 | `APP_VERSION` → **2.5.2** (public/index.html + apps-script/Code.gs); SW cache `pcr-staff-v2.5.2` |

