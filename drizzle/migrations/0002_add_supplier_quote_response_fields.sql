ALTER TABLE public.cotacao_itens
  ADD COLUMN prazo_entrega text,
  ADD COLUMN incoterm text,
  ADD COLUMN observacao_fornecedor text;