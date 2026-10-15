import * as XLSX from "xlsx";
import jsPDF, { AcroFormTextField } from "jspdf";
import { CATEGORIAS_MATERIAL, identificarCategoria, type Cotacao, type ItemCotacao } from "@/lib/cotacoes";

export function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase()
    .slice(0, 50);
}

function fmtExportDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB");
}

function categoryLabel(item: ItemCotacao): string {
  return item.categoria || "Unclassified";
}

type Cabecalho = {
  assunto: string;
  fornecedor?: string | null;
  observacoes?: string | null;
  prazoResposta?: string | null;
  dataEnvio?: string;
};

const COL_PESO = "Unit Weight (U/W)";

export type RespostaImportada = {
  item: number;
  precoUnitario: number | null;
  pesoUnitario: number | null;
  prazoEntrega: string;
  incoterm: string;
  observacaoFornecedor: string;
};

async function lerLinhasPlanilha(file: File): Promise<(string | number)[][]> {
  if (file.size > 20 * 1024 * 1024) throw new Error("A planilha deve ter no máximo 20 MB.");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) throw new Error("A planilha não possui abas.");
  const ws = wb.Sheets[firstSheet];
  if (!ws) throw new Error("Não foi possível abrir a primeira aba.");
  return XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: "", raw: true });
}

/** Valor da coluna B na linha cujo rótulo (coluna A) é `rotulo`, ex.: "Supplier:". */
function valorDoRotulo(rows: (string | number)[][], rotulo: string): string {
  const linha = rows.find((row) => String(row[0] ?? "").trim().toLowerCase() === rotulo.toLowerCase());
  return String(linha?.[1] ?? "").trim();
}

function parseNumero(valor: string | number | undefined): number | null {
  const bruto = String(valor ?? "").trim();
  if (bruto === "") return null;
  let normalizado = bruto.replace(/\s/g, "");
  if (normalizado.includes(",") && normalizado.includes(".")) {
    normalizado = normalizado.lastIndexOf(",") > normalizado.lastIndexOf(".")
      ? normalizado.replace(/\./g, "").replace(",", ".")
      : normalizado.replace(/,/g, "");
  } else normalizado = normalizado.replace(",", ".");
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : NaN;
}

export type CotacaoImportada = {
  assunto: string;
  fornecedor: string;
  observacoes: string;
  itens: ItemCotacao[];
};

