# PlannerHouse — Neon Phase 2 (Better Auth)

This phase moves login/session management from Supabase Auth to Better Auth, stored in the same Neon PostgreSQL database already used by PlannerHouse.

Supabase remains only for apartment photo storage during this phase.

## 1. Install dependencies

```bash
npm install
```

## 2. Environment variables

Keep `DATABASE_URL` set to Neon, then add:

```env
BETTER_AUTH_SECRET=your-long-random-secret
BETTER_AUTH_URL=http://localhost:3000
FROM_DATABASE_URL=your-Supabase-Postgres-connection-string
```

For Vercel, `BETTER_AUTH_URL` must be your production site URL, for example `https://your-domain.vercel.app`.

`FROM_DATABASE_URL` is temporary and is only used by the one-time user migration script. Do not add it to Vercel.

## 3. Create Better Auth tables on Neon

Run once:

```bash
npm run auth:migrate
```

This creates Better Auth's `user`, `account`, `session`, and `verification` structures plus admin-plugin fields.

## 4. Copy existing Supabase Auth users to Neon

Run once:

```bash
npm run auth:users
```

The script preserves the existing Supabase UUID user IDs, which is important because PlannerHouse `profiles`, `events`, and `event_members` already reference those IDs.

It also copies Supabase's existing password hashes and assigns the Better Auth `admin` role when `public.profiles.is_admin = true`.

## 5. Test locally

```bash
npm run dev
```

Test both existing accounts. Old Supabase browser sessions are not reused, so sign in again.

Test this sequence:

1. Admin login
2. Admin dashboard
3. Open Event
4. Create a test user + event
5. Logout
6. Guest login
7. Add/edit guest
8. Assign apartment
9. Review & submit
10. Apartment photos still load

## 6. Vercel

Add/update:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

`SUPABASE_SERVICE_ROLE_KEY` is no longer required by this phase.

Do not add `FROM_DATABASE_URL` to Vercel.

## 7. After successful testing

Supabase Auth is no longer needed. Do not delete the Supabase project yet because apartment photos are still stored there. Phase 3 will move photo storage and remove the remaining Supabase dependency.
