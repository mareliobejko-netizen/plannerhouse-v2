# PlannerHouse — Neon migration (Phase 1)

This version moves the **application data layer** from Supabase Postgres to **Neon Postgres**.

## What already uses Neon

- `profiles`
- `events`
- `event_members`
- `guests`
- `apartments`
- `notifications`
- `apartment_occupancy`
- Admin event status updates
- Admin create-user flow writes profile/event/member rows to Neon

## What is still temporarily on Supabase

- Authentication (`supabase.auth`)
- Apartment photo storage (`supabase.storage`)

This staged approach lets you verify all PlannerHouse data on Neon before replacing login and media storage.

## Environment variables

Create `.env.local`:

```env
DATABASE_URL="YOUR_NEON_CONNECTION_STRING"
NEXT_PUBLIC_SUPABASE_URL="YOUR_SUPABASE_URL"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY="YOUR_SUPABASE_PUBLISHABLE_KEY"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SUPABASE_SERVICE_ROLE_KEY"
```

`DATABASE_URL` is only read by server-side code in `lib/neon.ts` and API routes. Do not expose it as a `NEXT_PUBLIC_...` variable.

## Install

The Neon serverless driver was added to `package.json`.

```bash
npm install
npm run dev
```

## Vercel

Add `DATABASE_URL` in:

**Vercel → Project → Settings → Environment Variables**

Keep the three Supabase variables during Phase 1.

## Test checklist

1. Login as the admin demo account.
2. Open Admin dashboard and verify the 3 migrated events.
3. Open an event and check guests/occupancy.
4. Edit event settings.
5. Login as guest demo account.
6. Add a guest.
7. Edit the guest (including allergies/notes).
8. Assign the guest to an apartment.
9. Review the list.
10. Submit the event.
11. Return the event to Draft from Admin and verify editing works again.
12. Create a new test user + event from Admin.

## Architecture

Browser pages keep using the same `supabase.from(...)`-style calls for compatibility, but `lib/supabaseClient.ts` now routes those table operations to `/api/neon`. The API validates the current Supabase login token, checks permissions using Neon, and executes parameterized SQL on Neon.

Supabase Auth and Storage remain available through the same client during this phase.

## Security

- Neon credentials never go to the browser.
- `/api/neon` requires a valid authenticated user.
- Non-admin users are scoped to their own/member events.
- Guest writes are blocked when the event is not `draft`.
- Admin users can manage all events.
