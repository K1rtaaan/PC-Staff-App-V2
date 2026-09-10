# PCR Staff App V2 Polish — Changelog

Version **2.6.5**. Revert any item later by asking for its ID (e.g. “revert C7”).

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



## Roles / features / roster (2.6.0)

| ID | Change |
|----|--------|
| C38 | Feature flags via sheet tab `App Settings` (key/value). Keys: `feature_live_roster` (default **false**), `feature_leave_escalation` (default **false**). API `getAppSettings` / `setAppSetting` — **only superadmin + passcode 2026** can toggle (Admin 2025 cannot). UI: Admin → Settings / Features. When off, related UI is hidden/skipped and APIs return a friendly message. |
| C39 | Multi-permission roles: Users.permissions (comma-separated or JSON) + `role` as primary display label. Keys: `super_admin`, `admin`, `hod`, `assistant_hod`, `boat_manager`, `boat_captain`, `chef`, `staff`. New registrations always `permissions=staff`. Admin/super assign via Admin → Users multi-select; only superadmin grants/revokes `super_admin`. First super unlock can set `superadmin_pin` in App Settings. `canAdmin`/`canKitchen`/gates check permissions (+ legacy role). |
| C40 | Leave escalation behind `feature_leave_escalation`: staff → HOD/assistant_hod inbox (`pending_hod`) → approve forwards to managers (`pending_manager`) or disapprove+notify (`rejected`); managers final approve/reject. Feature off: previous simple admin leave review (`pending`). |
| C41 | Live roster behind `feature_live_roster`: read-only `SpreadsheetApp.openById('1n5onxR-Ww-0oDdPWDDUvRWuzKd-UGF51tBERtZfAcZM')`. Best-effort parse of dept tabs; match staff by name to Users.department. Schedule shows matched week shifts; HOD/admin see department roster. Parse errors surface in UI; toggle remains available to disable. |
| C42 | Chef prep list printable: staff name, food selection, time ordered, comments, approved/denied; sorted by food; served checkbox column; “did not order but received dinner” note area. Chef permission gates kitchen admin. |
| C43 | Boat captain: pax-booked info box per run; can update capacity + `fullNotification` via `saveBoatRun` limited fields (no full admin). |
| C44 | `APP_VERSION` → **2.6.0** (public/index.html + apps-script/Code.gs); SW cache `pcr-staff-v2.6.0` |

### How to enable feature flags (safe deploy defaults OFF)

1. Sign in as superadmin (`it@paradisecoveresortfiji.com`).
2. Open **Admin** and unlock with passcode **2026** (not 2025).
3. Open **Settings / Features**.
4. Toggle **Live roster** and/or **Leave escalation** ON.
5. To disable after a roster parse issue, toggle OFF from the same panel.


## Home polish / UX (2.6.1)

| ID | Change |
|----|--------|
| C45 | **Home aerial/Bula banner removed.** Sticky header (golden logo, Paradise Cove / title, logout) + primary tab nav remain on all tabs including Home. Compact greeting card only. Slideshow brand assets under `public/assets/slideshow/`. |
| C46 | Home order: compact greeting → Dinner|Lunch status cards → Reminders slideshow → Suggestions → quick tiles. |
| C47 | Dashboard suggestions sorted by likes; thumbs up/down via `voteSuggestion` with refresh; **Share idea** opens suggest modal; all staff. |
| C48 | Quick tile **Request leave** beside/under My Bookings; opens leave request modal (or My Schedule). |
| C49 | Global press animations; `showLoadingTips()` with slideshow thumbs; login hero rotates `assets/slideshow/*`; CSS motifs use slideshow. `APP_VERSION` → **2.6.1**; SW `pcr-staff-v2.6.1`. |


## Service worker cache bust (2.6.2)

| ID | Change |
|----|--------|
| C50 | Service worker rewritten network-first for navigations / `index.html` (update cache on success; cache only if offline). Stale-while-revalidate for same-origin static assets. CACHE `pcr-staff-v2.6.2`; activate deletes all other caches + `clients.claim`; install `skipWaiting`. Never cache Google / Apps Script hosts. Light one-reload-per-version on `controllerchange` / waiting SW. `APP_VERSION` → **2.6.2**. |

## Dinner prep PDF (2.6.3)

| ID | Change |
|----|--------|
| C51 | Dinner Prep List downloadable as **PDF** + **View all as PDF** (blob in new tab). Lazy-load `html2pdf.js` 0.14.0 from cdnjs on first PDF action; `buildPrepHtml` logo uses absolute URL so PDF keeps golden logo; header **Download PDF** / **View PDF**; Generate modal leads with View PDF + Download PDF (HTML/TXT secondary). `APP_VERSION` → **2.6.3**; SW cache `pcr-staff-v2.6.3`. |

## Home banner restore / avatar / order (2.6.4)

| ID | Change |
|----|--------|
| C52 | Bring back full-bleed home banner under sticky header (~2× old strip height, `h-44`/`h-48`, slideshow `hero-banner.jpg` via `--aerial`). Greeting avatar: staff photo or teal initials (no golden logo). Home order: Banner → greeting → Dinner\|Lunch → quick tiles → Reminders → Suggestions → version footer. `APP_VERSION` → **2.6.4**; SW cache `pcr-staff-v2.6.4`. |

## Home banner off / taller header (2.6.5)

| ID | Change |
|----|--------|
| C53 | Remove full-bleed home banner again (no strip under sticky header; `.home-accent { display: none }`). Double sticky header height (`#app-header` / `.app-header-motif`: `py-3`→`py-6`, logo `h-8`→`h-12`, slightly larger Paradise Cove / title). Keep greeting staff photo/initials; Reminders + Suggestions under quick tiles. `APP_VERSION` → **2.6.5**; SW cache `pcr-staff-v2.6.5`. |

