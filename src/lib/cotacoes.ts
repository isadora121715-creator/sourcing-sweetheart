import { supabase } from "@/integrations/supabase/client";

export type ItemCotacao = {
  id?: string;
  ordem: number;
  material: string;
  codigo: string;
  unidade: string;
  quantidade: number;
  observacao: string;
  categoria: CategoriaMaterial | "";
  precoUnitario: number | null;
  pesoUnitario: number | null;
  prazoEntrega: string;
  incoterm: string;
  observacaoFornecedor: string;
};

export type CategoriaMaterial = "Flange" | "Junta (Gasket)" | "Forjadinho" | "Tubular";

export const CATEGORIAS_MATERIAL: CategoriaMaterial[] = [
  "Flange",
  "Junta (Gasket)",
  "Forjadinho",
  "Tubular",
];

export function identificarCategoria(material: string): CategoriaMaterial | "" {
  const texto = material.toLocaleLowerCase("pt-BR");
  if (/\b(flange|flanged)\b/.test(texto)) return "Flange";
  if (/\b(junta|juntas|gasket|gaskets)\b/.test(texto)) return "Junta (Gasket)";
  if (/\b(tubo|tubos|tubular|pipe|pipes)\b/.test(texto)) return "Tubular";

  const conexao = /\b(cotovelo|curva|tee|tê|reducao|redução|luva|niple|nipples|conexao|conexão|fitting|elbow|coupling|socket|olet|weldolet|sockolet|threadolet)\b/.test(texto);
  const medidaPolegadas = texto.match(/(\d+(?:[.,]\d+)?)\s*(?:"|''|pol|polegada|inch|in\b)/);
  const medidaDn = texto.match(/\bdn\s*(\d+)\b/);
  if (conexao) {
    if (medidaPolegadas) return Number(medidaPolegadas[1]?.replace(",", ".")) <= 4 ? "Forjadinho" : "Tubular";
    if (medidaDn) return Number(medidaDn[1]) <= 100 ? "Forjadinho" : "Tubular";
    return "Forjadinho";
  }
  return "";
}

export type Cotacao = {
  id: string;
  assunto: string;
  fornecedor: string | null;
  observacoes: string | null;
  prazo_resposta: string | null;
  data_envio: string;
  status: string;
  itens: ItemCotacao[];
  respostas: RespostaFornecedor[];
};

export type PrecoFornecedor = {
  precoUnitario: number | null;
  pesoUnitario: number | null;
  prazoEntrega: string;
  incoterm: string;
  observacaoFornecedor: string;
};

export type RespostaFornecedor = {
  id: string;
  fornecedor: string;
  createdAt: string;
  /** Preços indexados pelo id do item da cotação. */
  precos: Record<string, PrecoFornecedor>;
};

/** Itens da cotação preenchidos com os preços de uma resposta (ou em branco, se não houver). */
export function itensComResposta(cotacao: Cotacao, resposta: RespostaFornecedor | null): ItemCotacao[] {
  return cotacao.itens.map((item) => {
    const preco = item.id ? resposta?.precos[item.id] : undefined;
    return {
      ...item,
      precoUnitario: preco?.precoUnitario ?? null,
      pesoUnitario: preco?.pesoUnitario ?? null,
      prazoEntrega: preco?.prazoEntrega ?? "",
      incoterm: preco?.incoterm ?? "",
      observacaoFornecedor: preco?.observacaoFornecedor ?? "",
    };
  });
}

export function totalResposta(cotacao: Cotacao, resposta: RespostaFornecedor): number {
  return itensComResposta(cotacao, resposta).reduce((total, item) => total + item.quantidade * (item.precoUnitario ?? 0), 0);
}

type ItemRow = {
  id: string;
  ordem: number;
  material: string;
  codigo: string | null;
  unidade: string | null;
  quantidade: number | string;
  observacao: string | null;
  categoria: string | null;
};

type RespostaItemRow = {
  item_id: string;
  preco_unitario: number | string | null;
  peso_unitario: number | string | null;
  prazo_entrega: string | null;
  incoterm: string | null;
  observacao_fornecedor: string | null;
};

type RespostaRow = {
  id: string;
  fornecedor: string;
  created_at: string;
  cotacao_resposta_itens: RespostaItemRow[] | null;
};

export async function listarCotacoes(): Promise<Cotacao[]> {
  const { data, error } = await supabase
    .from("cotacoes")
    .select("*, cotacao_itens(*), cotacao_respostas(*, cotacao_resposta_itens(*))")
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
        categoria: CATEGORIAS_MATERIAL.includes(i.categoria as CategoriaMaterial)
          ? (i.categoria as CategoriaMaterial)
          : "",
        precoUnitario: null,
        pesoUnitario: null,
        prazoEntrega: "",
        incoterm: "",
        observacaoFornecedor: "",
      })),
    respostas: ((row.cotacao_respostas ?? []) as RespostaRow[])
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((r) => ({
        id: r.id,
        fornecedor: r.fornecedor,
        createdAt: r.created_at,
        precos: Object.fromEntries(
          (r.cotacao_resposta_itens ?? []).map((ri) => [
            ri.item_id,
            {
              precoUnitario: ri.preco_unitario === null ? null : Number(ri.preco_unitario),
              pesoUnitario: ri.peso_unitario === null || ri.peso_unitario === undefined ? null : Number(ri.peso_unitario),
              prazoEntrega: ri.prazo_entrega ?? "",
              incoterm: ri.incoterm ?? "",
              observacaoFornecedor: ri.observacao_fornecedor ?? "",
            },
          ]),
        ),
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
      categoria: item.categoria || null,
    })),
  );

  if (itensError) throw itensError;

  return cotacaoId;
}

