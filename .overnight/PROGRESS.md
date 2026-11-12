# Overnight work plan — branch `overnight-fixes`

Noah asked (12 Nov 2026, 10:30pm Brisbane) for every bug and problem from the audit to be fixed,
plus the features below. He is asleep and **must not be asked questions**. Make the reasonable call,
write down what you decided in the log at the bottom, and keep going.

Anything that can't be done from here (needs his Google account, the real sheet owner, a phone in
hand, a deploy) goes into `CONVENTION-CHECKUP.md` at the repo root.

## Rules for every run (read first)

1. Work on branch `overnight-fixes` only. **Never push to `main`** (GitHub Pages serves main = live app).
   One PR `overnight-fixes → main`; open it as a draft if it doesn't exist yet. Don't merge it.
2. **Lock:** `.overnight/LOCK` holds an ISO UTC time. If it is less than 25 minutes old, another run is
   working: stop straight away without changing anything. Otherwise write the current UTC time to it,
   commit "overnight: take lock" and push before doing any work. Refresh LOCK on every commit.
   Commit + push **at least every 15 minutes** (small commits) so the next run can pick up if usage runs out.
3. Take the first unchecked item below, do it, tick it `[x]`, add a line to the Log, commit, push. Repeat.
4. Browser smoke test: `python3 .overnight/smoke.py /tmp/smoke` (headless Chrome at /usr/bin/google-chrome against
   `.overnight/mock-server.js`, which runs the real .gs files on an in-memory Sheet). Add scenarios via
   `SMOKE_EXTRA=file.py` (see smoke-lost.py). Look at the screenshots. Backend unit tests: `node .overnight/test-backend.js`.
5. Commit with `.overnight/commit.sh "message"` (runs checks, refreshes LOCK, pushes).
   Check your work: `node --check` on the JS pulled out of index.html (see `.overnight/check.sh`), and
   test the Apps Script logic in node with the mock in `.overnight/` where practical.
5. Keep the code style: plain ES5-ish JS in one `index.html`, no build step, no frameworks.
   Apps Script files stay ES5 (`var`, no arrow functions) so they paste into the editor.
6. Keep README.md up to date with anything that changes how to set up or use the app.
7. When every item is ticked: clear LOCK (write `done`), update the PR description with a plain-English
   summary for Noah (what changed, what he must do — point to CONVENTION-CHECKUP.md), push, stop.

## Items (in priority order)

