# YSA QR Check-In

A phone-first check-in app for the Brisbane YSA Convention. Staff scan the QR code on a lanyard to check people in, flag lost people, tick off airport pickups, and print lanyards. Everything reads and writes live to a Google Sheet.

- `index.html` — the app (one file, runs in any phone or laptop browser)
- `sw.js`, `manifest.webmanifest`, `icons/`, `vendor/` — make it installable and let it open with no signal (see **Offline and installing**)
- `apps-script/Code.gs` — the backend that connects the app to the Google Sheet
- `apps-script/Walkin.gs`, `Problems.gs`, `Staff.gs`, `Live.gs`, `Log.gs`, `Import.gs`, `Admin.gs` — walk-in sign-ups, problem reports, the staff access list, live updates and lost alerts, the audit log, importing from the registration form, and one-off admin tools (add them all next to Code.gs)
- `CONVENTION-CHECKUP.md` — the to-do list before the convention

Without a backend connected, the app runs on built-in demo data.

## Setup

### 1. Make the Google Sheet

Create a Google Sheet with a tab named exactly `Registrants` (or let `Import.gs` create it, see **Importing from the registration form**). The script finds columns by their header name (row 1), so column order doesn't matter and extra columns are fine.

**Registrants** — one row per person. Required headers:

| Header | What goes in it |
| --- | --- |
| `QR ID` | Unique ID printed in the QR code, e.g. `YSA-0001` |
| `First Name`, `Last Name`, `Preferred Name` | Preferred Name is shown if filled in |
| `Ward`, `Stake`, `Team` | |
| `Dietary Restrictions`, `Dietary Detail` | `Yes`/`No`, then the detail |
| `Airport Pickup Needed`, `Pickup Time` | `Yes`/`No`, then e.g. `9:00 AM` |
| `QR Printed`, `QR Printed At` | Filled in by the app |
| `Checked In`, `Checked In At` | Filled in by the app |
| `Lost`, `Lost At` | Filled in by the app |

Any app column that's missing (`QR Printed`, `Checked In`, `Lost`, `Team`, `Photo URL`, `Picked Up`, `Pack Given`, `Shirt Given`, the `… At` and `… By` columns) is added automatically the first time the script runs (`Walk-in` and `Registered At` are added with the first walk-in). Every other column (phone, emergency contact, allergies, etc.) shows up on the person's Details page in the app.

### 2. Add the Apps Script

1. In the Sheet, go to **Extensions → Apps Script**.
2. Delete what's in `Code.gs` and paste in the contents of `apps-script/Code.gs` from this repo. Then add the other script files (+ next to Files > Script) named `Walkin`, `Problems`, `Staff`, `Live`, `Log`, `Import` and `Admin`, and paste in the matching files. Save.
3. Set the time zone under **Project Settings** to **Australia/Brisbane** so timestamps are right (and the Sheet itself under File → Settings). After updating these script files, use **Deploy → Manage deployments → Edit → New version**.

### 3. Deploy it as a web app

1. Click **Deploy → New deployment**, choose type **Web app**.
2. Execute as: **Me**. Who has access: **Anyone**.
3. Click **Deploy**, approve the permissions, and copy the **/exec URL**.

After editing the script later, use **Deploy → Manage deployments → Edit → New version** so the same URL keeps working.

### 4. Connect the app

1. Open the app on the phone: https://noahruediger.github.io/ysa-qr-checkin/
2. Go to **Settings**, paste the /exec URL, and tap **Connect**. The box in the top right says **Online** once it's live.
3. Type your name and pick your role (Admin, Security or Other) when asked.

The URL is saved on that phone only. To set up another phone quickly, use **Settings → Share QR code** on a connected phone: step 1 opens the app, step 2 is a setup QR they scan from **Settings → Scan setup QR code** on their phone.

### Importing from the registration form

The real registrations live in the form's responses sheet, which belongs to the convention admin account. Don't point the app at that file. Keep a separate check-in Sheet you own and copy people across with `Import.gs`:

1. In the check-in Sheet's Apps Script: **Project Settings → Script Properties → Add**: `SOURCE_SHEET_ID` = the ID from the responses sheet's URL (between `/d/` and `/edit`). If the tab isn't called `DO NOT EDIT!!! LIVE DATA`, also add `SOURCE_TAB`.
2. Run `syncFromForm` once from the editor (approve permissions). Everyone appears on the `Registrants` tab with a QR ID (`YSA-0001`, `YSA-0002`, …) and the form questions turned into the app's columns (Ward, Stake, Dietary, Allergies, Airport pickup, Photo …).
3. Run `installSyncTrigger` once. From then on it re-imports every 5 minutes, so late registrations and edits reach every phone by themselves. (`removeSyncTrigger` stops it.)

