import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
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
import { BadgeCheck, ExternalLink, Inbox, X } from "lucide-react";

type Acao = { id: number; nome: string; crp: string; action: "approve" | "reject" };

/** Fila de quem pediu acesso como psicólogo(a). Só o admin vê. */
export default function TherapistRequests() {
  const utils = trpc.useUtils();
  const { data: requests = [], isLoading } = trpc.admin.therapistRequests.useQuery();
  const [confirmar, setConfirmar] = useState<Acao | null>(null);

  const review = trpc.admin.reviewTherapistRequest.useMutation({
    onSuccess: (r) => {
      utils.admin.therapistRequests.invalidate();
      setConfirmar(null);
      toast.success(
        r.action === "approved"
          ? "Aprovado! A psicóloga já tem acesso clínico e foi avisada por e-mail."
          : "Solicitação recusada. A pessoa foi avisada por e-mail.",
      );
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
                  <CardContent className="pt-6 text-muted-foreground">
                    <Inbox className="w-5 h-5 mb-2" />
                    Nenhuma solicitação esperando análise.
                  </CardContent>
                </Card>
              ) : (
                pendentes.map((r) => (
                  <Card key={r.id} className="border-primary/30">
                    <CardContent className="pt-6 space-y-4">
                      <div>
                        <p className="font-semibold text-foreground">{r.fullName}</p>
                        <p className="text-sm text-muted-foreground">{r.email}</p>
                        <p className="text-sm text-foreground mt-1">
                          CRP <strong>{r.crp}</strong> · pedido em{" "}
                          {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                        {r.message && (
                          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                            "{r.message}"
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

            {analisadas.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Já analisadas</h2>
                {analisadas.map((r) => (
                  <Card key={r.id}>
                    <CardContent className="pt-6 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {r.fullName} · CRP {r.crp}
                        </p>
                        <p className="text-xs text-muted-foreground">{r.email}</p>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded-full ${
                          r.status === "approved"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {r.status === "approved" ? "Aprovado" : "Recusado"}
                      </span>
                    </CardContent>
                  </Card>
                ))}
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
