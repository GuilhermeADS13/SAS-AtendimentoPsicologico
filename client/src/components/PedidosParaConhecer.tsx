import { useState } from "react";
import { toast } from "sonner";
import { ROTULO_DA_MODALIDADE } from "@shared/conhecer";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
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
import { TrocarDePlanoDialog, ehErroDeLimiteDoPlano } from "@/components/TrocarDePlanoDialog";
import { primeiraMaiuscula } from "@/components/BuscaDePsicologas";
import { Check, UserRoundSearch, X } from "lucide-react";

const FORMATO = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Pedidos de primeira conversa que chegaram pela busca. Aceitar cria a ficha do
 * paciente e a consulta (conta no plano, como qualquer paciente novo); recusar
 * avisa o paciente por e-mail. Some quando não há pedido esperando.
 */
export function PedidosParaConhecer() {
  const utils = trpc.useUtils();
  const { data } = trpc.conhecer.pedidosRecebidos.useQuery();
  const [recusando, setRecusando] = useState<{ id: number; nome: string } | null>(null);
  const [barrado, setBarrado] = useState<number | null>(null);

  const recarregar = () => {
    void utils.conhecer.pedidosRecebidos.invalidate();
    void utils.conhecer.minhaVitrine.invalidate();
  };
  const aceitar = trpc.conhecer.aceitar.useMutation({
    onSuccess: () => {
      recarregar();
      void utils.appointments.list.invalidate();
      void utils.patients.list.invalidate();
      toast.success("Primeira conversa marcada. O paciente recebe o aviso por e-mail e entra pela videochamada.");
    },
    onError: (e, vars) => {
      if (ehErroDeLimiteDoPlano(e.message)) return setBarrado(vars.id);
      recarregar();
      toast.error(e.message);
    },
  });
  const recusar = trpc.conhecer.recusar.useMutation({
    onSuccess: () => {
      recarregar();
      toast.success("Pedido recusado. O paciente foi avisado e pode procurar outro horário.");
    },
    onError: (e) => {
      recarregar();
      toast.error(e.message);
    },
  });

  const esperando = (data ?? []).filter((p) => p.status === "pendente");
  if (!esperando.length && barrado === null) return null;
  const ocupado = aceitar.isPending || recusar.isPending;

  return (
    <section aria-labelledby="titulo-pedidos" className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <UserRoundSearch className="size-5 text-primary" aria-hidden />
        <h2 id="titulo-pedidos" className="font-semibold text-foreground">
          {esperando.length === 1 ? "1 pedido de primeira conversa" : `${esperando.length} pedidos de primeira conversa`}
        </h2>
      </div>
      <ul className="space-y-3">
        {esperando.map((p) => {
          const detalhes = [
            p.idade !== null ? `${p.idade} anos` : null,
            p.cidade && p.uf ? `${p.cidade}/${p.uf}` : p.uf,
            p.modalidade === "ambos"
              ? "online ou presencial"
              : p.modalidade
                ? `prefere ${ROTULO_DA_MODALIDADE[p.modalidade].toLowerCase()}`
                : null,
          ].filter(Boolean);
          return (
            <li key={p.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{p.nome}</p>
                  {detalhes.length > 0 && <p className="text-sm text-muted-foreground">{detalhes.join(" · ")}</p>}
                  <p className="mt-1 text-sm text-foreground">
                    {primeiraMaiuscula(FORMATO.format(new Date(p.inicio)))}
                    <span className="text-muted-foreground"> · {p.duracao} min</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={ocupado}
                    onClick={() => setRecusando({ id: p.id, nome: p.nome })}
                  >
                    <X className="size-4" />
                    Recusar
                  </Button>
                  <Button type="button" size="sm" className="gap-1.5" disabled={ocupado} onClick={() => aceitar.mutate({ id: p.id })}>
                    <Check className="size-4" />
                    Aceitar
                  </Button>
                </div>
              </div>
              {p.oQueProcura && (
                <div className="mt-3 text-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">O que procura</p>
                  <p className="whitespace-pre-line text-foreground">{p.oQueProcura}</p>
                </div>
              )}
              {p.mensagem && (
                <div className="mt-3 text-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mensagem</p>
                  <p className="whitespace-pre-line text-foreground">{p.mensagem}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <AlertDialog open={recusando !== null} onOpenChange={(o) => !o && setRecusando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recusar o pedido de {recusando?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              A pessoa recebe um e-mail dizendo que o horário não pôde ser confirmado, sem motivo, e pode pedir outro horário seu ou de
              outra psicóloga.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (recusando) recusar.mutate({ id: recusando.id });
                setRecusando(null);
              }}
            >
              Recusar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TrocarDePlanoDialog
        aberto={barrado !== null}
        aoFechar={() => setBarrado(null)}
        aoTrocar={() => {
          if (barrado !== null) aceitar.mutate({ id: barrado });
        }}
      />
    </section>
  );
}
