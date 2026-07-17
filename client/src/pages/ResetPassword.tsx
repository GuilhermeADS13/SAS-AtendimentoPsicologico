import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoFull, APP_NAME, APP_TAGLINE } from "@/components/Logo";
import { getPasswordChecks, validatePassword, PASSWORD_RULE_LABELS } from "@shared/passwordPolicy";
import { Check, X } from "lucide-react";

/**
 * Define a nova senha após a pessoa clicar no link do e-mail de recuperação.
 *
 * O link do Supabase estabelece uma sessão de recuperação ao abrir esta página
 * (o cliente detecta o token na URL e dispara PASSWORD_RECOVERY). Só com essa
 * sessão o `updateUser({ password })` é permitido — por isso a página verifica
 * antes de mostrar o formulário: sem sessão, o link é inválido ou expirou.
 */
export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const [estado, setEstado] = useState<"verificando" | "pronto" | "invalido">("verificando");
  const [senha, setSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  const checks = getPasswordChecks(senha);

  useEffect(() => {
    if (!supabase) {
      setEstado("invalido");
      return;
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) {
        setEstado("pronto");
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setEstado("pronto");
    });
    // Se em alguns segundos não houve sessão de recuperação, o link não vale.
    const t = setTimeout(() => {
      setEstado((e) => (e === "verificando" ? "invalido" : e));
    }, 3000);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  const salvar = async () => {
    if (!supabase) return;
    const erro = validatePassword(senha);
    if (erro) {
      toast.error(erro);
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      toast.success("Senha redefinida! Entre com a nova senha.");
      await supabase.auth.signOut();
      setLocation("/login");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível redefinir a senha");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <LogoFull className="mx-auto w-52" />
          <CardTitle className="sr-only">
            {APP_NAME} — {APP_TAGLINE}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {estado === "verificando" ? (
            <p className="text-center text-muted-foreground">Verificando o link...</p>
          ) : estado === "invalido" ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Este link é inválido ou já expirou. Peça um novo em "Esqueci minha
                senha" na tela de login.
              </p>
              <Button onClick={() => setLocation("/login")} className="w-full">
                Voltar ao login
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <h1 className="text-lg font-semibold text-foreground">Nova senha</h1>
                <p className="text-sm text-muted-foreground">
                  Escolha uma senha para a sua conta.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nova-senha">Senha</Label>
                <Input
                  id="nova-senha"
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoFocus
                />
                {senha.length > 0 && (
                  <ul className="space-y-1 pt-1">
                    {PASSWORD_RULE_LABELS.map(({ key, label }) => {
                      const ok = checks[key];
                      return (
                        <li
                          key={key}
                          className={`flex items-center gap-2 text-xs ${
                            ok ? "text-green-600" : "text-muted-foreground"
                          }`}
                        >
                          {ok ? (
                            <Check className="w-3 h-3 shrink-0" />
                          ) : (
                            <X className="w-3 h-3 shrink-0" />
                          )}
                          {label}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <Button
                onClick={salvar}
                disabled={salvando}
                className="w-full bg-primary hover:bg-primary/90"
              >
                {salvando ? "Salvando..." : "Redefinir senha"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