export async function salvarRespostaCotacao(input: {
  cotacaoId: string;
  respostaId?: string;
  fornecedor: string;
  itens: ItemCotacao[];
}): Promise<void> {
  const fornecedor = input.fornecedor.trim();
  if (!fornecedor) throw new Error("Informe o nome do fornecedor.");
  if (!input.itens.some((item) => item.precoUnitario !== null)) throw new Error("Informe ao menos um preço.");
  if (input.itens.some((item) => item.precoUnitario !== null && (!Number.isFinite(item.precoUnitario) || item.precoUnitario < 0))) throw new Error("Os preços devem ser números maiores ou iguais a zero.");
  if (input.itens.some((item) => item.pesoUnitario !== null && (!Number.isFinite(item.pesoUnitario) || item.pesoUnitario < 0))) throw new Error("Os pesos unitários devem ser números maiores ou iguais a zero.");
  if (input.itens.some((item) => !item.id)) throw new Error("Item da cotação sem identificação.");

  let respostaId = input.respostaId;
  if (respostaId) {
    const { error } = await supabase
      .from("cotacao_respostas")
      .update({ fornecedor })
      .eq("id", respostaId)
      .eq("cotacao_id", input.cotacaoId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("cotacao_respostas")
      .insert({ cotacao_id: input.cotacaoId, fornecedor })
      .select("id")
      .single();
    if (error) throw error;
    respostaId = data.id;
  }

  const respostaSalvaId: string = respostaId;
  const { error: itensError } = await supabase.from("cotacao_resposta_itens").upsert(
    input.itens.map((item) => ({
      resposta_id: respostaSalvaId,
      item_id: item.id!,
      preco_unitario: item.precoUnitario,
      peso_unitario: item.pesoUnitario,
      prazo_entrega: item.prazoEntrega || null,
      incoterm: item.incoterm || null,
      observacao_fornecedor: item.observacaoFornecedor || null,
    })),
    { onConflict: "resposta_id,item_id" },
  );
  if (itensError?.message.includes("peso_unitario")) {
    throw new Error("O banco ainda não tem a coluna de peso unitário. Aplique a migração 0004_add_unit_weight no Lovable.");
  }
  if (itensError) throw itensError;

  const { error } = await supabase.from("cotacoes").update({ status: "Respondida" }).eq("id", input.cotacaoId);
  if (error) throw error;
}

export async function excluirRespostaCotacao(input: { cotacaoId: string; respostaId: string; restantes: number }): Promise<void> {
  const { error } = await supabase
    .from("cotacao_respostas")
    .delete()
    .eq("id", input.respostaId)
    .eq("cotacao_id", input.cotacaoId);
  if (error) throw error;
  if (input.restantes === 0) {
    const { error: statusError } = await supabase.from("cotacoes").update({ status: "Enviada" }).eq("id", input.cotacaoId);
    if (statusError) throw statusError;
  }
}

export async function excluirCotacao(id: string): Promise<void> {
  const { error } = await supabase.from("cotacoes").delete().eq("id", id);
  if (error) throw error;
}
