import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/neon";

type AdminSession = { id: string };

async function requireAdmin(req: Request): Promise<AdminSession> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) throw new Error("Unauthorized");

  const rows = await sql`SELECT is_admin FROM public.profiles WHERE id = ${session.user.id}::uuid LIMIT 1`;
  if (!rows[0]?.is_admin) throw new Error("Not allowed");

  // Keep the Better Auth admin role aligned with the app's profiles.is_admin flag.
  await sql`
    UPDATE "user"
    SET role = 'admin', "updatedAt" = now()
    WHERE id = ${session.user.id} AND (role IS DISTINCT FROM 'admin')
  `;

  return { id: session.user.id };
}

export async function GET(req: Request) {
  try {
    await requireAdmin(req);

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
      LEFT JOIN public.profiles p ON p.id::text = u.id
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
        events: eventsByUser.get(String(user.id)) ?? [],
      })),
    });
  } catch (error: any) {
    const message = error?.message ?? "Unable to load users";
    const status = message === "Unauthorized" ? 401 : message === "Not allowed" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireAdmin(req);
    const body = await req.json();
    const userId = String(body.userId ?? "");
    if (!userId) return NextResponse.json({ error: "Missing user id" }, { status: 400 });

    const current = await sql`SELECT id, email, name FROM "user" WHERE id = ${userId} LIMIT 1`;
    if (!current[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (body.action === "details") {
      const name = String(body.name ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!email || !email.includes("@")) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });

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
    const status = message === "Unauthorized" ? 401 : message === "Not allowed" ? 403 : 500;
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
    const status = message === "Unauthorized" ? 401 : message === "Not allowed" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