### Backend bugs (apps-script/)
- [x] B1 `doPost`: move `lock.waitLock` inside try (use `tryLock(20000)`), return `{ok:false,error:'busy'}` JSON instead of an HTML error page; client treats `busy` as retryable.
- [x] B2 `markPrinted`: build a QR ID → row index once, write the two columns in one `setValues` each (like `resetPrinted`). No per-cell writes.
- [x] B3 `ensureColumns_` only when columns are actually missing; don't write on every `list` (cache the check in `CacheService` for 10 min).
- [x] B4 Revision counter: every write bumps a number in `PropertiesService` (script props) + CacheService. New cheap `doGet action=rev` returns `{rev, lost:[ids+name+at+by], serverTime}`. App polls `rev` every ~8s and only pulls the full list when rev changed (or every 2 min as a safety net). Fixes the "every phone pulls 1,300 rows every 25s" problem and powers the lost alert.
- [x] B5 Audit trail: client sends `by` (staff name) + `deviceId` on every POST. Server writes `Checked In By`, `Lost By`, `Pack Given By`, `Shirt Given By`, `Picked Up By` columns (auto-added) and appends to a `Log` tab: Time, Staff, Device, Action, QR ID, Name, Detail. Batch-friendly (appendRow is fine).
- [x] B6 Optional access code: if Script Property `ACCESS_CODE` is set, every GET/POST must carry `key` equal to it, else `{ok:false,error:'locked'}`. App: Settings field for the code, stored in localStorage, included in the setup QR. `resetPrinted` additionally requires role Admin from the Staff tab (deviceId lookup). Document in README.
- [x] B7 Allergies + medical: registrant JSON gets `allergy` (detail text or null when Allergies != Yes) and `medical` (true if Medical / Disability Notes non-empty). Header lookup must tolerate both test names and real-form names (see B9 aliases).
- [x] B8 Search by phone/email: `doGet action=search&q=` (server side, so phones/emails aren't bulk-sent). Matches digits-only phone (last 6+ digits, ignores +61/0 prefix) and email substring, plus name. Returns up to 20 registrants.
- [x] B9 Real form sheet support: new `Import.gs`. Script Property `SOURCE_SHEET_ID` (+ `SOURCE_TAB`, default `DO NOT EDIT!!! LIVE DATA`). `syncFromForm()` reads the source, maps form questions → canonical headers via an alias table (regexes for "Ward/ Branch:", "Will you need transportation from the airport?", etc.), and upserts into `Registrants` keyed by Email (fallback: timestamp+name). New people get the next `YSA-####` QR ID (stable, never reused, counter in script props). Never touches app-owned columns (Checked In, Lost, Pack, Shirt, Printed, Picked Up, Team, Bookings…). `installSyncTrigger()` adds a 5-minute time trigger. Also `col_` must stay strict only for QR ID; other missing columns → null not a crash.
- [x] B10 `fixStampColumns()` one-off: turns raw serial numbers in any "… At" column into "d MMM, h:mm a" text.
- [x] B11 `buildDashboard()` one-off: rewrites the Dashboard tab with header-based formulas (MATCH on row 1) so it works on any column layout; also counts allergies, lost, picked up, walk-ins, per-team checked in.
- [x] B12 Set the TEST sheet time zone to Australia/Brisbane + en_AU locale (done via Sheets API from the first session if possible — see log).

### Front-end bugs (index.html)
- [x] F0 answerTask: only send `uncheckin` when this phone's own tick caused the check-in (i.e. person was not checked in before any tick, or checkedInBy came from a task). If they were checked in some other way, unticking/ticking leaves Checked In alone.
- [x] F0b Walk-in sign-ups survive a reload: keep pending `registerWalkin` in localStorage (photo downscaled to ≤ 400px JPEG so it fits), retried by the durable queue.

### Features
- [x] F1 Sound + vibration on scan. Web Audio (unlock AudioContext on the scan-button tap), `navigator.vibrate` where supported (not iPhone). Distinct: success (two rising beeps), already checked in (two flat mid beeps + double buzz), LOST person scanned (urgent triple), unknown code (low buzz, long vibrate), walk-in blank card (single soft beep). Settings toggle "Scan sounds" (default on).
- [x] F2 "Already checked in at 9:42 by Ella" warning on the scanned screen (amber banner + the warning sound), using Checked In At / Checked In By. Also show "by X" on lost/pickup/pack/shirt times where known.
- [x] F3 Installable + offline: `manifest.webmanifest`, icons (generated PNGs 192/512 + apple-touch-icon), `sw.js` (cache app shell + vendored libs; network-first for index.html with cache fallback; never cache the Apps Script API). Vendor qrious + jsQR into `vendor/` (npm) instead of CDN. Register SW in index.html. Add "Install app" hint in Settings.
- [x] F4 Search by phone or email at the desk: People-tab search box also hits B8 when the term looks like a phone/email (debounced), shows results under "From the Sheet".
- [x] F5 Lost-person alert on every phone: from the B4 `rev` poll, when a new lost ID appears show a red banner at the top of every screen ("LOST: Jane Doe — Team Blue · tap to view"), with sound/vibration once; dismiss per person; clears when found.
- [x] F6 Laptop view (≥ 1024px wide): left sidebar nav instead of bottom tab bar, content uses the full width (people list as a multi-column grid/table, person screen two-column, dashboard cards in a grid). Phones unchanged.
- [x] F7 Print screen on laptop: settings panel and a live one-A4-page preview side by side, preview re-renders as options change (uses the same card renderer as printing, scaled to fit). Settings panel stays open. Phones keep the current flow.
- [x] F8 Allergy / medical badge on the scanned screen (red "ALLERGY: bee sting" pill, "Medical notes — see Details"), in the people list, and an optional ALLERGY badge on printed cards (preset toggle).

### Wrap-up
- [x] W1 README updated (new tabs/columns/properties, access code, offline/install, import from form, laptop view).
- [x] W2 CONVENTION-CHECKUP.md complete and accurate.
- [x] W3 Final check: `.overnight/check.sh` passes, PR description written, LOCK = `done`.

## Log
- 2026-11-12 12:35 UTC (first session) — Plan written. Hourly scheduled runs created 11:40pm–4:40am Brisbane. Noah said not to ask anything.
- 12:45 UTC — B1 (tryLock → 'busy' JSON), B2 (batch markPrinted), B3 (column check cached 10 min) done; client fetch timeout 30/45 s added so a hung request can't block the queue. B12: TEST sheet set to Australia/Brisbane + en_AU via Sheets API.
- 13:10 UTC — B4 (Live.gs: rev counter, cheap `rev` poll every 8 s, full refresh only on change + every 2 min, onEdit bumps rev), F5 (red LOST banner on every phone, dismiss per report, beeps once), F1 (Web Audio beeps + vibration, Settings toggle + Test). doPost now routes through handlePost_() so REV_ACTIONS bump in one place. Added gas-mock.js, mock-server.js, smoke.py test harness. Added apiUrl() + ACCESS_KEY var (used fully in B6).
- 13:35 UTC — B5 (Log.gs + *By columns; apiPost stamps by/deviceId), B7 (allergy/medical in registrant JSON; HEADER_ALIASES in headerMap_ so real form headers work; reads tolerate missing columns; Activities tab optional; app-owned columns auto-added), F0 (untick only undoes a list-made check-in), F2 (amber 'Already checked in at … by …' on scanner opens + 'by X' on ticks/lost). F8 partly: allergy + medical pills on scanned screen (people list + print badge still to do). Renamed my banner CSS to .lostbar* (.alert-lost already existed).
- 13:45 UTC — B6: ACCESS_CODE script property gate (keyOk_ in doGet/doPost → 'locked'); app Settings 'Access code' field, apiBase()/apiUrl() add key to every GET, rawPost adds key to body; setup QR = URL#key=CODE, parsed on connect; resetPrinted requires an Admin device (if any Admin exists). Friendly messages for locked/busy/admin only.
- 13:55 UTC — B8 (searchPeople_: phone digits incl. +61/spaces, emergency phone, email, name; 20 max) + F4 (People search hits the Sheet for phone/email/unknown names, debounced; 'Matched in the Sheet' section). People list now capped at 200 rows (perf with 1,300) and shows allergy/In pills + team.
- 14:10 UTC — F3: manifest.webmanifest, icons/ (generated), sw.js (shell precache, network-first index with 4 s fallback, fonts cache-first, never caches /exec or script.google.com), vendor/ qrious + jsQR (licences included), Settings 'Install on this phone' card (beforeinstallprompt / iOS instructions / offline-ready status). Also: last full people list saved to localStorage (qrCheckinPeopleCache) and used when the Sheet can't be reached at boot → app fully usable offline. Test: `python3 .overnight/offline-test.py`. If sw.js changes, bump VERSION.
- 14:15 UTC — F0b: walk-ins were already saved in localStorage (qrCheckinWalkins, photo ≤480px) and sent at boot; now also re-sent after every good refresh, with an in-flight guard.
- 14:30 UTC — F6: ≥980px = full-screen grid with left sidebar (title, Scan / enter ID button, tabs), content up to 1200px; people/other lists as card grids; dashboard 2-col with 4 stat tiles; person page in two columns (.person-layout/.person-col-a/b, phone order unchanged). 521–979px = full-screen with bottom bar, content centred ≤760px. #screen gets class screen-<tab|screen> for per-screen CSS. Dashboard now also: still to arrive, airport pickups done, checked in by team (all sizes).
- 14:50 UTC — F7: print card/page CSS moved out of @media print (print-only bits remain inside), renderPrintCards(ids, st, target) draws page 1 into #printPreview scaled to fit; on ≥980px the Print tab is two columns (options always open + list | sticky A4 preview), number inputs update the preview on every keystroke (input event), everything else re-renders on change. Shows selected people, or a sample page if none ticked. F8: allergy pill on scanned screen (done earlier), 'Allergy' pill in People list, optional 'Allergy pill' print toggle (showAllergy, off by default) on cards incl. fold-over.
- 15:00 UTC — B9: Import.gs syncFromForm() (SOURCE_SHEET_ID/SOURCE_TAB props; maps real form headers via HEADER_ALIASES; photo upload → Photo URL; key = email or timestamp+name; new people get YSA-#### from nextQrNumber prop; only form columns rewritten, app columns untouched; idempotent; bumps rev). installSyncTrigger()/removeSyncTrigger() (5 min). Tested in node against the real header list.
- 15:10 UTC — B10/B11: Admin.gs fixStampColumns() + buildDashboard() (header-based INDEX/MATCH formulas + team table). Dashboard formulas verified live on the TEST sheet (written via Sheets API: 1000 registered / 102 in / 370 allergy — correct). NOTE for later runs: a Sheets 'clear' call was blocked by the permission classifier as an external write, so don't write to the Sheets again; the test sheet is done. Added isDate_() (cross-context-safe) used by asAppTime_.
- 15:25 UTC — W1 README rewritten for all new features/setup; W2 CONVENTION-CHECKUP.md complete; W3 all checks pass (14 backend tests, 4 browser scenarios at phone+laptop, offline reload). HEIC photos now go out as Drive JPEG thumbnails. Everything done in the first session; scheduled runs cancelled. LOCK = done.
