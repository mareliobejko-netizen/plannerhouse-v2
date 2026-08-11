# PlannerHouse Phase 3 — Cloudinary storage

Runtime stack after this phase:

- Next.js / Vercel
- Neon PostgreSQL
- Better Auth
- Cloudinary apartment photos

Supabase is used only by the one-time migration script `npm run storage:migrate` to read the old `apartment-photos` bucket. The application itself no longer reads Supabase Storage.

## 1. Create a Cloudinary account

From the Cloudinary Console copy Cloud name, API key and API secret into `.env.local`:

```env
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."
```

Keep the old Supabase URL and service role temporarily so the migration script can read the old bucket.

## 2. Install packages

```bash
npm install
```

## 3. Copy the old photos

```bash
npm run storage:migrate
```

The script reads all apartment IDs from Neon, lists `apartment-photos/<apartment-id>` in Supabase, downloads each file and uploads it under `plannerhouse/apartments/<apartment-id>/` in Cloudinary.

It is safe to rerun: existing Cloudinary public IDs are skipped.

## 4. Test

```bash
npm run dev
```

Open a Room Planner apartment that has photos. The photos should now come from `/api/photos` -> Cloudinary.

## 5. Vercel

Add these server-side environment variables:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Redeploy.

After local and Vercel tests pass, the Supabase URL/service-role values used only for the migration can be removed from the app environment. Do not delete the Supabase project until the Cloudinary photos have been visually checked.
