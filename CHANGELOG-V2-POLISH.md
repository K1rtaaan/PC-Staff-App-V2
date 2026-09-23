# PCR Staff App V2 Polish — Changelog

Version **2.9.2**. Revert any item later by asking for its ID (e.g. “revert C7”).

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

## Occupancy reminder / village boat (2.6.6)

| ID | Change |
|----|--------|
| C54 | Sample high-occupancy broadcast reminder (weeks ending 20 & 27 Sep; priority high / important; due 2026-09-27). `seedSampleReminders()` + `seedVillageBoatRuns()` (Soso Express 05:00/06:30/12:30/17:00/23:00 for 14 Fiji days) called from `initializeSheets`; action `seedVillageBoatSchedule` / `seedStaffSamples` (admin passcode). Boat tab info card: Staff Boat Transfer Schedule — Soso Express. Demo seeds same. `appendRow` writes by live sheet header names (fixes priority/fullNotification column drift); seed repairs misaligned reminder + deactivates broken Soso rows. `APP_VERSION` → **2.6.6**; SW cache `pcr-staff-v2.6.6`. |


## Uploaded roster / My Schedule (2.7.0)

| ID | Change |
|----|--------|
| C55 | **Uploaded weekly/monthly rosters** on My Schedule (works even when `feature_live_roster` is OFF). HOD / assistant_hod / admin / super_admin upload Excel/CSV (SheetJS in-browser) or PDF/image (pdf.js text try; otherwise reference note — no OpenAI/OCR). Client sends parsed shift rows via `uploadRosterParsed` (chunked GET-safe JSON). Fuzzy name match to Users (first last / last first / email local-part; prefer same department). Sheets: `Roster Uploads`, `Roster Shifts`, `Notifications`. Re-upload replaces shifts for period+(department OR matched users); diffs notify affected staff in-app (`Roster updated`). `getMySchedule` returns `weeklyShifts` / `monthlyShifts` + unread notices. CSV template: `name,department,date,start,end,dayOff`. **Limits:** Excel/CSV best; wide grids best-effort; PDF/image limited (no cloud AI OCR); large files must be parsed client-side (no base64 via GET). `APP_VERSION` → **2.7.0**; SW cache `pcr-staff-v2.7.0`. SCRIPT_URL unchanged. |


## Faster tab transitions (2.7.1)

| ID | Change |
|----|--------|
| C56 | Drop Paradise Cove loading-tip slideshow on tab load. showLoadingTips only shows plain Loading if request takes over 120ms. Fade-in 0.5s to 0.14s; shorter home tile stagger. APP_VERSION 2.7.1; SW pcr-staff-v2.7.1. |

## Breakfast + Lunch headcount (2.7.2)

| ID | Change |
|----|--------|
| C57 | **Breakfast + Lunch** order for **tomorrow**, close **1:00pm Fiji today** (stock/prep). No menu — one meal / headcount only; staff tap Count me in (or cancel). Dinner unchanged (8pm / tomorrow / menus / late path). Home: 3 status cards Breakfast\|Lunch\|Dinner. Nav: **Home \| Meals \| Boat \| More** with Breakfast/Lunch/Dinner pills in Meals hub. Kitchen: big **Total** for breakfast & lunch; dinner keeps item breakdown **and** total; weekly stats last 7 service days as `{ date, breakfast, lunch, dinner }`. Backend: `breakfastCutoffInfo` + lunch same (open hour<13, serviceDate tomorrow); sheet `Breakfast Orders`; `placeBreakfastOrder` / `getBreakfastOrders` / `cancelMealOrder`; `getKitchenDashboard` breakfast pack; lunch default `Lunch`, error text 1pm/tomorrow. Demo API mirrored. `APP_VERSION` → **2.7.2**; SW `pcr-staff-v2.7.2`. SCRIPT_URL unchanged. |


## Speed pack (2.7.3)

| ID | Change |
|----|--------|
| C58 | **Speed pack** (no forgot-password / register / kitchen redesign). (1) Single static login hero `assets/slideshow/beach-house.jpg` — removed login slideshow rotation / interval / multi-image list; header `.app-header-motif` solid/gradient only (no photo); keep golden logo; `showLoadingTips` stays plain text. (3) Skeleton shell (2–3 gray cards) on navigate for Home / Meals / Boat / Schedule. (4) In-memory + sessionStorage cache (~2.5 min TTL) for cutoffs, reminders, suggestions, boat runs, breakfast/lunch/dinner my-orders, kitchen dashboard, my schedule; instant paint then background refresh; invalidate on logout + mutations. (5) Fire-and-forget prefetch after login: getCutoffInfo, getBoatRuns, getReminders, getSuggestions, meal my-orders. (6) Compressed `golden-logo.jpg` (~512px) + login hero (~1200px, q~70–80); unused slideshow files may remain on disk unreferenced. `APP_VERSION` → **2.7.3**; SW `pcr-staff-v2.7.3`. SCRIPT_URL unchanged. |

