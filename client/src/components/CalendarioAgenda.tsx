import { useState } from "react";
import type { RouterOutputs } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Appt = RouterOutputs["appointments"]["list"][number];

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Cores por status, iguais às da tabela. Cancelada riscada.
const corPorStatus: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 hover:bg-blue-200",
  completed: "bg-green-100 text-green-800 hover:bg-green-200",
  cancelled: "bg-red-100 text-red-800 line-through hover:bg-red-200",
  no_show: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
};

function zerarHora(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function inicioDaSemana(base: Date): Date {
  const d = zerarHora(base);
  d.setDate(d.getDate() - d.getDay()); // volta ao domingo
  return d;
}

function mesmoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const hora = (v: string | Date) =>
  new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * Agenda em calendário, com duas granularidades: SEMANA (dom–sáb, cada consulta
 * detalhada) e MÊS (grade do calendário inteiro). Clicar num dia no mês AMPLIA
 * para a semana daquele dia — o "zoom" que um calendário de verdade tem.
 * Reaproveita a mesma lista de consultas da tabela.
 */
export function CalendarioAgenda({
  appointments,
  patientName,
  onSelect,
}: {
  appointments: Appt[];
  patientName: (id: number) => string;
  onSelect: (appt: Appt) => void;
}) {
  const [modo, setModo] = useState<"semana" | "mes">("semana");
  const [cursor, setCursor] = useState(new Date());
  const hoje = new Date();

  const doDia = (dia: Date) =>
    appointments
      .filter((a) => mesmoDia(new Date(a.scheduledAt), dia))
      .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));

  const navegar = (dir: -1 | 1) =>
    setCursor((c) => {
      const n = new Date(c);
      if (modo === "semana") n.setDate(n.getDate() + dir * 7);
      else n.setMonth(n.getMonth() + dir);
      return n;
    });

  // Dias a desenhar + rótulo do período.
  let dias: Date[];
  let label: string;
  if (modo === "semana") {
    const inicio = inicioDaSemana(cursor);
    dias = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      return d;
    });
    const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
    label = `${inicio.toLocaleDateString("pt-BR", opts)} – ${dias[6].toLocaleDateString("pt-BR", opts)}`;
  } else {
    const primeiro = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const inicioGrade = zerarHora(primeiro);
    inicioGrade.setDate(1 - primeiro.getDay()); // recua ao domingo antes do dia 1
    const ultimoDia = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const semanas = Math.ceil((primeiro.getDay() + ultimoDia) / 7);
    dias = Array.from({ length: semanas * 7 }, (_, i) => {
      const d = new Date(inicioGrade);
      d.setDate(inicioGrade.getDate() + i);
      return d;
    });
    label = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }

  const ampliarDia = (dia: Date) => {
    setCursor(dia);
    setModo("semana");
  };

  const abaBtn = (ativo: boolean) =>
    `px-2.5 py-1 rounded-md text-sm transition-colors ${
      ativo ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="space-y-3">
      {/* Navegação + granularidade */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => navegar(-1)} aria-label="Anterior">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
            Hoje
          </Button>
          <Button variant="outline" size="icon" onClick={() => navegar(1)} aria-label="Próximo">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <span className="ml-2 text-sm font-medium text-foreground capitalize">{label}</span>
        </div>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          <button onClick={() => setModo("semana")} className={abaBtn(modo === "semana")}>
            Semana
          </button>
          <button onClick={() => setModo("mes")} className={abaBtn(modo === "mes")}>
            Mês
          </button>
        </div>
      </div>

      {modo === "semana" ? (
        <div className="overflow-x-auto">
          <div className="grid grid-cols-7 gap-2 min-w-[760px]">
            {dias.map((dia, i) => {
              const ehHoje = mesmoDia(dia, hoje);
              const consultas = doDia(dia);
              return (
                <div
                  key={i}
                  className={`rounded-lg border p-2 min-h-[180px] ${
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
                        <span className="font-semibold">{hora(a.scheduledAt)}</span>
                        <span className="block truncate">{patientName(a.patientId)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-7 mb-1">
              {DIAS.map((d) => (
                <div key={d} className="text-xs text-muted-foreground text-center py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {dias.map((dia, i) => {
                const ehHoje = mesmoDia(dia, hoje);
                const foraDoMes = dia.getMonth() !== cursor.getMonth();
                const consultas = doDia(dia);
                return (
                  // Dia clicável = amplia para a semana. Não é <button> para não
                  // aninhar botões (os chips são botões).
                  <div
                    key={i}
                    role="button"
                    tabIndex={0}
                    onClick={() => ampliarDia(dia)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        ampliarDia(dia);
                      }
                    }}
                    title="Clique para ampliar esta semana"
                    className={`rounded-lg border p-1.5 min-h-[96px] cursor-pointer transition-colors ${
                      ehHoje ? "border-primary bg-primary/[0.03]" : "border-border hover:border-primary/50"
                    } ${foraDoMes ? "opacity-40" : ""}`}
                  >
                    <div
                      className={`text-xs font-semibold mb-1 ${
                        ehHoje ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {dia.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {consultas.slice(0, 3).map((a) => (
                        <button
                          key={a.id}
                          onClick={(e) => {
                            e.stopPropagation(); // não amplia; abre a consulta
                            onSelect(a);
                          }}
                          title={`${patientName(a.patientId)} — clique para abrir`}
                          className={`w-full text-left rounded px-1 py-0.5 text-[11px] leading-tight truncate transition-colors ${
                            corPorStatus[a.status] ?? "bg-muted text-foreground"
                          }`}
                        >
                          <span className="font-semibold">{hora(a.scheduledAt)}</span>{" "}
                          {patientName(a.patientId).split(" ")[0]}
                        </button>
                      ))}
                      {consultas.length > 3 && (
                        <p className="text-[10px] text-muted-foreground pl-1">
                          +{consultas.length - 3} mais
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
