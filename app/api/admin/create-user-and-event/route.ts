import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/neon";

type Body = {
  email: string;
  password: string;
  full_name?: string;
  event_name: string;
  start_date?: string | null;
  end_date?: string | null;
  welcome_title?: string | null;
  welcome_message?: string | null;
  tip_message?: string | null;
  tutorial_video_url?: string | null;
};

export async function POST(req: Request) {
  try {
    if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) {
      return NextResponse.json({ error: "Missing Neon / Better Auth environment variables" }, { status: 500 });
    }

    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminId = session.user.id;
    const adminRows = await sql`SELECT is_admin FROM public.profiles WHERE id = ${adminId}::uuid LIMIT 1`;
    if (!adminRows[0]?.is_admin) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    const body = (await req.json()) as Body;
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    const fullName = (body.full_name || "").trim();
    const eventName = (body.event_name || "").trim();

    if (!email || !password || !eventName) {
      return NextResponse.json({ error: "Missing fields: email/password/event_name" }, { status: 400 });
    }

    // Better Auth Admin API creates the login directly in Neon.
    // Public sign-up is disabled in lib/auth.ts, so only the admin workflow can create accounts.
    const created: any = await auth.api.createUser({
      body: {
        email,
        password,
        name: fullName || email,
        role: "user",
      },
      headers: req.headers,
    } as any);

    const createdUser = created?.user ?? created;
    const newUserId = createdUser?.id as string | undefined;
    if (!newUserId) {
      return NextResponse.json({ error: "Better Auth did not return the new user id" }, { status: 400 });
    }

    try {
      await sql`
        INSERT INTO public.profiles (id, email, is_admin, full_name)
        VALUES (${newUserId}::uuid, ${email}, false, ${fullName || null})
        ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            full_name = EXCLUDED.full_name
      `;

      const eventRows = await sql`
        INSERT INTO public.events (
          name,
          start_date,
          end_date,
          created_by,
          status,
          welcome_title,
          welcome_message,
          tip_message,
          tutorial_video_url
        ) VALUES (
          ${eventName},
          ${body.start_date ?? null}::date,
          ${body.end_date ?? null}::date,
          ${newUserId}::uuid,
          'draft',
          ${body.welcome_title?.trim() || "Welcome to your private area"},
          ${body.welcome_message?.trim() || null},
          ${body.tip_message?.trim() || null},
          ${body.tutorial_video_url?.trim() || null}
        )
        RETURNING id
      `;

      const eventId = String(eventRows[0].id);

      await sql`
        INSERT INTO public.event_members (event_id, user_id, role)
        VALUES (${eventId}::uuid, ${newUserId}::uuid, 'client')
      `;

      return NextResponse.json({ ok: true, user_id: newUserId, event_id: eventId });
    } catch (dbError: any) {
      await auth.api.removeUser({
        body: { userId: newUserId },
        headers: req.headers,
      } as any).catch(() => undefined);
      return NextResponse.json({ error: dbError?.message ?? "Neon insert failed" }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Server error" }, { status: 500 });
  }
}
