
-- STATIONS
CREATE TABLE public.stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  city text,
  is_popular boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stations TO authenticated;
GRANT ALL ON public.stations TO service_role;
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stations public read" ON public.stations FOR SELECT USING (true);

-- TRAINS
CREATE TABLE public.trains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  train_number text NOT NULL UNIQUE,
  train_name text NOT NULL,
  source_code text NOT NULL,
  destination_code text NOT NULL,
  departure_time text NOT NULL,
  arrival_time text NOT NULL,
  duration text NOT NULL,
  runs_on text[] NOT NULL DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trains TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trains TO authenticated;
GRANT ALL ON public.trains TO service_role;
ALTER TABLE public.trains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trains public read" ON public.trains FOR SELECT USING (true);
CREATE INDEX trains_route_idx ON public.trains(source_code, destination_code);

-- AVAILABILITY CACHE
CREATE TABLE public.availability_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  train_number text NOT NULL,
  journey_date date NOT NULL,
  travel_class text NOT NULL,
  status_label text NOT NULL,
  status_tone text NOT NULL,
  confirm_probability integer NOT NULL DEFAULT 0,
  fare integer,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (train_number, journey_date, travel_class)
);
GRANT SELECT ON public.availability_cache TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_cache TO authenticated;
GRANT ALL ON public.availability_cache TO service_role;
ALTER TABLE public.availability_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "availability public read" ON public.availability_cache FOR SELECT USING (true);
CREATE INDEX availability_lookup_idx ON public.availability_cache(train_number, journey_date);

-- SEARCH HISTORY (anonymous analytics)
CREATE TABLE public.search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  destination text NOT NULL,
  journey_date date NOT NULL,
  travel_class text NOT NULL,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.search_history TO anon;
GRANT SELECT, INSERT ON public.search_history TO authenticated;
GRANT ALL ON public.search_history TO service_role;
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can log a search" ON public.search_history FOR INSERT WITH CHECK (true);
CREATE POLICY "users read own searches" ON public.search_history FOR SELECT USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);
