-- PlannerHouse V2 — Coach House + configurable earliest arrival date
-- Run once on Neon before deploying the updated app.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS arrival_start_date date;

COMMENT ON COLUMN public.events.arrival_start_date IS
  'Earliest date guests are allowed to arrive for the event.';

UPDATE public.events
SET arrival_start_date = COALESCE(arrival_start_date, start_date)
WHERE arrival_start_date IS NULL;

INSERT INTO public.apartments (id, label, capacity, structure, floor)
VALUES ('apt_ch', 'Coach House', 3, 'Coach House', 0)
ON CONFLICT (id) DO UPDATE
SET label = EXCLUDED.label,
    capacity = EXCLUDED.capacity,
    structure = EXCLUDED.structure,
    floor = EXCLUDED.floor;
