import { useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import { PLUGINS_REHYPE_SEGUROS } from "@/lib/markdownSeguro";
import { textoSemMarkdown } from "@shared/notasMarkdown";
import { toast } from "sonner";
import { Award, CalendarDays, ChevronDown, ChevronUp, Clock, Flag, Layers, Plus, Repeat, RotateCcw, Search, SlidersHorizontal, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ClassificacaoDaSessao, type Classificacao } from "@/components/ClassificacaoDaSessao";
import { GraficoDeHumor } from "@/components/GraficoDeHumor";
import { EscolherFrequencia } from "@/components/EscolherFrequencia";
import { descreverFrequencia, lerFrequencia } from "@shared/frequencia";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatarData, formatarDataHora, formatarMesAno } from "@shared/datas";
import { SOAP_CAMPOS } from "@shared/prontuario";
import { contemTodos, termosDaBusca, trechosDestacados } from "@shared/buscaTexto";
import { duracaoEmPalavras, momentosDaEvolucao, resumoDaEvolucao, rotuloDaFase, type Fase, type Marco } from "@shared/evolucao";

export type SessaoDaEvolucao = {
  id: number;
  startedAt: Date | string;
  mood?: string | null;
  clinicalNotes?: string | null;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  treatment?: string | null;
  nextSteps?: string | null;
  moodScore?: number | null;
  fase?: string | null;
};

/** Os textos de uma sessão, na ordem em que aparecem no cartão aberto. */
function camposDaSessao(s: SessaoDaEvolucao): { rotulo: string | null; texto: string }[] {
  return [
    { rotulo: null, texto: s.clinicalNotes ?? "" },
    ...SOAP_CAMPOS.map((c) => ({ rotulo: c.rotulo, texto: (s[c.chave] as string | null | undefined) ?? "" })),
    { rotulo: "Tratamento", texto: s.treatment ?? "" },
    { rotulo: "Próximos passos", texto: s.nextSteps ?? "" },
  ].filter((c) => c.texto.trim());
}

const ICONE_DO_MARCO: Record<Marco["tipo"], typeof Flag> = { inicio: Flag, retorno: RotateCcw, contagem: Award, fase: Layers };

function Destacado({ texto, termos }: { texto: string; termos: string[] }) {
  return (
    <>
      {trechosDestacados(texto, termos).map((t, i) =>
        t.destaque ? (
          <mark key={i} className="rounded bg-amber-200/70 px-0.5 text-foreground dark:bg-amber-500/30">
            {t.texto}
          </mark>
        ) : (
          <span key={i}>{t.texto}</span>
        ),
      )}
    </>
  );
}

/**
 * Aba "Evolução" do prontuário: a história do acompanhamento como uma linha do
 * tempo, um cartão por sessão, separado por mês. Os marcos (início, retorno após
 * pausa, a cada 10 sessões) e o resumo vêm de shared/evolucao.ts — nada novo é
 * gravado; é outra forma de LER as sessões que já existem.
 */
