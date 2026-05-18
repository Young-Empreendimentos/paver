
-- Remover de paver_orcamento_itens
DROP TRIGGER IF EXISTS trg_paver_validate_orcamento_item_tag ON public.paver_orcamento_itens;
ALTER TABLE public.paver_orcamento_itens DROP COLUMN IF EXISTS tag_id;

-- Adicionar em paver_eap_items
ALTER TABLE public.paver_eap_items
  ADD COLUMN tag_id uuid NULL REFERENCES public.paver_service_tags(id) ON DELETE SET NULL;

CREATE INDEX idx_paver_eap_items_tag_id ON public.paver_eap_items(tag_id);

-- Função de validação (reaproveita lógica, agora para eap_items)
CREATE OR REPLACE FUNCTION public.paver_validate_eap_item_tag()
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

CREATE TRIGGER trg_paver_validate_eap_item_tag
  BEFORE INSERT OR UPDATE ON public.paver_eap_items
  FOR EACH ROW
  EXECUTE FUNCTION public.paver_validate_eap_item_tag();

-- Limpa função antiga
DROP FUNCTION IF EXISTS public.paver_validate_orcamento_item_tag();
