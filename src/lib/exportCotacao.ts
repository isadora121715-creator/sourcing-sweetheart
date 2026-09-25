import * as XLSX from "xlsx";
import jsPDF, { AcroFormTextField } from "jspdf";
import type { Cotacao, ItemCotacao } from "@/lib/cotacoes";

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

type Cabecalho = {
  assunto: string;
  fornecedor?: string | null;
  observacoes?: string | null;
  prazoResposta?: string | null;
  dataEnvio?: string;
};

/** Planilha editável enviada ao fornecedor (colunas de preço em branco). */
export function exportPlanilhaFornecedor(info: Cabecalho, itens: ItemCotacao[]) {
  const wb = XLSX.utils.book_new();
  const dataEnvio = info.dataEnvio ? fmtData(info.dataEnvio) : new Date().toLocaleDateString("pt-BR");

  const aoa: (string | number)[][] = [
    ["COTAÇÃO DE PEDIDOS"],
    ["Assunto:", info.assunto],
    ["Fornecedor:", info.fornecedor || ""],
    ["Data de envio:", dataEnvio],
    ["Prazo para resposta:", info.prazoResposta ? fmtData(info.prazoResposta) : ""],
    ["Observações:", info.observacoes || ""],
    [],
    ["Preencha as colunas em amarelo: preço unitário, prazo de entrega e marca."],
    [],
    ["Item", "Código", "Material / Descrição", "Un.", "Qtd", "Preço Unit.", "Total", "Prazo entrega", "Marca", "Obs. fornecedor"],
  ];

  const headerRow = aoa.length; // 0-based index da linha de cabeçalho
  itens.forEach((item, idx) => {
    const line = headerRow + 1 + idx + 1; // linha da planilha (1-based)
    aoa.push([
      idx + 1,
      item.codigo || "",
      item.material,
      item.unidade,
      item.quantidade,
      "",
      { f: `IF(F${line}="","",E${line}*F${line})` } as unknown as string,
      "",
      "",
      item.observacao || "",
    ]);
  });

  const totalLine = headerRow + 1 + itens.length + 1;
  aoa.push([]);
  aoa.push([
    "",
    "",
    "TOTAL GERAL",
    "",
    "",
    "",
    { f: `SUM(G${headerRow + 2}:G${totalLine - 2})` } as unknown as string,
    "",
    "",
    "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 50 },
    { wch: 6 },
    { wch: 8 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Cotação");
  XLSX.writeFile(wb, `cotacao_${slug(info.assunto)}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** Planilha de histórico: assunto, data enviada, materiais e quantidades. */
export function exportPlanilhaHistorico(cotacoes: Cotacao[]) {
  const wb = XLSX.utils.book_new();

  const resumo = [
    ["Assunto", "Fornecedor", "Data enviada", "Prazo resposta", "Itens", "Total de peças", "Status"],
    ...cotacoes.map((c) => [
      c.assunto,
      c.fornecedor || "",
      fmtData(c.data_envio),
      c.prazo_resposta ? fmtData(c.prazo_resposta) : "",
      c.itens.length,
      c.itens.reduce((s, i) => s + i.quantidade, 0),
      c.status,
    ]),
  ];
  const wsResumo = XLSX.utils.aoa_to_sheet(resumo);
  wsResumo["!cols"] = [{ wch: 40 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsResumo, "Cotações");

  const detalhe = [
    ["Assunto", "Data enviada", "Fornecedor", "Item", "Código", "Material", "Un.", "Qtd", "Observação"],
    ...cotacoes.flatMap((c) =>
      c.itens.map((i, idx) => [
        c.assunto,
        fmtData(c.data_envio),
        c.fornecedor || "",
        idx + 1,
        i.codigo || "",
        i.material,
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
    { wch: 6 },
    { wch: 8 },
    { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDet, "Materiais");

  XLSX.writeFile(wb, `historico_cotacoes_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** PDF editável (campos de formulário) para o fornecedor preencher os preços. */
export function exportPdfEditavel(info: Cabecalho, itens: ItemCotacao[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const BLUE: [number, number, number] = [29, 78, 216];
  const dataEnvio = info.dataEnvio ? fmtData(info.dataEnvio) : new Date().toLocaleDateString("pt-BR");

  const cols = [
    { label: "Item", w: 12 },
    { label: "Código", w: 26 },
    { label: "Material / Descrição", w: 92 },
    { label: "Un.", w: 12 },
    { label: "Qtd", w: 16 },
    { label: "Preço Unit.", w: 30 },
    { label: "Prazo entrega", w: 32 },
    { label: "Marca", w: 30 },
    { label: "Observação", w: 30 },
  ];
  const left = 8;
  const rowH = 9;

  const drawHeaderBar = () => {
    doc.setFillColor(...BLUE);
    doc.rect(0, 0, pageW, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Solicitação de Cotação", left, 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Assunto: ${info.assunto}`, left, 15.5);
    doc.setFontSize(8);
    doc.text(`Enviado em: ${dataEnvio}`, pageW - left, 9, { align: "right" });
    if (info.prazoResposta) {
      doc.text(`Responder até: ${fmtData(info.prazoResposta)}`, pageW - left, 15.5, { align: "right" });
    }
  };

  const drawTableHead = (y: number) => {
    doc.setFillColor(...BLUE);
    doc.rect(left, y, cols.reduce((s, c) => s + c.w, 0), 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    let x = left;
    cols.forEach((c) => {
      doc.text(c.label, x + 1.5, y + 5.4);
      x += c.w;
    });
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "normal");
    return y + 8;
  };

  drawHeaderBar();
  let y = 24;

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(8.5);
  if (info.fornecedor) {
    doc.text(`Fornecedor: ${info.fornecedor}`, left, y);
    y += 5;
  }
  if (info.observacoes) {
    const lines = doc.splitTextToSize(`Observações: ${info.observacoes}`, pageW - left * 2);
    doc.text(lines, left, y);
    y += lines.length * 4.2 + 1;
  }
  doc.setFontSize(8);
  doc.text("Os campos de preço, prazo, marca e observação são editáveis neste PDF.", left, y);
  y += 5;

  y = drawTableHead(y);

  itens.forEach((item, idx) => {
    if (y + rowH > pageH - 14) {
      doc.addPage();
      drawHeaderBar();
      y = drawTableHead(24);
    }

    if (idx % 2 === 1) {
      doc.setFillColor(239, 246, 255);
      doc.rect(left, y, cols.reduce((s, c) => s + c.w, 0), rowH, "F");
    }
    doc.setDrawColor(210, 215, 225);
    doc.setLineWidth(0.2);
    doc.rect(left, y, cols.reduce((s, c) => s + c.w, 0), rowH);

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(8);
    const descLines = doc.splitTextToSize(item.material, cols[2]!.w - 3).slice(0, 2);
    const cells = [
      String(idx + 1),
      item.codigo || "—",
      descLines,
      item.unidade,
      String(item.quantidade),
    ];
    let x = left;
    cells.forEach((value, ci) => {
      doc.text(value as string | string[], x + 1.5, y + (ci === 2 && Array.isArray(value) && value.length > 1 ? 3.6 : 5.8));
      x += cols[ci]!.w;
    });

    // Campos editáveis (AcroForm)
    const fieldDefs: { name: string; w: number }[] = [
      { name: `preco_${idx + 1}`, w: cols[5]!.w },
      { name: `prazo_${idx + 1}`, w: cols[6]!.w },
      { name: `marca_${idx + 1}`, w: cols[7]!.w },
      { name: `obs_${idx + 1}`, w: cols[8]!.w },
    ];
    fieldDefs.forEach((def) => {
      const field = new AcroFormTextField();
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
  doc.text("Condições de pagamento:", left, y);
  const condFields: { name: string; x: number; w: number }[] = [
    { name: "condicoes_pagamento", x: left + 42, w: 90 },
    { name: "validade_proposta", x: left + 178, w: 60 },
  ];
  doc.text("Validade da proposta:", left + 138, y);
  condFields.forEach((c) => {
    const field = new AcroFormTextField();
    field.fieldName = c.name;
    field.Rect = [c.x, y - 4.5, c.w, 6.5];
    field.fontSize = 9;
    field.value = "";
    doc.addField(field);
  });

  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(`Cotação — ${info.assunto} — gerado em ${dataEnvio}`, pageW / 2, pageH - 5, { align: "center" });

  doc.save(`cotacao_${slug(info.assunto)}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
