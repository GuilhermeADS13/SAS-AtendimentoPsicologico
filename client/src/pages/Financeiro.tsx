import { useState } from "react";
import { formatarData, formatarMesAno } from "@shared/datas";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { formatarBRL } from "@shared/dinheiro";
import { DollarSign, Clock, TrendingUp, CheckCircle2, Users, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { AvatarDaPessoa } from "@/components/AvatarDaPessoa";

type Periodo = "semana" | "mes" | "ano";

/**
 * Início/fim do período escolhido, em datas LOCAIS (o mesmo fuso em que as
 * consultas são exibidas). fim é exclusivo: compara-se com `d >= inicio && d < fim`.
 *
 * `deslocamento` anda pelas setas: -1 = semana/mês/ano anterior, +1 = o próximo.
 * Sem isso o painel só mostrava o período ATUAL — uma consulta marcada para o mês
 * que vem não aparecia em "Mês", e parecia que o previsto estava errado.
 */
function intervalo(periodo: Periodo, deslocamento = 0): { inicio: Date; fim: Date; label: string } {
  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = hoje.getMonth();

  if (periodo === "semana") {
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - hoje.getDay() + deslocamento * 7); // domingo da semana
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(inicio);
    fim.setDate(inicio.getDate() + 7);
    const sabado = new Date(fim);
    sabado.setDate(fim.getDate() - 1);
    const dm = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const label = deslocamento === 0 ? "esta semana" : `${dm(inicio)} a ${dm(sabado)}`;
    return { inicio, fim, label };
  }
  if (periodo === "ano") {
    return { inicio: new Date(y + deslocamento, 0, 1), fim: new Date(y + deslocamento + 1, 0, 1), label: String(y + deslocamento) };
  }
  const inicio = new Date(y, m + deslocamento, 1);
  return {
    inicio,
    fim: new Date(y, m + deslocamento + 1, 1),
    label: formatarMesAno(inicio),
  };
}

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mês" },
  { valor: "ano", rotulo: "Ano" },
];

