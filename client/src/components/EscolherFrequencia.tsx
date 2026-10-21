import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  DIAS_DA_SEMANA,
  FREQUENCIAS_PADRAO,
  descreverFrequencia,
  gravarFrequencia,
  lerFrequencia,
  type Frequencia,
} from "@shared/frequencia";

const opcao = (ativa: boolean) =>
  cn(
    "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    ativa ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted",
  );

/**
 * A psicóloga escolhe a frequência do paciente: um padrão (semanal, quinzenal,
 * mensal) OU os dias da semana. "Automática" volta ao cálculo pelas sessões.
 */
export function EscolherFrequencia({
  patientId,
  atual,
  exemplo = false,
}: {
  patientId: number;
  atual: string | null | undefined;
  /** Prontuário de exemplo: salvar só avisa. */
  exemplo?: boolean;
}) {
  const utils = trpc.useUtils();
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState<Frequencia | null>(null);
  const salvar = trpc.patients.definirFrequencia.useMutation({
    onSuccess: () => {
      void utils.patients.get.invalidate({ id: patientId });
      setAberto(false);
      toast.success("Frequência salva.");
    },
    onError: (e) => toast.error(e.message || "Não foi possível salvar."),
  });

  const diasMarcados = rascunho?.tipo === "dias" ? rascunho.dias : [];
  const alternarDia = (dia: number) => {
    const dias = diasMarcados.includes(dia) ? diasMarcados.filter((d) => d !== dia) : [...diasMarcados, dia];
    setRascunho(dias.length ? { tipo: "dias", dias } : null);
  };

  return (
    <Popover
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) setRascunho(lerFrequencia(atual)); // abre com o que está salvo
      }}
    >
      <PopoverTrigger asChild>
        {/* Link embaixo do valor (e não ícone no canto): no celular o ícone
            apertava o cartão e cortava "Frequência" e "Terças e quintas". */}
        <button
          type="button"
          aria-label="Alterar a frequência"
          className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Pencil className="size-3" aria-hidden /> Alterar
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4">
        <div className="space-y-1">
          <p className="font-semibold text-foreground">Frequência do atendimento</p>
          <p className="text-xs text-muted-foreground">Escolha um padrão ou os dias da semana.</p>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Padrões">
          {FREQUENCIAS_PADRAO.map((p) => {
            const ativa = rascunho?.tipo === p.valor;
            return (
              <button key={p.valor} type="button" aria-pressed={ativa} onClick={() => setRascunho(ativa ? null : { tipo: p.valor })} className={opcao(ativa)}>
                {p.rotulo}
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Ou nos dias:</p>
          <div className="grid grid-cols-7 gap-1" role="group" aria-label="Dias da semana">
            {DIAS_DA_SEMANA.map((d) => {
              const ativo = diasMarcados.includes(d.dia);
              return (
                <button key={d.dia} type="button" aria-pressed={ativo} onClick={() => alternarDia(d.dia)} className={cn(opcao(ativo), "px-0")}>
                  {d.curto}
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-sm text-foreground" aria-live="polite">
          {rascunho ? descreverFrequencia(rascunho) : "Automática: calculada pelas sessões registradas."}
        </p>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setRascunho(null)}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
            disabled={!rascunho}
          >
            Usar automática
          </button>
          <Button
            size="sm"
            disabled={salvar.isPending}
            onClick={() =>
              exemplo
                ? toast.info("Este é um prontuário de exemplo: nada aqui é salvo.")
                : salvar.mutate({ patientId, frequencia: gravarFrequencia(rascunho) })
            }
          >
            {salvar.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
