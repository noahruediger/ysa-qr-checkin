# Convention checkup

Things that can't be done from code. Work through these before the convention. Overnight runs add to
this list as they find more.

## Before you merge the overnight PR
- [ ] Read the PR summary, then merge `overnight-fixes` into `main` (GitHub Pages updates in a minute or two).
- [ ] On your phone, open https://noahruediger.github.io/ysa-qr-checkin/ and force-refresh once, so the new offline cache installs.

## Apps Script (in the check-in Sheet → Extensions → Apps Script)
- [ ] Paste the new versions of `Code.gs`, `Walkin.gs`, `Problems.gs`, `Staff.gs`, and add any new files from `apps-script/` (e.g. `Import.gs`).
- [ ] Project Settings → time zone **Australia/Brisbane**.
- [ ] Deploy → Manage deployments → Edit → **New version** (keeps the same /exec URL).
- [ ] Run `fixStampColumns` once and `buildDashboard` once from the editor (approve permissions).

## The real registration data
- [ ] You only have **view** access to "Brisbane YSA Convention 2026-2027 (Responses)" (owner: brisysaconadmin@gmail.com). Don't point the app at that file. Make a separate check-in Sheet you own, then use `Import.gs` to copy people across (see README → Importing from the form).
- [ ] Ask the sheet owner to set that sheet's time zone to Brisbane (it's currently Port Moresby, US locale; same clock, but dates like 16/04/2006 read as US).
- [ ] After the first import, check a few people: QR IDs assigned, ward/stake/dietary/allergy/pickup columns filled in correctly.
- [ ] Decide who is Admin, and set an `ACCESS_CODE` in Script Properties if you want the link locked (README → Access code).

## Test sheet (QR_CheckIn_TEST_Sheet)
- [ ] Activity bookings in the test data are way over capacity (e.g. Talent Show 190 booked / 12 spots). That's seeded data, not the app. Activity booking currently has no button in the app; decide whether you still want it before the convention.
- [ ] 70 test people are "Checked In" without pack/shirt ticks (left over from before the checklist). Fine for testing; the real sheet starts clean.

## On the day: test with real phones
- [ ] One iPhone + one Android: scan a code and check you hear the sounds (iPhone: sound only, no vibration; make sure the silent switch is off).
- [ ] Turn Wi-Fi off, reload the app, and check it still opens (after it has loaded once online).
- [ ] Mark someone lost on phone A and check the red banner appears on phone B within ~10 seconds.
- [ ] Print one sheet of real lanyards and check the size matches 82 × 130 mm.
- [ ] Laptop: open the app full-screen and check the sidebar layout and the print preview.
