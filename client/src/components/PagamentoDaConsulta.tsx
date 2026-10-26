import { toast } from "sonner";
import { formatarBRL } from "@shared/dinheiro";
import { pixComValor } from "@shared/pix";
import type { SituacaoDoPagamento } from "@shared/pagamentoDaConsulta";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { CopiarPix } from "@/components/CopiarPix";
import { CheckCircle2, Clock } from "lucide-react";

/**
 * Pagamento de uma consulta que já aconteceu, no cartão de Minhas Consultas.
 * O Pix vai direto para a psicóloga; "Já paguei" só AVISA — vira pago quando
 * ela confirma que caiu (decisão de 2026-10-26).
 */
export function PagamentoDaConsulta({
  appointmentId,
  pagamento,
  pixDaPsicologa,
}: {
  appointmentId: number;
  pagamento: { valorCentavos: number; situacao: SituacaoDoPagamento };
  /** "Copia e cola" da psicóloga sem valor; null se ela não cadastrou a chave. */
  pixDaPsicologa: string | null;
}) {
  const utils = trpc.useUtils();
  const informar = trpc.me.informarPagamento.useMutation({
    onSuccess: () => {
      utils.me.appointments.invalidate();
      toast.success("Avisamos a sua psicóloga. Assim que ela confirmar, a consulta aparece como paga.");
    },
    onError: (e) => toast.error(e.message || "Não foi possível avisar agora."),
  });
  const valor = formatarBRL(pagamento.valorCentavos);

  if (pagamento.situacao === "pago") {
    return (
      <p className="flex basis-full items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
        <CheckCircle2 className="size-4" aria-hidden /> {valor} · pago
      </p>
    );
  }
  if (pagamento.situacao === "aguardando") {
    return (
      <p className="flex basis-full items-center gap-1.5 text-sm text-amber-800 dark:text-amber-300">
        <Clock className="size-4 shrink-0" aria-hidden /> {valor} · você avisou que pagou — aguardando a psicóloga confirmar
      </p>
    );
  }
  return (
    <div className="basis-full space-y-2 rounded-lg border bg-secondary/40 p-3">
      <p className="text-sm">
        <span className="font-semibold text-foreground">{valor}</span>
        <span className="text-muted-foreground"> · pagamento em aberto</span>
      </p>
      {pixDaPsicologa ? (
        <CopiarPix
          opcoes={[
            {
              chave: "consulta",
              rotulo: `Copiar Pix: ${valor}`,
              codigo: pixComValor(pixDaPsicologa, pagamento.valorCentavos),
            },
          ]}
        />
      ) : (
        <p className="text-xs text-muted-foreground">Combine a forma de pagamento com a sua psicóloga.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={informar.isPending}
          onClick={() => informar.mutate({ appointmentId })}
        >
          <CheckCircle2 className="size-4 mr-1.5" />
          Já paguei
        </Button>
        {pixDaPsicologa && (
          <span className="text-xs text-muted-foreground">Cole no app do banco em Pix → Copia e Cola. O dinheiro vai direto para a sua psicóloga.</span>
        )}
      </div>
    </div>
  );
}
