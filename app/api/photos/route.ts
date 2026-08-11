import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/neon";
import { cloudinary, APARTMENT_PHOTO_PREFIX } from "@/lib/cloudinary";

export const runtime = "nodejs";

function safeApartmentId(value: string | null) {
  // Apartment IDs in PlannerHouse are text values such as "apt_23" and "apt_wc",
  // not UUIDs. Keep the value path-safe because it is also used in Cloudinary folders.
  if (!value || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) return null;
  return value;
}

async function requireUser(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user ?? null;
}

async function isAdmin(userId: string) {
  const rows = await sql`SELECT is_admin FROM public.profiles WHERE id = ${userId}::uuid LIMIT 1`;
  return Boolean(rows[0]?.is_admin);
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const apartmentId = safeApartmentId(searchParams.get("apartmentId"));
    if (!apartmentId) return NextResponse.json({ error: "Invalid apartmentId" }, { status: 400 });

    const prefix = `${APARTMENT_PHOTO_PREFIX}/${apartmentId}/`;
    const result: any = await cloudinary.api.resources({
      type: "upload",
      resource_type: "image",
      prefix,
      max_results: 100,
    });

    const photos = (result.resources ?? [])
      .map((r: any) => ({
        publicId: r.public_id,
        url: r.secure_url,
        width: r.width ?? null,
        height: r.height ?? null,
        createdAt: r.created_at ?? null,
      }))
      .sort((a: any, b: any) => a.publicId.localeCompare(b.publicId));

    return NextResponse.json({ photos });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Unable to load photos" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

    const form = await req.formData();
    const apartmentId = safeApartmentId(String(form.get("apartmentId") ?? ""));
    const file = form.get("file");

    if (!apartmentId || !(file instanceof File)) {
      return NextResponse.json({ error: "apartmentId and image file are required" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only images are allowed" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Image is larger than 10 MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "photo";
    const publicId = `${APARTMENT_PHOTO_PREFIX}/${apartmentId}/${Date.now()}-${base}`;

    const uploaded: any = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { public_id: publicId, resource_type: "image", overwrite: false },
        (error, result) => (error ? reject(error) : resolve(result))
      );
      stream.end(buffer);
    });

    return NextResponse.json({
      photo: { publicId: uploaded.public_id, url: uploaded.secure_url },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

    const body = await req.json();
    const publicId = String(body?.publicId ?? "");
    if (!publicId.startsWith(`${APARTMENT_PHOTO_PREFIX}/`)) {
      return NextResponse.json({ error: "Invalid publicId" }, { status: 400 });
    }

    const result: any = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });

    return NextResponse.json({ ok: result.result === "ok" || result.result === "not found", result: result.result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Delete failed" }, { status: 500 });
  }
}
