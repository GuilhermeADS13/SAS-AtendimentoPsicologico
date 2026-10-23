import { useState } from "react";
import { Loader2, UserMinus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { MAX_PARTICIPANTES_EXTRAS, MAX_PESSOAS_NA_CHAMADA } from "@shared/chamadaEmGrupo";

type Paciente = { id: number; firstName: string; lastName: string };

/**
 * Participantes EXTRAS da consulta (chamada em grupo: terapia de casal; os dois
 * responsáveis + a criança). Cada um entra na sala logado com a própria conta,
 * pelo "Minhas Consultas" dele. A sessão continua no prontuário do principal.
 */
export function ParticipantesDaConsulta({
  appointmentId,
  pacientePrincipalId,
  pacientes,
  className,
  rotulo = "Participantes",
}: {
  appointmentId: number;
  pacientePrincipalId: number;
  pacientes: readonly Paciente[];
  className?: string;
  /** Texto do botão ("Convidar" na chamada). */
  rotulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [escolhido, setEscolhido] = useState("");
  const utils = trpc.useUtils();
  const lista = trpc.appointments.participantes.useQuery({ appointmentId }, { enabled: aberto });
  const atualizar = () => void utils.appointments.participantes.invalidate({ appointmentId });
  const adicionar = trpc.appointments.adicionarParticipante.useMutation({
    onSuccess: () => {
      setEscolhido("");
      atualizar();
      toast.success("Participante adicionado. Ele entra pela sala em “Minhas Consultas”.");
    },
    onError: (e) => toast.error(e.message || "Não foi possível adicionar."),
  });
  const remover = trpc.appointments.removerParticipante.useMutation({
    onSuccess: () => {
      atualizar();
      toast.success("Participante removido.");
    },
    onError: (e) => toast.error(e.message || "Não foi possível remover."),
  });

  const participantes = lista.data ?? [];
  const jaNaConsulta = new Set([pacientePrincipalId, ...participantes.map((p) => p.patientId)]);
  const disponiveis = pacientes.filter((p) => !jaNaConsulta.has(p.id));
  const cheio = participantes.length >= MAX_PARTICIPANTES_EXTRAS;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-1.5", className)}
          title="Incluir mais pessoas na chamada (casal, responsáveis)"
        >
          <Users className="h-4 w-4" /> <span>{rotulo}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Participantes da consulta</DialogTitle>
          <DialogDescription>
            Para terapia de casal ou para os responsáveis acompanharem a criança. Até {MAX_PESSOAS_NA_CHAMADA} pessoas na
            chamada: você e mais {MAX_PESSOAS_NA_CHAMADA - 1}. Cada um entra com a própria conta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {lista.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </p>
          ) : participantes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Só o paciente principal, por enquanto.</p>
          ) : (
            <ul className="space-y-2">
              {participantes.map((p) => (
                <li key={p.patientId} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {p.firstName} {p.lastName}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-destructive hover:bg-destructive/10"
                    disabled={remover.isPending}
                    onClick={() => remover.mutate({ appointmentId, patientId: p.patientId })}
                    aria-label={`Remover ${p.firstName} da consulta`}
                  >
                    <UserMinus className="mr-1.5 h-4 w-4" /> Remover
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {cheio ? (
            <p className="text-sm text-muted-foreground">A chamada já está no máximo de {MAX_PESSOAS_NA_CHAMADA} pessoas.</p>
          ) : disponiveis.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Para incluir alguém, cadastre a pessoa antes em Pacientes / Prontuários.
            </p>
          ) : (
            <div className="flex gap-2">
              <Select value={escolhido} onValueChange={setEscolhido}>
                <SelectTrigger className="flex-1" aria-label="Paciente para incluir">
                  <SelectValue placeholder="Escolha o paciente" />
                </SelectTrigger>
                <SelectContent>
                  {disponiveis.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.firstName} {p.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!escolhido || adicionar.isPending}
                onClick={() => adicionar.mutate({ appointmentId, patientId: Number(escolhido) })}
              >
                <UserPlus className="mr-1.5 h-4 w-4" /> Incluir
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
