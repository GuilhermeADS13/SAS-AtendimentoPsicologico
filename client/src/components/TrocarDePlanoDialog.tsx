import { toast } from "sonner";
import { PLANOS, formatarReais, planoPorId, valorDoPlano } from "@shared/precos";
import { trpc } from "@/lib/trpc";
import { linkWhatsAppDoSuporte } from "@/lib/suporte";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { ArrowRight, Check } from "lucide-react";

/** O servidor recusa o paciente acima do teto com esta frase (exigirVagaNoPlano). */
export const ehErroDeLimiteDoPlano = (mensagem: string | undefined) => /mude de plano/i.test(mensagem ?? "");

/**
 * Janela que abre quando ela tenta cadastrar (ou reativar) um paciente acima do
 * teto do plano: explica o PORQUÊ e troca de plano com um clique, já seguindo
 * com o cadastro (`aoTrocar`). Do Voz para o Coro não há troca sozinha — é
 * combinado pelo WhatsApp.
 */
export function TrocarDePlanoDialog({
  aberto,
  aoFechar,
  aoTrocar,
  acao = "cadastrar",
}: {
  aberto: boolean;
  aoFechar: () => void;
  /** Roda depois da troca: refaz o cadastro/reativação que foi barrado. */
  aoTrocar: () => void;
  acao?: "cadastrar" | "reativar";
}) {
  const utils = trpc.useUtils();
  const { data } = trpc.assinatura.minha.useQuery(undefined, { enabled: aberto });
  const mudar = trpc.assinatura.mudarPlano.useMutation({
    onSuccess: (r) => {
      utils.assinatura.minha.invalidate();
      toast.success(`Pronto: agora você está no ${r.plano}.`);
      aoFechar();
      aoTrocar();
    },
    onError: (e) => toast.error(e.message || "Não foi possível mudar de plano."),
  });
  if (!data) return null;

  const atual = planoPorId(data.planoEscolhido);
  const proximo = PLANOS[PLANOS.indexOf(atual) + 1];
  const n = data.pacientes;
  const valorAgora = valorDoPlano(n, atual.id, { fundador: data.fundador });
  const valorDepois = proximo ? valorDoPlano(n + 1, proximo.id, { fundador: data.fundador }) : null;
  const ehCoro = !proximo || proximo.ate === null;
  const coro = linkWhatsAppDoSuporte(
    `Olá! Tenho ${n} pacientes no plano ${atual.nome} do VozInterior e quero passar para o Coro.`,
  );
  const verbo = acao === "reativar" ? "reativar" : "cadastrar";

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Seu plano {atual.nome} chegou ao limite</DialogTitle>
          <DialogDescription>
            O {atual.nome} vai até {atual.ate} pacientes, e você já tem {n}. Para {verbo} mais um, é preciso
            passar para o {proximo?.nome ?? "próximo plano"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-xl bg-secondary/50 p-4">
            <p className="mb-2 font-medium text-foreground">Por que trocar?</p>
            <p className="text-muted-foreground">
              Cada plano cobre um tamanho de consultório. Seu consultório cresceu — e com o{" "}
              {proximo?.nome ?? "próximo plano"} você também ganha:
            </p>
            {proximo && (
              <ul className="mt-2 space-y-1.5 text-foreground">
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  {proximo.ate === null ? "Pacientes sem limite" : `Até ${proximo.ate} pacientes`}
                </li>
                {proximo.perguntasLumaPorDia && (
                  <li className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    Luma: {proximo.perguntasLumaPorDia} perguntas por dia (hoje: {atual.perguntasLumaPorDia})
                  </li>
                )}
                {proximo.anexoMaxMb && (
                  <li className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    Anexos de até {proximo.anexoMaxMb} MB (hoje: {atual.anexoMaxMb} MB)
                  </li>
                )}
              </ul>
            )}
          </div>

          {!ehCoro && valorAgora !== null && valorDepois !== null && (
            <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3 tabular-nums">
              <div>
                <p className="text-xs text-muted-foreground">{atual.nome} hoje</p>
                <p className="font-semibold text-foreground">{formatarReais(valorAgora)}/mês</p>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
              <div className="text-right">
                <p className="text-xs text-muted-foreground">
                  {proximo?.nome} com {n + 1} pacientes
                </p>
                <p className="font-semibold text-foreground">{formatarReais(valorDepois)}/mês</p>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {ehCoro
              ? "O Coro é para clínicas e equipes: o valor é combinado com você pelo WhatsApp."
              : "Os bônus valem na hora; o valor novo entra no próximo Pix. Paciente que encerrou o acompanhamento pode ser marcado como inativo e deixa de contar."}
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={aoFechar}>
            Agora não
          </Button>
          {ehCoro ? (
            coro && (
              <Button asChild className="gap-2">
                <a href={coro} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className="size-4" /> Conversar sobre o Coro
                </a>
              </Button>
            )
          ) : (
            <Button
              disabled={mudar.isPending}
              onClick={() => proximo && (proximo.id === "pro" || proximo.id === "max") && mudar.mutate({ plano: proximo.id })}
            >
              {mudar.isPending ? "Mudando..." : `Mudar para ${proximo?.nome} e ${verbo}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
