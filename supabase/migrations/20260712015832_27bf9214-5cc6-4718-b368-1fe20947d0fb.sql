DROP POLICY IF EXISTS "anyone can log a search" ON public.search_history;

CREATE POLICY "anon can log anonymous search" ON public.search_history
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

CREATE POLICY "authenticated can log own search" ON public.search_history
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);