The import matches people by email, never deletes anyone, and never touches the columns the app writes (Checked In, Lost, Pack/Shirt, Printed, Team, Picked Up …), so it's always safe to run again. A person keeps their QR ID for good. Your account only needs view access to the responses sheet.

The script also understands the form's own question headers directly (e.g. "Ward/ Branch:"), so a Sheet that still has them works too.

### Access code (optional, recommended)

Anyone with the /exec link can otherwise read the Sheet through it. To lock it: **Project Settings → Script Properties → Add** `ACCESS_CODE` = any code (e.g. `ysa2026`). Then on each phone, enter the code under **Settings → Access code** and tap **Connect**. The setup QR from **Settings → Share QR code** includes the code, so scanning it sets up both.

Only phones listed as **Admin** on the `Staff` tab can use **Reset printing** (once at least one Admin exists).

### One-off tidy-ups (Admin.gs)

- `fixStampColumns`: turns old timestamps saved as numbers (e.g. `46279.45903`) into readable text.
- `buildDashboard`: rebuilds the `Dashboard` tab with live counts (registered, checked in, lost, printed, pack/shirt, pickups, dietary, allergies, walk-ins, and checked in per team). It finds columns by header name, so column order doesn't matter.

## Photos

The app shows a profile photo for each person from the `Photo URL` column, or from the registration form's photo upload column (Google Drive links). If there's no photo, it shows initials.

- For private Drive photos, run `testDriveAccess` once from the Apps Script editor to grant Drive access.
- For test data only, run `seedStockPhotos` to fill `Photo URL` with stock portraits.
- Columns matching `HIDE_COLUMNS` in the script (ID photos, passports, licences) are never sent to phones. Edit that list to hide anything else.

## Keep the /exec URL private

Unless you set an access code (see **Access code** above), anyone with the /exec URL can read the Sheet's data through it, including names, phone numbers and emergency contacts. Don't commit it to this repo or post it publicly. Only share it with staff who need it. If it leaks, create a new deployment and archive the old one.

## Printing lanyards

The **Print** tab prints QR lanyard cards (82 × 130 mm, 4 per A4 sheet) with name, team and a dietary badge. Printed cards are marked in the Sheet so you can print only the new ones later, and **Reset printing** marks everyone (except walk-ins) as not printed again.

The **Fold-over with photo · 2 per page** layout prints each person as a 164 × 130 mm strip: name and QR on the left, their photo on the right. Strips start at the top-left corner of the A4 sheet — cut down the right, along the bottom and between the two people, then fold each in half to get an 82 × 130 mm card with the photo on the back. People without a photo get an empty PHOTO box.

## Walk-ins

For people who sign up on the day. In **Other → Walk-ins → Print blank cards**, print blank walk-in cards (codes `YSA-A0001` onward, with an empty name box). Scanning a card that isn't linked to anyone opens a sign-up screen: type their name, take their photo, and the card is linked to them. Walk-ins are added as new rows on the Registrants tab (`Walk-in` = Yes) and their photos are saved to a Drive folder called "YSA Walk-in Photos". **Other → Walk-ins** lists them all, with how many blank cards have been printed, signed up and are still blank. The printed count is shared through an `App Settings` tab (created automatically), so every phone shows the same number.

## On the day

- **Scan sounds:** each scan beeps differently: checked in (two rising beeps), already checked in (two flat beeps), **lost person** (urgent alarm), unknown code (low buzz), blank walk-in card (one beep). Android phones also vibrate; iPhones don't allow websites to vibrate, so they beep only (and stay quiet with the silent switch on). Turn it off or test it in **Settings → Scan sounds**.
- **Already checked in:** scanning a lanyard that's already been used shows "Already checked in at 9:42 AM by Ella", to catch shared lanyards.
- **Allergies and medical notes:** a red Allergy pill (with what it is) and a Medical notes pill show on the person's screen and in the People list. Cards can also print an ALLERGY badge (Print → layout options → Allergy pill).
- **Lost-person alert:** when anyone marks someone lost, a red banner appears on every phone within about 10 seconds, with a beep. Tap it to open the person; × hides it on that phone.
- **Desk search:** someone without their lanyard can be found by typing their phone number (any format, +61 or 04…) or email on the People tab. Those are looked up in the Sheet, not kept on every phone.
- **Who did what:** every change is logged on a `Log` tab (time, staff name, phone, action, person), and the Registrants tab gets `Checked In By`, `Lost By`, `Pack Given By`, `Shirt Given By` and `Picked Up By` columns. The names come from what each phone typed under Settings.

