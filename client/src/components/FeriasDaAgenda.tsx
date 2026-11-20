import { useState } from "react";
import { toast } from "sonner";
import { Palmtree, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
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
  linkDoCancelamento,
}: {
  consultas: T[];
  nomeDoPaciente: (patientId: number) => string;
  /** WhatsApp com a mensagem de cancelamento (o da Agenda); null = paciente sem telefone. */
  linkDoCancelamento: (consulta: T) => string | null;
}) {
  const utils = trpc.useUtils();
  const [aberto, setAberto] = useState(false);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [desmarcando, setDesmarcando] = useState<(PeriodoDeFerias & { id: number }) | null>(null);
  const [cancelando, setCancelando] = useState(false);
  // Desmarcadas agora: o e-mail pode cair no spam ou estar desligado, então a janela
  // mostra o WhatsApp de cada uma, como no cancelamento de uma consulta só.
  const [avisar, setAvisar] = useState<T[]>([]);
  const [avisados, setAvisados] = useState<Set<number>>(new Set());

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
    const resultados = await Promise.allSettled(consultasDoPeriodo.map((c) => cancelar.mutateAsync({ id: c.id, status: "cancelled" })));
    const desmarcadas = consultasDoPeriodo.filter((_, i) => resultados[i].status === "fulfilled");
    const falharam = consultasDoPeriodo.length - desmarcadas.length;
    if (desmarcadas.length) {
      toast.success(
        desmarcadas.length === 1
          ? "Consulta desmarcada. Avise o paciente pelo WhatsApp também."
          : `${desmarcadas.length} consultas desmarcadas. Avise cada paciente pelo WhatsApp também.`,
      );
    }
    if (falharam) toast.error(`${falharam === 1 ? "1 consulta não foi desmarcada" : `${falharam} consultas não foram desmarcadas`}. Confira na agenda.`);
    setAvisar(desmarcadas);
    setAvisados(new Set());
    utils.appointments.list.invalidate();
    setCancelando(false);
    setDesmarcando(null);
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

          {avisar.length > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-950/20">
              <p className="text-sm font-semibold text-foreground">Avise pelo WhatsApp</p>
              <p className="text-xs text-muted-foreground">
                O aviso por e-mail pode cair no spam ou estar desligado pelo paciente. Abra a mensagem de cada um, confira e envie.
              </p>
              <ul className="space-y-1.5">
                {avisar.map((c) => {
                  const href = linkDoCancelamento(c);
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        {formatarData(c.scheduledAt)} às {formatarHora(c.scheduledAt)} · {nomeDoPaciente(c.patientId)}
                      </span>
                      {!href ? (
                        <span className="shrink-0 text-xs text-muted-foreground">Sem telefone</span>
                      ) : (
                        <Button
                          size="sm"
                          variant={avisados.has(c.id) ? "ghost" : "outline"}
                          className="h-8 shrink-0"
                          onClick={() => {
                            window.open(href, "_blank", "noopener");
                            setAvisados((a) => new Set(a).add(c.id));
                          }}
                        >
                          <WhatsAppIcon className="mr-1.5 size-4" />
                          {avisados.has(c.id) ? "Avisado" : "Avisar"}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setAvisar([])}>
                Pronto
              </Button>
            </div>
          )}

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
                <p>
                  Cada paciente recebe o aviso de cancelamento por e-mail (quem não desligou esse aviso). Em seguida, eu mostro o
                  botão para avisar cada um pelo WhatsApp. Para remarcar, é na Agenda.
                </p>
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
