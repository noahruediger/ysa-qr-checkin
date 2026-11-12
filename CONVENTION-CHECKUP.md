# Convention checkup

Things that can't be done from code. Work through them before the convention, roughly in this order.
(Made overnight on 12–13 Nov alongside PR #2. The README explains each feature in more detail.)

## 1. Merge the overnight work
- [ ] Read the PR #2 summary, then merge `overnight-fixes` into `main`. GitHub Pages updates the live app in a minute or two.
- [ ] On each phone, open https://noahruediger.github.io/ysa-qr-checkin/ once with internet. That installs the offline copy (Settings → Install on this phone shows "Offline copy ready").

## 2. Update the Apps Script (test Sheet first, then the real check-in Sheet)
- [ ] Extensions → Apps Script: replace `Code.gs`, `Walkin.gs`, `Problems.gs`, `Staff.gs` with the new versions from `apps-script/`.
- [ ] Add 4 new script files with these exact names and paste them in: `Live`, `Log`, `Import`, `Admin`.
- [ ] Project Settings → time zone **Australia/Brisbane**.
- [ ] Deploy → Manage deployments → Edit → **New version** (the /exec URL stays the same).
- [ ] Run `fixStampColumns` once (turns old number timestamps into readable text).
- [ ] The test Sheet's Dashboard tab is already fixed (done overnight). On the real check-in Sheet, run `buildDashboard` once.
- [ ] Optional but recommended: Script Properties → add `ACCESS_CODE`, then enter it on each phone (Settings → Access code → Connect), or reshare the setup QR, which now includes the code.

## 3. Real registration data
- [ ] Make a new Google Sheet you own for check-in (e.g. "YSA Check-In LIVE"), with the Apps Script set up as in step 2 and deployed as a web app.
- [ ] Script Properties: `SOURCE_SHEET_ID` = `17tJUBu32rcJZ9RcO72lDTrxGozCN7kWTpXx2tR6sT-k` (the form responses sheet; you only have view access, which is enough).
- [ ] Run `syncFromForm` once, then `installSyncTrigger` once (re-imports every 5 minutes).
- [ ] Spot-check 5–10 people on the Registrants tab: QR ID, name, ward/stake, dietary, allergy, pickup time, photo link.
- [ ] Fill in the **Team** column (the form doesn't ask for it).
- [ ] Photos: the real photos are in the admin account's Drive. Make sure your account can at least view that upload folder, run `testDriveAccess` once, then open a few people in the app to check their photos show. Some are iPhone HEIC files: the app shows Drive's JPEG version of those.
- [ ] Ask the responses sheet's owner (brisysaconadmin@gmail.com) to set its time zone to Brisbane and locale to Australia (it's Port Moresby / US now, so dates like 16/04/2006 can be misread).
- [ ] Point every phone at the new Sheet's /exec URL (Settings → Share QR code from your phone makes this quick).

## 4. Decisions only you can make
- [ ] **Activity booking**: the code is still there, but there's no button for it in the app anymore and no way to cancel a booking. The test data is also way over capacity (e.g. Talent Show 190 booked for 12 spots). Do you still want booking at the convention? If yes, it needs a booking screen. If no, it can be removed.
- [ ] Who is **Admin** (only Admin phones can Reset printing once an Admin exists).
- [ ] Whether lanyards should print the new **ALLERGY** badge (Print → layout options → Allergy pill; off by default).

## 5. Test with real phones (30 minutes, worth it)
- [ ] One iPhone + one Android: scan codes and listen for the different sounds (Settings → Scan sounds → Test). iPhone: silent switch off; it beeps but can't vibrate.
- [ ] Scan someone twice: the second scan should say "Already checked in at … by …".
- [ ] Phone A: mark someone lost. Phone B should show the red LOST banner within ~10 seconds.
- [ ] People tab: type a phone number like `0412 345 678` or an email and check the person comes up.
- [ ] Airplane mode on, close and reopen the app: it should open with the saved list and say Offline. Tick something, turn airplane mode off, and check it reaches the Sheet.
- [ ] Laptop: open the app full-screen and check the sidebar, the dashboard team bars and the Print tab preview.
- [ ] Print one real sheet of lanyards and measure a card (should be 82 × 130 mm). Compare it to the on-screen preview.
- [ ] Check the new `Log` tab fills in as people use the app.

## Notes from the overnight run
- Everything was tested on a copy of the backend running in node (`.overnight/test-backend.js`) and in headless Chrome against it (`.overnight/smoke.py`, `.overnight/offline-test.py`), not on real phones or the live Google deployment.
- The `.overnight/` folder only holds the work plan and test tools. It can be deleted after merging if you like.