/** Painel financeiro da psicóloga: ganhos por período e quem ainda não pagou. */
export default function Financeiro() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  // Quantas semanas/meses/anos para trás (-) ou para a frente (+) do atual.
  const [deslocamento, setDeslocamento] = useState(0);

  const { data: appointments = [] } = trpc.appointments.list.useQuery();
  const { data: patients = [] } = trpc.patients.list.useQuery();
  // Fotos dos pacientes (assinadas no servidor; a URL vale 1 h).
  const { data: fotos = {} } = trpc.patients.fotos.useQuery(undefined, { staleTime: 50 * 60_000 });

  // Sem toast por chamada: quem confirma é a ação do grupo (marcar tudo pago),
  // que dá uma única mensagem no fim — senão apareceriam N toasts de uma vez.
  const setPayment = trpc.appointments.setPayment.useMutation({
    onError: (e) => toast.error(e.message || "Não foi possível atualizar"),
  });

  const pacienteDe = (id: number) => patients.find((p) => p.id === id);
  const nomePaciente = (id: number) => {
    const p = pacienteDe(id);
    return p ? `${p.firstName} ${p.lastName}` : "Paciente";
  };

  // Uma consulta só "conta" no financeiro se não foi cancelada nem faltada.
  const ativa = (a: (typeof appointments)[number]) =>
    a.status !== "cancelled" && a.status !== "no_show";

  const { inicio, fim, label } = intervalo(periodo, deslocamento);
  const noPeriodo = appointments.filter((a) => {
    const d = new Date(a.scheduledAt);
    return d >= inicio && d < fim;
  });
  const recebido = noPeriodo
    .filter((a) => a.paid)
    .reduce((soma, a) => soma + (a.price ?? 0), 0);
  const aReceber = noPeriodo
    .filter((a) => !a.paid && ativa(a))
    .reduce((soma, a) => soma + (a.price ?? 0), 0);
  const consultasPeriodo = noPeriodo.filter(ativa).length;

  // "Quem não pagou" olha TODO o histórico, não só o período: uma dívida de dois
  // meses atrás ainda importa.
  const pendentes = appointments
    .filter((a) => !a.paid && ativa(a) && (a.price ?? 0) > 0)
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)); // mais antigas primeiro
  const totalPendente = pendentes.reduce((soma, a) => soma + (a.price ?? 0), 0);

  // Agrupado por PACIENTE: "quem não pagou" é pergunta sobre pessoas, não sobre
  // consultas soltas. Um card por paciente, com o total que deve e desde quando.
  // As consultas já vêm ordenadas (mais antiga primeiro), então consultas[0] é a
  // dívida mais antiga da pessoa — e ordenamos os grupos por ela (mais atrasado
  // no topo).
  type Grupo = { patientId: number; consultas: typeof pendentes; total: number };
  const grupos: Grupo[] = [];
  const porId = new Map<number, Grupo>();
  for (const a of pendentes) {
    let g = porId.get(a.patientId);
    if (!g) {
      g = { patientId: a.patientId, consultas: [], total: 0 };
      porId.set(a.patientId, g);
      grupos.push(g);
    }
    g.consultas.push(a);
    g.total += a.price ?? 0;
  }
  grupos.sort(
    (x, y) =>
      +new Date(x.consultas[0].scheduledAt) - +new Date(y.consultas[0].scheduledAt),
  );

  // Marca TODAS as consultas pendentes do paciente como pagas de uma vez (o caso
  // comum: a pessoa acertou tudo). Para baixa parcial, a aba Pagamentos do
  // paciente permite consulta a consulta.
  const marcarGrupoPago = async (g: Grupo) => {
    try {
      await Promise.all(
        g.consultas.map((a) => setPayment.mutateAsync({ id: a.id, paid: true })),
      );
      utils.appointments.list.invalidate();
      toast.success(`${nomePaciente(g.patientId)}: pagamento em dia!`);
    } catch {
      /* o onError da mutation já avisa */
    }
  };

  // Lembrete pelo WhatsApp com o total do paciente (1 ou N consultas).
  const lembrarGrupoHref = (g: Grupo): string | null => {
    const digits = (pacienteDe(g.patientId)?.phone ?? "").replace(/\D/g, "");
    if (!digits) return null;
    const numero = digits.startsWith("55") ? digits : `55${digits}`;
    const nome = nomePaciente(g.patientId).split(" ")[0];
    const corpo =
      g.consultas.length === 1
        ? `do pagamento da nossa consulta do dia ${formatarData(
            g.consultas[0].scheduledAt,
          )} (${formatarBRL(g.total)})`
        : `do pagamento de ${g.consultas.length} consultas (total ${formatarBRL(g.total)})`;
    const msg = `Olá, ${nome}! 😊\n\nPassando para lembrar ${corpo}.\n\nQualquer dúvida, estou à disposição!`;
    return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
  };

  // Lembrete de pagamento pelo WhatsApp — semiautomático, igual aos outros
  // avisos: abre no aparelho da psicóloga com a mensagem pronta, ela revisa e
  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-6">
        {/* Título à esquerda, período à direita (empilha no celular). */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-foreground">Financeiro</h1>
            <p className="text-muted-foreground">Seus ganhos por período e quem ainda não acertou o pagamento.</p>
          </div>
          <div className="inline-flex rounded-xl border border-border bg-card p-1" role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <button
                key={p.valor}
                onClick={() => {
                  setPeriodo(p.valor);
                  setDeslocamento(0);
                }}
                aria-pressed={periodo === p.valor}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                  periodo === p.valor ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        </div>

        {/* Setas para andar pelo período (inclusive para a frente: o previsto). */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            onClick={() => setDeslocamento((d) => d - 1)}
            aria-label={`${PERIODOS.find((x) => x.valor === periodo)?.rotulo} anterior`}
            title="Anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <p className="min-w-40 text-center text-base font-semibold text-foreground first-letter:uppercase" aria-live="polite">
            {label}
          </p>
          <Button
            variant="outline"
            size="icon"
            className="size-9"
            onClick={() => setDeslocamento((d) => d + 1)}
            aria-label={`Próximo ${periodo === "semana" ? "semana" : periodo === "mes" ? "mês" : "ano"}`}
            title="Próximo"
          >
            <ChevronRight className="size-4" />
          </Button>
          {deslocamento !== 0 && (
            <Button variant="ghost" size="sm" className="h-9" onClick={() => setDeslocamento(0)}>
              Hoje
            </Button>
          )}
        </div>

        {/* Cartões do período */}
        <div className="grid gap-4 sm:grid-cols-3" data-tour="financeiro">
          {[
            { icone: DollarSign, rotulo: "Recebido", valor: recebido, nota: label, destaque: true },
            { icone: Clock, rotulo: "A receber", valor: aReceber, nota: "no período", destaque: false },
            {
              icone: TrendingUp,
              rotulo: "Previsto",
              valor: recebido + aReceber,
              nota: `${consultasPeriodo} consulta${consultasPeriodo === 1 ? "" : "s"}`,
              destaque: false,
            },
          ].map(({ icone: Icone, rotulo, valor, nota, destaque }) => (
            <Card key={rotulo} className={destaque ? "border-primary/30 bg-primary/[0.03]" : undefined}>
              <CardContent className="flex items-center gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icone className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{rotulo}</p>
                  <p className="text-2xl font-bold tabular-nums text-foreground">{formatarBRL(valor)}</p>
                  <p className="text-xs text-muted-foreground first-letter:uppercase">{nota}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="border-t" />

        {/* Quem ainda não pagou (todo o histórico) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
              <Users className="size-5 text-muted-foreground" aria-hidden /> Quem ainda não pagou
            </h2>
            {totalPendente > 0 && (
              <span className="text-sm text-muted-foreground">
                Total: <span className="font-bold text-foreground">{formatarBRL(totalPendente)}</span>
              </span>
            )}
          </div>

          {grupos.length === 0 ? (
            <Card>
              <CardContent className="flex items-center gap-3 text-muted-foreground">
                <CheckCircle2 className="size-5 text-primary" />
                Tudo em dia — nenhuma consulta com pagamento pendente.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {grupos.map((g) => {
                const href = lembrarGrupoHref(g);
                const desde = formatarData(g.consultas[0].scheduledAt);
                const n = g.consultas.length;
                return (
                  <Card key={g.patientId}>
                    <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-3">
                      <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
                        <AvatarDaPessoa url={fotos[g.patientId]} nome={nomePaciente(g.patientId)} className="size-11" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{nomePaciente(g.patientId)}</p>
                          <p className="text-sm text-muted-foreground">
                            {n} consulta{n === 1 ? "" : "s"} pendente{n === 1 ? "" : "s"}
                            {n === 1 ? ` (${desde})` : ` · desde ${desde}`}
                          </p>
                        </div>
                        <span className="ml-auto shrink-0 border-l pl-3 text-lg font-bold sm:pl-5 tabular-nums text-amber-700 dark:text-amber-400">
                          {formatarBRL(g.total)}
                        </span>
                      </div>
                      <div className="flex w-full items-center gap-2 sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!href}
                          onClick={() => href && window.open(href, "_blank", "noopener")}
                          title={href ? "Lembrar no WhatsApp" : "Paciente sem telefone"}
                          className="h-9 border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800 disabled:text-muted-foreground dark:border-green-800 dark:text-green-400"
                        >
                          <WhatsAppIcon className="mr-2 size-4" />
                          Lembrar
                        </Button>
                        <Button size="sm" className="h-9" disabled={setPayment.isPending} onClick={() => marcarGrupoPago(g)}>
                          <CheckCircle2 className="mr-2 size-4" />
                          {n === 1 ? "Marcar pago" : "Marcar tudo pago"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setLocation("/appointments")}
          className="flex w-full items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
          <span className="flex-1">Lançar valores e pagamentos na agenda</span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </button>
      </div>
    </DashboardLayout>
  );
}
