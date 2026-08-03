DROP POLICY IF EXISTS "verified pnr history public read" ON public.pnr_history;

REVOKE SELECT ON public.pnr_history FROM anon;
REVOKE SELECT ON public.pnr_history FROM authenticated;
GRANT ALL ON public.pnr_history TO service_role;

CREATE OR REPLACE FUNCTION public.pnr_confirm_stats(_train_number text, _class_code text, _quota text DEFAULT NULL)
RETURNS TABLE (total bigint, confirmed bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint AS total,
         count(*) FILTER (WHERE h.confirmed)::bigint AS confirmed
  FROM public.pnr_history h
  WHERE h.verified = true
    AND h.train_number = _train_number
    AND h.class_code = _class_code
    AND (_quota IS NULL OR h.quota = _quota);
$$;

GRANT EXECUTE ON FUNCTION public.pnr_confirm_stats(text, text, text) TO anon, authenticated, service_role;