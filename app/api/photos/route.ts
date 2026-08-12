import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/neon";
import { cloudinary, APARTMENT_PHOTO_PREFIX } from "@/lib/cloudinary";

export const runtime = "nodejs";

function safeApartmentId(value: string | null) {
  if (!value || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) return null;
  return value;
}

function safePublicId(value: unknown, apartmentId?: string) {
  const publicId = String(value ?? "");
  const prefix = apartmentId
    ? `${APARTMENT_PHOTO_PREFIX}/${apartmentId}/`
    : `${APARTMENT_PHOTO_PREFIX}/`;
  if (!publicId.startsWith(prefix)) return null;
  if (!/^[A-Za-z0-9_\-/.]+$/.test(publicId)) return null;
  return publicId;
}

async function requireUser(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user ?? null;
}

async function isAdmin(userId: string) {
  const rows = await sql`SELECT is_admin FROM public.profiles WHERE id::text = ${userId}::text LIMIT 1`;
  return Boolean(rows[0]?.is_admin);
}

async function loadPhotoMetadata(apartmentId: string) {
  try {
    return await sql`
      SELECT public_id, image_url, sort_order, is_cover
      FROM public.apartment_photos
      WHERE apartment_id = ${apartmentId}
      ORDER BY is_cover DESC, sort_order ASC, id ASC
    `;
  } catch (error: any) {
    if (String(error?.message ?? "").includes("apartment_photos")) return [];
    throw error;
  }
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

    const metadata = await loadPhotoMetadata(apartmentId);
    const metaMap = new Map<string, { sortOrder: number; isCover: boolean; imageUrl: string }>(
      metadata.map((row: any) => [
        String(row.public_id),
        {
          sortOrder: Number(row.sort_order ?? 0),
          isCover: Boolean(row.is_cover),
          imageUrl: String(row.image_url ?? ""),
        },
      ] as [string, { sortOrder: number; isCover: boolean; imageUrl: string }])
    );

    const photos = (result.resources ?? [])
      .map((r: any, cloudIndex: number) => {
        const meta = metaMap.get(String(r.public_id));
        return {
          publicId: String(r.public_id),
          url: meta?.imageUrl || r.secure_url,
          width: r.width ?? null,
          height: r.height ?? null,
          createdAt: r.created_at ?? null,
          sortOrder: meta?.sortOrder ?? 10000 + cloudIndex,
          isCover: meta?.isCover ?? false,
        };
      })
      .sort((a: any, b: any) => {
        if (a.isCover !== b.isCover) return a.isCover ? -1 : 1;
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.publicId.localeCompare(b.publicId);
      });

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

    const apartmentRows = await sql`SELECT id FROM public.apartments WHERE id = ${apartmentId} LIMIT 1`;
    if (!apartmentRows.length) return NextResponse.json({ error: "Apartment not found" }, { status: 404 });

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

    const countRows = await sql`
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order,
             COUNT(*) FILTER (WHERE is_cover = true) AS cover_count
      FROM public.apartment_photos
      WHERE apartment_id = ${apartmentId}
    `;
    const nextOrder = Number(countRows[0]?.next_order ?? 0);
    const cloudList: any = await cloudinary.api.resources({
      type: "upload",
      resource_type: "image",
      prefix: `${APARTMENT_PHOTO_PREFIX}/${apartmentId}/`,
      max_results: 2,
    });
    const shouldBeCover = Number(countRows[0]?.cover_count ?? 0) === 0 && (cloudList.resources ?? []).length <= 1;

    await sql`
      INSERT INTO public.apartment_photos (apartment_id, public_id, image_url, sort_order, is_cover)
      VALUES (${apartmentId}, ${uploaded.public_id}, ${uploaded.secure_url}, ${nextOrder}, ${shouldBeCover})
      ON CONFLICT (public_id) DO UPDATE
      SET image_url = EXCLUDED.image_url
    `;

    return NextResponse.json({
      photo: {
        publicId: uploaded.public_id,
        url: uploaded.secure_url,
        sortOrder: nextOrder,
        isCover: shouldBeCover,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Upload failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

    const body = await req.json();
    const apartmentId = safeApartmentId(String(body?.apartmentId ?? ""));
    if (!apartmentId) return NextResponse.json({ error: "Invalid apartmentId" }, { status: 400 });

    const orderedPublicIds = Array.isArray(body?.orderedPublicIds)
      ? body.orderedPublicIds.map((value: unknown) => safePublicId(value, apartmentId)).filter(Boolean) as string[]
      : [];
    const coverPublicId = body?.coverPublicId ? safePublicId(body.coverPublicId, apartmentId) : null;

    if (!orderedPublicIds.length) {
      return NextResponse.json({ error: "At least one photo is required" }, { status: 400 });
    }
    if (coverPublicId && !orderedPublicIds.includes(coverPublicId)) {
      return NextResponse.json({ error: "Cover photo must belong to this apartment" }, { status: 400 });
    }

    const prefix = `${APARTMENT_PHOTO_PREFIX}/${apartmentId}/`;
    const result: any = await cloudinary.api.resources({
      type: "upload",
      resource_type: "image",
      prefix,
      max_results: 100,
    });
    const cloudMap = new Map((result.resources ?? []).map((r: any) => [String(r.public_id), String(r.secure_url)]));

    for (const [index, publicId] of orderedPublicIds.entries()) {
      const imageUrl = cloudMap.get(publicId);
      if (!imageUrl) continue;
      await sql`
        INSERT INTO public.apartment_photos (apartment_id, public_id, image_url, sort_order, is_cover)
        VALUES (${apartmentId}, ${publicId}, ${imageUrl}, ${index}, false)
        ON CONFLICT (public_id) DO UPDATE SET
          apartment_id = EXCLUDED.apartment_id,
          image_url = EXCLUDED.image_url,
          sort_order = EXCLUDED.sort_order,
          is_cover = false
      `;
    }

    if (coverPublicId) {
      await sql`UPDATE public.apartment_photos SET is_cover = false WHERE apartment_id = ${apartmentId}`;
      await sql`UPDATE public.apartment_photos SET is_cover = true WHERE apartment_id = ${apartmentId} AND public_id = ${coverPublicId}`;
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Unable to save photo order" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

    const body = await req.json();
    const publicId = safePublicId(body?.publicId);
    if (!publicId) return NextResponse.json({ error: "Invalid publicId" }, { status: 400 });

    const metaRows = await sql`
      SELECT apartment_id, is_cover
      FROM public.apartment_photos
      WHERE public_id = ${publicId}
      LIMIT 1
    `;

    const result: any = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    });

    await sql`DELETE FROM public.apartment_photos WHERE public_id = ${publicId}`;

    const apartmentId = metaRows[0]?.apartment_id ? String(metaRows[0].apartment_id) : null;
    const wasCover = Boolean(metaRows[0]?.is_cover);
    if (apartmentId && wasCover) {
      await sql`
        UPDATE public.apartment_photos
        SET is_cover = true
        WHERE id = (
          SELECT id FROM public.apartment_photos
          WHERE apartment_id = ${apartmentId}
          ORDER BY sort_order ASC, id ASC
          LIMIT 1
        )
      `;
    }

    return NextResponse.json({ ok: result.result === "ok" || result.result === "not found", result: result.result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Delete failed" }, { status: 500 });
  }
}
