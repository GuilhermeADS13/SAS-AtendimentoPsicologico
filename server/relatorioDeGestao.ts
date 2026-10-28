import { and, eq } from "drizzle-orm";
import { appointments, patients } from "../drizzle/schema";
import { formatarBRL } from "../shared/dinheiro";
import { avaliarSumico } from "./ai/clinical-tools";
import type { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * Relatório da clínica — diferencial do Coro (2026-10-28). Calculado pelo próprio
 * sistema, SEM IA: não gasta a cota da Groq e nenhum nome de paciente sai do
 * servidor. Usa só agenda e financeiro (nada de conteúdo clínico).
 */

export type ConsultaDoRelatorio = {
  patientId: number;
  scheduledAt: Date;
  status: string;
  price: number | null;
  paid: boolean;
  confirmedAt: Date | null;
};
export type PacienteDoRelatorio = { id: number; nome: string; status: string; createdAt: Date };

const DIA = 24 * 60 * 60 * 1000;
/** Consulta que aconteceu (ou estava marcada e passou): não cancelada nem falta. */
const aconteceu = (c: ConsultaDoRelatorio) => c.status !== "cancelled" && c.status !== "no_show";

function resumoDoPeriodo(consultas: ConsultaDoRelatorio[], inicio: number, fim: number) {
  const doPeriodo = consultas.filter((c) => c.scheduledAt.getTime() >= inicio && c.scheduledAt.getTime() < fim);
  const realizadas = doPeriodo.filter(aconteceu);
  const faltas = doPeriodo.filter((c) => c.status === "no_show").length;
  const soma = (lista: ConsultaDoRelatorio[]) => lista.reduce((total, c) => total + (c.price ?? 0), 0);
  return {
    realizadas: realizadas.length,
    faltas,
    canceladas: doPeriodo.filter((c) => c.status === "cancelled").length,
    /** % de quem veio entre quem tinha que vir; null sem nenhuma consulta. */
    comparecimento: realizadas.length + faltas > 0 ? Math.round((realizadas.length / (realizadas.length + faltas)) * 100) : null,
    recebido: soma(realizadas.filter((c) => c.paid)),
    aReceber: soma(realizadas.filter((c) => !c.paid)),
  };
}

export function montarRelatorioDeGestao(
  consultas: ConsultaDoRelatorio[],
  pacientes: PacienteDoRelatorio[],
  agora: Date = new Date(),
  dias = 30,
) {
  const fim = agora.getTime();
  const inicio = fim - dias * DIA;

  // Quem está devendo olha TODO o histórico: dívida de dois meses atrás ainda importa.
  const devendo = new Map<number, number>();
  for (const c of consultas) {
    if (c.scheduledAt.getTime() < fim && aconteceu(c) && !c.paid && (c.price ?? 0) > 0) {
      devendo.set(c.patientId, (devendo.get(c.patientId) ?? 0) + (c.price ?? 0));
    }
  }
  const nomeDe = (id: number) => pacientes.find((p) => p.id === id)?.nome ?? "Paciente";
  const inadimplentes = Array.from(devendo, ([id, total]) => ({ nome: nomeDe(id), total })).sort((a, b) => b.total - a.total);

  const ativos = pacientes.filter((p) => p.status === "active");
  const corte = fim - 30 * DIA;
  const sumidos = ativos
    .filter((p) => avaliarSumico(consultas.filter((c) => c.patientId === p.id), p.createdAt, fim, corte).sumiu)
    .map((p) => p.nome);

  const proximos = consultas.filter(
    (c) => c.status === "scheduled" && c.scheduledAt.getTime() >= fim && c.scheduledAt.getTime() < fim + 7 * DIA,
  );

  return {
    dias,
    atual: resumoDoPeriodo(consultas, inicio, fim),
    /** Os mesmos números no período anterior, para comparar. */
    anterior: resumoDoPeriodo(consultas, inicio - dias * DIA, inicio),
    pacientesAtivos: ativos.length,
    novosPacientes: pacientes.filter((p) => p.createdAt.getTime() >= inicio).length,
    inadimplentes,
    totalDevido: inadimplentes.reduce((total, i) => total + i.total, 0),
    sumidos,
    proximos7Dias: { agendadas: proximos.length, naoConfirmadas: proximos.filter((c) => !c.confirmedAt).length },
  };
}

export type RelatorioDeGestao = ReturnType<typeof montarRelatorioDeGestao>;

export async function relatorioDaPsicologa(db: Db, therapistId: number, agora: Date = new Date()): Promise<RelatorioDeGestao> {
  const [consultas, lista] = await Promise.all([
    db
      .select({
        patientId: appointments.patientId,
        scheduledAt: appointments.scheduledAt,
        status: appointments.status,
        price: appointments.price,
        paid: appointments.paid,
        confirmedAt: appointments.confirmedAt,
      })
      .from(appointments)
      .where(eq(appointments.therapistId, therapistId)),
    db
      .select({ id: patients.id, firstName: patients.firstName, lastName: patients.lastName, status: patients.status, createdAt: patients.createdAt })
      .from(patients)
      .where(and(eq(patients.therapistId, therapistId))),
  ]);
  const pacientes = lista.map((p) => ({ id: p.id, nome: `${p.firstName} ${p.lastName}`.trim(), status: p.status, createdAt: p.createdAt }));
  return montarRelatorioDeGestao(consultas, pacientes, agora);
}

/** "▲ 3" / "▼ 2" / "=" frente ao período anterior. */
function variacao(atual: number, anterior: number, formatar: (n: number) => string = String): string {
  if (atual === anterior) return "igual ao período anterior";
  return `${atual > anterior ? "▲" : "▼"} ${formatar(Math.abs(atual - anterior))} frente ao período anterior`;
}

/** O relatório em texto, para a Luma responder sem passar pela IA. */
export function relatorioEmTexto(r: RelatorioDeGestao): string {
  const a = r.atual;
  const linhas = [
    `**Relatório da clínica — últimos ${r.dias} dias**`,
    "",
    `- Consultas realizadas: **${a.realizadas}** (${variacao(a.realizadas, r.anterior.realizadas)})`,
    `- Faltas: **${a.faltas}** · cancelamentos: **${a.canceladas}**`,
    `- Comparecimento: **${a.comparecimento === null ? "sem consultas no período" : `${a.comparecimento}%`}**`,
    `- Recebido: **${formatarBRL(a.recebido)}** (${variacao(a.recebido, r.anterior.recebido, formatarBRL)})`,
    `- A receber de consultas do período: **${formatarBRL(a.aReceber)}**`,
    `- Pacientes ativos: **${r.pacientesAtivos}** · novos no período: **${r.novosPacientes}**`,
    `- Próximos 7 dias: **${r.proximos7Dias.agendadas}** consultas, **${r.proximos7Dias.naoConfirmadas}** sem confirmação`,
  ];
  if (r.inadimplentes.length) {
    linhas.push(
      "",
      `**Quem está devendo** (total ${formatarBRL(r.totalDevido)}): ${r.inadimplentes
        .slice(0, 5)
        .map((i) => `${i.nome} (${formatarBRL(i.total)})`)
        .join(", ")}${r.inadimplentes.length > 5 ? ` e mais ${r.inadimplentes.length - 5}` : ""}.`,
    );
  }
  if (r.sumidos.length) {
    linhas.push("", `**Sem consulta há mais de 30 dias e nada marcado:** ${r.sumidos.slice(0, 5).join(", ")}${r.sumidos.length > 5 ? ` e mais ${r.sumidos.length - 5}` : ""}.`);
  }
  linhas.push("", "O relatório completo fica no Financeiro.");
  return linhas.join("\n");
}
