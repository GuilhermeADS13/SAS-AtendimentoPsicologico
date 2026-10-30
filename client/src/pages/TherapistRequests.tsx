import { useState } from "react";
import { formatarData } from "@shared/datas";
import { DIAS_DE_TESTE_GRATIS, DIAS_PARA_O_PRIMEIRO_PACIENTE } from "@shared/precos";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { AssinaturasAdmin } from "@/components/AssinaturasAdmin";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
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
import { AlertTriangle, BadgeCheck, ExternalLink, Inbox, X } from "lucide-react";

type Acao = { id: number; nome: string; crp: string; action: "approve" | "reject" };

/**
 * Link wa.me com o aviso de aprovação pronto. Quem envia é o admin, no aparelho
 * dele: enviar sozinho exigiria SMS ou a API do WhatsApp, que são pagos. O e-mail
 * de aprovação continua saindo automático. Sem celular, null (o botão não aparece).
 */
function avisoDeAprovacaoNoWhatsApp(r: {
  fullName: string;
  celular: string | null;
  telefone: string | null;
  testeAguardando: boolean | null;
}): string | null {
  const digitos = (r.celular || r.telefone || "").replace(/\D/g, "");
  if (!digitos) return null;
  const numero = digitos.startsWith("55") ? digitos : `55${digitos}`; // 55 = Brasil
  const teste = r.testeAguardando
    ? `\n\nSeus ${DIAS_DE_TESTE_GRATIS} dias grátis começam quando você cadastrar o primeiro paciente. Você tem ${DIAS_PARA_O_PRIMEIRO_PACIENTE} dias para fazer esse cadastro.`
    : "";
  const msg =
    `Olá, ${r.fullName.trim().split(/\s+/)[0]}! Seu cadastro no VozInterior foi aprovado.\n\n` +
    `Sua área clínica já está liberada: ${window.location.origin}/login\n` +
    `Se o site já estava aberto, saia e entre de novo.${teste}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
}

/** Fila de quem pediu acesso como psicólogo(a). Só o admin vê. */
export default function TherapistRequests() {
  const utils = trpc.useUtils();
  const { data: requests = [], isLoading } = trpc.admin.therapistRequests.useQuery();
  const [confirmar, setConfirmar] = useState<Acao | null>(null);

  const review = trpc.admin.reviewTherapistRequest.useMutation({
    onSuccess: (r) => {
      utils.admin.therapistRequests.invalidate();
      utils.admin.assinaturas.invalidate();
      setConfirmar(null);
      if (r.action !== "approved") {
        toast.success("Solicitação recusada. A pessoa foi avisada por e-mail.");
      } else if (r.ganhouTeste) {
        toast.success(
          `Aprovado! A psicóloga já tem acesso, com 14 dias grátis a partir do primeiro paciente${r.fundador ? " e vaga de Psicóloga Fundadora" : ""}, e foi avisada por e-mail. Para avisar no celular, use "Avisar no WhatsApp" em Já analisadas.`,
          { duration: 10_000 },
        );
      } else {
        // Um teste por pessoa: CRP ou celular já usados por outra conta.
        toast.warning(
          "Aprovado, mas SEM teste grátis: esse CRP ou celular já usou o teste em outra conta. O acesso só libera depois do Pix.",
          { duration: 10_000 },
        );
      }
    },
    onError: (e) => toast.error(e.message || "Erro ao processar a solicitação"),
  });

  const pendentes = requests.filter((r) => r.status === "pending");
  const analisadas = requests.filter((r) => r.status !== "pending");

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Solicitações de acesso</h1>
          <p className="text-muted-foreground">
            Quem se cadastrou como psicólogo(a). Confira o CRP no Cadastro Nacional de
            Psicólogos antes de aprovar — o número é público e não prova identidade
            sozinho.
          </p>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : (
          <>
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">
                Pendentes {pendentes.length > 0 && `(${pendentes.length})`}
              </h2>

              {pendentes.length === 0 ? (
                <Card>
                  <CardContent className="text-muted-foreground">
                    <Inbox className="w-5 h-5 mb-2" />
                    Nenhuma solicitação esperando análise.
                  </CardContent>
                </Card>
              ) : (
                pendentes.map((r) => (
                  <Card key={r.id} className="border-primary/30">
                    <CardContent className="space-y-4">
                      <div>
                        <p className="font-semibold text-foreground">{r.fullName}</p>
                        <p className="text-sm text-muted-foreground">{r.email}</p>
                        <p className="text-sm text-foreground mt-1">
                          CRP <strong>{r.crp}</strong> · pedido em{" "}
                          {formatarData(r.createdAt)}
                        </p>
                        {r.message && (
                          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                            "{r.message}"
                          </p>
                        )}
                        {/* O aviso por e-mail falhou: mostra o motivo aqui, senão
                            ele só existiria no log do servidor. A solicitação em
                            si está a salvo — é só o e-mail que não saiu. */}
                        {r.notifyError && (
                          <p className="text-xs text-destructive mt-2 flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                            <span>
                              O e-mail de aviso não saiu: {r.notifyError}
                            </span>
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href="https://cadastro.cfp.org.br"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Conferir CRP no CNP
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          className="bg-primary hover:bg-primary/90"
                          onClick={() =>
                            setConfirmar({
                              id: r.id,
                              nome: r.fullName,
                              crp: r.crp,
                              action: "approve",
                            })
                          }
                        >
                          <BadgeCheck className="w-4 h-4 mr-2" />
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() =>
                            setConfirmar({
                              id: r.id,
                              nome: r.fullName,
                              crp: r.crp,
                              action: "reject",
                            })
                          }
                        >
                          <X className="w-4 h-4 mr-2" />
                          Recusar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            <AssinaturasAdmin />

            {analisadas.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Já analisadas</h2>
                {analisadas.map((r) => {
                  const whatsapp = r.status === "approved" ? avisoDeAprovacaoNoWhatsApp(r) : null;
                  return (
                    <Card key={r.id}>
                      <CardContent className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {r.fullName} · CRP {r.crp}
                          </p>
                          <p className="text-xs text-muted-foreground">{r.email}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {whatsapp && (
                            <Button variant="outline" size="sm" asChild>
                              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                                <WhatsAppIcon className="mr-2 size-4" />
                                Avisar no WhatsApp
                              </a>
                            </Button>
                          )}
                          <span
                            className={`text-xs font-semibold px-2 py-1 rounded-full ${
                              r.status === "approved"
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {r.status === "approved" ? "Aprovado" : "Recusado"}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmar?.action === "approve"
                ? `Aprovar ${confirmar?.nome}?`
                : `Recusar ${confirmar?.nome}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar?.action === "approve" ? (
                <>
                  O CRP <strong>{confirmar?.crp}</strong> confere no Cadastro Nacional de
                  Psicólogos? Aprovar dá acesso clínico completo — prontuários,
                  agendamentos e sessões dos pacientes dela.
                </>
              ) : (
                <>
                  A conta continua ativa como paciente, e a pessoa recebe um e-mail
                  avisando. Ela pode pedir de novo depois.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmar) review.mutate({ id: confirmar.id, action: confirmar.action });
              }}
              disabled={review.isPending}
              className={
                confirmar?.action === "reject"
                  ? "bg-destructive hover:bg-destructive/90"
                  : "bg-primary hover:bg-primary/90"
              }
            >
              {review.isPending
                ? "Processando..."
                : confirmar?.action === "approve"
                  ? "Aprovar acesso"
                  : "Recusar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
