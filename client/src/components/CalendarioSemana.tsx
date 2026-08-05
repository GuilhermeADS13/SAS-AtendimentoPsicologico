import { useState } from "react";
import type { RouterOutputs } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Appt = RouterOutputs["appointments"]["list"][number];

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Cores por status, iguais às da tabela (getStatusColor). Cancelada riscada.
const corPorStatus: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 hover:bg-blue-200",
  completed: "bg-green-100 text-green-800 hover:bg-green-200",
  cancelled: "bg-red-100 text-red-800 line-through hover:bg-red-200",
  no_show: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
};

function inicioDaSemana(base: Date): Date {
  const d = new Date(base);
  d.setDate(d.getDate() - d.getDay()); // volta ao domingo
  d.setHours(0, 0, 0, 0);
  return d;
}

function mesmoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Agenda em grade semanal (domingo a sábado), do jeito que profissional de saúde
 * pensa a semana. Navega semana a semana; "Hoje" volta à atual. Reaproveita a
 * mesma lista de consultas da tabela — é só outra forma de ver os mesmos dados.
 */
export function CalendarioSemana({
  appointments,
  patientName,
  onSelect,
}: {
  appointments: Appt[];
  patientName: (id: number) => string;
  onSelect: (appt: Appt) => void;
}) {
  const [offset, setOffset] = useState(0); // semanas a partir da atual
  const hoje = new Date();

  const inicio = inicioDaSemana(hoje);
  inicio.setDate(inicio.getDate() + offset * 7);
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    return d;
  });
  const fim = dias[6];

  const doDia = (dia: Date) =>
    appointments
      .filter((a) => mesmoDia(new Date(a.scheduledAt), dia))
      .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));

  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  const rangeLabel = `${inicio.toLocaleDateString("pt-BR", opts)} – ${fim.toLocaleDateString("pt-BR", opts)}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setOffset((o) => o - 1)}
            aria-label="Semana anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOffset(0)}>
            Hoje
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setOffset((o) => o + 1)}
            aria-label="Próxima semana"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <span className="text-sm font-medium text-foreground capitalize">{rangeLabel}</span>
      </div>

      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 gap-2 min-w-[720px]">
          {dias.map((dia, i) => {
            const ehHoje = mesmoDia(dia, hoje);
            const consultas = doDia(dia);
            return (
              <div
                key={i}
                className={`rounded-lg border p-2 min-h-[120px] ${
                  ehHoje ? "border-primary bg-primary/[0.03]" : "border-border"
                }`}
              >
                <div className="text-xs text-muted-foreground mb-2">
                  {DIAS[i]}{" "}
                  <span className={`font-semibold ${ehHoje ? "text-primary" : "text-foreground"}`}>
                    {dia.getDate()}
                  </span>
                </div>
                <div className="space-y-1">
                  {consultas.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => onSelect(a)}
                      title={`${patientName(a.patientId)} — clique para abrir`}
                      className={`w-full text-left rounded px-1.5 py-1 text-xs transition-colors ${
                        corPorStatus[a.status] ?? "bg-muted text-foreground"
                      }`}
                    >
                      <span className="font-semibold">
                        {new Date(a.scheduledAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>{" "}
                      <span className="block truncate">{patientName(a.patientId)}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
