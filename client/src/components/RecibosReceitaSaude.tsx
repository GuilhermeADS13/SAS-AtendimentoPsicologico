import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronLeft, ChevronRight, FileDown, Receipt } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { baixar } from "@/lib/prontuario-export";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatarBRL } from "@shared/dinheiro";
import { formatarData } from "@shared/datas";
import { idadeEmAnos } from "@shared/conhecer";
import { cpfValido, mascaraCpf } from "@shared/recibo";
import {
  arquivoDoCarneLeao,
  dataDoPagamento,
  mesEmBrasilia,
  nomeDoArquivo,
  problemasDoLote,
  type ReciboDoLote,
} from "@shared/receitaSaude";

type Modo = "pagamento" | "consulta";

const nomeDoMes = (ano: number, mes: number) => {
  const texto = new Date(Date.UTC(ano, mes - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

/**
 * Financeiro: os recibos do mês num arquivo só, para importar no Carnê-Leão e emitir de
 * uma vez no Receita Saúde (shared/receitaSaude.ts). Os CPFs que faltam são preenchidos
 * aqui e ficam salvos; o de quem pagou, quando é outra pessoa, vale só para este arquivo,
 * como no recibo em PDF.
 */
export function RecibosReceitaSaude() {
  const utils = trpc.useUtils();
  const [aberto, setAberto] = useState(false);
  const [{ ano, mes }, setMes] = useState(() => mesEmBrasilia(new Date()));
  const [modo, setModo] = useState<Modo>("pagamento");
  // Consultas em que ela mudou a marcação padrão (paga e realizada entra; cancelada ou falta, não).
  const [alteradas, setAlteradas] = useState<Set<number>>(new Set());
  const [cpfDigitado, setCpfDigitado] = useState<Record<number, string>>({});
  const [outroPagou, setOutroPagou] = useState<Record<number, boolean>>({});
  const [cpfDoPagador, setCpfDoPagador] = useState<Record<number, string>>({});
  const [cpfDela, setCpfDela] = useState("");

  const { data: consultas = [], isLoading } = trpc.appointments.recibosParaReceitaSaude.useQuery({ ano }, { enabled: aberto });
  const { data: perfil } = trpc.therapists.me.useQuery(undefined, { enabled: aberto });

  // O CPF salvo entra uma vez por abertura: buscar o perfil de novo não apaga o que ela digita.
  const cpfPreenchido = useRef(false);
  useEffect(() => {
    if (!aberto) {
      cpfPreenchido.current = false;
      return;
    }
    if (!perfil || cpfPreenchido.current) return;
    cpfPreenchido.current = true;
    setCpfDela(perfil.cpf ? mascaraCpf(perfil.cpf) : "");
  }, [aberto, perfil]);

  const salvarCpfDela = trpc.therapists.definirDadosDoRecibo.useMutation({
    onSuccess: () => {
      utils.therapists.me.invalidate();
      toast.success("Seu CPF ficou salvo.");
    },
    onError: (e) => toast.error(e.message || "Não foi possível salvar."),
  });
  const salvarCpfDoPaciente = trpc.patients.definirCpf.useMutation({
    onSuccess: () => {
      utils.appointments.recibosParaReceitaSaude.invalidate();
      toast.success("CPF salvo no cadastro do paciente.");
    },
    onError: (e) => toast.error(e.message || "Não foi possível salvar."),
  });

  const andarMes = (passo: number) => {
    const total = ano * 12 + (mes - 1) + passo;
    setMes({ ano: Math.floor(total / 12), mes: (total % 12) + 1 });
    setAlteradas(new Set());
  };

  const dataDoRecibo = (c: (typeof consultas)[number]) => (modo === "pagamento" ? dataDoPagamento(c) : new Date(c.scheduledAt));
  // Cancelada ou falta que foi paga começa DESMARCADA: o recibo diz "psicoterapia realizada".
  const naoAconteceu = (c: (typeof consultas)[number]) => c.status === "cancelled" || c.status === "no_show";
  const marcada = (c: (typeof consultas)[number]) => (alteradas.has(c.id) ? naoAconteceu(c) : !naoAconteceu(c));

  // As consultas do mês escolhido, por paciente.
  const grupos = useMemo(() => {
    const porPaciente = new Map<number, { patientId: number; nome: string; cpf: string | null; menor: boolean; responsavel: string | null; consultas: typeof consultas }>();
    for (const c of consultas) {
      const m = mesEmBrasilia(dataDoRecibo(c));
      if (m.ano !== ano || m.mes !== mes) continue;
      let g = porPaciente.get(c.patientId);
      if (!g) {
        // O nascimento é gravado à meia-noite em UTC (ver formatarNascimento): lido em
        // Brasília, viraria o dia anterior e erraria a idade na véspera do aniversário.
        const idade = c.dateOfBirth ? idadeEmAnos(new Date(c.dateOfBirth).toISOString().slice(0, 10)) : null;
        g = {
          patientId: c.patientId,
          nome: `${c.firstName} ${c.lastName}`.trim(),
          cpf: c.cpf,
          menor: idade !== null && idade < 18,
          responsavel: c.guardianName,
          consultas: [],
        };
        porPaciente.set(c.patientId, g);
      }
      g.consultas.push(c);
    }
    return Array.from(porPaciente.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [consultas, ano, mes, modo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Menor de idade: quem paga costuma ser o responsável, então já começa marcado.
  const pagouOutro = (g: (typeof grupos)[number]) => outroPagou[g.patientId] ?? (g.menor || !!g.responsavel);

  const recibos: ReciboDoLote[] = grupos.flatMap((g) =>
    g.consultas
      .filter(marcada)
      .map((c) => ({
        pagoEm: dataDoRecibo(c),
        consultaEm: new Date(c.scheduledAt),
        valorCentavos: c.price ?? 0,
        cpfPagador: pagouOutro(g) ? (cpfDoPagador[g.patientId] ?? "") : (g.cpf ?? ""),
        cpfBeneficiario: g.cpf ?? "",
      })),
  );
  const total = recibos.reduce((soma, r) => soma + r.valorCentavos, 0);
  const cpfSalvoDela = perfil?.cpf ?? null;
  const problemas = problemasDoLote(recibos, cpfSalvoDela);

  const alternar = (id: number) =>
    setAlteradas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });

  const baixarArquivo = () => {
    if (problemas.length || !cpfSalvoDela) return;
    const texto = arquivoDoCarneLeao(recibos, cpfSalvoDela);
    baixar(new Blob([texto], { type: "text/csv" }), nomeDoArquivo(ano, mes));
    toast.success(`Arquivo com ${recibos.length} recibo${recibos.length === 1 ? "" : "s"} baixado. Agora é importar no Carnê-Leão.`);
  };

  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Receipt className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">Recibos do Receita Saúde</p>
            <p className="text-sm text-muted-foreground">
              Os recibos do mês num arquivo só, para emitir todos de uma vez no Carnê-Leão. Para quem atende sem CNPJ.
            </p>
          </div>
          <Button variant="outline" className="h-9 w-full sm:w-auto" onClick={() => setAberto(true)}>
            <FileDown className="mr-2 size-4" />
            Gerar arquivo do mês
          </Button>
        </CardContent>
      </Card>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Recibos do Receita Saúde</DialogTitle>
            <DialogDescription>
              Gera o arquivo que o Carnê-Leão importa: todos os recibos do mês saem de uma vez, em vez de um por um no app.
              Só vale para quem atende como pessoa física (sem CNPJ).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Mês e qual data vai no recibo. */}
            <div className="flex flex-wrap items-center gap-2">
              {/* O Receita Saúde começou em janeiro de 2025: antes disso não há recibo para emitir. */}
              <Button
                variant="outline"
                size="icon"
                className="size-9"
                onClick={() => andarMes(-1)}
                disabled={ano <= 2025 && mes <= 1}
                aria-label="Mês anterior"
                title="Anterior"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <p className="min-w-40 text-center text-base font-semibold text-foreground" aria-live="polite">
                {nomeDoMes(ano, mes)}
              </p>
              <Button variant="outline" size="icon" className="size-9" onClick={() => andarMes(1)} aria-label="Próximo mês" title="Próximo">
                <ChevronRight className="size-4" />
              </Button>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-foreground">Data que vai no recibo</legend>
              <div className="inline-flex rounded-xl border border-border bg-card p-1" role="group" aria-label="Data do recibo">
                {(
                  [
                    { valor: "pagamento", rotulo: "Do pagamento" },
                    { valor: "consulta", rotulo: "Da consulta" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.valor}
                    type="button"
                    onClick={() => {
                      setModo(o.valor);
                      setAlteradas(new Set());
                    }}
                    aria-pressed={modo === o.valor}
                    className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                      modo === o.valor ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {o.rotulo}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {modo === "pagamento"
                  ? "O recibo vale pela data em que o dinheiro entrou: o “Já paguei” do paciente ou o dia em que você marcou como pago."
                  : "Use se o paciente paga no dia da sessão e você marca o pagamento depois."}
              </p>
            </fieldset>

            {/* CPF dela: o mesmo do Carnê-Leão. O campo só aparece com o perfil carregado:
                salvar o CPF regrava o endereço do recibo, e sem o perfil ele iria vazio. */}
            {!perfil ? null : cpfSalvoDela && cpfValido(cpfSalvoDela) ? (
              <p className="text-sm text-muted-foreground">
                Seu CPF no arquivo: <span className="font-medium text-foreground">{mascaraCpf(cpfSalvoDela)}</span>
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="receita-cpf-dela">Seu CPF (o mesmo que você usa no Carnê-Leão)</Label>
                <div className="flex gap-2">
                  <Input
                    id="receita-cpf-dela"
                    inputMode="numeric"
                    value={cpfDela}
                    onChange={(e) => setCpfDela(mascaraCpf(e.target.value))}
                    placeholder="000.000.000-00"
                  />
                  <Button
                    variant="outline"
                    disabled={!cpfValido(cpfDela) || salvarCpfDela.isPending}
                    onClick={() => salvarCpfDela.mutate({ cpf: cpfDela, endereco: perfil.endereco ?? "" })}
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            )}

            {/* Pacientes e consultas do mês. */}
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando as consultas pagas…</p>
            ) : grupos.length === 0 ? (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                Nenhuma consulta paga em {nomeDoMes(ano, mes).toLowerCase()}. Marque os pagamentos no Financeiro ou na Agenda e
                volte aqui.
              </p>
            ) : (
              <ul className="space-y-3">
                {grupos.map((g) => {
                  const cpfOk = !!g.cpf && cpfValido(g.cpf);
                  const digitado = cpfDigitado[g.patientId] ?? "";
                  const outro = pagouOutro(g);
                  const cpfPagador = cpfDoPagador[g.patientId] ?? "";
                  const doGrupo = g.consultas.filter(marcada).reduce((s, c) => s + (c.price ?? 0), 0);
                  return (
                    <li key={g.patientId} className="space-y-3 rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{g.nome}</p>
                          {cpfOk && <p className="text-xs text-muted-foreground">CPF {mascaraCpf(g.cpf!)}</p>}
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums text-foreground">{formatarBRL(doGrupo)}</span>
                      </div>

                      {!cpfOk && (
                        <div className="space-y-1.5">
                          <Label htmlFor={`receita-cpf-${g.patientId}`} className="text-amber-700 dark:text-amber-400">
                            Falta o CPF do paciente
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id={`receita-cpf-${g.patientId}`}
                              inputMode="numeric"
                              value={digitado}
                              onChange={(e) => setCpfDigitado((a) => ({ ...a, [g.patientId]: mascaraCpf(e.target.value) }))}
                              placeholder="000.000.000-00"
                            />
                            <Button
                              variant="outline"
                              disabled={!cpfValido(digitado) || salvarCpfDoPaciente.isPending}
                              onClick={() => salvarCpfDoPaciente.mutate({ patientId: g.patientId, cpf: digitado })}
                            >
                              Salvar
                            </Button>
                          </div>
                        </div>
                      )}

                      <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={outro}
                          onChange={(e) => setOutroPagou((a) => ({ ...a, [g.patientId]: e.target.checked }))}
                          className="h-4 w-4 accent-primary"
                        />
                        Quem pagou foi outra pessoa{g.responsavel ? ` (${g.responsavel}, por exemplo)` : g.menor ? " (o responsável)" : ""}
                      </label>
                      {outro && (
                        <div className="space-y-1.5">
                          <Label htmlFor={`receita-pagador-${g.patientId}`}>CPF de quem pagou</Label>
                          <Input
                            id={`receita-pagador-${g.patientId}`}
                            inputMode="numeric"
                            value={cpfPagador}
                            onChange={(e) => setCpfDoPagador((a) => ({ ...a, [g.patientId]: mascaraCpf(e.target.value) }))}
                            placeholder="000.000.000-00"
                          />
                        </div>
                      )}

                      <ul className="space-y-1">
                        {g.consultas.map((c) => (
                          <li key={c.id}>
                            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                              <span className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={marcada(c)}
                                  onChange={() => alternar(c.id)}
                                  className="h-4 w-4 accent-primary"
                                />
                                {formatarData(dataDoRecibo(c))}
                                {modo === "pagamento" && (
                                  <span className="text-muted-foreground">· consulta de {formatarData(c.scheduledAt)}</span>
                                )}
                                {naoAconteceu(c) && (
                                  <span className="text-amber-700 dark:text-amber-400">· {c.status === "no_show" ? "falta" : "cancelada"}</span>
                                )}
                              </span>
                              <span className="tabular-nums text-muted-foreground">{formatarBRL(c.price ?? 0)}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Resumo e o que falta. */}
            {grupos.length > 0 && (
              <div className="space-y-3 rounded-lg bg-muted/40 p-3">
                <p className="text-sm text-foreground">
                  <span className="font-semibold">
                    {recibos.length} recibo{recibos.length === 1 ? "" : "s"}
                  </span>{" "}
                  · {formatarBRL(total)}
                </p>
                {problemas.length > 0 && (
                  <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-400">
                    {problemas.map((p) => (
                      <li key={p} className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
                <Button className="w-full sm:w-auto" disabled={problemas.length > 0} onClick={baixarArquivo}>
                  <FileDown className="mr-2 size-4" />
                  Baixar arquivo
                </Button>
              </div>
            )}

            {/* Como importar (manual do Receita Saúde, perguntas 11 e 24). */}
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <p className="font-semibold text-foreground">Como importar no Carnê-Leão</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>
                  Entre no{" "}
                  <a href="https://cav.receita.fazenda.gov.br" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                    e-CAC
                  </a>{" "}
                  com a conta gov.br (prata ou ouro) e abra “Declarações e Demonstrativos” → “Acessar Carnê-Leão”.
                </li>
                <li>
                  Na primeira vez do ano, o Carnê-Leão pede o cadastro: marque que é autônoma e informe a ocupação (psicóloga) e o CRP.
                </li>
                <li>
                  Em “Escrituração”, toque em “Importar Escrituração”, escolha o arquivo e depois “Analisar Arquivo”. Sem erro, toque em
                  “Importar”.
                </li>
                <li>Os recibos aparecem no app Receita Saúde e na declaração do paciente.</li>
              </ol>
              <p className="text-muted-foreground">
                Recibo que você já emitiu no app: desmarque aqui, senão sai em dobro. Errou? No Carnê-Leão, “Histórico da Escrituração”
                → “Desfazer escrituração”.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
