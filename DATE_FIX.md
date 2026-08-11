# Neon date formatting fix

This patch fixes `RangeError: date value is not finite` in the admin dashboard.

Neon/PostgreSQL may return DATE columns as JavaScript Date / ISO timestamp values. The UI previously assumed every value was exactly `YYYY-MM-DD` and appended another time suffix, producing invalid strings such as `2026-09-12T00:00:00.000ZT12:00:00`.

Changes:
- Normalize PostgreSQL DATE columns in `/api/neon` to `YYYY-MM-DD`.
- Make admin dashboard date parsing tolerant of both `YYYY-MM-DD` and ISO timestamps.
- Make Open Event date formatting tolerant as well.
