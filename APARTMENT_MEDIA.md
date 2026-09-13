# Apartment Media

Admin page: `/admin/media`

Features:
- list/search all apartments
- upload multiple photos to Cloudinary
- delete photos from Cloudinary
- choose the gallery cover
- reorder photos with left/right controls
- fullscreen preview with keyboard arrows

## One-time Neon migration

Run this once before using cover/order management:

```cmd
"C:\Program Files\PostgreSQL\18\bin\psql.exe" "YOUR_NEON_CONNECTION_STRING" -f public\add_apartment_photos_table.sql
```

The migration only adds `public.apartment_photos`; it does not delete or replace existing apartment data or Cloudinary assets.

Existing Cloudinary photos remain visible immediately. The first time you click **Save order & cover** for an apartment, their order/cover metadata is stored in Neon.
