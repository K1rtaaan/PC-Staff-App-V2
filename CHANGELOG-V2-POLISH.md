# PCR Staff App V2 Polish — Changelog

Version **3.5.2**. Revert any item later by asking for its ID (e.g. “revert C7”).


## 3.5.2 — Home: one combined top card (2026-10-03, TEST)

| ID | Change |
|----|--------|
| C202 | **My roster merged into the Bula greeting card** (Pranav): greeting, name and photo, then today's shift + status, days to the next day off and the roster pattern (same content / function / saved data as Schedule › My roster's first card — `r34TodayInnerHtml`). Tapping the roster part opens Schedule. Locked account: "Schedule is locked — open Schedule to link" line inside the card. Superadmin, demo, Schedule off: plain Bula card. Replaces the separate card from C199. |

## 3.5.1 — Home: my roster first, boat + role shortcuts (2026-10-03, TEST)

| ID | Change |
|----|--------|
| C199 | **Home › My roster** is the first section (Pranav): the same card as the first card of Schedule › My roster (today's shift and status, countdown to the next day off, roster pattern), drawn by the same function (`r34TodayCardHtml`) from the same saved data (`r34my`). Shown only when Schedule is on; a not-linked account sees a short "Schedule is locked — open Schedule to link" card; hidden in the demo / for superadmin. Tap → Schedule. Schedule does not fetch again when Home loaded it in the last minute. |
| C200 | **Home quick actions**: + **Book village boat** (Boat › Village boat, scrolled to the runs) and **Book resort boat** (Boat › Resort boat / PCE request form); Request leave and Report a problem stay. Two per row at 320 / 390 px. |
| C201 | **Role shortcuts on Home** ("My roles"), only for roles the user holds: admin → Admin + Approvals · chef → Kitchen Admin · HOD / assistant HOD → Approvals + Department · boat manager / captain → Boat Admin. Several roles → each shortcut once. Tests: `tools/tests/r351flows.js` (demo), Home checks in `tools/test-env/r350-test-env.js`. |

## 3.5.0 — Clean-up: one page per job, nothing repeated (2026-10-02)

| ID | Change |
|---|---|
| C187 | **Kitchen Admin** is one section with tabs **Today** (orders, Served / Cancel, allergies, meal times, order for someone, activity log) · **Lists** (one date picker, ONE dinner prep list card with Print / PDF / View PDF / CSV / Copy totals / Generate (PDF · Print · HTML · TXT) and a saved-or-live label, breakfast & lunch headcount with Print / PDF / CSV per meal, island estimate line, admin-only "Saved copies" fold with summary status + back-fill) · **Approvals** (late + order-for-someone chips, Approve all / Decline all, Print / CSV, recently decided) · **Menu** (one editor) · **Reports** (stats, feedback, not on menu; roster compare now uses the uploaded rosters via new `getRosterExpected` — no local file upload). Removed: the 2.x kitchen page (with its duplicate PDF blocks), the classic Kitchen tab, Chef hub and the duplicate menu editor. |
| C188 | **One Approvals inbox** with chips Leave (HOD step / final) · Late meals · Special meals (Meal while away + order for someone) · Resort boat (HOD step + boat-manager confirm) · Emergency travel · GL links. Chips are role-scoped, one badge count (superadmin nav + More), Approve all / Decline all (one reason) and Print / CSV on each chip, admin department filter. HOD special-meal approvals (were only on Department staff) are included. Admins decide HOD-step items **on behalf of the HOD** (`decideOnBehalf`, logged, HOD notified). Admins and HODs get More › Approvals. |
| C189 | **Leave**: own leave only in Schedule › Leave (More › Leave only when Schedule is off — the row waits for the feature flags, fixing the race that showed it before flags loaded). Team leave = **Leave overview** with Calendar | List tabs, admin department filter and CSV on both. Decisions only happen in Approvals; old leave deep links (`leave` + dept/final) open Approvals › Leave. |
| C190 | **Inbox**: tabs For me (notifications) and Announcements (whole-resort reminders + department updates, post box for HOD / admin: whole resort or one department; admin Edit / Done / Remove). Phone notification settings = gear in the Inbox header. Home shows the top 1–2 announcements. |
| C191 | **People**: one page (3.4.1 department grid) with tabs Users (search, role filter, edit roles / code / active, Edit details, Add user, Quick Import CSV, sign-ups to approve, CSV export) and Roster links (requests → Approvals › GL links, roster-only, unmatched names, employee-code / staff-listing import). HODs get the same page locked to their department with Edit details / Remove from department. Removed: classic Staff directory, duplicate deptstaff entry, double tiles, dead `v3RenderDeptStaff`. |
| C192 | **Boat Admin** tabs Village runs (list, passengers, add / edit / remove run, capacity + mark full, captain board, passenger + Dive PDFs, remove duplicates, copy today's pax, passenger cancel) · Resort boat (PCE) · Emergency. Staff Boat tab = booking + My bookings (cancel); "Copy today's pax" only for boat roles. Removed the 2.x boatruns screen and classic Boat ops. |
| C193 | **Overview / versions / System**: one Overview (superadmin Home, top of the admin's Admin page). One version line in the footer of every page + the About modal (other version texts removed). One **System** page: Alert emails · Archive · Saved summaries · API health; superadmin also Email sender + test, Features, Revert owner, About image, Role migration, Roster archive. Superadmin Manage = Admin hub + superadmin sections; admins never land on Manage (Leave calendar back button fixed). |
| C194 | **Old 2.x pages removed** (admin classic, users, kitchen, boatruns, reminders, my bookings, the Features tab in App settings, dead render functions). Stale renders are cancelled by a navigation token (`V35.tok`), so a slow page can no longer paint over the next one. "Special meal request" (staff, off island) → **Meal while away**; "Meal on behalf" → one **Order for someone** page. Home quick actions = Request leave + Report a problem; the meal status shows once. One Activity log page with area chips. Header flag + More › My reports kept. |
| C195 | **Menus**: bottom nav Home · Meals · Boat · Schedule · More; More = profile card, Inbox, My history, My reports, (Leave when Schedule is off), role groups Department / Kitchen / Boat / Admin, Sign out. Superadmin nav Overview · Approvals · Manage · More. Every old page name / hash redirects to its new home (`V35_REDIRECT`; notification deep links incl. `tab:chip`, activity-log area keys and guide keys); unknown names open Home. First-time guides updated. |
| C196 | TEST staff listing refreshed from the 2026 timesheets share (TEST only — never live). |
| C198 | **HR → Management, no "Admin" department** (Pranav): "Admin" is a role only. Listing / roster "HR", "Human Resources" (and an old "Admin" department) map to **Management**; the "Admin" department added in 3.4.1 is removed from the department list, sign-up, the People grid and the mappings. One-time server step `r35MoveAdminDept` (flag `departments_350`) moves every record with department Admin / HR (Users, leave, department updates, resort boat, special meals, link requests, staff listing, emergency travel, roster shifts / links / allowances) to Management. Test: `r341-gl-unit.js`. |
| C197 | Tests: new `tools/tests/r350flows.js` (every role's menus, no duplicate entries, every old hash redirects, capability checklist, screenshots 390 / 320 px) and `tools/test-env/r350-test-env.js` (TEST site + server); smoke, r330, r340, r341, r342, r310 / r320 demo, swupdate and unit suites updated for the new navigation. Version **3.5.0** (TEST server 3.5.0-test); SW cache `pcr-staff-v3.5.0`. |

## 3.4.1 — GL number linking, People & roles by department, per-meal island estimate (2026-10-02)

| ID | Change |
|---|---|
| C179 | **GL number linking** (Admin → People & roles → department, and Department Admin → **Link GL numbers** for HODs/assistant HODs, their own department only). Each person has a GL box: type the number, press Enter (or **Link**). The server checks it against the saved **staff listing** (new tab `Staff Listing`; the roster workbooks themselves carry no GL numbers) and the roster names (current + archive + unmatched), then shows a verify panel: listing name/department/start date, the roster person picked automatically (name + department) or a picker, and a field table (App vs Roster) for name, department, position, pay type and date started with per-field ticks and "update all". **Link only** (focused, so Enter twice links) or **Link + update selected**. Linking also links the roster name and moves its roster days to the account. Focus then jumps to the next person's GL box. |
| C180 | **Checks**: a GL not in the listing is shown in red and nothing is saved; a GL already on another account is blocked (a superadmin can override, which moves it and clears it on the other account); a department difference between app / roster / listing is warned. HODs can't change departments. Every field change is written to the new `GL Link Log` tab and the activity log. Pending "enter my employee number" requests for that person are closed. |
| C181 | **People & roles redesign** (was Users & roles): a 2-column grid of department buttons (works at 320px) showing "X on roster · Y registered in app" (roster = this + next week, incl. names without an account) and a badge with pending requests. Tapping a department lists its users with role filter, GL boxes and the same role editor. A search box at the top searches all users in every department (name, email, GL). |
| C182 | **Pending department requests** button (total count) at the top of People & roles: every item waiting for the HOD step in all departments — GL / number link requests, leave (HOD step), resort boat (HOD step), special meal requests. An admin can approve or decline on behalf of the HOD; this is logged as "approved/declined by admin on behalf of HOD" and the HOD is told. |
| C183 | **Staff listing**: Employee codes now saves the whole listing for GL checks (on Confirm, or "Save staff listing only") and shows when it was last saved. **Band** and **Naisoso** rows are skipped (not app staff) and those two departments are removed from the department list once (marker `departments_341`). HR maps to a new **Admin** department; **Medical** is added; Construction maps to Maintenance. |
| C184 | Roster reading: pay type (Hourly / Salary / Wage) and position from column A of each employee block are stored with the shifts (used for the GL field table). Family leave codes (FAMILY, F/LEAVE, F/L → Family / Bereavement; counts as off-island). |
| C185 | **Island estimate per meal**: roster status for the date, adjusted by **confirmed** resort boat (PCE) trips that day (AM in 10:00 / out 10:20, PM in 15:00 / out 15:30 vs breakfast 07:00, lunch 12:00, dinner 19:00). Shown on the Meals tab, kitchen summary, dinner prep / order sheets and the PDF/printouts with a boat note ("+2 arrive on the PM boat"). The roster part is cached for an hour (busted when rosters, leave or trips change). |
| C186 | Tests: `tools/tests/r341-gl-unit.js` (listing, lookup, link, override, skip, departments, family codes, per-meal boat, on behalf of HOD), `tools/test-env/r342-gl-link.js` (TEST site + server at 390px and 320px: People & roles grid, global search, GL verify panel, pending requests, island lines). |

## 3.4.0 — Schedule tab: rosters, leave balances, roster reminders (2026-10-02)

| ID | Change |
|---|---|
| C162 | **Schedule tab** (bottom bar, before More, behind `feature_my_schedule`). It has two sub-tabs. **My roster** shows a Today card, a countdown to the next day off (or the report-back day while off or on leave), the week list, a month calendar/list and the roster pattern. **Leave** shows balances per leave type, a New leave request button and your requests. Plain staff open Leave here, so the old Leave row on More is hidden while the flag is on. Superadmin is blocked. Not available in the demo. |
| C163 | **Real PCR roster workbooks** ("Roster we <Sunday>.xlsx/.xlsm") are read as they are. Each department sheet is one Mon–Sun week of Start/End pairs in columns B–O, with employee blocks (name, pay type, role, up to 3 split shifts, then `day total`). The parser handles: sheet aliases (Houskeeping, NEW F&B, BAR/BAR1, MAINT); sub-section headings; occupancy and kids-count rows; numeric, corrupt-style and typed times (`18;00`, `12"00`, `22>00`, `23:OO`); and ends at 24:00 or later. Summary, Man Hrs, Floor1 and Sheet* are skipped. The simple template (rows) and grid (names × dates) formats still work. |
| C164 | **Dates in files aren't trusted.** The week comes from the file name, or else from the majority of sheets. A sheet dated another week, or with a year/month typo, is read Mon–Sun by position, with a warning. A warning is also shown when the file name and the chosen week disagree. A week whose shifts are identical to another week is flagged as a **possible duplicate** (in the preview and on the server), as in "we 24 May" = "we 17 May". |
| C165 | **Uploads.** An HOD or assistant HOD uploads the weekly workbook, and only their department's sheet is used (sheet picker if the name doesn't match). An admin uploads one or more whole-resort workbooks on **Rosters**, and each one becomes that week's roster for every department (department `ALL`). An HOD upload for their own department replaces only that department. The superadmin uploads past workbooks into the **Roster archive** by month. Uploads are sent in parts of 500 rows with retries and are idempotent. Tabs and settings are created automatically. |
| C166 | **Codes** (free text, whitespace and case ignored, spelling variants and typos included). Day off: DAY OFF / OFF / D/OFF / RDO / DAT OFF. Annual leave: A/L / ANNUAL LEAVE (n). Unpaid leave: LWOP / LOPW. Maternity / Paternity: M/L / MARENITY LEAVE. Sick leave: SICK / SL / SICKLEAVE. Family / Bereavement: B/LEAVE / BREVEAMNET. PH = Public holiday. SPECIAL LEAVE = Other. **RELEASE / RELEASED / STAFF RELEASE** marks a separation, not leave: it shows as "Released", stops the countdown, and is listed for admins as **Possibly left** from that date. Accounts are never changed automatically. TRAINING and Stores **ON** count as working days. SDD and other unknown texts are shown as written. Codes and leave types can be edited (Leave allowances & codes). |
| C167 | **Matching** uses name AND department. Only a saved link or one exact full name is assigned automatically. First name only, first name + initial ("Malelili S", "Mereseini.K"), ties and wrong-department matches go to **Unmatched names** with suggestions, so they can be linked once and the link is reused on every upload. |
| C168 | **Leave balances** combine approved leave in the app with leave codes on the roster (archive plus current), counted once per date. Remaining is shown only when an allowance is set (per person > department > everyone). The leave request form uses the configured types. Overlap with approved leave is blocked as well as overlap with pending leave. |
| C169 | **Reminders** (in-app and phone): staff are told when their roster changes (only the days that changed). There's a report-back reminder the evening before returning (18:00, configurable) and an optional day-off heads-up (off by default). HODs are reminded when next week's roster is missing (Saturday 6pm), and admins when next month's is missing. |
| C170 | **Departments**: **Front Office** and **Stores** (from the real rosters) are added to the department list. This happens once and idempotently, through App Setting `departments` (marker `departments_roster_340`). Existing departments are never renamed or merged. The app reads the list from the public `getDepartments` action (cached on the phone). |
| C171 | `Users.roster` (e.g. "24/8") is written as text, and a value Sheets had stored as a date is shown as d/m again (display only, no data change). Bulk deletes are done in blocks instead of row by row. |
| C172 | Tests: `tools/tests/r340-roster-unit.js` (server, incl. employee codes), `tools/tests/r340-realparse.js` (all 35 real files, read only; prints no staff names), `tools/test-env/r340-test-env.js` (TEST site + server: whole-resort upload, duplicate week, links, HOD override, Schedule, leave, archive with a real workbook, employee-code import/edit/match). Version checks are 3.4.0 in every suite. Version 3.4.0 (TEST server 3.4.0-test). |
| C173 | **Employee codes** (approved by Pranav). `Users.employeeCode` (column added once, idempotently). Admin → **Employee codes**: upload the staff listing workbook (New Code, Name, Date Started, Department), codes are matched to accounts by name AND department, the preview shows matched / check first / ambiguous / no account, unmatched or ambiguous rows are linked by hand, nothing is saved until **Confirm**. A code is never on two people. Admins edit a code per user in Users → edit. Roster matching: employee code first (when the roster has a code column or a "GL018 Name" cell), then the saved name link, then one exact name in the department. Whole-resort uploads now update unmatched rows in one pass (a 1,200-row workbook used to time out on the second part); a part that times out or meets "server busy" is retried safely. |
| C174 | **Schedule access by employee code** (Pranav). Schedule opens only for accounts with an employee code (App Setting `schedule_link_required`, default on). Others see a lock screen: **Enter my employee number** (goes to their HOD and admins to approve) or **I don't know my number – request it** (HOD/admin enters it). Approving saves the code, can link a roster-only name too, and unlocks Schedule. Every step sends an in-app notification + phone push and is written to the admin log. Requests are kept in `Roster Link Requests`. Leave requests still work from the lock screen. |
| C175 | **Department staff page** (Department Admin → Department staff; admins: all departments with a filter). Roster weeks this + next week merged with app accounts: **Active** (code + on the roster), **Pending** (account not linked: link with the employee number, optional roster name), **Roster-only** (on the roster, no account). HODs/admins **register a staff member** (name, email, department, employee code, optional roster name): the account is created active, a **one-time password** is emailed through the app's mail sender (Brevo when configured, else MailApp) and must be replaced at first sign-in (expires after 14 days). Passwords never appear in responses or logs. |
| C176 | **Roster change notices**: every re-upload (e.g. a HOD mid-week) notifies only the people whose shifts changed, with what changed (unchanged; now covered by the TEST e2e). **Missing weekly roster**: HODs are warned on Saturday (from 18:00), admins get one pending alert on Sunday listing the departments still missing; each alert is sent once (Roster Reminder Log). |
| C177 | **Estimated staff on island** (Meals, kitchen summary, printouts): from the resolved roster for the date, incl. roster names without an app account. Working, days off, sick, PH, training, SDD, ON = on the island; **leave only** = off: App Setting `meal_off_island_leave` (default Annual leave, Unpaid leave/LWOP, Maternity/Paternity, Family/Bereavement — Pranav 2 Oct 2026). Shown as "N orders vs ~M staff on island". **Meal block on leave** (App Setting `meal_roster_block`, default off live / ON in TEST): a linked staff member rostered on that leave cannot place the normal order ("You are rostered off …") and can send a **special meal request** with a reason to their HOD; approved requests appear in **Special meal requests** on the kitchen summary and the dinner / breakfast / lunch printouts and PDF (`Special Meal Requests` sheet). Unlinked staff are never blocked. |
| C178 | Tests: `tools/tests/r340-roster-unit.js` (+45: lock, requests, department staff, registration + first password, island rules, block, special meals, Saturday/Sunday alerts), `tools/test-env/r341-staff-links.js` (TEST site + server, real archive workbook). TEST backend only: a `TEST Mail Log` sheet + superadmin-only `testMailLog` action so the e2e can read the one-time password (never in the live build). |

## 3.3.0 — Meals sub-tabs, Resort boat (PCE) requests, chef feedback with meal / date (2026-10-01)

| ID | Change |
|---|---|
| C151 | **Meals → 4 sub-tabs** (bar at the top of Meals): **My meals** · **Dinner** · **Lunch** · **Breakfast**. Each meal tab is the existing ordering card with every rule unchanged (cutoffs, late dinner requests, weekday menus, limits). The last tab is remembered on the phone (`pcr_meals_tab`); works at 320px. Notifications / Home meal tiles still open Meals. |
| C152 | **My meals** tab: the staff member's own orders for Yesterday / Today / Tomorrow with status, dinner choice and kitchen note, and Change / Order / Late request (opens that meal tab) and Cancel / Withdraw late request where the existing rules allow. |
| C153 | **Feedback to the chef** moved to My meals (it already existed: “Chef Feedback” sheet, Kitchen Admin → Staff feedback, chef in-app + phone notification). New optional **Meal** and **Date** fields (columns `meal`, `mealDate` added to the sheet automatically) shown in the chef's list and the notification title. |
| C154 | **Boat → 2 sub-tabs**: **Village boat** (all existing booking, unchanged) and **Resort boat** (Paradise Cove Express, Naisoso Marina ↔ resort). Remembered (`pcr_boat_tab`). The PCE timetable and report-by times are shown: AM 9:00am from Naisoso (marina before 8:15am, arrives ~10:00am), back ~10:20–10:30am (~1 hour); PM 2:00pm from Naisoso (marina before 1:00pm, at PC by 3:00pm), back ~3:30pm (Dive Shop by 2:30pm). |
| C155 | **Resort boat request form**: direction, date, AM/PM run, pax (1–20), purpose **Day off** (return date + run; a linked return request in the opposite direction is created automatically) or **Other reason** (required text). Server checks: no past dates, ≤ 90 days ahead, same-day request closes at the report-by time, return not before the outbound, same-day return = AM out / PM back, no duplicate request for the same date / run / direction. |
| C156 | **Workflow**: pending HOD → HOD approved (sent to admin / boat manager) → confirmed (on the manifest), or rejected at either step with an optional reason. HOD step uses the leave rule (HOD or assistant HOD of the staff member's department; admin only if the department has no other lead; HOD / admin requests skip to the confirm step). Confirm = admin or boat manager. Nobody decides their own request. Each leg is decided on its own; “Approve / confirm both legs” does trip + return together. Staff can cancel while pending (a day off cancels both pending legs). |
| C157 | **Approvals page**: new “Resort boat — HOD step” section. **Resort boat (PCE)** admin page (Admin Settings, superadmin Manage, Boat Admin button): HOD-approved requests to confirm / reject, **manifest** per date with the 4 trips (run · direction), confirmed staff and pax, filter and **Print**; recently decided list. Boat captains can open the manifest (read only). Badges on Department Admin / More. |
| C158 | **Notifications**: in-app + phone push on every change — staff (submitted / approved / confirmed / rejected), HODs (new request), admins + boat managers (HOD-approved, cancelled). Tapping opens Boat → Resort boat, Approvals or the Resort boat page. **Logs**: HOD decisions in the department log, confirmations / rejections in the boat log (existing activity logs). |
| C159 | **Server**: new `Resort33.gs`; sheet tab **Resort Boat Bookings** created on first use (idempotent, no manual setup on live). Actions `requestResortBoat`, `cancelResortBoat`, `getResortBoat`, `hodDecideResortBoat`, `confirmResortBoat`, `getResortBoatManifest`; home counts `resortBoat`. Version 3.3.0 (TEST server 3.3.0-test). |
| C160 | **More page**: the version line was shown twice; now only once (in the footer above About). |
| C161 | Tests: new `tools/test-env/r330-test-env.js` (meals sub-tabs, remembered tab, 320px, My meals, chef feedback meal/date → chef page, full resort flow incl. HOD / admin reject and cancel, manifest, notifications, logs) for the TEST site + TEST server; `r300flows.js`, `smoke-test-env.js` use the meal / boat sub-tabs; version checks 3.3.0 in the server suites, `r320flows.js` (version line once), `swupdate3.js`. |

## 3.2.1 — Footer: About button only (2026-09-28)

| ID | Change |
|---|---|
| C149 | **Footer**: the “Made by Pranav Kumar (Group IT Manager)” pill (text, golden frame, glow) is removed from every page and the sign-in screen. The **About** button stays and opens the same picture as before (default poster or the superadmin's About image); its text and icon now use the red / yellow / green gradient, and it is smaller and lightly see-through (10px text, translucent background and border, 80% opacity, full on hover/focus; still 32px tall to tap; fits 320px phones). Frontend only — UI 3.2.1, API stays 3.2.0 (no Apps Script deploy). Service worker cache `pcr-staff-v3.2.1` so phones pick it up. |
| C150 | Tests: `tools/tests/r320flows.js` updated (no Made-by text/pill, gradient on the About button, size / opacity / tap height, 320px), `swupdate3.js` for 3.2.1. Rollback: gh-pages files from 4735c9a (3.2.0 = main 0eeefcc). |

## 3.2.0 — Phone notifications (Web Push), reports owner-only, admin tools, footer credit (2026-09-28)

| ID | Change |
|---|---|
| C141 | **Phone notifications** (standard Web Push with VAPID, no Firebase): a “Turn on phone notifications” prompt on Home (once per session; “Not now” hides it for 7 days; iPhone users see the Add to Home Screen steps), and More → **Phone notifications** (this phone on/off, account on/off, send a test, what you'll get). One subscription per user per device (new **Push Subscriptions** tab); dead ones (404/410 or 5 failures) are switched off automatically; logging out switches this phone off. The VAPID key pair is made on the server the first time and kept only in Script Properties (`VAPID_D` / `VAPID_PUB`); the public key is sent to the app. Pushes carry no data: the service worker fetches the text (`getPushInbox`, new **Push Queue** tab) and shows it, or a generic “open the app” message if offline. The service worker's fetch/caching behaviour is unchanged. |
| C142 | **What is pushed**: meal / late meal / special meal approved, declined, cancelled; leave requests and decisions; HOD notices; boat bookings (to boat admins, and to the staff member if booked for them), booking cancelled, run time changed or run cancelled (to the booked staff), emergency travel request (to boat admins) and decision; late / special meal requests (to chefs); messages from admin; replies and status changes on your problem reports; new problem reports (report owner only). Plus a **reminder 1 hour before each meal's cutoff** only to staff who have not ordered that meal (checked every 10 minutes, 60–40 min before cutoff, sent once per meal per day; text = App setting `push_cutoff_text`, placeholders {Meal} {time}). Superadmins and station accounts get no meal reminders. |
| C143 | **Reports owner-only**: new problem reports no longer email anyone. They show only in the Reports inbox of the report owner (App setting `revert_owner_email`, else it@paradisecoveresortfiji.com), who alone gets the in-app / phone alert and the Manage badge and can reply / change status; other superadmins don't see the inbox. Reporter notifications (in-app, email, push) on a reply or status change are unchanged. One-time update on the first request after deploy: if `revert_owner_email` is empty and it@paradisecoveresortfiji.com is an active superadmin, it is set to that address (logged in the Superadmin log, never overwrites an existing value). |
| C144 | Tests: `tools/tests/a33-push.js` (39: keys, ES256 JWT verified with node crypto, subscribe, VAPID header, inbox, every event, off switch, 410 cleanup, reminders, owner-only report push), `a31-backend.js` now 83 (owner-only reports, no email, one-time owner update). Real end to end on the TEST site with headless Chrome: FCM accepted the push (201) and the service worker fetched the text and showed the notification. |
| C145 | **Admins get more tools** (not only superadmins): delete users (never a superadmin account; confirm prompt kept; admins type the **admin code**, superadmins the superadmin code), **Overview** (the superadmin dashboard stats) and **System tools** (alert emails, archive old records, kitchen summary status / back-fill) under Admin Settings. The server checks the same rules; every change is written to the Admin Log. Still superadmin-only: granting / removing Admin or Superadmin, App settings, Role migration, Superadmin log / Revert, Reports inbox, About image. |
| C146 | **One-time live update on the first request after the 3.2.0 deploy** (Script Property `A320_ROLES_DONE`, under the script lock): Role migration applied (Users tab backed up first as “Users backup YYYY-MM-DD HHMM”; checks that nobody's permissions changed), then **Leanne and Delai: Superadmin → Admin** (other roles kept; it@ stays superadmin). Results in the Superadmin log and in App setting `ops_320_result`. As admins they get their staff features back and no superadmin notice. |
| C147 | **Footer credit**: at the bottom of every page (and the sign-in screen), under the version line: “Made by Pranav Kumar (Group IT Manager)” in red / yellow / green gradient text inside a golden frame with a slow glow (no animation with “reduce motion”; fits 320px phones; hidden when printing). An **About** button opens a picture (default: the “No guts no glory” poster, `assets/about-default.jpg`). Superadmin **Manage → About image**: choose a picture (shrunk on the phone, saved to the Drive folder like report screenshots, App setting `about_image_url`), preview, reset to default; logged. |
| C148 | Tests: `tools/tests/a34-admin.js` (43: admin tools + codes, superadmin-only list, About image, one-time migration + role changes), `tools/tests/r320flows.js` (demo browser, 38: credit on every page, gradient / glow / reduced motion / 320px, About modal, admin Overview + System tools + delete with the admin code, About image upload / reset). |

## 3.1.0 — Superadmin admin-only, activity logs, superadmin log + revert, page guides, Report a problem (2026-09-28)

| ID | Change |
|----|--------|
| C134 | **Superadmin is an admin-only account**: no Meals, Boat, My bookings, My orders/history, My schedule or My leave; the server refuses staff actions for a superadmin (“Superadmin accounts can't place orders or bookings. Use a staff account.”). One-time notice at the next login (remembered on the server per user, column `superNotice31At`), and a small permanent note on the superadmin Home. |
| C135 | **Activity log**: every change made from an admin/role page (Kitchen Admin, Boat Admin, Department Admin, Admin Settings) is written to a new **Admin Log** sheet tab (Fiji time, who, role, area, action, target, before/after JSON). Each admin page has an “Activity log” (that area only, newest first, 50 per page). |
| C136 | **Superadmin log + Revert** (Manage → Logs): every superadmin change keeps its before-state; a Revert button restores it (refused if the row changed again since). Only the **revert owner** (App setting `revert_owner_email`, enforced on the server) may revert; empty = nobody. Things that can't be undone (sent notifications/emails, saved summaries) show “can't be reverted”. Reverts are logged too. |
| C138 | **First-time guides** on Kitchen Admin, Boat Admin, Department Admin, Admin Settings and superadmin Manage: a short step-by-step tour (same style as the first-login tour) the first time each page is opened; remembered per user on the server (Users column `guidesSeen31`) and on the phone. A “?” button at the top reopens it. |
| C139 | **Report a problem** (flag button at the top of every page, and in More): type (Problem / Change request / New feature), description, up to 3 screenshots shrunk on the phone (JPEG ≤ ~300 KB each), plus page, app version, device and user. Saved to a new **Reports** tab; screenshots go to the Drive folder “PCR App Reports” (view-by-link). New reports notify superadmins in-app and email the developer (App setting `report_email`, else the revert owner, else it@paradisecoveresortfiji.com). Superadmin **Reports inbox** (Manage, badge on the Manage tab): filter by status, set New / Noted / In progress / Done, reply — the reporter gets an in-app notification and an email. Everyone sees their own reports and replies under More → My reports. Large requests are sent as POST. |
| C140 | Fixes: times like “2026-09-28 15:36 FJT” showed as “… FJ ” on the 3.0 screens (now “2026-09-28 15:36”); icon font subset rebuilt so the new icons (flag, question mark, shield, image, reply, book) show. |
| C137 | Tests: `tools/tests/a31-backend.js` (74), `tools/tests/r310flows.js` (demo browser, 55). `r301race.js` skips the staff pages for the superadmin; browser tests set `pcr_guides_off` so the guides don't cover their clicks. |

## 3.0.1 hotfix — My boat bookings console error, superadmin code box (2026-09-28)

| ID | Change |
|----|--------|
| C131 | **My boat bookings**: leaving the page (Home / Boat / More…) before the bookings finished loading threw `Cannot set properties of null (setting 'innerHTML')` in `renderMyBookings` (its `#mb-root` box was already replaced by the new page) and showed a stray “Could not open My boat bookings” toast. It now keeps its own box and quietly stops if that box is gone. Same guard for the other screens that fill a box after loading: Suggestions, Reminders (classic), Meal statistics (classic), Staff directory (classic; also no error on a first visit with no saved list), Reports / Meal report “Generate”, and Boat (no longer paints over the page you moved to). Frontend only — backend stays 3.0.0. |
| C133 | **Superadmin code box**: making someone Admin / Superadmin (Users & roles → Edit → Save) said “Enter the superadmin code” but never showed a box to type it, so the change could not be saved (same for Delete user, App settings, Role migration, Archive). The code box now opens on top of the Edit window (which stays open with its ticks); Cancel sends nothing, a wrong code shows the server error. Other role-only actions are unchanged (no code asked). |
| C132 | Tests: `tools/tests/r301race.js` (demo; slow API simulated, leave each page while loading — every role), `tools/tests/r301code.js` (code box: cancel / wrong code / right code / restore), `archive.js` types the code. Rollback: gh-pages 1be1334 (3.0.0 = main e6e030d). |

## 3.0.0 — Roles, meal times, Brevo email, one Meals page (2026-09-28)

| ID | Change |
|----|--------|
| C120 | **Role model**: superadmin, admin, HOD, assistant HOD, chef, boat manager, boat captain, staff — one person can hold several roles (`roles` column). Everyone uses the normal staff layout (Home · Meals · Boat · More); roles only add buttons in **More**: Admin Settings, Kitchen Admin, Boat Admin, Department Admin. Superadmin keeps Dashboard · Approvals · Manage · More. Stations (shared chef/boat logins) removed. |
| C121 | Role pages need the signed session token from login; an expired/missing token asks for the password again (staff pages keep working). |
| C122 | Superadmin **Role migration** (Manage): preview, then apply — copies the Users tab to “Users backup …” first; nobody gains or loses a role. |
| C123 | **Meal times** (Kitchen Admin): dinner orders close **11:55pm** the day before, late requests until **8:00am** on the dinner day; breakfast & lunch late requests until midnight. At the late close late requests are **approved automatically**, added to the list and the dinner summary/PDF re-saved (extra run at 11:55pm). All times editable. |
| C124 | **Meals page** rewritten: my meals today/tomorrow with countdowns and tomorrow's menu, Dinner (tonight + tomorrow), Lunch, Breakfast, Late Meal Request forms, feedback to the chef, and an “order completed” overlay (CSS only, respects reduced motion). |
| C125 | **Kitchen Admin**: lists & saved summaries, late/special requests, **7-day dinner menu editor** (add/rename/reorder/hide/delete per weekday), meal times, **Not on the menu** list, food feedback, meal statistics, meal on behalf; today/tomorrow orders with Served / **Cancel**. |
| C126 | **Cancel with reason** always stores the reason (+ who/when) on the order row (columns added if missing). Kitchen Admin/admin cancel notifies the staff member in-app; admin/superadmin can also notify another chosen user, add a message, or send nothing. Admin/superadmin can send an in-app notification to any user from Users & roles. |
| C127 | **Boat Admin** (boat manager/captain): runs & passengers, PDFs, emergency travel; staff Boat tab never shows role tools. **Department Admin** (HOD/assistant HOD): approvals, staff, updates, leave calendar & summary, meal on behalf. No department join approval any more. |
| C128 | **Email**: Brevo is the primary sender (API key in Script Properties), MailApp fallback; superadmin test email + status in App settings. Login box says “Email”. |
| C129 | 2.10.2 menu-day fix carried into 3.0: dropdown shows only the dinner date's weekday menu, server rejects off-menu dishes (“That dish isn't on <Day>'s menu – please pick again” + menu reload), prep lists/summaries flag off-menu orders separately, sortOrder NaN → 99. |
| C130 | Tests: `tools/tests/v300-backend.js`, `tools/tests/r300flows.js` (demo browser, every role), `dinner-menu-day.js`, `menu-day-demo.js`. Rollback: backend deployment @40, gh-pages 2d2f8fd, tag `v2.10.2-pre-3.0`. |

## 2.10.2 hotfix — Dinner menu day fix (2026-09-28)

| ID | Change |
|----|--------|
| C110 | Dinner form: the phone's saved "last dinner" dish (and **Same as last time**) is only used if that dish is on the **service-date (tomorrow's) menu**. Before, a dish not on tomorrow's menu was injected into the dropdown and pre-selected, so today's dish was booked for tomorrow (live 28 Sep: 16 off-menu Sunday dishes on Monday's list, 15 of them the person's previous-day dish). |
| C111 | Backend `placeDinnerOrder` rejects a dish that is not on the service-date weekday menu (`notOnMenu`, case/space-insensitive; re-saving your current dish still allowed; weekday with no menu rows accepts anything as before). App shows “That dish isn't on <weekday>'s menu – please pick again” and refreshes the menu. Demo mode mirrors it. |
| C112 | Kitchen Admin menu edit: a non-number sort order is saved as 99 (was written as `#NUM!`). |
| C113 | Tests: `tools/tests/dinner-menu-day.js` (backend, fake sheet), `tools/tests/menu-day-demo.js` (demo browser). Rollback tag `v2.10.1-pre-menufix`. |

## 2.10.1 hotfix — Kitchen order summaries by date (2026-09-28)

| ID | Change |
|----|--------|
| C105 | Kitchen page: new **Order summaries by date** card at the top — chips for the last 3 days, today (“Tonight”) and tomorrow. Picking a date shows the dinner total, dish counts, allergy/special-note count, and **Print / Download PDF / View PDF** of the usual Dinner Prep List for that dinner date (same builder as before), plus breakfast & lunch headcounts for that date with Print / PDF. Chef, HOD, admin, superadmin (same people who see the Kitchen page). |
| C106 | Backend `getKitchenDaySummary` (read only — never approves or rewrites orders): uses the saved snapshot for that date when there is one, else builds it live from the order rows. “Show live orders instead / Show saved 8pm summary” switch when both exist. |
| C107 | Automatic save at the 8pm Fiji cutoff: the first app request after 8:00pm saves tomorrow’s dinner summary into the existing **Dinner Prep Snapshots** tab (no new permission needed); optional time trigger `dinnerSummaryTick` ~8:10pm Fiji. The 2.10.0 8:30pm auto-save now uses the same code with a compact payload split across cells (the old single-cell payload could hit the 50,000-character limit on busy nights and error the Kitchen screen). |
| C108 | PDFs in Drive folder **PCR Kitchen Order Summaries** (script account) + “Saved 8pm PDF” button — active after `setupDinnerSummaries` is run once from the Apps Script editor (authorises Drive + triggers, installs the trigger, backfills the last 3 days). Admin actions `saveDinnerSummary`, superadmin `backfillDinnerSummaries`, `dinnerSummaryStatus`. |
| C109 | Tests: `tools/tests/summaries-unit.js` (backend, fake sheet), `tools/tests/kitchen-days.js` (demo-mode browser: picker, print, PDF). Rollback tag `v2.10.0-pre-hotfix`. |

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


## My Orders summary (2.9.3)

| ID | Change |
|----|--------|
| C100 | **My Orders** — new read-only API action `getMyOrdersSummary` (requester's own email only; ignores other `userEmail`). One call returns Fiji **yesterday / today / tomorrow**: breakfast (status, late, headcount), lunch (status, headcount), dinner (status, late, items), boat bookings on each date (time, route, seats, status), plus tomorrow's cutoff state (B/L open until 1pm, late breakfast 1–6pm, dinner until 8pm). Reads each sheet once (Breakfast/Lunch/Dinner Orders, Boat Bookings, Boat Runs only if the user has bookings); **no** `processDinnerWorkflow` / `processBreakfastWorkflow`, no writes. Pending dinner shows the read-only projection of the 12/17/19 auto-approve waves (`effectiveStatus`). Demo `?demo=1` implements the same action (`buildMyOrdersSummary`). **UI**: Home "My Orders" card under *Do this now* (tomorrow at a glance), More → *My Orders*, and a *My Orders →* link under the Meals pills. Screen: Yesterday · Today · Tomorrow tabs with date labels (e.g. "Thu 24 Sep"); defaults to **Tomorrow** while dinner is still open (before 8pm Fiji), otherwise **Today**. Chips: Confirmed / Waiting chef / Cancelled / Rejected / Not ordered (+ Late). Tomorrow shows *Order now* / *Late request* / *Change / Cancel* → meal tab; yesterday/today read-only. Skeleton, error card with Retry, 2.5-min cache + soft refresh on revisit; meal/boat changes invalidate it. Also fixes Dinner tab showing an older *cancelled* row instead of the re-booked active one (`pickActiveOrder`). |
| C101 | `APP_VERSION` → **2.9.3**; SW cache `pcr-staff-v2.9.3`; Code.gs 2.9.3. SCRIPT_URL / deployment unchanged. `feature_my_schedule` OFF. Dinner=tomorrow only; B/L next-day headcount 1pm; late breakfast 1–6pm Fiji. |

### Rollback / restore (pre-My Orders 2.9.3)

Rollback tag **`v2.9.2-pre-myorders`** (SHA `88f04404a25b50767a852b22683a53fa02751c99`, also branch `backup/2.9.2-pre-myorders`) = live 2.9.2.

```bash
cd /workspace/pcr-staff-app   # or clone PC-Staff-App-V2
git fetch --tags
# rebuild static host from the tag
git checkout gh-pages && git checkout v2.9.2-pre-myorders -- public/ && \
  rm -rf assets index.html manifest.json sw.js 2>/dev/null; cp -a public/. . && rm -rf public && \
  git add -A && git commit -m "Restore public from v2.9.2-pre-myorders" && git push origin gh-pages
git checkout main
# Apps Script (same deployment id)
git checkout v2.9.2-pre-myorders -- apps-script/Code.gs && cd apps-script && clasp push -f && \
  clasp deploy --deploymentId AKfycbzZFZhIgebzM8tegKAmE6ia6hoUD_eyrVBfYUmPS1jW60uV3NSyIkJLq7iZYIrdNi8 -d "rollback 2.9.2"
# verify → version 2.9.2
curl -sSL "https://script.google.com/macros/s/AKfycbzZFZhIgebzM8tegKAmE6ia6hoUD_eyrVBfYUmPS1jW60uV3NSyIkJLq7iZYIrdNi8/exec?action=getVersion"
```


## Kitchen special notes / allergies (2.9.4)

| ID | Change |
|----|--------|
| C102 | **Special notes & allergies reach the kitchen.** *Why they were missing:* dinner had a "Notes / allergies" box (saved to `notes`), but breakfast and lunch had **no note field at all**, and the kitchen outputs mostly dropped the note: the Kitchen screen tables, the Dinner/Breakfast/Lunch **Order List** PDFs + print checklists, the CSV and the Admin → Kitchen tab never rendered it; only the old dinner prep list printed it in a plain "Comments" column (no flag, not at the top), and demo mode's prep list dropped it entirely. Re-booking dinner also opened with an empty note box, so changing a dish silently wiped the note. *Now:* optional **"Special note / allergy"** input (max 200 chars) on Breakfast (normal + late request), Lunch and Dinner; pre-filled with the current note when changing an order; "Your note to kitchen" chip. Stored in new column **`specialNote`** on Breakfast/Lunch/Dinner Orders (header appended at the end of row 1 by `initSheets` and, once per 6h under a script lock, by `assertSheetsReady` → `ensureOrderNoteColumns`; old rows read as empty; `notes` also written for back-compat; legacy dinner `notes` is used as fallback with system text like "order declined…" / "[On behalf by …]" stripped). Latest note wins on change (`noteFromParams`; a cleared box clears it; undo re-places with the previous note). Backend adds `specialNote`, `noteFlag`, `displayName` (current preferredName from Users) to kitchen rows and `specialNotes` lists to `getKitchenDashboard`, `getDinnerPrepList` (`prep.specialNotes`), `getBreakfastOrderSheet`, `getLunchOrderSheet`; `getMyOrdersSummary` meals carry `specialNote`. |
| C103 | **Where the kitchen sees them:** Kitchen screen top card **"Allergies & special requests"** (Dinner / Breakfast / Lunch groups: preferredName · dish · note, late status) + inline chips on every order row and late-request row; Admin → Kitchen tab card; **Dinner Prep List** print / Download PDF / "View all as PDF" / HTML / TXT — notes section at the top + "Special note / allergy" column inline; **Dinner/Breakfast/Lunch Order List** View PDF / Download / Print checklist — notes section at top + note column (incl. late waiting list); CSV gets `specialNote,noteFlag`. Flags by keyword: **red ALLERGY** = allergy/allergic/nut/peanut/gluten/dairy/lactose/shellfish/seafood/egg; **amber DIET** = vegetarian/vegan/halal/no pork; other notes = plain "Request". Cancelled / rejected orders are left out; approved late orders are included (late-pending shown as "late — waiting chef"). Demo `?demo=1` supports notes end-to-end and seeds an allergy (Jone: peanut), dietary (Laisa: vegetarian, Mere breakfast: gluten free) and special requests (Mere: extra gravy, Epi: keep a plate warm, Tomasi lunch: take away). |
| C104 | `APP_VERSION` → **2.9.4**; SW cache `pcr-staff-v2.9.4`; Code.gs 2.9.4. SCRIPT_URL / deployment id unchanged, GET-only `api()`, Fiji time via `getFijiNow`, cutoffs unchanged, `feature_my_schedule` OFF. No user-profile allergy field exists (Users sheet has none) — notes are per order. |

### Rollback / restore (pre-notes 2.9.4)

Rollback tag **`v2.9.3-pre-notes`** (SHA `25947326f4b37d9636c5f8bf0a317abbda14c79e`, also branch `backup/2.9.3-pre-notes`) = live 2.9.3.
The extra `specialNote` sheet column is harmless for 2.9.3 (it reads columns by header name) — no sheet change is needed to roll back.

```bash
cd /workspace/pcr-staff-app   # or clone PC-Staff-App-V2
git fetch --tags
# rebuild static host from the tag
git checkout gh-pages && git checkout v2.9.3-pre-notes -- public/ && \
  rm -rf assets index.html manifest.json sw.js 2>/dev/null; cp -a public/. . && rm -rf public && \
  git add -A && git commit -m "Restore public from v2.9.3-pre-notes" && git push origin gh-pages
git checkout main
# Apps Script (same deployment id)
git checkout v2.9.3-pre-notes -- apps-script/Code.gs && cd apps-script && clasp push -f && \
  clasp deploy --deploymentId AKfycbzZFZhIgebzM8tegKAmE6ia6hoUD_eyrVBfYUmPS1jW60uV3NSyIkJLq7iZYIrdNi8 -d "rollback 2.9.3"
# verify → version 2.9.3 (first call after deploy may still show the old version; repeat)
curl -sSL "https://script.google.com/macros/s/AKfycbzZFZhIgebzM8tegKAmE6ia6hoUD_eyrVBfYUmPS1jW60uV3NSyIkJLq7iZYIrdNi8/exec?action=getVersion"
```

## Speed release (2.10.0)

| ID | Change |
|----|--------|
| C105 | **Instant paint from saved data.** Home, My Orders, Meals (breakfast / lunch / dinner), Boat and Kitchen paint straight away from the last data saved on the phone (localStorage `pcr_v2_pcache:<email>`, per user, owner-checked), then refresh in the background. A small line under the header says "Updated just now" / "Showing saved data from HH:MM · refreshing…" / "Offline — showing saved data from HH:MM". Logout wipes that user's saved data (plus last-dinner / last-boat hints). Saved copies older than 7 days are ignored. |
| C106 | **One bootstrap call.** New backend action `getBootstrap` returns user/profile, feature flags, settings, cutoffs, My Orders summary, this user's breakfast/lunch/dinner orders, 14-day boat runs, dinner menu, reminders, suggestions, role ops cards (admin/HOD full daily ops, boat roles emergency count, superadmin meal stats, chef late/pending counts) and "Do this now" — each sheet read once per request (`REQ_MEMO`). App open now makes **1** backend call for staff (was 19), **2** for chef/admin home (was 16–17; the 2nd is a background prefetch of the Kitchen tab). All old actions still work; the frontend falls back to them if `getBootstrap` is unknown. If the bootstrap gets no reply (120 s timeout / no connection) the screens keep their saved data, the status line says "No reply from server · will retry", the per-screen reads are **not** fired in a burst, and one bootstrap retry runs 30 s later (or on the `online` event). |
| C107 | **Server cache (CacheService, `Speed.gs`).** App Settings / feature flags 10 min, Dinner Menus 10 min, Reminders 5 min, Suggestions 2 min, 14-day `getBoatRuns` result 3 min. Every write through `appendRow` / `updateRowById` / `setSetting` / delete helpers bumps the sheet's cache version (so menu edits, boat run add/edit/remove, dedupe, flag changes and bookings that change seat counts invalidate immediately). Values are chunked at 30,000 chars (max 8 chunks, well under the 100KB/key limit); anything bigger is simply not cached. Cutoff info is pure time maths (no sheet read), so it is not cached; there is no department-list API (the list is fixed in the frontend). |
| C108 | **Self-hosted CSS + icons.** Tailwind CDN (JIT in the browser), Font Awesome CDN, lucide and framer-motion (both unused) removed. `public/assets/app.css` is a prebuilt, purged Tailwind 3.4.17 build (25 KB, ~5.5 KB gzipped); `public/assets/fa/` is Font Awesome 6.5.1 cut down to the 66 icons used (CSS 18 KB + fonts 9.7 KB). Rebuild after adding classes/icons: `cd tools && npm install && npm run build` (fa subset needs `pip install fonttools brotli`). Screenshots of 30 screens (staff, chef, boat captain, boat manager, superadmin) at 390px compared pixel-by-pixel before/after: identical apart from the version text and a few antialiased pixels. |
| C109 | **App shell stored on the phone.** `sw.js` precaches index.html, manifest, CSS, icon fonts, logo and login photo and serves them cache-first with background revalidation. A new release installs in the background and waits; the app shows **"Update available — tap to refresh"**. Cache name `pcr-staff-v2.10.0` (old caches deleted on activate). Apps Script / Google hosts are never handled or cached by the SW. CSS links carry `?v=<version>`; the SW is registered after page load so first paint isn't slowed. Signed-in opens no longer download the 130 KB login photo. |
| C110 | **Archive old rows (superadmin).** Action `archiveOldRows` (superadmin passcode) moves rows older than 60 days from Dinner / Breakfast / Lunch Orders, Boat Bookings (dated by their run) and Boat Runs into `Archive_<sheet>` tabs: copy → read back and verify count + ids → delete bottom-up → verify source count, all under a script lock; cache invalidated. `dryRun=1` only reports counts (plus oldest row date and rows without a date). Admin → Settings / Features → "Archive old rows": dry run first, then "Archive now…" with a confirm tick-box. **Not run on the live sheet** — 25 Sep 2026 dry run: 0 rows older than 60 days on every sheet (oldest data 10–15 Sep 2026). |
| C111 | **Offline order queue.** Meal orders (breakfast / lunch / dinner), dinner cancel / change, meal cancel and boat book / cancel that fail for lack of connection are saved per user (`pcr_v2_queue:<email>`) with a unique `clientRequestId`, shown as **"Waiting to send"** on My Orders, Home and the relevant tab, and sent automatically (online event, app open, every 30 s while visible, "Send now"). The backend is idempotent on `clientRequestId` (script lock + `Request Log` sheet + cache): a re-send returns the stored result with `duplicate:true`, never a second order. Cutoffs are still enforced on arrival; a queued item whose service date has moved on (or a boat run already gone) comes back as **"Didn't go through — cutoff passed"**. Admin / kitchen approvals are never queued. |
| C112 | Allergy keywords widened: red adds prawn, crab, lobster, fish, soy/soya, sesame, coconut; amber adds "no beef", "pescatarian". |
| C113 | `APP_VERSION` → **2.10.0**; SW cache `pcr-staff-v2.10.0`; Code.gs 2.10.0 (+ new `Speed.gs`). SCRIPT_URL / deployment id unchanged, GET-only `api()`, Fiji time via `getFijiNow`, cutoffs unchanged (B/L 1pm, late breakfast 6pm, dinner 8pm), `feature_my_schedule` OFF. |

### Rollback / restore (pre-speed 2.10.0)

Rollback tag **`v2.9.4-pre-speed`** (SHA `db391932d9a9922d9fe16d053d057b4afad545b0`, also branch `backup/2.9.4-pre-speed`) = live 2.9.4.
The new `Request Log` / `Archive_*` tabs are harmless for 2.9.4 and can stay. The 2.9.4 service worker takes over by itself (it calls skipWaiting), so phones return to 2.9.4 within one or two opens.

```bash
cd /workspace/pcr-staff-app   # or clone PC-Staff-App-V2
git fetch --tags
# rebuild static host from the tag
git checkout gh-pages && git checkout v2.9.4-pre-speed -- public/ && \
  rm -rf assets index.html manifest.json sw.js 2>/dev/null; cp -a public/. . && rm -rf public && \
  git add -A && git commit -m "Restore public from v2.9.4-pre-speed" && git push origin gh-pages
git checkout main
# Apps Script (same deployment id) — remove Speed.gs, restore 2.9.4 Code.gs
git checkout v2.9.4-pre-speed -- apps-script/Code.gs && rm -f apps-script/Speed.gs && cd apps-script && clasp push -f && \
  clasp deploy --deploymentId AKfycbzZFZhIgebzM8tegKAmE6ia6hoUD_eyrVBfYUmPS1jW60uV3NSyIkJLq7iZYIrdNi8 -d "rollback 2.9.4"
# (quicker backend-only alternative: redeploy the old version: clasp deploy --deploymentId <same id> -V 34)
# verify → version 2.9.4 (first call after deploy may still show the old version; repeat)
curl -sSL "https://script.google.com/macros/s/AKfycbzZFZhIgebzM8tegKAmE6ia6hoUD_eyrVBfYUmPS1jW60uV3NSyIkJLq7iZYIrdNi8/exec?action=getVersion"
```