## Auth / profile / breakfast late / role menus (2.8.0)

| ID | Change |
|----|--------|
| C59 | **Forgot password** on login: email → reset code (Verification Codes `purpose=reset`) → set new password. APIs `requestPasswordReset`, `resetPassword` (existing Users only). |
| C60 | **Register**: roster-name note (no nicknames); department mandatory; add **Diveshop**, **Activities** (keep Maintenance); **Mainland or Village Staff** (store Mainland/Village); remove `@pcr.com` pending-approval gate — verify email then active staff. |
| C61 | **Profile**: first/last/department read-only; contact, photo, mainland/village, password editable; **Deactivate account** (`deactivateAccount` → `active=false`). Staff Directory: superadmin **Delete user**. |
| C62 | **Breakfast late path**: normal open until **1pm Fiji** (tomorrow headcount → `ordered`); **1–6pm** late → `late_pending` (“waiting approval from chef”); after **6pm** fully closed + auto-decline unapproved (`order declined please see hod or chef`). Approve: chef/admin/superadmin → `late_approved` counts in total; Kitchen late queue + **Approve all**. Lunch unchanged (no late). Dinner late unchanged. |
| C63 | **Role dashboards / More**: Superadmin home shows weekly+monthly meal stats (not staff meal tiles). Admin More ordered: Statistics, boat bookings, Kitchen/Boat Admin, Staff Directory, Broadcast, Suggestions, Leave inbox, Alert Emails. HOD: dept leave + **Meal on behalf** (`placeMealOnBehalf`). Chef More → Kitchen Admin in 3 sections (Overview stats / Dinner prep+late / Breakfast&Lunch sheets). |
| C64 | APIs: `getMealStatistics`, `getBreakfastOrderSheet`, `getLunchOrderSheet`, `approveLateBreakfastOrder`, `approveAllLateBreakfast`, `processBreakfastWorkflow`. `APP_VERSION` → **2.8.0**; SW `pcr-staff-v2.8.0`. SCRIPT_URL unchanged. |
| C65 | **Dinner ordering picker**: for tomorrow’s service, meal choice includes **service weekday menu** + **previous Fiji weekday menu** (deduped by item name). UI optgroups “Tomorrow’s menu” / “Previous day menu”. Kitchen menu CRUD unchanged (`getDinnerMenus` merge when `serviceDate` set). |
| C66 | **Remove Admin unlock passcodes (2025/2026) UI** and **superadmin first-access PIN** (`unlockSuperadminPin` no-op). Admin/Kitchen/More gated by **role permissions only**. Backend `requirePasscode` accepts requester role (legacy passcode still honored if sent). No Re-lock / Upgrade unlock UI. |

## Dinner tomorrow-only + Kitchen harden + My Schedule flag (2.8.1)

| ID | Change |
|----|--------|
| C67 | **Dinner menu = tomorrow only**: `getDinnerMenus` defaults `includePreviousDay` to **false**; staff dinner picker lists tomorrow’s service weekday items only (no previous-day optgroups/copy). Admin menu CRUD still uses `includeInactive:true` for all weekdays. **Kitchen Admin crash fix**: guard missing `r`/`r.data` with error card; default `dinner`/`lunch`/`breakfast`/`stats` to `{}`; fingerprint + render lock stop bg-refresh spam; ensure `#kit-root` before `innerHTML`; try/catch surfaces `e.message`; print/dl guards if pack undefined. Late dinner approve: **no `askPasscode`** — role-gated `approveLateDinnerOrder` (chef/admin/super via requesterEmail, like breakfast late). Superadmin home stats / Admin kitchen tab hardened on API fail. **`feature_my_schedule`** App Setting (default **OFF**): Settings/Features toggle; when OFF hide My Schedule from home/More/nav paths; `getMySchedule` / roster upload / listRosterUploads return featureOff; leave request modal stays. Live flag seeded/set **false** so testing focuses on meals + boat. `APP_VERSION` → **2.8.1**; SW `pcr-staff-v2.8.1`. SCRIPT_URL unchanged. |

