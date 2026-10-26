import { useState } from "react";
import { toast } from "sonner";
import { formatarData } from "@shared/datas";
import { formatarReais, type Ciclo } from "@shared/precos";
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

type Pix = { therapistId: number; nome: string; ciclo: Ciclo; valor: number | null };

/**
 * Controle do Pix (só admin): cada psicóloga com plano, valor do ciclo e até
 * quando está liberada. "Registrar Pix" soma 1 mês (ou 1 ano) ao que já estava pago.
 */
export function AssinaturasAdmin() {
  const utils = trpc.useUtils();
  const { data: linhas = [] } = trpc.admin.assinaturas.useQuery();
  const [confirmar, setConfirmar] = useState<Pix | null>(null);

  const registrar = trpc.admin.registrarPix.useMutation({
    onSuccess: (r) => {
      utils.admin.assinaturas.invalidate();
      setConfirmar(null);
      toast.success(`Pix registrado. Liberada até ${formatarData(r.pagoAte)}.`);
    },
    onError: (e) => toast.error(e.message || "Erro ao registrar o Pix"),
  });
  const fundador = trpc.admin.definirFundador.useMutation({
    onSuccess: () => utils.admin.assinaturas.invalidate(),
    onError: (e) => toast.error(e.message || "Erro ao mudar fundadora"),
  });

  const pagantes = linhas.filter((l) => !l.isento);
  if (!pagantes.length) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">Assinaturas ({pagantes.length})</h2>
      {pagantes.map((l) => {
        const s = l.situacao;
        const situacao =
          s.motivo === "teste"
            ? `Teste até ${formatarData(s.ate)}`
            : s.motivo === "pago"
              ? `Pago até ${formatarData(s.ate)}`
              : s.ate
                ? `Venceu em ${formatarData(s.ate)}`
                : "Sem assinatura";
        const mensal = l.valorCentavos === null ? null : l.ciclo === "anual" ? Math.round(l.valorCentavos / 10) : l.valorCentavos;
        return (
          <Card key={l.therapistId} className={s.liberado ? undefined : "border-destructive/40"}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium text-foreground">
                  {l.nome || l.email} · CRP {l.crp}
                </p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {l.pacientes} paciente{l.pacientes === 1 ? "" : "s"} · {l.plano} ·{" "}
                  {mensal === null ? "valor combinado" : `${formatarReais(mensal)}/mês`}
                  {l.fundador && " · fundadora"}
                </p>
                <p className={`text-sm font-medium ${s.liberado ? "text-foreground" : "text-destructive"}`}>{situacao}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["mensal", "anual"] as const).map((ciclo) => (
                  <Button
                    key={ciclo}
                    size="sm"
                    variant={ciclo === "mensal" ? "default" : "outline"}
                    onClick={() =>
                      setConfirmar({
                        therapistId: l.therapistId,
                        nome: l.nome || l.email || "",
                        ciclo,
                        valor: mensal === null ? null : ciclo === "anual" ? mensal * 10 : mensal,
                      })
                    }
                  >
                    Pix {ciclo}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={fundador.isPending}
                  onClick={() => fundador.mutate({ therapistId: l.therapistId, fundador: !l.fundador })}
                >
                  {l.fundador ? "Tirar fundadora" : "Tornar fundadora"}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrar Pix {confirmar?.ciclo} de {confirmar?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              Confira no seu banco que o Pix
              {confirmar?.valor != null ? ` de ${formatarReais(confirmar.valor)}` : ""} caiu. Isso libera mais{" "}
              {confirmar?.ciclo === "anual" ? "12 meses" : "1 mês"}, contados do fim do período atual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={registrar.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirmar) registrar.mutate({ therapistId: confirmar.therapistId, ciclo: confirmar.ciclo });
              }}
            >
              {registrar.isPending ? "Registrando..." : "Registrar Pix"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
