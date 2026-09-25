CREATE TABLE public.cotacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assunto text NOT NULL,
  fornecedor text,
  observacoes text,
  prazo_resposta date,
  data_envio timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'Enviada',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cotacao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id uuid NOT NULL REFERENCES public.cotacoes(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 0,
  material text NOT NULL,
  codigo text,
  unidade text NOT NULL DEFAULT 'PC',
  quantidade numeric NOT NULL DEFAULT 1,
  observacao text,
  preco_unitario numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cotacao_itens_cotacao_id_idx ON public.cotacao_itens(cotacao_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotacoes TO anon, authenticated;
GRANT ALL ON public.cotacoes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotacao_itens TO anon, authenticated;
GRANT ALL ON public.cotacao_itens TO service_role;

ALTER TABLE public.cotacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacao_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cotacoes acesso publico" ON public.cotacoes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cotacao itens acesso publico" ON public.cotacao_itens FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