export function LinhaDoTempoEvolucao({
  patientId,
  frequencia,
  sessoes,
  aoNovaSessao,
  exemplo = false,
}: {
  patientId: number;
  /** Prontuário de exemplo: classificar e alterar só avisam, nada é gravado. */
  exemplo?: boolean;
  /** A escolhida pela psicóloga (patients.frequencia); sem ela, calculada pelas sessões. */
  frequencia: string | null | undefined;
  sessoes: readonly SessaoDaEvolucao[];
  aoNovaSessao: () => void;
}) {
  const frequenciaDefinida = lerFrequencia(frequencia);
  const utils = trpc.useUtils();
  // Sessão sendo classificada (humor/fase) e o rascunho dela.
  const [classificando, setClassificando] = useState<{ id: number; valor: Classificacao } | null>(null);
  const classificar = trpc.sessions.classificar.useMutation({
    onSuccess: () => {
      void utils.sessions.getByPatient.invalidate({ patientId });
      setClassificando(null);
      toast.success("Sessão classificada.");
    },
    onError: (e) => toast.error(e.message || "Não foi possível salvar."),
  });
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<number>>(() => new Set());
  const termos = termosDaBusca(busca);
  const resumo = useMemo(() => resumoDaEvolucao(sessoes), [sessoes]);
  const momentos = useMemo(() => momentosDaEvolucao(sessoes), [sessoes]);
  const visiveis = momentos.filter((m) =>
    contemTodos([m.sessao.mood ?? "", ...camposDaSessao(m.sessao).map((c) => textoSemMarkdown(c.texto))].join("\n"), termos),
  );

  // Separa por mês mantendo a ordem (mais recente primeiro).
  const meses: { mes: string; itens: typeof visiveis }[] = [];
  for (const m of visiveis) {
    const ultimo = meses[meses.length - 1];
    if (ultimo?.mes === m.mes) ultimo.itens.push(m);
    else meses.push({ mes: m.mes, itens: [m] });
  }

  const alternar = (id: number) =>
    setAbertos((a) => {
      const novo = new Set(a);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">Evolução do paciente</h2>
          <p className="text-sm text-muted-foreground">Cada sessão é um momento do acompanhamento, do mais recente ao primeiro.</p>
        </div>
        <Button onClick={aoNovaSessao} className="bg-primary hover:bg-primary/90">
          <Plus className="mr-2 size-4" />
          Nova Sessão
        </Button>
      </div>

      {resumo.total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <TrendingUp className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium text-foreground">A evolução aparece aqui a partir da primeira sessão.</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Registre a sessão em "Nova Sessão" ou pelas anotações da videochamada.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Resumo do acompanhamento */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                icone: CalendarDays,
                rotulo: "Acompanhamento",
                valor: duracaoEmPalavras(resumo.diasDeAcompanhamento ?? 0),
                nota: `desde ${formatarData(resumo.inicio)}`,
              },
              { icone: TrendingUp, rotulo: "Sessões", valor: String(resumo.total), nota: "registradas" },
              {
                icone: Repeat,
                rotulo: "Frequência",
                // A escolhida pela psicóloga vale mais que a calculada pelas sessões.
                valor: frequenciaDefinida ? descreverFrequencia(frequenciaDefinida) : (resumo.frequencia ?? "—"),
                nota: "",
                acao: <EscolherFrequencia patientId={patientId} atual={frequencia} exemplo={exemplo} />,
              },
              { icone: Clock, rotulo: "Última sessão", valor: formatarData(resumo.ultima), nota: "" },
            ].map(({ icone: Icone, rotulo, valor, nota, acao }) => (
              <Card key={rotulo}>
                <CardContent className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icone className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{rotulo}</p>
                    {/* text-sm no celular: com text-base a data quebrava no meio ("14/10/202" / "6"). */}
                    <p className="text-sm font-semibold text-foreground first-letter:uppercase sm:text-base">{valor}</p>
                    {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
                    {acao}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <GraficoDeHumor
            pontos={momentos.map((m) => ({
              numero: m.numero,
              moodScore: m.sessao.moodScore ?? null,
              startedAt: m.sessao.startedAt,
              fase: m.fase,
            }))}
          />

          {/* Busca nas evoluções */}
          <div className="space-y-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar nas evoluções (ex.: sono, ansiedade)"
                aria-label="Buscar nas evoluções"
                className="pl-9"
              />
            </div>
            {termos.length > 0 && (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {visiveis.length === 0
                  ? "Nenhuma sessão fala disso."
                  : `${visiveis.length} de ${momentos.length} sessões`}
              </p>
            )}
          </div>

          {/* Linha do tempo */}
          <div className="space-y-6">
            {meses.map(({ mes, itens }) => (
              <section key={mes} className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground first-letter:uppercase">
                  {formatarMesAno(itens[0].sessao.startedAt)} · {itens.length} {itens.length === 1 ? "sessão" : "sessões"}
                </h3>
                <ol className="relative space-y-3 border-l-2 border-border pl-5">
                  {itens.map((m) => {
                    const campos = camposDaSessao(m.sessao);
                    // Busca ativa abre o cartão: o trecho achado pode estar no fim da evolução.
                    const aberto = abertos.has(m.sessao.id) || termos.length > 0;
                    const temMarco = m.marcos.length > 0;
                    return (
                      <li key={m.sessao.id} className="relative">
                        <span
                          aria-hidden
                          className={cn(
                            "absolute -left-[27px] top-5 size-3 rounded-full border-2 border-background",
                            temMarco ? "bg-primary ring-2 ring-primary/30" : "bg-muted-foreground/40",
                          )}
                        />
                        <Card className={cn(temMarco && "border-primary/30")}>
                          <CardContent className="space-y-3">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                                Sessão {m.numero}
                              </span>
                              <span className="text-sm font-medium text-foreground">{formatarDataHora(m.sessao.startedAt)}</span>
                              {m.diasDesdeAnterior !== null && (
                                <span className="text-xs text-muted-foreground">
                                  {m.diasDesdeAnterior === 0
                                    ? "no mesmo dia da anterior"
                                    : `${m.diasDesdeAnterior} ${m.diasDesdeAnterior === 1 ? "dia" : "dias"} após a anterior`}
                                </span>
                              )}
                              {m.sessao.moodScore != null && (
                                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium tabular-nums text-secondary-foreground">
                                  Humor {m.sessao.moodScore}/10
                                </span>
                              )}
                              {m.sessao.mood && (
                                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                                  Humor: <Destacado texto={m.sessao.mood} termos={termos} />
                                </span>
                              )}
                              {m.fase && (
                                <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                                  {rotuloDaFase(m.fase)}
                                </span>
                              )}
                            </div>

                            {temMarco && (
                              <div className="flex flex-wrap gap-2">
                                {m.marcos.map((marco) => {
                                  const Icone = ICONE_DO_MARCO[marco.tipo];
                                  return (
                                    <span
                                      key={marco.tipo}
                                      className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary"
                                    >
                                      <Icone className="size-3.5" aria-hidden />
                                      {marco.texto}
                                    </span>
                                  );
                                })}
                              </div>
                            )}

                            {campos.length === 0 ? (
                              <p className="text-sm italic text-muted-foreground">Sessão sem evolução escrita.</p>
                            ) : aberto ? (
                              <div className="space-y-2">
                                {campos.map((c, i) =>
                                  // Buscando: texto limpo com o trecho destacado. Sem busca: a
                                  // anotação FORMATADA (negrito, listas), como no "Ver formatado".
                                  termos.length > 0 ? (
                                    <p key={i} className="whitespace-pre-wrap text-sm text-foreground">
                                      {c.rotulo && <span className="font-medium">{c.rotulo}: </span>}
                                      <Destacado texto={textoSemMarkdown(c.texto)} termos={termos} />
                                    </p>
                                  ) : (
                                    <div key={i} className="text-sm text-foreground [&_ol]:pl-5 [&_ul]:pl-5">
                                      {c.rotulo && <p className="font-medium">{c.rotulo}</p>}
                                      <Streamdown rehypePlugins={PLUGINS_REHYPE_SEGUROS}>{c.texto}</Streamdown>
                                    </div>
                                  ),
                                )}
                              </div>
                            ) : (
                              // Resumo SEM as marcas: mostrava "**Evolução**" cru.
                              <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                                {campos[0].rotulo && <span className="font-medium text-foreground">{campos[0].rotulo}: </span>}
                                {textoSemMarkdown(campos[0].texto)}
                              </p>
                            )}

                            {classificando?.id === m.sessao.id ? (
                              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                                <ClassificacaoDaSessao
                                  idBase={`classificar-${m.sessao.id}`}
                                  valor={classificando.valor}
                                  aoMudar={(valor) => setClassificando({ id: m.sessao.id, valor })}
                                />
                                <div className="flex justify-end gap-2">
                                  <Button variant="ghost" size="sm" onClick={() => setClassificando(null)}>
                                    Cancelar
                                  </Button>
                                  <Button
                                    size="sm"
                                    disabled={classificar.isPending}
                                    onClick={() =>
                                      exemplo
                                        ? toast.info("Este é um prontuário de exemplo: nada aqui é salvo.")
                                        : classificar.mutate({
                                        sessionId: m.sessao.id,
                                        moodScore: classificando.valor.moodScore,
                                        fase: classificando.valor.fase,
                                      })
                                    }
                                  >
                                    {classificar.isPending ? "Salvando..." : "Salvar"}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                {campos.length > 0 && termos.length === 0 && (
                                  <button
                                    type="button"
                                    onClick={() => alternar(m.sessao.id)}
                                    aria-expanded={aberto}
                                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                                  >
                                    {aberto ? (
                                      <>
                                        <ChevronUp className="size-4" aria-hidden /> Mostrar menos
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="size-4" aria-hidden /> Ver evolução completa
                                      </>
                                    )}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setClassificando({
                                      id: m.sessao.id,
                                      // A fase MARCADA nesta sessão (não a herdada): é o que se edita.
                                      valor: { moodScore: m.sessao.moodScore ?? null, fase: (rotuloDaFase(m.sessao.fase) ? m.sessao.fase : null) as Fase | null },
                                    })
                                  }
                                  className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
                                >
                                  <SlidersHorizontal className="size-4" aria-hidden /> Classificar
                                </button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
