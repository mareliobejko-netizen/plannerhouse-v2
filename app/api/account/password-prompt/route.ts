import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/neon";

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await sql`
      UPDATE public.profiles
      SET password_prompt_pending = false
      WHERE id = ${session.user.id}::uuid
    `;

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Unable to update password preference" }, { status: 500 });
  }
}