## Chef printable sheets + polish (2.8.2)

| ID | Change |
|----|--------|
| C68 | **Chef printable PDFs**: Breakfast / Lunch / Dinner order sheets with Paradise Cove golden logo (absolute URL), title, Fiji service date + printed time, totals, Chef in charge name + signature. B/L cross-off columns (Served / Name / Dept / Time ordered) sorted by time ascending; late breakfast in Waiting list (late). Dinner grouped by menu item with per-item totals, day subtotal, and late waiting list. Kitchen Admin **View PDF** / **Download PDF** for B, L, Dinner (+ Print/CSV). Reuses html2pdf helpers. Sample PNGs: `/workspace/sample-*-sheet.png`. Polish: meals/boat smoke-ready demo seed; kitchen empty states (“0 counted”, “no late requests”); soft-poll kitchen totals; “Still loading…” messaging; larger Count me in / Approve all taps; client error → console + toast; meal/kitchen paths stay role-gated (no passcode prompts). Keep dinner tomorrow-only, `feature_my_schedule` OFF, SCRIPT_URL unchanged. `APP_VERSION` → **2.8.2**; SW `pcr-staff-v2.8.2`. |






## Security / boat / ops / emergency (2.9.0)

| ID | Change |
|----|--------|
| C69 | **Security department** added to register, profile, HOD meal-on-behalf, and admin create-user department dropdowns (`PCR_DEPARTMENTS`). |
| C70 | **Block duplicate boat bookings**: one confirmed booking per `userEmail` per `runId` (API + demo); clear error asking to cancel first. |
| C71 | **Boat schedule Edit / Remove**: boat_manager/admin can edit date/time/route/capacity/notes and deactivate a run (weather) without passcode UI; role-gated `requireBoatManagerOrAdmin`. |
| C72 | **Dive trip summary PDF**: View/Download PDF per run (route, date/time, total pax, bookings). Visible to boat_manager/captain/admin/super + Dive department. Title “Boat Trip Summary — Dive”. |
| C73 | **Daily Operational Dashboard** on Home for admin/super/HOD: Today’s Summary cards (Breakfast/Lunch/Dinner counts for Fiji today, boat pax, dive pax best-effort, staff on leave). Tappable to meals/boat. |
| C74 | **HOD leave summary**: More → Department leave summary (counts by status + list). Reachable with `feature_my_schedule` OFF. |
| C75 | **Emergency off-island travel**: separate `Emergency Travel` requests (`pending`→`confirmed`/`rejected`); staff form on Boat; inbox for captain/manager/admin. Distinct from village schedule booking. |
| C76 | `APP_VERSION` → **2.9.0**; SW cache `pcr-staff-v2.9.0`. SCRIPT_URL unchanged. Parked: 26–28. |


## UX pack (2.9.1)

| ID | Change |
|----|--------|
| C77 | **Do this now** strip on Home — role-aware actions (book dinner / breakfast / lunch / boat / late awaiting chef / emergency pending). Hidden when empty. |
| C78 | **Remember last choices** — dinner meal/notes + boat seats/route in localStorage; “Same as last time” on dinner. |
| C79 | **Big primary CTAs** — Book/Cancel/Approve emphasized; boat Edit/Remove + captain tools nested under Manage / details. |
| C80 | **Passcode trim** — leave inbox view open without passcode; askPasscode only on approve/reject (+ existing destructive admin). Read-only ops/PDF/kitchen unchanged. |
| C81 | **Fewer confirm loops** — meal/boat cancel: single confirm + toast Undo (no double modals). |
| C82 | **Honest offline/errors** — api() network/parse → “Couldn’t reach kitchen / server — try again” + Retry on Meals/Boat lists. |
| C83 | **Prefetch next tab** — after Home / login, warm Kitchen / Boat / leave+ops / Meals by role. |
| C84 | **Skeletons** — kitchen + leave summary + ops cards while loading (meals/boat already). |
| C85 | **PDF path** — View PDF primary for dive/boat trip + chef sheets; Download secondary. |
| C86 | **Role-specific first paint** — chef→Kitchen, boat_captain/manager→Boat, HOD/admin→Home (ops), staff→Meals. Hash/`?tab=` deep links preserved. |
| C87 | **Cutoff one-liners** — under Meals titles with Fiji weekday/service date (e.g. Dinner for Thursday · open until 8:00pm today). |
| C88 | **Late state chips** — yellow “Needs chef OK” / “Waiting approval” on user’s late breakfast/dinner. |
| C89 | **Boat capacity bar** — “12 / 20” + progress; Full greys Book (“Full — ask Boat”). |
| C90 | **Ops cards deep-link** — B/L/D → Kitchen section (or Meals); Boat→Boat; Leave→HOD leave summary. |
| C91 | **Copy buttons** — “Copy today’s boat pax” + “Copy dinner totals” (plain text) on Ops + Boat/Kitchen. |
| C92 | *(skipped)* Quiet daily digests / push notifications. |
| C93 | **First-login coach** — 3 steps Meals/Boat/Profile (+ Approvals for HOD); localStorage `pcr_v2_coach_done`; dismissible. |
| C94 | **Human statuses** — Confirmed / Waiting chef / Cancelled / Rejected instead of raw `pending_approval` etc. |
| C95 | **Preferred / display name** — optional profile field; greeting + kitchen/boat `userName` prefer it; Users sheet column via `initializeSheets`. |
| C96 | `APP_VERSION` → **2.9.1**; SW cache `pcr-staff-v2.9.1`. SCRIPT_URL unchanged. `feature_my_schedule` remains OFF. Dinner=tomorrow; B/L next-day headcount; late breakfast 1–6pm Fiji. |

