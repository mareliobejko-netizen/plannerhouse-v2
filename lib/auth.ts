import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { Pool } from "pg";
import bcrypt from "bcrypt";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Missing DATABASE_URL");

const pool = new Pool({
  connectionString: databaseUrl,
  max: 5,
});

function hostnameFromUrl(value?: string) {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return value.replace(/^https?:\/\//, "").replace(/\/$/, "") || null;
  }
}

// Better Auth 1.5+ can resolve the base URL from each incoming request.
// This lets localhost, the stable Vercel production domain, and the unique
// URL of every Vercel deployment work without changing BETTER_AUTH_URL.
const allowedHosts = Array.from(
  new Set(
    [
      "localhost:*",
      "127.0.0.1:*",
      hostnameFromUrl(process.env.BETTER_AUTH_URL),
      hostnameFromUrl(process.env.VERCEL_URL),
      hostnameFromUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL),
    ].filter((host): host is string => Boolean(host)),
  ),
);

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: {
    allowedHosts,
    protocol: "auto",
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    password: {
      hash: async (password) => bcrypt.hash(password, 10),
      verify: async ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  plugins: [admin()],
});
