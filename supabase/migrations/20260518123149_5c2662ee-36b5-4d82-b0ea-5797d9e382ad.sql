
-- 1. Tabela de tags
CREATE TABLE public.paver_service_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text UNIQUE NOT NULL,
  unidade_permitida text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.paver_service_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View service_tags"
  ON public.paver_service_tags FOR SELECT
  USING (true);

CREATE POLICY "Insert service_tags"
  ON public.paver_service_tags FOR INSERT
  WITH CHECK (paver_has_role(auth.uid(), 'admin'));

CREATE POLICY "Update service_tags"
  ON public.paver_service_tags FOR UPDATE
  USING (paver_has_role(auth.uid(), 'admin'));

CREATE POLICY "Delete service_tags"
  ON public.paver_service_tags FOR DELETE
  USING (paver_has_role(auth.uid(), 'admin'));

-- 2. Seed
INSERT INTO public.paver_service_tags (nome, unidade_permitida) VALUES
  ('MO de execução de rede de água', 'm'),
  ('MO de execução de rede pluvial', 'm'),
  ('MO de execução de rede cloacal', 'm'),
  ('MO de execução de pavimentação', 'm²');

-- 3. Coluna tag_id + índice
ALTER TABLE public.paver_orcamento_itens
  ADD COLUMN tag_id uuid NULL REFERENCES public.paver_service_tags(id) ON DELETE SET NULL;

CREATE INDEX idx_paver_orcamento_itens_tag_id
  ON public.paver_orcamento_itens(tag_id);

-- 4. Trigger de validação
CREATE OR REPLACE FUNCTION public.paver_validate_orcamento_item_tag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag_nome text;
  v_unidade_permitida text;
BEGIN
  IF NEW.tag_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT nome, unidade_permitida
    INTO v_tag_nome, v_unidade_permitida
  FROM public.paver_service_tags
  WHERE id = NEW.tag_id;

  IF v_tag_nome IS NULL THEN
    RAISE EXCEPTION 'Tag % não encontrada.', NEW.tag_id;
  END IF;

  IF NEW.unidade IS DISTINCT FROM v_unidade_permitida THEN
    RAISE EXCEPTION 'Tag % requer unidade %, mas o item tem unidade %.',
      v_tag_nome, v_unidade_permitida, COALESCE(NEW.unidade, '(nula)');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_paver_validate_orcamento_item_tag
  BEFORE INSERT OR UPDATE ON public.paver_orcamento_itens
  FOR EACH ROW
  EXECUTE FUNCTION public.paver_validate_orcamento_item_tag();
