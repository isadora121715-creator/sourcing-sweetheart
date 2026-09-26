ALTER TABLE public.cotacao_itens
ADD COLUMN categoria text;

ALTER TABLE public.cotacao_itens
ADD CONSTRAINT cotacao_itens_categoria_check
CHECK (categoria IS NULL OR categoria IN ('Flange', 'Junta (Gasket)', 'Forjadinho', 'Tubular'));

COMMENT ON COLUMN public.cotacao_itens.categoria IS 'Classificação comercial do material: Flange, Junta (Gasket), Forjadinho ou Tubular.';