function normalizarCabecalho(texto: string | number): string {
  return String(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // "DESCRIPTION (HCI)" → "description"
    .replace(/[:.]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[:.]+$/g, "");
}

/**
 * Índice da coluna cujo cabeçalho corresponde a um dos nomes. Primeiro procura o nome exato;
 * com `aceitarPrefixo`, aceita também cabeçalhos que começam pelo nome (ex.: "qty pcs").
 */
function acharColuna(header: string[], nomes: string[], aceitarPrefixo = false): number {
  const exata = header.findIndex((n) => nomes.includes(n));
  if (exata >= 0 || !aceitarPrefixo) return exata;
  return header.findIndex((n) => nomes.some((nome) => n.startsWith(`${nome} `) || n.startsWith(`${nome}/`)));
}

const NOMES_COLUNAS = {
  material: ["material / description", "material / descricao", "material", "descricao", "description", "descricao do material", "item description", "produto"],
  quantidade: ["qty", "qtd", "qtde", "quantidade", "quantity", "quant"],
  codigo: ["code", "codigo", "cod", "part number", "pn"],
  unidade: ["unit", "un", "unid", "unidade", "uom"],
  categoria: ["category", "categoria"],
  observacao: ["observacao", "observacoes", "obs", "notes", "note"],
};

/**
 * Lê uma planilha com a lista de materiais (a planilha de cotação da HCI ou qualquer
 * planilha com colunas de material e quantidade) para montar uma nova cotação.
 */
export async function importarItensCotacao(file: File): Promise<CotacaoImportada> {
  const rows = await lerLinhasPlanilha(file);
  const headerIndex = rows.slice(0, 50).findIndex((row) => {
    const nomes = row.map(normalizarCabecalho);
    return acharColuna(nomes, NOMES_COLUNAS.material, true) >= 0 && acharColuna(nomes, NOMES_COLUNAS.quantidade, true) >= 0;
  });
  if (headerIndex < 0) {
    throw new Error("Não encontrei as colunas de material e quantidade na planilha. Use cabeçalhos como “Description” ou “Material” e “Qty” ou “Quantidade”.");
  }
  const header = rows[headerIndex]!.map(normalizarCabecalho);
  const colunas = {
    material: acharColuna(header, NOMES_COLUNAS.material, true),
    quantidade: acharColuna(header, NOMES_COLUNAS.quantidade, true),
    codigo: acharColuna(header, NOMES_COLUNAS.codigo),
    unidade: acharColuna(header, NOMES_COLUNAS.unidade),
    categoria: acharColuna(header, NOMES_COLUNAS.categoria),
    observacao: acharColuna(header, NOMES_COLUNAS.observacao),
  };
  const texto = (row: (string | number)[], idx: number) => (idx < 0 ? "" : String(row[idx] ?? "").trim());

  const itens: ItemCotacao[] = [];
  rows.slice(headerIndex + 1).forEach((row) => {
    const material = texto(row, colunas.material);
    if (!material || ["grand total", "total", "total geral"].includes(normalizarCabecalho(material))) return;
    const quantidade = parseNumero(row[colunas.quantidade]);
    if (quantidade === null || Number.isNaN(quantidade) || quantidade <= 0) {
      throw new Error(`Quantidade inválida para o material “${material}”.`);
    }
    const categoriaInformada = CATEGORIAS_MATERIAL.find(
      (c) => normalizarCabecalho(c) === normalizarCabecalho(texto(row, colunas.categoria)),
    );
    itens.push({
      ordem: itens.length,
      material,
      codigo: texto(row, colunas.codigo),
      unidade: texto(row, colunas.unidade) || "PC",
      quantidade,
      observacao: texto(row, colunas.observacao),
      categoria: categoriaInformada ?? identificarCategoria(material),
      precoUnitario: null,
      pesoUnitario: null,
      prazoEntrega: "",
      incoterm: "",
      observacaoFornecedor: "",
    });
  });
  if (!itens.length) throw new Error("Nenhum material foi encontrado na planilha.");

  return {
    assunto: valorDoRotulo(rows, "Subject:") || valorDoRotulo(rows, "Assunto:"),
    fornecedor: valorDoRotulo(rows, "Supplier:") || valorDoRotulo(rows, "Fornecedor:"),
    observacoes: valorDoRotulo(rows, "Notes:") || valorDoRotulo(rows, "Observações:"),
    itens,
  };
}

/** Lê a planilha devolvida pelo fornecedor: nome do fornecedor e preços por item. */
export async function importarRespostaFornecedor(file: File): Promise<{ fornecedor: string; itens: RespostaImportada[] }> {
  const rows = await lerLinhasPlanilha(file);
  const headerIndex = rows.findIndex((row) => row.some((cell) => String(cell).trim() === "Unit Price"));
  if (headerIndex < 0) throw new Error("A coluna “Unit Price” não foi encontrada.");
  const header = rows[headerIndex]?.map((cell) => String(cell).trim()) ?? [];
  const col = (name: string) => header.indexOf(name);
  const required = ["Item", "Unit Price", "Delivery Time", "Incoterm", "Supplier Notes"];
  if (required.some((name) => col(name) < 0)) throw new Error("A planilha não tem todas as colunas do modelo enviado.");

  const encontrados = new Set<number>();
  const resposta = rows.slice(headerIndex + 1).flatMap((row) => {
    const item = Number(row[col("Item")]);
    if (!Number.isInteger(item) || item < 1) return [];
    if (encontrados.has(item)) throw new Error(`O item ${item} está repetido na planilha.`);
    encontrados.add(item);
    const parsedPrice = parseNumero(row[col("Unit Price")]);
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) throw new Error(`Preço inválido no item ${item}.`);
    // Planilhas enviadas antes da coluna de peso não têm "Unit Weight (U/W)".
    const parsedWeight = col(COL_PESO) < 0 ? null : parseNumero(row[col(COL_PESO)]);
    if (parsedWeight !== null && (!Number.isFinite(parsedWeight) || parsedWeight < 0)) throw new Error(`Peso unitário inválido no item ${item}.`);
    return [{
      item,
      precoUnitario: parsedPrice,
      pesoUnitario: parsedWeight,
      prazoEntrega: String(row[col("Delivery Time")] ?? "").trim(),
      incoterm: String(row[col("Incoterm")] ?? "").trim(),
      observacaoFornecedor: String(row[col("Supplier Notes")] ?? "").trim(),
    }];
  });
  if (!resposta.length) throw new Error("Nenhum item foi encontrado na planilha.");
  return { fornecedor: valorDoRotulo(rows, "Supplier:"), itens: resposta };
}

