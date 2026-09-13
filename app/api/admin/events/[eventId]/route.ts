import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/neon";

async function requireAdmin(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) throw new Error("Unauthorized");
  const rows = await sql`SELECT is_admin FROM public.profiles WHERE id = ${session.user.id}::uuid LIMIT 1`;
  if (!rows[0]?.is_admin) throw new Error("Not allowed");
  return session.user.id;
}

export async function DELETE(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  try {
    await requireAdmin(req);
    const { eventId } = await ctx.params;
    if (!eventId) return NextResponse.json({ error: "Missing event id" }, { status: 400 });

    const deleted = await sql`
      WITH deleted_notifications AS (
        DELETE FROM public.notifications WHERE event_id = ${eventId}::uuid RETURNING id
      ), deleted_guests AS (
        DELETE FROM public.guests WHERE event_id = ${eventId}::uuid RETURNING id
      ), deleted_members AS (
        DELETE FROM public.event_members WHERE event_id = ${eventId}::uuid RETURNING event_id
      )
      DELETE FROM public.events
      WHERE id = ${eventId}::uuid
      RETURNING id, name
    `;

    if (!deleted[0]) return NextResponse.json({ error: "Event not found" }, { status: 404 });
    return NextResponse.json({ ok: true, event: deleted[0] });
  } catch (error: any) {
    const message = error?.message ?? "Unable to delete event";
    const status = message === "Unauthorized" ? 401 : message === "Not allowed" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
