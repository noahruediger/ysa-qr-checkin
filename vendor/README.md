# Vendored libraries

Kept here (instead of loading from a CDN) so the app still opens on bad venue Wi-Fi.

- `qrious.min.js`: QRious 4.0.2 (draws QR codes), GPL-3.0, see LICENSE-qrious.md
- `jsQR.js`: jsQR 1.4.0 (reads QR codes from the camera), Apache-2.0, see LICENSE-jsqr

To update: `npm pack qrious@<v> jsqr@<v>` and copy the files from `package/dist/`.
