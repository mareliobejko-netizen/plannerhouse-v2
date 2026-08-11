import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";
import { Pool } from "pg";
import path from "node:path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!supabaseUrl || !serviceKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
if (!databaseUrl) throw new Error("Missing DATABASE_URL");
if (!cloudName || !apiKey || !apiSecret) throw new Error("Missing Cloudinary environment variables");

cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const pool = new Pool({ connectionString: databaseUrl, max: 2 });
const bucket = "apartment-photos";
const basePrefix = "plannerhouse/apartments";

function uploadBuffer(buffer: Buffer, publicId: string) {
  return new Promise<any>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, resource_type: "image", overwrite: false },
      (error, result) => error ? reject(error) : resolve(result)
    );
    stream.end(buffer);
  });
}

async function main() {
  const { rows } = await pool.query(`SELECT id::text FROM public.apartments ORDER BY id`);
  console.log(`Found ${rows.length} apartment(s) in Neon.`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const apartmentId = row.id as string;
    const { data: files, error } = await supabase.storage.from(bucket).list(apartmentId, {
      limit: 100,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Supabase list failed for ${apartmentId}: ${error.message}`);

    const actualFiles = (files ?? []).filter((f) => f.name && !f.name.endsWith("/"));
    if (!actualFiles.length) {
      console.log(`- ${apartmentId}: no photos`);
      continue;
    }

    console.log(`- ${apartmentId}: ${actualFiles.length} photo(s)`);
    for (const file of actualFiles) {
      const sourcePath = `${apartmentId}/${file.name}`;
      const stem = path.parse(file.name).name.replace(/[^a-zA-Z0-9_-]+/g, "-") || "photo";
      const publicId = `${basePrefix}/${apartmentId}/${stem}`;

      try {
        try {
          await cloudinary.api.resource(publicId, { resource_type: "image" });
          console.log(`  = skip ${file.name} (already exists)`);
          skipped++;
          continue;
        } catch {
          // Not found -> upload.
        }

        const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(sourcePath);
        if (downloadError || !blob) throw new Error(downloadError?.message ?? "Download returned no data");
        const buffer = Buffer.from(await blob.arrayBuffer());
        await uploadBuffer(buffer, publicId);
        console.log(`  ✓ ${file.name}`);
        migrated++;
      } catch (error: any) {
        console.error(`  ✗ ${file.name}: ${error?.message ?? error}`);
        failed++;
      }
    }
  }

  console.log(`Done. Migrated ${migrated}, skipped ${skipped}, failed ${failed}.`);
  if (failed) process.exitCode = 1;
}

main().finally(async () => pool.end());
