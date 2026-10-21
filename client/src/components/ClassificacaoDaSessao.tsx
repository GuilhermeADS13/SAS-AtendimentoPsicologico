import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { FASES, type Fase } from "@shared/evolucao";

export type Classificacao = { moodScore: number | null; fase: Fase | null };

const SEM_FASE = "continua";

/**
 * Humor de 0 a 10 e fase do tratamento de uma sessão. Usado no "Nova Sessão" e
 * para classificar sessões já registradas, na aba "Evolução" (é o que alimenta o
 * gráfico). Os dois são opcionais.
 */
export function ClassificacaoDaSessao({
  valor,
  aoMudar,
  idBase,
}: {
  valor: Classificacao;
  aoMudar: (v: Classificacao) => void;
  idBase: string;
}) {
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium leading-none">Humor na sessão (0 a 10)</legend>
        <div className="grid grid-cols-11 gap-1" role="group" aria-label="Humor de 0 a 10">
          {Array.from({ length: 11 }, (_, n) => {
            const marcado = valor.moodScore === n;
            return (
              <button
                key={n}
                type="button"
                aria-pressed={marcado}
                // Tocar de novo no mesmo número desmarca (o humor é opcional).
                onClick={() => aoMudar({ ...valor, moodScore: marcado ? null : n })}
                className={cn(
                  "h-9 rounded-md border text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  marcado
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted",
                )}
              >
                {n}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0 = muito mal</span>
          <span>10 = muito bem</span>
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor={`${idBase}-fase`}>Fase do tratamento</Label>
        <Select
          value={valor.fase ?? SEM_FASE}
          onValueChange={(v) => aoMudar({ ...valor, fase: v === SEM_FASE ? null : (v as Fase) })}
        >
          <SelectTrigger id={`${idBase}-fase`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_FASE}>Continua a fase anterior</SelectItem>
            {FASES.map((f) => (
              <SelectItem key={f.valor} value={f.valor}>
                {f.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Marque só quando a fase mudar: as sessões seguintes continuam nela.</p>
      </div>
    </div>
  );
}
