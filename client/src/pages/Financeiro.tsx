import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { formatarBRL } from "@shared/dinheiro";
import { Wallet, Clock, TrendingUp, CheckCircle2, Users } from "lucide-react";

type Periodo = "semana" | "mes" | "ano";

/**
 * Início/fim do período escolhido, em datas LOCAIS (o mesmo fuso em que as
 * consultas são exibidas). fim é exclusivo: compara-se com `d >= inicio && d < fim`.
 */
function intervalo(periodo: Periodo): { inicio: Date; fim: Date; label: string } {
  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = hoje.getMonth();

  if (periodo === "semana") {
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - hoje.getDay()); // volta ao domingo
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(inicio);
    fim.setDate(inicio.getDate() + 7);
    return { inicio, fim, label: "esta semana" };
  }
  if (periodo === "ano") {
    return { inicio: new Date(y, 0, 1), fim: new Date(y + 1, 0, 1), label: String(y) };
  }
  return {
    inicio: new Date(y, m, 1),
    fim: new Date(y, m + 1, 1),
    label: hoje.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
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

  const { data: appointments = [] } = trpc.appointments.list.useQuery();
  const { data: patients = [] } = trpc.patients.list.useQuery();

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

  const { inicio, fim, label } = intervalo(periodo);
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
        ? `do pagamento da nossa consulta do dia ${new Date(
            g.consultas[0].scheduledAt,
          ).toLocaleDateString("pt-BR")} (${formatarBRL(g.total)})`
        : `do pagamento de ${g.consultas.length} consultas (total ${formatarBRL(g.total)})`;
    const msg = `Olá, ${nome}! 😊\n\nPassando para lembrar ${corpo}.\n\nQualquer dúvida, estou à disposição!`;
    return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
  };

  // Lembrete de pagamento pelo WhatsApp — semiautomático, igual aos outros
  // avisos: abre no aparelho da psicóloga com a mensagem pronta, ela revisa e
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Financeiro</h1>
          <p className="text-muted-foreground">
            Seus ganhos por período e quem ainda não acertou o pagamento.
          </p>
        </div>

        {/* Seletor de período */}
        <div className="inline-flex rounded-lg border border-border p-1 bg-card">
          {PERIODOS.map((p) => (
            <button
              key={p.valor}
              onClick={() => setPeriodo(p.valor)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                periodo === p.valor
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>

        {/* Cartões do período */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-primary/30 bg-primary/[0.03]">
            <CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-primary" /> Recebido
              </p>
              <p className="text-2xl font-bold text-foreground">{formatarBRL(recebido)}</p>
              <p className="text-xs text-muted-foreground capitalize">{label}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> A receber
              </p>
              <p className="text-2xl font-bold text-foreground">{formatarBRL(aReceber)}</p>
              <p className="text-xs text-muted-foreground">no período</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" /> Previsto
              </p>
              <p className="text-2xl font-bold text-foreground">
                {formatarBRL(recebido + aReceber)}
              </p>
              <p className="text-xs text-muted-foreground">
                {consultasPeriodo} consulta{consultasPeriodo === 1 ? "" : "s"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quem ainda não pagou (todo o histórico) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-foreground">Quem ainda não pagou</h2>
            {totalPendente > 0 && (
              <span className="text-sm font-semibold text-foreground">
                Total: {formatarBRL(totalPendente)}
              </span>
            )}
          </div>

          {grupos.length === 0 ? (
            <Card>
              <CardContent className="flex items-center gap-3 text-muted-foreground">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                Tudo em dia — nenhuma consulta com pagamento pendente.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {grupos.map((g) => {
                const href = lembrarGrupoHref(g);
                const desde = new Date(g.consultas[0].scheduledAt).toLocaleDateString("pt-BR");
                const n = g.consultas.length;
                return (
                  <Card key={g.patientId}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground flex items-center gap-2">
                          <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                          {nomePaciente(g.patientId)}
                          <span className="text-base font-bold text-yellow-700">
                            {formatarBRL(g.total)}
                          </span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {n} consulta{n === 1 ? "" : "s"} pendente{n === 1 ? "" : "s"}
                          {n === 1 ? ` (${desde})` : ` · desde ${desde}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!href}
                          onClick={() => href && window.open(href, "_blank", "noopener")}
                          title={href ? "Lembrar no WhatsApp" : "Paciente sem telefone"}
                          className="text-green-700 hover:bg-green-50 disabled:text-muted-foreground"
                        >
                          <WhatsAppIcon className="w-4 h-4 mr-2" />
                          Lembrar
                        </Button>
                        <Button
                          size="sm"
                          disabled={setPayment.isPending}
                          onClick={() => marcarGrupoPago(g)}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-2" />
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

        <Button variant="ghost" onClick={() => setLocation("/appointments")} className="text-muted-foreground">
          <Wallet className="w-4 h-4 mr-2" />
          Lançar valores e pagamentos na agenda
        </Button>
      </div>
    </DashboardLayout>
  );
}