const LOGO_URL = "/hci-logo.png";
const LOGO_RATIO = 950 / 590; // largura / altura do arquivo do logo
let logoCache: Promise<Uint8Array> | null = null;

function carregarLogo(): Promise<Uint8Array> {
  logoCache ??= fetch(LOGO_URL)
    .then((res) => {
      if (!res.ok) throw new Error("Não foi possível carregar o logo da HCI.");
      return res.arrayBuffer();
    })
    .then((buffer) => new Uint8Array(buffer))
    .catch((error) => {
      logoCache = null;
      throw error;
    });
  return logoCache;
}

function baixarArquivo(conteudo: BlobPart, tipo: string, nome: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Planilha editável enviada ao fornecedor, no layout do modelo da HCI:
 * título azul, logo, instruções em amarelo e células rosa para o fornecedor preencher.
 */
export async function exportPlanilhaFornecedor(info: Cabecalho, itens: ItemCotacao[]) {
  const [{ default: ExcelJS }, logo] = await Promise.all([import("exceljs"), carregarLogo()]);
  const AZUL = "FF1F4E78";
  const ROSA = "FFFCE4EC";
  const AMARELO = "FFFFF2CC";
  const borda = { style: "thin" as const, color: { argb: "FF999999" } };
  const bordas = { top: borda, left: borda, bottom: borda, right: borda };
  const fonte = { name: "Calibri", size: 12 };
  const dataEnvio = info.dataEnvio ? fmtExportDate(info.dataEnvio) : new Date().toLocaleDateString("en-GB");

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Quotation");
  ws.columns = [9.375, 16.875, 50.875, 20.875, 6.875, 8.875, 14.875, 14.875, 14.875, 16.875, 16.875, 28.875].map((width) => ({ width }));

  ws.mergeCells("A1:L1");
  const titulo = ws.getCell("A1");
  titulo.value = "REQUEST FOR QUOTATION";
  titulo.font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  titulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
  titulo.alignment = { vertical: "middle" };
  ws.getRow(1).height = 21;

  const cabecalho: [string, string][] = [
    ["Subject:", info.assunto],
    ["Supplier:", info.fornecedor || ""],
    ["Sent date:", dataEnvio],
    ["Reply due:", info.prazoResposta ? fmtExportDate(info.prazoResposta) : ""],
    ["Notes:", info.observacoes || ""],
  ];
  cabecalho.forEach(([rotulo, valor], idx) => {
    const linha = ws.getRow(idx + 2);
    linha.getCell(1).value = rotulo;
    linha.getCell(1).font = fonte;
    linha.getCell(2).value = valor;
    linha.getCell(2).font = fonte;
  });
  // Nome do fornecedor: célula rosa para ele preencher quando não foi informado.
  const celulaFornecedor = ws.getCell("B3");
  celulaFornecedor.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROSA } };
  celulaFornecedor.border = bordas;

  let logoBinario = "";
  logo.forEach((byte) => (logoBinario += String.fromCharCode(byte)));
  const logoId = wb.addImage({ base64: btoa(logoBinario), extension: "png" });
  ws.addImage(logoId, { tl: { col: 11.15, row: 1.1 }, ext: { width: 150, height: 150 / LOGO_RATIO } });

  ws.mergeCells("A8:L8");
  const instrucoes = ws.getCell("A8");
  instrucoes.value =
    "SUPPLIER INSTRUCTIONS: Fill ONLY the pink cells. Do not change item descriptions or quantities. Inform Unit Weight (U/W), Unit Price, Delivery Time, Incoterm and Supplier Notes.";
  instrucoes.font = fonte;
  instrucoes.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMARELO } };

  const linhaCabecalho = 10;
  const cab = ws.getRow(linhaCabecalho);
  ["Item", "Code", "Material / Description", "Category", "Unit", "Qty", COL_PESO, "Unit Price", "Total", "Delivery Time", "Incoterm", "Supplier Notes"].forEach(
    (texto, idx) => {
      const cell = cab.getCell(idx + 1);
      cell.value = texto;
      cell.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
      cell.border = bordas;
      cell.alignment = { vertical: "middle", wrapText: true };
    },
  );

  // Colunas: F = Qty, G = U/W, H = Unit Price, I = Total.
  const COLUNAS_FORNECEDOR = [7, 8, 10, 11, 12];
  const TOTAL_COLUNAS = 12;
  itens.forEach((item, idx) => {
    const numero = linhaCabecalho + idx + 1;
    const linha = ws.getRow(numero);
    linha.values = [
      idx + 1,
      item.codigo || "",
      item.material,
      categoryLabel(item),
      item.unidade,
      item.quantidade,
      null,
      null,
      { formula: `IF(H${numero}="","",F${numero}*H${numero})` },
      null,
      null,
      item.observacao || null,
    ];
    for (let col = 1; col <= TOTAL_COLUNAS; col++) {
      const cell = linha.getCell(col);
      cell.font = fonte;
      cell.border = bordas;
      cell.alignment = { vertical: "middle", wrapText: true };
      if (COLUNAS_FORNECEDOR.includes(col)) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROSA } };
    }
    linha.getCell(7).numFmt = "#,##0.000";
    linha.getCell(8).numFmt = "#,##0.00";
    linha.getCell(9).numFmt = "#,##0.00";
  });

  const linhaVazia = linhaCabecalho + itens.length + 1;
  const linhaTotal = linhaVazia + 1;
  for (let col = 1; col <= TOTAL_COLUNAS; col++) {
    ws.getRow(linhaVazia).getCell(col).border = bordas;
    const cell = ws.getRow(linhaTotal).getCell(col);
    cell.border = bordas;
    cell.font = fonte;
  }
  ws.getCell(`C${linhaTotal}`).value = "GRAND TOTAL";
  ws.getCell(`C${linhaTotal}`).font = { ...fonte, bold: true };
  const total = ws.getCell(`I${linhaTotal}`);
  total.value = { formula: `SUM(I${linhaCabecalho + 1}:I${linhaCabecalho + itens.length})` };
  total.numFmt = "#,##0.00";
  total.font = { ...fonte, bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  baixarArquivo(
    new Uint8Array(buffer),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    `quotation_${slug(info.assunto)}_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

/** Planilha preenchida com a resposta recebida do fornecedor. */
export function exportPlanilhaPrecos(info: Cabecalho, itens: ItemCotacao[]) {
  const wb = XLSX.utils.book_new();
  const dataEnvio = info.dataEnvio ? fmtExportDate(info.dataEnvio) : new Date().toLocaleDateString("en-GB");
  const aoa: (string | number | { t: string; f: string })[][] = [
    ["SUPPLIER QUOTATION RESPONSE"], ["Subject:", info.assunto], ["Supplier:", info.fornecedor || ""],
    ["Sent date:", dataEnvio], [],
    ["Item", "Code", "Material / Description", "Category", "Unit", "Qty", COL_PESO, "Unit Price", "Total", "Delivery Time", "Incoterm", "Supplier Notes"],
  ];
  const headerRow = aoa.length;
  itens.forEach((item, idx) => {
    const line = headerRow + idx + 1;
    aoa.push([idx + 1, item.codigo || "", item.material, categoryLabel(item), item.unidade, item.quantidade,
      item.pesoUnitario ?? "", item.precoUnitario ?? "", { t: "n", f: `IF(H${line}="","",F${line}*H${line})` },
      item.prazoEntrega, item.incoterm, item.observacaoFornecedor]);
  });
  aoa.push([], ["", "", "GRAND TOTAL", "", "", "", "", "", { t: "n", f: `SUM(I${headerRow + 1}:I${headerRow + itens.length})` }, "", "", ""]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 6 }, { wch: 16 }, { wch: 50 }, { wch: 20 }, { wch: 6 }, { wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, ws, "Supplier Response");
  XLSX.writeFile(wb, `supplier_response_${slug(info.assunto)}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** Planilha comparando o preço unitário de cada fornecedor, item a item. */
export function exportPlanilhaComparativo(cotacao: Cotacao) {
  const wb = XLSX.utils.book_new();
  const respostas = cotacao.respostas;
  const aoa: (string | number)[][] = [
    ["SUPPLIER PRICE COMPARISON"],
    ["Subject:", cotacao.assunto],
    ["Sent date:", fmtExportDate(cotacao.data_envio)],
    [],
    ["Item", "Code", "Material / Description", "Category", "Unit", "Qty", ...respostas.map((r) => `${r.fornecedor} — Unit Price`), "Best Price", "Best Supplier"],
  ];
  cotacao.itens.forEach((item, idx) => {
    const precos = respostas.map((r) => (item.id ? r.precos[item.id]?.precoUnitario ?? null : null));
    const validos = precos.flatMap((p, i) => (p === null ? [] : [{ preco: p, fornecedor: respostas[i]!.fornecedor }]));
    const melhor = validos.reduce<{ preco: number; fornecedor: string } | null>((m, v) => (m === null || v.preco < m.preco ? v : m), null);
    aoa.push([
      idx + 1,
      item.codigo || "",
      item.material,
      categoryLabel(item),
      item.unidade,
      item.quantidade,
      ...precos.map((p) => p ?? ""),
      melhor?.preco ?? "",
      melhor?.fornecedor ?? "",
    ]);
  });
  aoa.push([]);
  aoa.push([
    "", "", "GRAND TOTAL", "", "", "",
    ...respostas.map((r) =>
      cotacao.itens.reduce((total, item) => total + item.quantidade * ((item.id ? r.precos[item.id]?.precoUnitario : null) ?? 0), 0),
    ),
  ]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 6 }, { wch: 16 }, { wch: 50 }, { wch: 20 }, { wch: 6 }, { wch: 8 }, ...respostas.map(() => ({ wch: 22 })), { wch: 14 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws, "Comparison");
  XLSX.writeFile(wb, `comparison_${slug(cotacao.assunto)}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** Planilha de histórico: assunto, data enviada, materiais e quantidades. */
export function exportPlanilhaHistorico(cotacoes: Cotacao[]) {
  const wb = XLSX.utils.book_new();

  const resumo = [
    ["Subject", "Supplier", "Sent Date", "Reply Due", "Items", "Total Quantity", "Status", "Responses"],
    ...cotacoes.map((c) => [
      c.assunto,
      c.fornecedor || "",
      fmtExportDate(c.data_envio),
      c.prazo_resposta ? fmtExportDate(c.prazo_resposta) : "",
      c.itens.length,
      c.itens.reduce((s, i) => s + i.quantidade, 0),
      c.status,
      c.respostas.map((r) => r.fornecedor).join(", "),
    ]),
  ];
  const wsResumo = XLSX.utils.aoa_to_sheet(resumo);
  wsResumo["!cols"] = [{ wch: 40 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsResumo, "Quotations");

  const detalhe = [
    ["Subject", "Sent Date", "Supplier", "Item", "Code", "Material", "Category", "Unit", "Qty", "Notes"],
    ...cotacoes.flatMap((c) =>
      c.itens.map((i, idx) => [
        c.assunto,
        fmtExportDate(c.data_envio),
        c.fornecedor || "",
        idx + 1,
        i.codigo || "",
        i.material,
        categoryLabel(i),
        i.unidade,
        i.quantidade,
        i.observacao || "",
      ]),
    ),
  ];
  const wsDet = XLSX.utils.aoa_to_sheet(detalhe);
  wsDet["!cols"] = [
    { wch: 34 },
    { wch: 14 },
    { wch: 22 },
    { wch: 6 },
    { wch: 16 },
    { wch: 46 },
    { wch: 20 },
    { wch: 6 },
    { wch: 8 },
    { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDet, "Materials");

  XLSX.writeFile(wb, `quotation_history_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** PDF editável (campos de formulário) para o fornecedor preencher os preços. */
export async function exportPdfEditavel(info: Cabecalho, itens: ItemCotacao[]) {
  const logo = await carregarLogo();
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const BLUE: [number, number, number] = [29, 78, 216];
  const dataEnvio = info.dataEnvio ? fmtExportDate(info.dataEnvio) : new Date().toLocaleDateString("en-GB");

  // Larguras somam 281 mm (A4 paisagem menos 8 mm de margem de cada lado).
  const cols = [
    { label: "Item", w: 10 },
    { label: "Code", w: 32 },
    { label: "Material / Description", w: 62 },
    { label: "Category", w: 22 },
    { label: "Unit", w: 10 },
    { label: "Qty", w: 12 },
    { label: COL_PESO, w: 20 },
    { label: "Unit Price", w: 24 },
    { label: "Delivery Time", w: 26 },
    { label: "Incoterm", w: 22 },
    { label: "Supplier Notes", w: 41 },
  ];
  const tableW = cols.reduce((s, c) => s + c.w, 0);
  const left = 8;
  const minRowH = 9;
  const cellPad = 1.5;
  const lineH = 3.4; // altura de cada linha de texto em fonte 8

  /** Divisórias verticais entre as colunas, para as informações não se misturarem. */
  const drawColumnLines = (y: number, h: number) => {
    let x = left;
    cols.slice(0, -1).forEach((c) => {
      x += c.w;
      doc.line(x, y, x, y + h);
    });
  };

  const drawHeaderBar = () => {
    doc.setFillColor(...BLUE);
    doc.rect(0, 0, pageW, 20, "F");
    // Logo da HCI sobre um fundo branco, ao lado do título.
    const logoH = 14;
    const logoW = logoH * LOGO_RATIO;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(left - 2, 2, logoW + 4, logoH + 2, 1.5, 1.5, "F");
    doc.addImage(logo, "PNG", left, 3, logoW, logoH);
    const textLeft = left + logoW + 6;
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("REQUEST FOR QUOTATION", textLeft, 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Subject: ${info.assunto}`, textLeft, 15.5);
    doc.setFontSize(8);
    doc.text(`Sent: ${dataEnvio}`, pageW - left, 9, { align: "right" });
    if (info.prazoResposta) {
      doc.text(`Reply by: ${fmtExportDate(info.prazoResposta)}`, pageW - left, 15.5, { align: "right" });
    }
  };

  const drawTableHead = (y: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    // Títulos longos (ex.: "Unit Weight (U/W)") quebram em mais de uma linha.
    const labels = cols.map((c) => doc.splitTextToSize(c.label, c.w - cellPad * 2) as string[]);
    const headH = Math.max(8, Math.max(...labels.map((l) => l.length)) * lineH + 3);
    doc.setFillColor(...BLUE);
    doc.rect(left, y, tableW, headH, "F");
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.2);
    drawColumnLines(y, headH);
    doc.setTextColor(255, 255, 255);
    let x = left;
    cols.forEach((c, ci) => {
      const lines = labels[ci]!;
      const firstBaseline = y + (headH - lines.length * lineH) / 2 + lineH * 0.8;
      lines.forEach((line, li) => doc.text(line, x + cellPad, firstBaseline + li * lineH));
      x += c.w;
    });
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "normal");
    return y + headH;
  };

  drawHeaderBar();
  let y = 24;

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(8.5);
  // Nome do fornecedor: campo editável, já preenchido quando informado na cotação.
  y += 1;
  doc.text("Supplier:", left, y);
  const supplierField = new AcroFormTextField() as AcroFormTextField & { Rect: number[] };
  supplierField.fieldName = "supplier_name";
  supplierField.Rect = [left + 15, y - 4.2, 100, 6];
  supplierField.fontSize = 9;
  supplierField.value = info.fornecedor || "";
  doc.addField(supplierField);
  y += 6;
  if (info.observacoes) {
    const lines = doc.splitTextToSize(`Notes: ${info.observacoes}`, pageW - left * 2);
    doc.text(lines, left, y);
    y += lines.length * 4.2 + 1;
  }
  doc.setFontSize(8);
  doc.text("Supplier name, unit weight (U/W), unit price, delivery time, Incoterm and supplier notes are editable in this PDF.", left, y);
  y += 5;

  y = drawTableHead(y);

  itens.forEach((item, idx) => {
    doc.setFontSize(8);
    // Cada texto quebra dentro da largura da sua coluna; a linha cresce para caber tudo.
    const cells: string[][] = [
      String(idx + 1),
      item.codigo || "—",
      item.material,
      categoryLabel(item),
      item.unidade,
      String(item.quantidade),
    ].map((value, ci) => doc.splitTextToSize(value, cols[ci]!.w - cellPad * 2) as string[]);
    const maxLines = Math.max(...cells.map((lines) => lines.length));
    const rowH = Math.max(minRowH, maxLines * lineH + 3);

    if (y + rowH > pageH - 14) {
      doc.addPage();
      drawHeaderBar();
      y = drawTableHead(24);
    }

    if (idx % 2 === 1) {
      doc.setFillColor(239, 246, 255);
      doc.rect(left, y, tableW, rowH, "F");
    }
    doc.setDrawColor(210, 215, 225);
    doc.setLineWidth(0.2);
    doc.rect(left, y, tableW, rowH);
    drawColumnLines(y, rowH);

    doc.setTextColor(30, 30, 30);
    let x = left;
    cells.forEach((lines, ci) => {
      // Centraliza o bloco de texto na altura da linha.
      const firstBaseline = y + (rowH - lines.length * lineH) / 2 + lineH * 0.8;
      lines.forEach((line, li) => doc.text(line, x + cellPad, firstBaseline + li * lineH));
      x += cols[ci]!.w;
    });

    // Campos editáveis (AcroForm)
    const fieldDefs: { name: string; w: number }[] = [
      { name: `unit_weight_${idx + 1}`, w: cols[6]!.w },
      { name: `unit_price_${idx + 1}`, w: cols[7]!.w },
      { name: `delivery_time_${idx + 1}`, w: cols[8]!.w },
      { name: `incoterm_${idx + 1}`, w: cols[9]!.w },
      { name: `supplier_notes_${idx + 1}`, w: cols[10]!.w },
    ];
    fieldDefs.forEach((def) => {
      const field = new AcroFormTextField() as AcroFormTextField & { Rect: number[] };
      field.fieldName = def.name;
      field.Rect = [x + 0.8, y + 1, def.w - 1.6, rowH - 2];
      field.fontSize = 8;
      field.value = "";
      doc.addField(field);
      x += def.w;
    });

    y += rowH;
  });

  y += 6;
  if (y > pageH - 30) {
    doc.addPage();
    drawHeaderBar();
    y = 26;
  }
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  doc.text("Payment terms:", left, y);
  const condFields: { name: string; x: number; w: number }[] = [
    { name: "payment_terms", x: left + 31, w: 100 },
    { name: "quotation_validity", x: left + 179, w: 60 },
  ];
  doc.text("Quotation validity:", left + 139, y);
  condFields.forEach((c) => {
    const field = new AcroFormTextField() as AcroFormTextField & { Rect: number[] };
    field.fieldName = c.name;
    field.Rect = [c.x, y - 4.5, c.w, 6.5];
    field.fontSize = 9;
    field.value = "";
    doc.addField(field);
  });

  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(`Quotation — ${info.assunto} — generated on ${dataEnvio}`, pageW / 2, pageH - 5, { align: "center" });

  doc.save(`quotation_${slug(info.assunto)}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