## Approving new phones

A new phone can't see or change anything until an Admin approves it. When someone opens the app for the first time they type their name and pick the role they're asking for, then see **Waiting for approval**. The app checks every few seconds and opens by itself once they're approved.

- **Approve or deny:** Admins see a dot on **Settings** and a "waiting for approval" note on the Dashboard. In **Settings → People with access**, pick their role (Admin, Security or Other), then **Approve** or **Deny**.
- **Change someone's role or take access away:** use the role menu or **Remove** next to their name. A removed phone loses access straight away, and its saved list of people is cleared.
- **Roles are only requests.** Picking "Admin" when you sign up doesn't make you one; only an Admin can give someone the Admin role, and the last Admin can't be removed.
- **New Sheet:** the very first phone to sign up on a Sheet with no Admin becomes the Admin automatically. Phones that were already on the Staff tab before approvals were added keep their access.
- The `Staff` tab has **Status** (Approved / Pending / Denied), **Approved By** and **Approved At** columns. To switch approvals off, add Script Property `REQUIRE_APPROVAL` = `false`.

## Laptop view

On a laptop or big screen the app fills the window: a sidebar on the left, people as a grid of cards (with a **Filters** button that opens a column on the right: checked in or not, lost, allergy, medical notes, dietary, walk-ins, airport pickup, printed, and team / stake / ward; active filters show as chips you can tap to remove; on a phone the same filters open full-screen), the person page in two columns, and a dashboard with checked-in-by-team bars. On the **Print** tab the layout options stay open next to a live preview of one A4 page, which redraws as you change sizes, toggles or the selected people. What you see is what prints. Tablets get the phone layout using the whole screen.

## Offline and installing

- **Install:** iPhone: Safari → Share → **Add to Home Screen**. Android: Chrome → ⋮ → **Install app**. Laptop Chrome: the install icon in the address bar. **Settings → Install on this phone** shows the right steps and whether the offline copy is ready.
- **No signal:** after the app has loaded once, it opens with no internet. It uses the last list of people saved on that phone (the status box says when it's from). Scans, ticks, lost flags and walk-ins still work and are sent when the signal comes back.
- The QR libraries are in `vendor/` (not a CDN) for this reason. The Google Sheet is never cached: live data always comes from the Sheet. If you change `sw.js`, bump `VERSION` at the top so phones refresh their copy.

## First load

When the app opens it shows a loading screen with a count ("340 of 1,000 people loaded") and a bar. People are fetched from the Sheet 100 at a time, four pages at once, so a big Sheet still loads reasonably fast and the count is real.

## Sync status (top right)

The box in the top right shows how the phone is talking to the Sheet:

- **Offline** — not connected to a Sheet, or the last request couldn't reach it.
- **Online** — connected, nothing sent yet.
- **Spinner + number** — that many changes are still on their way to the Sheet. Changes are sent one at a time, so the number counts down as each one lands. If a save fails, it stays on the phone and retries, and the person screen shows an error.
- **Offline** plus a number — the Sheet can’t be reached, and that many saves are waiting on the phone.
- **Synced** — every change has reached the Sheet.

Check-in ticks (pack and shirt), lost flags and pickups are kept on the phone until the Sheet accepts them, including across a reload. Someone is marked **Checked In** in the Sheet once both pack and shirt are Yes, even if those ticks were made on two different phones. Lost is a set flag (with a confirm), not a toggle. Times are shown in Brisbane local time.

Each open app asks the Sheet "has anything changed?" every 8 seconds (a tiny request that doesn't read the Sheet), and only downloads everyone again when something has. It also does a full refresh every 2 minutes as a safety net. (With an older Sheet script that doesn't have `Live.gs`, it falls back to a full refresh every 25 seconds.) An unrecognised QR code is checked against the Sheet once before it's reported as unknown. If the Sheet is busy or slow, a save is cut off after about 45 seconds and retried, so one stuck save can’t hold up the rest.

## Problems and staff

- **Settings → Submit problem / View problems** — staff report issues to a `Problems` tab and mark them resolved.
- **Settings → People with access** — every phone that has connected, with the person's name and role, from a `Staff` tab. This is a record, not a lock: anyone with the /exec URL can still connect.
- **Dashboard → Staff online** — the same list, with anyone who's had the app open in the last 5 minutes shown as online. Each open app checks in with the Sheet every couple of minutes (more often while the Dashboard is open), which updates `Last Seen` and `Last Active` on the Staff tab.
