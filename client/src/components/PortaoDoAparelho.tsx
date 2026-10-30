import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

/** Páginas sem dado clínico. A Ajuda fica aberta: é onde se procura quem travou aqui. */
const ROTAS_ABERTAS = ["/", "/login", "/redefinir-senha", "/ajuda", "/privacidade", "/termos", "/precos"];

/**
 * Psicóloga ou admin em aparelho novo confirma um código do e-mail antes de ver o
 * sistema. Fica ACIMA das rotas: nada do prontuário chega a montar. Quem barra de
 * verdade é o servidor (server/aparelhos.ts); esta tela só explica o que fazer.
 */
export default function PortaoDoAparelho({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [local] = useLocation();
  if (user?.aparelhoVerificado !== false || ROTAS_ABERTAS.includes(local)) return <>{children}</>;
  return <ConfirmarAparelho aoSair={() => void logout()} />;
}

function ConfirmarAparelho({ aoSair }: { aoSair: () => void }) {
  const utils = trpc.useUtils();
  const [codigo, setCodigo] = useState("");
  const [destino, setDestino] = useState("");
  const [aviso, setAviso] = useState("");

  const enviar = trpc.aparelho.enviarCodigo.useMutation({
    onSuccess: (r) => {
      setDestino(r.destino);
      setAviso(r.enviado ? "" : "Espere um minuto para pedir outro código.");
    },
    onError: (e) => setAviso(e.message),
  });
  const confirmar = trpc.aparelho.confirmarCodigo.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
    onError: (e) => setAviso(e.message),
  });

  // Uma vez só: o StrictMode e os recarregamentos não podem pedir código a cada render.
  const jaPediu = useRef(false);
  useEffect(() => {
    if (jaPediu.current) return;
    jaPediu.current = true;
    enviar.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aoConfirmar = (e: FormEvent) => {
    e.preventDefault();
    setAviso("");
    confirmar.mutate({ codigo });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Confirme que é você</h1>
            <p className="text-sm text-muted-foreground">
              Este aparelho é novo na sua conta. Enviamos um código de 6 números
              {destino ? ` para ${destino}` : " para o seu e-mail"}. Você só precisa fazer isso uma vez neste aparelho.
            </p>
          </div>

          <form onSubmit={aoConfirmar} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="codigo-aparelho">Código</Label>
              <Input
                id="codigo-aparelho"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder="000000"
                className="text-center text-2xl tracking-[0.4em]"
              />
            </div>
            {aviso && (
              <p role="alert" className="text-sm text-destructive">
                {aviso}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={codigo.length !== 6 || confirmar.isPending}>
              {confirmar.isPending ? "Confirmando..." : "Confirmar"}
            </Button>
          </form>

          <div className="space-y-2 border-t pt-4 text-sm text-muted-foreground">
            <p>Não chegou? Olhe a caixa de spam e a aba Atualizações. O código vale por 10 minutos.</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={enviar.isPending}
                onClick={() => {
                  setAviso("");
                  enviar.mutate();
                }}
              >
                {enviar.isPending ? "Enviando..." : "Reenviar código"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={aoSair}>
                Sair
              </Button>
            </div>
            <p>
              Não tem mais acesso a esse e-mail?{" "}
              <Link href="/ajuda" className="text-primary underline underline-offset-4">
                Fale com o suporte
              </Link>
              .
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
