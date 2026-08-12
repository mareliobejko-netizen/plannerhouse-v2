# Better Auth on Vercel

PlannerHouse uses Better Auth's dynamic base URL support.

The server automatically allows:

- `localhost:*`
- `127.0.0.1:*`
- the current Vercel deployment host from `VERCEL_URL`
- the stable production host from `VERCEL_PROJECT_PRODUCTION_URL`
- `BETTER_AUTH_URL`, if you set it (useful for a custom domain)

This means you do **not** need to edit `BETTER_AUTH_URL` every time Vercel creates a new deployment URL.

Required Vercel environment variables:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

`BETTER_AUTH_URL` is optional for normal Vercel deployments. If you later add a custom domain, set it to that custom URL and redeploy.
