import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/neon";

const DEFAULT_SECOND_SUPERADMIN_EMAIL = "deferrarilucia@gmail.com";
const configuredSuperadminEmails = process.env.SUPERADMIN_EMAILS
  || `${process.env.SUPERADMIN_EMAIL || "admindemo@demo.com"},${DEFAULT_SECOND_SUPERADMIN_EMAIL}`;
const SUPERADMIN_EMAILS = new Set(
  configuredSuperadminEmails
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

type AdminSession = { id: string; email: string; isSuperadmin: boolean };

function isSuperadminEmail(email: unknown) {
  return SUPERADMIN_EMAILS.has(String(email ?? "").trim().toLowerCase());
}

function apiErrorStatus(message: string) {
  if (message === "Unauthorized") return 401;
  if (message === "Not allowed" || message.includes("Superadmin") || message.includes("Protected admin")) return 403;
  return 500;
}

async function requireAdmin(req: Request): Promise<AdminSession> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) throw new Error("Unauthorized");

  const rows = await sql`
    SELECT p.is_admin, u.email
    FROM public.profiles p
    JOIN "user" u ON u.id::text = p.id::text
    WHERE p.id = ${session.user.id}::uuid
    LIMIT 1
  `;
  const email = String(rows[0]?.email ?? session.user.email ?? "").trim().toLowerCase();
  const isSuperadmin = isSuperadminEmail(email);
  if (!rows[0]?.is_admin && !isSuperadmin) throw new Error("Not allowed");

  if (isSuperadmin && !rows[0]?.is_admin) {
    await sql`UPDATE public.profiles SET is_admin = true WHERE id = ${session.user.id}::uuid`;
  }

  // Keep the Better Auth admin role aligned with the app's profiles.is_admin flag.
  await sql`
    UPDATE "user"
    SET role = 'admin', "updatedAt" = now()
    WHERE id = ${session.user.id} AND (role IS DISTINCT FROM 'admin')
  `;

  return { id: session.user.id, email, isSuperadmin };
}

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req);

    const users = await sql`
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        u.banned,
        u."createdAt" AS created_at,
        p.full_name,
        p.is_admin,
        COALESCE(p.password_prompt_pending, false) AS password_prompt_pending
      FROM "user" u
      LEFT JOIN public.profiles p ON p.id::text = u.id::text
      ORDER BY u."createdAt" DESC
    `;

    const eventRows = await sql`
      SELECT
        e.id, e.name, e.status, e.created_by, e.start_date, e.end_date,
        em.user_id, em.role AS member_role
      FROM public.events e
      LEFT JOIN public.event_members em ON em.event_id = e.id
      ORDER BY e.created_at DESC
    `;

    const eventsByUser = new Map<string, any[]>();
    for (const row of eventRows) {
      const ownerId = String(row.created_by);
      const memberId = row.user_id ? String(row.user_id) : null;
      for (const uid of new Set([ownerId, memberId].filter(Boolean) as string[])) {
        const list = eventsByUser.get(uid) ?? [];
        if (!list.some((item) => String(item.id) === String(row.id))) {
          list.push({
            id: String(row.id),
            name: String(row.name),
            status: String(row.status),
            start_date: row.start_date ? String(row.start_date).slice(0, 10) : null,
            end_date: row.end_date ? String(row.end_date).slice(0, 10) : null,
            is_owner: uid === ownerId,
            member_role: uid === memberId ? row.member_role : null,
          });
        }
        eventsByUser.set(uid, list);
      }
    }

    return NextResponse.json({
      users: users.map((user: any) => ({
        ...user,
        id: String(user.id),
        is_superadmin: isSuperadminEmail(user.email),
        events: eventsByUser.get(String(user.id)) ?? [],
      })),
      viewer: { id: admin.id, is_superadmin: admin.isSuperadmin },
    });
  } catch (error: any) {
    const message = error?.message ?? "Unable to load users";
    const status = apiErrorStatus(message);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireAdmin(req);
    const body = await req.json();
    const userId = String(body.userId ?? "");
    if (!userId) return NextResponse.json({ error: "Missing user id" }, { status: 400 });

    const current = await sql`
      SELECT u.id, u.email, u.name, COALESCE(p.is_admin, false) AS is_admin
      FROM "user" u
      LEFT JOIN public.profiles p ON p.id::text = u.id::text
      WHERE u.id = ${userId}
      LIMIT 1
    `;
    if (!current[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const targetIsSuperadmin = isSuperadminEmail(current[0].email);
    const targetIsAdmin = Boolean(current[0].is_admin) || targetIsSuperadmin;

    if (body.action === "role") {
      if (!admin.isSuperadmin) throw new Error("Superadmin privileges required");
      if (targetIsSuperadmin) return NextResponse.json({ error: "The Superadmin role cannot be changed" }, { status: 403 });

      const makeAdmin = Boolean(body.isAdmin);
      await sql`
        UPDATE public.profiles
        SET is_admin = ${makeAdmin}
        WHERE id = ${userId}::uuid
      `;
      await sql`
        UPDATE "user"
        SET role = ${makeAdmin ? "admin" : "user"}, "updatedAt" = now()
        WHERE id = ${userId}
      `;
      if (!makeAdmin) {
        await auth.api.revokeUserSessions({
          body: { userId },
          headers: req.headers,
        } as any);
      }
      return NextResponse.json({ ok: true, is_admin: makeAdmin });
    }

    if (targetIsAdmin && !admin.isSuperadmin) {
      throw new Error("Protected admin account: only the Superadmin can modify it");
    }

    if (body.action === "details") {
      const name = String(body.name ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!email || !email.includes("@")) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
      if (targetIsSuperadmin && !isSuperadminEmail(email)) {
        return NextResponse.json({ error: "Change SUPERADMIN_EMAILS before changing a Superadmin email" }, { status: 400 });
      }

      await sql`
        UPDATE "user"
        SET name = ${name || email}, email = ${email}, "updatedAt" = now()
        WHERE id = ${userId}
      `;
      await sql`
        UPDATE public.profiles
        SET full_name = ${name || null}
        WHERE id = ${userId}::uuid
      `;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "password") {
      const newPassword = String(body.password ?? "");
      if (newPassword.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

      await auth.api.setUserPassword({
        body: { userId, newPassword },
        headers: req.headers,
      } as any);
      await auth.api.revokeUserSessions({
        body: { userId },
        headers: req.headers,
      } as any);

      await sql`
        UPDATE public.profiles
        SET password_prompt_pending = true
        WHERE id = ${userId}::uuid
      `;
      return NextResponse.json({ ok: true, prompt_on_next_login: true });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error: any) {
    const message = error?.message ?? "Unable to update user";
    const status = apiErrorStatus(message);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const admin = await requireAdmin(req);
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") ?? "";
    if (!userId) return NextResponse.json({ error: "Missing user id" }, { status: 400 });
    if (userId === admin.id) return NextResponse.json({ error: "You cannot delete your own admin account" }, { status: 400 });

    const target = await sql`
      SELECT u.email, COALESCE(p.is_admin, false) AS is_admin
      FROM "user" u
      LEFT JOIN public.profiles p ON p.id::text = u.id::text
      WHERE u.id = ${userId}
      LIMIT 1
    `;
    if (!target[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (isSuperadminEmail(target[0].email)) {
      return NextResponse.json({ error: "The Superadmin account cannot be deleted" }, { status: 403 });
    }
    if (target[0].is_admin && !admin.isSuperadmin) {
      return NextResponse.json({ error: "Only the Superadmin can delete another Admin" }, { status: 403 });
    }

    const ownedEvents = await sql`SELECT id, name FROM public.events WHERE created_by = ${userId}::uuid LIMIT 5`;
    if (ownedEvents.length > 0) {
      return NextResponse.json({
        error: "This user still owns one or more events. Delete those events first, then delete the user.",
      }, { status: 409 });
    }

    await auth.api.removeUser({
      body: { userId },
      headers: req.headers,
    } as any);

    await sql`DELETE FROM public.event_members WHERE user_id = ${userId}::uuid`;
    await sql`DELETE FROM public.notifications WHERE to_user_id = ${userId}::uuid`;
    await sql`DELETE FROM public.profiles WHERE id = ${userId}::uuid`;

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const message = error?.message ?? "Unable to delete user";
    const status = apiErrorStatus(message);
    return NextResponse.json({ error: message }, { status });
  }
}
