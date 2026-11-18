import { useState } from "react";
import { toast } from "sonner";
import { formatarData } from "@shared/datas";
import { mascaraTelefone } from "@shared/telefone";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const PAPEL: Record<string, string> = { therapist: "Psicóloga", admin: "Admin" };

/**
 * Suporte: troca o e-mail de uma conta cujo dono perdeu o acesso ao e-mail atual (a troca
 * normal, em Configurações, pede um código nele). Primeiro busca a conta e mostra os dados
 * para conferir a identidade; só então troca, com confirmação.
 */
export function TrocarEmailAdmin() {
  const [digitado, setDigitado] = useState("");
  const [buscado, setBuscado] = useState("");
  const [novo, setNovo] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  const conta = trpc.admin.contaPorEmail.useQuery({ email: buscado }, { enabled: Boolean(buscado), retry: false });
  const trocar = trpc.admin.trocarEmailDaConta.useMutation({
    onSuccess: (r) => {
      toast.success(`E-mail trocado para ${r.email}. A pessoa sai dos aparelhos e entra de novo com ele; os dois endereços foram avisados.`, {
        duration: 10_000,
      });
      setConfirmando(false);
      setDigitado("");
      setBuscado("");
      setNovo("");
    },
    onError: (e) => {
      setConfirmando(false);
      toast.error(e.message || "Não foi possível trocar o e-mail.");
    },
  });

  const buscar = () => {
    const email = digitado.trim().toLowerCase();
    if (!email.includes("@")) {
      toast.error("Digite o e-mail atual da conta.");
      return;
    }
    setNovo("");
    setBuscado(email);
  };

  const encontrada = conta.data;
  const novoValido = novo.trim().includes("@") && novo.trim().toLowerCase() !== encontrada?.email;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">Trocar o e-mail de uma conta</h2>
      <Card>
        <CardContent className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">
            Para quem perdeu o acesso ao e-mail atual. Antes de trocar, confira que é a pessoa: pelo WhatsApp do celular
            do cadastro e pelo CRP (psicóloga), ou com a psicóloga dele (paciente).
          </p>

          <div className="space-y-2">
            <Label htmlFor="email-atual-da-conta">E-mail atual da conta</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="email-atual-da-conta"
                type="email"
                autoComplete="off"
                value={digitado}
                onChange={(e) => setDigitado(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && buscar()}
              />
              <Button variant="outline" onClick={buscar} disabled={!digitado.trim()}>
                Buscar
              </Button>
            </div>
          </div>

          {buscado && conta.isLoading && <p className="text-sm text-muted-foreground">Buscando…</p>}
          {buscado && conta.error && <p className="text-sm text-destructive">{conta.error.message}</p>}
          {buscado && !conta.isLoading && !conta.error && !encontrada && (
            <p className="text-sm text-muted-foreground">Nenhuma conta com esse e-mail.</p>
          )}

          {encontrada && (
            <div className="space-y-4">
              <dl className="grid gap-x-6 gap-y-2 rounded-lg border bg-muted/40 p-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Nome</dt>
                  <dd className="font-medium">{encontrada.nome || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Tipo de conta</dt>
                  <dd className="font-medium">{PAPEL[encontrada.papel] ?? "Paciente"}</dd>
                </div>
                {encontrada.crp && (
                  <div>
                    <dt className="text-muted-foreground">CRP</dt>
                    <dd className="font-medium">{encontrada.crp}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">Celular do cadastro</dt>
                  <dd className="font-medium">{encontrada.celular ? mascaraTelefone(encontrada.celular) : "Não informado"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Conta criada em</dt>
                  <dd className="font-medium">{formatarData(encontrada.desde)}</dd>
                </div>
              </dl>

              <div className="space-y-2">
                <Label htmlFor="email-novo-da-conta">E-mail novo</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="email-novo-da-conta"
                    type="email"
                    autoComplete="off"
                    value={novo}
                    onChange={(e) => setNovo(e.target.value)}
                  />
                  <Button onClick={() => setConfirmando(true)} disabled={!novoValido || trocar.isPending}>
                    Trocar e-mail
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmando} onOpenChange={(aberto) => !trocar.isPending && setConfirmando(aberto)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trocar o e-mail desta conta?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  <strong>{encontrada?.nome || "Conta"}</strong>: de <strong className="break-all">{encontrada?.email}</strong> para{" "}
                  <strong className="break-all">{novo.trim().toLowerCase()}</strong>.
                </p>
                <p>A pessoa sai de todos os aparelhos e entra de novo com o e-mail novo (a senha não muda). Os dois endereços recebem um aviso.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={trocar.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={trocar.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (encontrada) trocar.mutate({ userId: encontrada.id, novoEmail: novo.trim().toLowerCase() });
              }}
            >
              {trocar.isPending ? "Trocando..." : "Trocar e-mail"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
