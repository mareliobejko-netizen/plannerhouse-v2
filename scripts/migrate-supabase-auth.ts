import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { randomUUID } from "crypto";
import { Pool } from "pg";

const fromUrl = process.env.FROM_DATABASE_URL;
const toUrl = process.env.TO_DATABASE_URL || process.env.DATABASE_URL;

if (!fromUrl) throw new Error("Missing FROM_DATABASE_URL (Supabase Postgres connection string)");
if (!toUrl) throw new Error("Missing TO_DATABASE_URL or DATABASE_URL (Neon connection string)");

const source = new Pool({ connectionString: fromUrl, max: 2 });
const target = new Pool({ connectionString: toUrl, max: 2 });

async function main() {
  const { rows: users } = await source.query(`
    SELECT
      id::text,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_user_meta_data
    FROM auth.users
    WHERE email IS NOT NULL
    ORDER BY created_at ASC
  `);

  console.log(`Found ${users.length} Supabase auth user(s).`);

  let migrated = 0;
  for (const u of users) {
    const { rows: profiles } = await target.query(
      `SELECT full_name, is_admin FROM public.profiles WHERE id = $1::uuid LIMIT 1`,
      [u.id]
    );

    const profile = profiles[0];
    const metadata = u.raw_user_meta_data || {};
    const name = profile?.full_name || metadata.full_name || metadata.name || String(u.email).split("@")[0];
    const role = profile?.is_admin ? "admin" : "user";
    const createdAt = u.created_at || new Date();
    const updatedAt = u.updated_at || createdAt;

    await target.query(
      `INSERT INTO public."user"
        ("id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt", "role", "banned", "banReason", "banExpires")
       VALUES ($1::uuid, $2, $3, $4, NULL, $5, $6, $7, false, NULL, NULL)
       ON CONFLICT ("id") DO UPDATE SET
         "name" = EXCLUDED."name",
         "email" = EXCLUDED."email",
         "emailVerified" = EXCLUDED."emailVerified",
         "updatedAt" = EXCLUDED."updatedAt",
         "role" = EXCLUDED."role"`,
      [u.id, name, String(u.email).toLowerCase(), Boolean(u.email_confirmed_at), createdAt, updatedAt, role]
    );

    if (u.encrypted_password) {
      const existing = await target.query(
        `SELECT 1 FROM public."account" WHERE "userId" = $1::uuid AND "providerId" = 'credential' LIMIT 1`,
        [u.id]
      );

      if (!existing.rowCount) {
        await target.query(
          `INSERT INTO public."account"
            ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
           VALUES ($1::uuid, $2, 'credential', $3::uuid, $4, $5, $6)`,
          [randomUUID(), u.id, u.id, u.encrypted_password, createdAt, updatedAt]
        );
      } else {
        await target.query(
          `UPDATE public."account" SET "password" = $2, "updatedAt" = $3
           WHERE "userId" = $1::uuid AND "providerId" = 'credential'`,
          [u.id, u.encrypted_password, updatedAt]
        );
      }
    }

    migrated += 1;
    console.log(`✓ ${u.email} (${role})`);
  }

  console.log(`Done. Migrated ${migrated} Better Auth user(s) to Neon.`);
  console.log("Existing browser sessions are intentionally not migrated; users must sign in again.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await source.end();
    await target.end();
  });
