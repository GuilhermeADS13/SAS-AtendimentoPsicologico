import { useState } from "react";
import { toast } from "sonner";
import { Palmtree, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatarData, formatarHora } from "@shared/datas";
import { consultasNasFerias, problemaNoPeriodo, textoDoPeriodo, type PeriodoDeFerias } from "@shared/ferias";
import { hojeEmBrasilia } from "@shared/lembretesDoDia";

type Consulta = { id: number; patientId: number; scheduledAt: Date | string; status: string };

/**
 * Agenda: "Férias". Ela marca um período (folga, feriado prolongado, férias); nesses dias
 * os horários de primeira conversa somem da busca. As consultas já marcadas no período
 * continuam na agenda até ela tocar em "Desmarcar e avisar", que cancela cada uma com o
 * aviso de cancelamento de sempre (server/notifications.ts).
 */
export function FeriasDaAgenda<T extends Consulta>({
  consultas,
  nomeDoPaciente,
}: {
  consultas: T[];
  nomeDoPaciente: (patientId: number) => string;
}) {
  const utils = trpc.useUtils();
  const [aberto, setAberto] = useState(false);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [desmarcando, setDesmarcando] = useState<(PeriodoDeFerias & { id: number }) | null>(null);
  const [cancelando, setCancelando] = useState(false);

  const { data: periodos = [] } = trpc.ferias.listar.useQuery();
  const hoje = hojeEmBrasilia();
  const deFeriasHoje = periodos.some((p) => p.inicio <= hoje && hoje <= p.fim);

  const criar = trpc.ferias.criar.useMutation({
    onSuccess: () => {
      utils.ferias.listar.invalidate();
      setInicio("");
      setFim("");
      toast.success("Férias marcadas. Nesses dias, seus horários de primeira conversa não aparecem na busca.");
    },
    onError: (e) => toast.error(e.message || "Não foi possível marcar."),
  });
  const remover = trpc.ferias.remover.useMutation({
    onSuccess: () => {
      utils.ferias.listar.invalidate();
      toast.success("Período apagado.");
    },
    onError: (e) => toast.error(e.message || "Não foi possível apagar."),
  });
  const cancelar = trpc.appointments.updateStatus.useMutation();

  const problema = inicio && fim ? problemaNoPeriodo({ inicio, fim }, hoje) : null;

  const desmarcarTodas = async (consultasDoPeriodo: T[]) => {
    setCancelando(true);
    try {
      await Promise.all(consultasDoPeriodo.map((c) => cancelar.mutateAsync({ id: c.id, status: "cancelled" })));
      toast.success(
        consultasDoPeriodo.length === 1
          ? "Consulta desmarcada. O paciente recebe o aviso de cancelamento."
          : `${consultasDoPeriodo.length} consultas desmarcadas. Cada paciente recebe o aviso de cancelamento.`,
      );
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Nem todas as consultas foram desmarcadas. Confira a agenda.");
    } finally {
      utils.appointments.list.invalidate();
      setCancelando(false);
      setDesmarcando(null);
    }
  };

  const aDesmarcar = desmarcando ? consultasNasFerias(consultas, desmarcando) : [];

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <Palmtree className="mr-2 size-4" />
        Férias
        {deFeriasHoje && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">agora</span>}
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Férias e folgas</DialogTitle>
            <DialogDescription>
              Nos dias marcados, seus horários de primeira conversa somem da busca de pacientes. As consultas já marcadas
              continuam na agenda até você desmarcar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 rounded-lg border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ferias-inicio">Primeiro dia</Label>
                <Input id="ferias-inicio" type="date" min={hoje} value={inicio} onChange={(e) => setInicio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ferias-fim">Último dia</Label>
                <Input id="ferias-fim" type="date" min={inicio || hoje} value={fim} onChange={(e) => setFim(e.target.value)} />
              </div>
            </div>
            {problema && <p className="text-sm text-amber-700 dark:text-amber-400">{problema}</p>}
            <Button
              className="w-full sm:w-auto"
              disabled={!inicio || !fim || !!problema || criar.isPending}
              onClick={() => criar.mutate({ inicio, fim })}
            >
              {criar.isPending ? "Marcando…" : "Marcar férias"}
            </Button>
          </div>

          {periodos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum período marcado.</p>
          ) : (
            <ul className="space-y-2">
              {periodos.map((p) => {
                const doPeriodo = consultasNasFerias(consultas, p);
                return (
                  <li key={p.id} className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-foreground">{textoDoPeriodo(p)}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={remover.isPending}
                        onClick={() => remover.mutate({ id: p.id })}
                        aria-label={`Apagar as férias de ${textoDoPeriodo(p)}`}
                        title="Apagar"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {doPeriodo.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhuma consulta marcada nesses dias.</p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm text-amber-700 dark:text-amber-400">
                          {doPeriodo.length === 1 ? "1 consulta marcada" : `${doPeriodo.length} consultas marcadas`} nesses dias.
                        </p>
                        <Button variant="outline" size="sm" className="h-9" onClick={() => setDesmarcando(p)}>
                          Desmarcar e avisar
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!desmarcando} onOpenChange={(abrir) => !abrir && !cancelando && setDesmarcando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Desmarcar {aDesmarcar.length === 1 ? "1 consulta" : `${aDesmarcar.length} consultas`}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Cada paciente recebe o aviso de cancelamento, como quando você cancela uma consulta. Para remarcar, é na Agenda.</p>
                <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                  {aDesmarcar.map((c) => (
                    <li key={c.id}>
                      {formatarData(c.scheduledAt)} às {formatarHora(c.scheduledAt)} · {nomeDoPaciente(c.patientId)}
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelando}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelando || aDesmarcar.length === 0}
              onClick={(e) => {
                e.preventDefault();
                void desmarcarTodas(aDesmarcar);
              }}
            >
              {cancelando ? "Desmarcando…" : "Desmarcar e avisar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
