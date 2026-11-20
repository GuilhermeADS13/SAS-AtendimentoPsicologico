import { useState } from "react";
import { toast } from "sonner";
import { Gift } from "lucide-react";
import { formatarData } from "@shared/datas";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

/** O que a confirmação usa de uma linha da lista. */
type Item = { userId: number | null; nome: string | null; quemIndicou: { id: number; nome: string | null } | null };

/**
 * Suporte: quem criou conta por link de indicação (server/indicacao.ts). Quando a indicada
 * pagou, "Dar 1 mês às duas" soma 1 mês à assinatura dela e à de quem indicou, sem mudar o
 * ciclo, uma vez por indicação (regra de 17/11).
 */
export function IndicacoesAdmin() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.indicacoes.useQuery();
  const [confirmar, setConfirmar] = useState<Item | null>(null);

  const dar = trpc.admin.darMesDaIndicacao.useMutation({
    onSuccess: (r) => {
      toast.success(
        `Mês lançado: ${confirmar?.nome || "a indicada"} vai até ${formatarData(r.indicada)} e ${confirmar?.quemIndicou?.nome || "quem indicou"} até ${formatarData(r.quemIndicou)}.`,
        { duration: 10_000 },
      );
      setConfirmar(null);
      utils.admin.indicacoes.invalidate();
      utils.admin.assinaturas.invalidate();
    },
    onError: (e) => {
      setConfirmar(null);
      toast.error(e.message || "Não foi possível lançar o mês.");
    },
  });

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">Indicações</h2>
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Quem criou conta pelo link de uma colega. Quando a indicada pagar, as duas ganham 1 mês grátis.
          </p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : data === null ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">Não deu para ler os cadastros agora. Tente de novo mais tarde.</p>
          ) : !data?.length ? (
            <p className="text-sm text-muted-foreground">Ninguém criou conta por link de indicação ainda.</p>
          ) : (
            <ul className="divide-y">
              {data.map((i) => {
                const podeDar = i.pagou && !i.mesLancadoEm && i.userId !== null && i.quemIndicou !== null;
                return (
                  <li key={`${i.email}-${String(i.criadaEm)}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {i.nome || "Sem nome"} <span className="font-normal text-muted-foreground">· {i.email ?? "sem e-mail"}</span>
                      </p>
                      <p className="text-muted-foreground">
                        Conta criada em {formatarData(i.criadaEm)} · indicada por{" "}
                        {i.quemIndicou ? (i.quemIndicou.nome ?? `conta ${i.quemIndicou.id}`) : `“${i.origem}”`}
                      </p>
                    </div>
                    {podeDar ? (
                      <Button size="sm" className="h-9 shrink-0" onClick={() => setConfirmar(i)}>
                        <Gift className="mr-2 size-4" />
                        Dar 1 mês às duas
                      </Button>
                    ) : (
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          i.mesLancadoEm ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {i.mesLancadoEm
                          ? `Mês lançado em ${formatarData(i.mesLancadoEm)}`
                          : i.aprovada
                            ? "Aprovada, sem pagamento"
                            : "Ainda sem CRP aprovado"}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmar} onOpenChange={(aberto) => !aberto && !dar.isPending && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dar 1 mês grátis às duas?</AlertDialogTitle>
            <AlertDialogDescription>
              Soma 1 mês à assinatura de <strong>{confirmar?.nome || "a indicada"}</strong> e à de{" "}
              <strong>{confirmar?.quemIndicou?.nome || "quem indicou"}</strong>, a partir do vencimento de cada uma, sem mudar o
              plano nem o ciclo. Vale uma vez por indicação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dar.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={dar.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirmar?.userId) dar.mutate({ userId: confirmar.userId });
              }}
            >
              {dar.isPending ? "Lançando..." : "Dar 1 mês às duas"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
