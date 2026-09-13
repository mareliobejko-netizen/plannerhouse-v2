# PDF export fix

The Admin > Open Event > Export PDF action previously opened the print tab with
`noopener,noreferrer`. Chromium browsers can return `null` from `window.open()`
when `noopener` is requested, so the app treated a successfully opened tab as a
blocked popup and never wrote the printable report.

The export now:
- opens the print tab with a usable `Window` handle;
- detaches `window.opener` afterwards;
- writes the A4 landscape report;
- focuses the print tab;
- opens the browser print dialog, where the admin can choose **Save as PDF**.
