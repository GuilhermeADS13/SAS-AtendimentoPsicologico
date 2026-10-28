import { formatarBRL } from "@shared/dinheiro";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Lock } from "lucide-react";

/**
 * Relatório da clínica — diferencial do Coro (2026-10-28). Os números vêm prontos
 * do servidor (server/relatorioDeGestao.ts), calculados sem IA. Fora do Coro, um
 * cartão curto mostra que o recurso existe.
 */
export function RelatorioDaClinica() {
  const { data: assinatura } = trpc.assinatura.minha.useQuery();
  const liberado = assinatura?.recursos?.relatorioDeGestao ?? false;
  const { data: r, isLoading } = trpc.gestao.relatorio.useQuery(undefined, { enabled: liberado });

  if (!assinatura) return null;
  if (!liberado) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-dashed bg-muted/30 px-4 py-3 text-sm">
        <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Relatório da clínica</span> — comparecimento, faltas, quem está
          devendo e quem sumiu, todo mês. Faz parte do plano Coro, combinado na aba Assinatura.
        </p>
      </div>
    );
  }
  if (isLoading || !r) return <Skeleton className="h-40 w-full rounded-xl" />;

  const a = r.atual;
  const numeros = [
    { rotulo: "Consultas realizadas", valor: String(a.realizadas), nota: comparar(a.realizadas, r.anterior.realizadas) },
    { rotulo: "Comparecimento", valor: a.comparecimento === null ? "—" : `${a.comparecimento}%`, nota: `${a.faltas} falta${a.faltas === 1 ? "" : "s"} · ${a.canceladas} cancelada${a.canceladas === 1 ? "" : "s"}` },
    { rotulo: "Recebido", valor: formatarBRL(a.recebido), nota: comparar(a.recebido, r.anterior.recebido, formatarBRL) },
    { rotulo: "Devendo (todo o histórico)", valor: formatarBRL(r.totalDevido), nota: `${r.inadimplentes.length} paciente${r.inadimplentes.length === 1 ? "" : "s"}` },
  ];

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <BarChart3 className="size-5 text-primary" aria-hidden /> Relatório da clínica
          </h2>
          <span className="text-sm text-muted-foreground">últimos {r.dias} dias</span>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {numeros.map((n) => (
            <div key={n.rotulo} className="rounded-lg bg-secondary/50 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{n.rotulo}</dt>
              <dd className="text-xl font-bold tabular-nums text-foreground">{n.valor}</dd>
              <dd className="text-xs text-muted-foreground">{n.nota}</dd>
            </div>
          ))}
        </dl>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>
            Pacientes ativos: <span className="font-medium text-foreground">{r.pacientesAtivos}</span> · novos no período:{" "}
            <span className="font-medium text-foreground">{r.novosPacientes}</span>
          </li>
          <li>
            Próximos 7 dias: <span className="font-medium text-foreground">{r.proximos7Dias.agendadas}</span> consultas,{" "}
            <span className="font-medium text-foreground">{r.proximos7Dias.naoConfirmadas}</span> sem confirmação
          </li>
          {r.sumidos.length > 0 && (
            <li>
              Sem consulta há mais de 30 dias e nada marcado:{" "}
              <span className="font-medium text-foreground">{r.sumidos.join(", ")}</span>
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function comparar(atual: number, anterior: number, formatar: (n: number) => string = String): string {
  if (atual === anterior) return "igual aos 30 dias anteriores";
  return `${atual > anterior ? "▲" : "▼"} ${formatar(Math.abs(atual - anterior))} frente aos 30 dias anteriores`;
}
