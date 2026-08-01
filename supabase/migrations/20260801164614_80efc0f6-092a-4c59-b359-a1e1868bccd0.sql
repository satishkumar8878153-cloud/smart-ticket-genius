CREATE TABLE public.pnr_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  train_number text NOT NULL,
  class_code text NOT NULL,
  quota text,
  journey_date date,
  booking_status text,
  final_status text,
  confirmed boolean NOT NULL DEFAULT false,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pnr_history TO anon;
GRANT SELECT ON public.pnr_history TO authenticated;
GRANT ALL ON public.pnr_history TO service_role;

ALTER TABLE public.pnr_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verified pnr history public read"
ON public.pnr_history FOR SELECT
TO anon, authenticated
USING (verified = true);

CREATE INDEX idx_pnr_history_lookup ON public.pnr_history (train_number, class_code, verified);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_pnr_history_updated_at
BEFORE UPDATE ON public.pnr_history
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();