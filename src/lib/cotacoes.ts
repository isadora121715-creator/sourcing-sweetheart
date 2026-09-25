import { supabase } from "@/integrations/supabase/client";

export type ItemCotacao = {
  id?: string;
  ordem: number;
  material: string;
  codigo: string;
  unidade: string;
  quantidade: number;
  observacao: string;
};

export type Cotacao = {
  id: string;
  assunto: string;
  fornecedor: string | null;
  observacoes: string | null;
  prazo_resposta: string | null;
  data_envio: string;
  status: string;
  itens: ItemCotacao[];
};

type ItemRow = {
  id: string;
  ordem: number;
  material: string;
  codigo: string | null;
  unidade: string | null;
  quantidade: number | string;
  observacao: string | null;
};

export async function listarCotacoes(): Promise<Cotacao[]> {
  const { data, error } = await supabase
    .from("cotacoes")
    .select("*, cotacao_itens(*)")
    .order("data_envio", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    assunto: row.assunto,
    fornecedor: row.fornecedor,
    observacoes: row.observacoes,
    prazo_resposta: row.prazo_resposta,
    data_envio: row.data_envio,
    status: row.status,
    itens: (row.cotacao_itens ?? [])
      .slice()
      .sort((a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem)
      .map((i: ItemRow) => ({
        id: i.id,
        ordem: i.ordem ?? 0,
        material: i.material ?? "",
        codigo: i.codigo ?? "",
        unidade: i.unidade ?? "PC",
        quantidade: Number(i.quantidade ?? 0),
        observacao: i.observacao ?? "",
      })),
  }));
}

export async function salvarCotacao(input: {
  assunto: string;
  fornecedor: string;
  observacoes: string;
  prazoResposta: string;
  itens: ItemCotacao[];
}): Promise<string> {
  const { data, error } = await supabase
    .from("cotacoes")
    .insert({
      assunto: input.assunto,
      fornecedor: input.fornecedor || null,
      observacoes: input.observacoes || null,
      prazo_resposta: input.prazoResposta || null,
    })
    .select("id")
    .single();

  if (error) throw error;

  const cotacaoId = data.id;

  const { error: itensError } = await supabase.from("cotacao_itens").insert(
    input.itens.map((item, idx) => ({
      cotacao_id: cotacaoId,
      ordem: idx,
      material: item.material,
      codigo: item.codigo || null,
      unidade: item.unidade || "PC",
      quantidade: item.quantidade,
      observacao: item.observacao || null,
    })),
  );

  if (itensError) throw itensError;

  return cotacaoId;
}

export async function excluirCotacao(id: string): Promise<void> {
  const { error } = await supabase.from("cotacoes").delete().eq("id", id);
  if (error) throw error;
}
