import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ClipboardList,
  Download,
  FileDown,
  FileSpreadsheet,
  Loader2,
  Package,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Toaster } from "@/components/ui/sonner";

import {
  excluirCotacao,
  listarCotacoes,
  salvarCotacao,
  type ItemCotacao,
} from "@/lib/cotacoes";
import {
  exportPdfEditavel,
  exportPlanilhaFornecedor,
  exportPlanilhaHistorico,
  fmtData,
} from "@/lib/exportCotacao";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cotação de Pedidos — Controle de Compras" },
      {
        name: "description",
        content:
          "Monte cotações de materiais, gere planilha e PDF editáveis para fornecedores e mantenha todo o histórico salvo.",
      },
      { property: "og:title", content: "Cotação de Pedidos — Controle de Compras" },
      {
        property: "og:description",
        content:
          "Monte cotações de materiais, gere planilha e PDF editáveis para fornecedores e mantenha todo o histórico salvo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CotacaoPage,
});

function linhaVazia(ordem: number): ItemCotacao {
  return { ordem, material: "", codigo: "", unidade: "PC", quantidade: 1, observacao: "" };
}

function CotacaoPage() {
  const queryClient = useQueryClient();

  const [assunto, setAssunto] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [prazoResposta, setPrazoResposta] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [itens, setItens] = useState<ItemCotacao[]>([linhaVazia(0)]);

  const { data: cotacoes = [], isLoading } = useQuery({
    queryKey: ["cotacoes"],
    queryFn: listarCotacoes,
  });

  const salvar = useMutation({
    mutationFn: salvarCotacao,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cotacoes"] });
      toast.success("Cotação salva no histórico.");
    },
    onError: (e: Error) => toast.error(`Não foi possível salvar: ${e.message}`),
  });

  const remover = useMutation({
    mutationFn: excluirCotacao,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cotacoes"] });
      toast.success("Cotação excluída.");
    },
    onError: (e: Error) => toast.error(`Não foi possível excluir: ${e.message}`),
  });

  const itensValidos = itens.filter((i) => i.material.trim() !== "");
  const totalPecas = itensValidos.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);

  function atualizarItem(idx: number, patch: Partial<ItemCotacao>) {
    setItens((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  }

  function validar(): boolean {
    if (!assunto.trim()) {
      toast.error("Informe o assunto da cotação.");
      return false;
    }
    if (itensValidos.length === 0) {
      toast.error("Adicione ao menos um material.");
      return false;
    }
    return true;
  }

  const info = {
    assunto,
    fornecedor,
    observacoes,
    prazoResposta,
  };

  function limpar() {
    setAssunto("");
    setFornecedor("");
    setPrazoResposta("");
    setObservacoes("");
    setItens([linhaVazia(0)]);
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <Toaster />
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-5">
          <ClipboardList className="h-7 w-7" />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Cotação de Pedidos</h1>
            <p className="text-sm opacity-80">
              Monte a cotação, envie planilha e PDF editáveis e mantenha o histórico salvo
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Tabs defaultValue="nova">
          <TabsList>
            <TabsTrigger value="nova">
              <Plus className="mr-1.5 h-4 w-4" /> Nova cotação
            </TabsTrigger>
            <TabsTrigger value="historico">
              <Package className="mr-1.5 h-4 w-4" /> Cotações salvas
              <Badge variant="secondary" className="ml-2">
                {cotacoes.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {/* ── Nova cotação ─────────────────────────────────────────── */}
          <TabsContent value="nova" className="mt-4 space-y-4">
            <section className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <Label htmlFor="assunto">Assunto da cotação *</Label>
                  <Input
                    id="assunto"
                    value={assunto}
                    onChange={(e) => setAssunto(e.target.value)}
                    placeholder="Ex.: Cotação de conexões e válvulas — obra Santos"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="fornecedor">Fornecedor (opcional)</Label>
                  <Input
                    id="fornecedor"
                    value={fornecedor}
                    onChange={(e) => setFornecedor(e.target.value)}
                    placeholder="Nome do fornecedor"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="prazo">Prazo para resposta</Label>
                  <Input
                    id="prazo"
                    type="date"
                    value={prazoResposta}
                    onChange={(e) => setPrazoResposta(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="obs">Observações para o fornecedor</Label>
                  <Textarea
                    id="obs"
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    placeholder="Condições de entrega, local, forma de pagamento desejada..."
                    className="mt-1.5"
                    rows={2}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-lg border bg-card shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Materiais da cotação</h2>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>
                    {itensValidos.length} material(is) · {totalPecas} peça(s)
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setItens((p) => [...p, linhaVazia(p.length)])}>
                    <Plus className="mr-1 h-4 w-4" /> Adicionar linha
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead className="w-32">Código</TableHead>
                      <TableHead>Material / Descrição *</TableHead>
                      <TableHead className="w-20">Un.</TableHead>
                      <TableHead className="w-24">Qtd</TableHead>
                      <TableHead className="w-48">Observação</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <Input
                            value={item.codigo}
                            onChange={(e) => atualizarItem(idx, { codigo: e.target.value })}
                            placeholder="Cód."
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.material}
                            onChange={(e) => atualizarItem(idx, { material: e.target.value })}
                            placeholder="Descrição do material"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.unidade}
                            onChange={(e) => atualizarItem(idx, { unidade: e.target.value })}
                            placeholder="PC"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={item.quantidade}
                            onChange={(e) => atualizarItem(idx, { quantidade: Number(e.target.value) })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.observacao}
                            onChange={(e) => atualizarItem(idx, { observacao: e.target.value })}
                            placeholder="Opcional"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              setItens((p) => (p.length === 1 ? [linhaVazia(0)] : p.filter((_, i) => i !== idx)))
                            }
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap gap-2 border-t px-4 py-3">
                <Button
                  onClick={() => {
                    if (!validar()) return;
                    exportPlanilhaFornecedor(info, itensValidos);
                  }}
                >
                  <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Gerar planilha para fornecedor
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!validar()) return;
                    exportPdfEditavel(info, itensValidos);
                  }}
                >
                  <FileDown className="mr-1.5 h-4 w-4" /> Gerar PDF editável
                </Button>
                <Button
                  variant="outline"
                  disabled={salvar.isPending}
                  onClick={() => {
                    if (!validar()) return;
                    salvar.mutate(
                      { assunto, fornecedor, observacoes, prazoResposta, itens: itensValidos },
                      { onSuccess: limpar },
                    );
                  }}
                >
                  {salvar.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-4 w-4" />
                  )}
                  Salvar cotação
                </Button>
              </div>
            </section>
          </TabsContent>

          {/* ── Histórico ────────────────────────────────────────────── */}
          <TabsContent value="historico" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Button
                variant="outline"
                disabled={cotacoes.length === 0}
                onClick={() => exportPlanilhaHistorico(cotacoes)}
              >
                <Download className="mr-1.5 h-4 w-4" /> Baixar planilha de todas as cotações
              </Button>
            </div>

            {isLoading ? (
              <div className="flex items-center gap-2 p-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando cotações...
              </div>
            ) : cotacoes.length === 0 ? (
              <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
                Nenhuma cotação salva ainda.
              </div>
            ) : (
              <div className="space-y-3">
                {cotacoes.map((c) => (
                  <article key={c.id} className="rounded-lg border bg-card p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{c.assunto}</h3>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          Enviada em {fmtData(c.data_envio)}
                          {c.fornecedor ? ` · ${c.fornecedor}` : ""} · {c.itens.length} material(is) ·{" "}
                          {c.itens.reduce((s, i) => s + i.quantidade, 0)} peça(s)
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            exportPlanilhaFornecedor(
                              {
                                assunto: c.assunto,
                                fornecedor: c.fornecedor,
                                observacoes: c.observacoes,
                                prazoResposta: c.prazo_resposta,
                                dataEnvio: c.data_envio,
                              },
                              c.itens,
                            )
                          }
                        >
                          <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Planilha
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            exportPdfEditavel(
                              {
                                assunto: c.assunto,
                                fornecedor: c.fornecedor,
                                observacoes: c.observacoes,
                                prazoResposta: c.prazo_resposta,
                                dataEnvio: c.data_envio,
                              },
                              c.itens,
                            )
                          }
                        >
                          <FileDown className="mr-1.5 h-4 w-4" /> PDF
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remover.mutate(c.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead className="w-32">Código</TableHead>
                            <TableHead>Material</TableHead>
                            <TableHead className="w-20">Un.</TableHead>
                            <TableHead className="w-20 text-right">Qtd</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {c.itens.map((i, idx) => (
                            <TableRow key={i.id ?? idx}>
                              <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                              <TableCell>{i.codigo || "—"}</TableCell>
                              <TableCell>{i.material}</TableCell>
                              <TableCell>{i.unidade}</TableCell>
                              <TableCell className="text-right tabular-nums">{i.quantidade}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
