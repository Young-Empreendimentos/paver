
UPDATE public.paver_eap_items
SET tag_id = '75812cfc-533d-4c9c-8175-2e8e75f46186'
WHERE tipo='item' AND tag_id IS NULL AND unidade='m'
  AND lote='SISTEMA DE ABASTECIMENTO DE ÁGUA'
  AND (descricao ILIKE '%mão de obra%' OR descricao ILIKE '%mao de obra%');

UPDATE public.paver_eap_items
SET tag_id = '9c526f73-e7ca-4e32-b406-4f8e592fef85'
WHERE tipo='item' AND tag_id IS NULL AND unidade='m'
  AND lote='DRENAGEM PLUVIAL'
  AND (descricao ILIKE '%mão de obra%' OR descricao ILIKE '%mao de obra%');

UPDATE public.paver_eap_items
SET tag_id = 'a369e291-5cf6-448a-b324-fef79b671061'
WHERE tipo='item' AND tag_id IS NULL AND unidade='m'
  AND lote='DRENAGEM CLOACAL'
  AND (descricao ILIKE '%mão de obra%' OR descricao ILIKE '%mao de obra%');

UPDATE public.paver_eap_items
SET tag_id = '63fea12d-ab21-4e8f-845d-83c67ab6ab8b'
WHERE tipo='item' AND tag_id IS NULL AND unidade='m²'
  AND lote='PAVIMENTAÇÃO'
  AND (descricao ILIKE '%mão de obra%' OR descricao ILIKE '%mao de obra%');
