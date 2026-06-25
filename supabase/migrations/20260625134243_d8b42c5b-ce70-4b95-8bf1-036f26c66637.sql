ALTER TABLE public.comercial_dados_bancarios ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.comercial_dados_bancarios FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comercial_dados_bancarios TO authenticated;
GRANT ALL ON public.comercial_dados_bancarios TO service_role;

DROP POLICY IF EXISTS "Authenticated users can view dados bancarios" ON public.comercial_dados_bancarios;
DROP POLICY IF EXISTS "Authenticated users can manage dados bancarios" ON public.comercial_dados_bancarios;

CREATE POLICY "Authenticated users can view dados bancarios"
  ON public.comercial_dados_bancarios FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage dados bancarios"
  ON public.comercial_dados_bancarios FOR ALL
  TO authenticated USING (true) WITH CHECK (true);