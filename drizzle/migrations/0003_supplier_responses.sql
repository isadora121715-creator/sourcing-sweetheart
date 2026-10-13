CREATE TABLE public.cotacao_respostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id uuid NOT NULL REFERENCES public.cotacoes(id) ON DELETE CASCADE,
  fornecedor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cotacao_resposta_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resposta_id uuid NOT NULL REFERENCES public.cotacao_respostas(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.cotacao_itens(id) ON DELETE CASCADE,
  preco_unitario numeric,
  prazo_entrega text,
  incoterm text,
  observacao_fornecedor text,
  UNIQUE (resposta_id, item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotacao_respostas TO anon, authenticated;
GRANT ALL ON public.cotacao_respostas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotacao_resposta_itens TO anon, authenticated;
GRANT ALL ON public.cotacao_resposta_itens TO service_role;
ALTER TABLE public.cotacao_respostas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacao_resposta_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "respostas acesso publico" ON public.cotacao_respostas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "resposta itens acesso publico" ON public.cotacao_resposta_itens FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

INSERT INTO public.cotacao_respostas (cotacao_id, fornecedor, created_at)
SELECT c.id, COALESCE(NULLIF(c.fornecedor, ''), 'Fornecedor'), c.created_at FROM public.cotacoes c
WHERE EXISTS (SELECT 1 FROM public.cotacao_itens i WHERE i.cotacao_id = c.id AND i.preco_unitario IS NOT NULL);
INSERT INTO public.cotacao_resposta_itens (resposta_id, item_id, preco_unitario, prazo_entrega, incoterm, observacao_fornecedor)
SELECT r.id, i.id, i.preco_unitario, i.prazo_entrega, i.incoterm, i.observacao_fornecedor
FROM public.cotacao_itens i JOIN public.cotacao_respostas r ON r.cotacao_id = i.cotacao_id;
COMMENT ON COLUMN public.cotacao_itens.preco_unitario IS 'DEPRECATED: replaced by cotacao_resposta_itens';