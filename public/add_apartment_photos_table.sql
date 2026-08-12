CREATE TABLE IF NOT EXISTS public.apartment_photos (
  id bigserial PRIMARY KEY,
  apartment_id text NOT NULL REFERENCES public.apartments(id) ON DELETE CASCADE,
  public_id text NOT NULL UNIQUE,
  image_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_cover boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS apartment_photos_apartment_idx
  ON public.apartment_photos (apartment_id, sort_order, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS apartment_photos_one_cover_per_apartment
  ON public.apartment_photos (apartment_id)
  WHERE is_cover = true;