## Speed + boat dedupe (2.9.2)

| ID | Change |
|----|--------|
| C97 | **Apps Script hot-path speed**: remove `initializeSheets()` / seeding from every request. `getVersion`/`health` are a pure fast path (no spreadsheet). Other actions use lightweight `assertSheetsReady()` (existence check + cache). Full create/seed only via admin `initSheets`. Sets `sheets_ready` on init. |
| C98 | **Boat runs window + dedupe**: `getBoatRuns` defaults to Fiji **today → +14 days** (still supports `date`, or `allDates`/`fromDate`/`toDate`). Client Boat/Home prefetch uses that window. New admin `dedupeBoatRuns` soft-deactivates duplicate active (date,time,route) rows (keep earliest `createdAt` / lowest id). `seedVillageBoatRuns` skips any date that already has active runs so re-init cannot recreate duplicates. |
| C99 | `APP_VERSION` → **2.9.2**; SW cache `pcr-staff-v2.9.2`. SCRIPT_URL unchanged. `feature_my_schedule` remains OFF. Dinner/B/L rules unchanged. |

### Rollback / restore (pre-speed 2.9.2)

Shipped rollback tag **`v2.9.1-pre-speed`** (SHA `f9280fa171e54c4554cee980124c636d417babf7`, also branch `backup/2.9.1-pre-speed`).

```bash
cd /workspace/pcr-staff-app   # or clone PC-Staff-App-V2
git fetch --tags
git checkout v2.9.1-pre-speed
# rebuild static host
git checkout gh-pages && git checkout v2.9.1-pre-speed -- public/ && \
  rm -rf assets index.html manifest.json sw.js 2>/dev/null; cp -a public/. . && \
  git add -A && git commit -m "Restore public from v2.9.1-pre-speed" && git push origin gh-pages
# Apps Script
cd apps-script && clasp push && clasp deploy --deploymentId AKfycbzZFZhIgebzM8tegKAmE6ia6hoUD_eyrVBfYUmPS1jW60uV3NSyIkJLq7iZYIrdNi8
# verify
curl -sSL "<SCRIPT_URL>?action=getVersion"
```

Or: `git checkout v2.9.1-pre-speed` then redeploy `public/` to gh-pages and clasp-push that tree’s `Code.gs`.

### Rollback / restore (pre-UX)

Shipped from tag **`v2.9.0-pre-ux`** (also branch `backup/2.9.0-pre-ux`).

```bash
cd /workspace/pcr-staff-app   # or clone PC-Staff-App-V2
git fetch --tags
git checkout v2.9.0-pre-ux
# rebuild static host
git checkout gh-pages && git checkout v2.9.0-pre-ux -- public/ && \
  rm -rf assets index.html manifest.json sw.js 2>/dev/null; cp -a public/. . && \
  git add -A && git commit -m "Restore public from v2.9.0-pre-ux" && git push origin gh-pages
# Apps Script
cd apps-script && clasp push && clasp deploy --deploymentId <SAME_DEPLOYMENT_ID>
# verify
curl -sS "<SCRIPT_URL>?action=getVersion"
```

Or: `git checkout v2.9.0-pre-ux` then redeploy `public/` to gh-pages and clasp-push that tree’s `Code.gs`.

