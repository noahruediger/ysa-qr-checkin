# YSA QR Check-In

A phone-first check-in app for the Brisbane YSA Convention. Staff scan the QR code on a lanyard to check people in, book activities, flag lost people, tick off airport pickups, and print lanyards. Everything reads and writes live to a Google Sheet.

- `index.html` — the app (one file, runs in any phone browser)
- `apps-script/Code.gs` — the backend that connects the app to the Google Sheet

Without a backend connected, the app runs on built-in demo data.

## Setup

### 1. Make the Google Sheet

Create a Google Sheet with two tabs, named exactly `Registrants` and `Activities`. The script finds columns by their header name (row 1), so column order doesn't matter and extra columns are fine.

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
| `Activity Bookings` | Filled in by the app (comma-separated activity IDs) |

`Photo URL`, `Picked Up` and `Picked Up At` are added automatically the first time the script runs. Every other column (phone, emergency contact, allergies, etc.) shows up on the person's Details page in the app.

**Activities** — one row per activity:

| Header | Example |
| --- | --- |
| `Activity ID` | `futsal` |
| `Activity Name` | `Sports Tournament: Futsal` |
| `Day/Time` | `Sat 2:30 PM` |
| `Location` | `Sports Courts` |
| `Capacity` | `24` |
| `Baseline Bookings (non-test)` | Spots already taken outside the app (use `0` if none) |

### 2. Add the Apps Script

1. In the Sheet, go to **Extensions → Apps Script**.
2. Delete what's in `Code.gs` and paste in the contents of `apps-script/Code.gs` from this repo. Save.
3. Optional: set the time zone under **Project Settings** (e.g. Australia/Brisbane) so timestamps are right.

### 3. Deploy it as a web app

1. Click **Deploy → New deployment**, choose type **Web app**.
2. Execute as: **Me**. Who has access: **Anyone**.
3. Click **Deploy**, approve the permissions, and copy the **/exec URL**.

After editing the script later, use **Deploy → Manage deployments → Edit → New version** so the same URL keeps working.

### 4. Connect the app

1. Open `index.html` on the phone (host it somewhere like GitHub Pages, or open the file directly).
2. Go to **Settings**, paste the /exec URL, and tap **Connect**. The green dot means it's live.

The URL is saved on that phone only, so repeat this on each staff phone.

## Photos

The app shows a profile photo for each person from the `Photo URL` column, or from the registration form's photo upload column (Google Drive links). If there's no photo, it shows initials.

- For private Drive photos, run `testDriveAccess` once from the Apps Script editor to grant Drive access.
- For test data only, run `seedStockPhotos` to fill `Photo URL` with stock portraits.
- Columns matching `HIDE_COLUMNS` in the script (ID photos, passports, licences) are never sent to phones. Edit that list to hide anything else.

## Keep the /exec URL private

Anyone with the /exec URL can read the Sheet's data through it, including names, phone numbers and emergency contacts. Don't commit it to this repo or post it publicly. Only share it with staff who need it. If it leaks, create a new deployment and archive the old one.

## Printing lanyards

The **Print** tab prints QR lanyard cards (82 × 130 mm, 4 per A4 sheet) with name, team and a dietary badge. Printed cards are marked in the Sheet so you can print only the new ones later.
