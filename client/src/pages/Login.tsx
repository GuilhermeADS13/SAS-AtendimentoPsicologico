import { useState } from "react";
import { useLocation } from "wouter";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getPasswordChecks,
  validatePassword,
  PASSWORD_RULE_LABELS,
} from "@shared/passwordPolicy";
import { Check, X } from "lucide-react";
import { LogoFull, APP_NAME, APP_TAGLINE } from "@/components/Logo";
import { maskCrp, isValidCrp } from "@shared/crp";

export default function Login() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  // Cadastro: paciente (padrão) ou psicólogo(a) — este último vira solicitação
  // pendente com o CRP, aprovada manualmente pelo admin.
  const [isPsychologist, setIsPsychologist] = useState(false);
  const [crp, setCrp] = useState("");

  const requestTherapist = trpc.me.requestTherapist.useMutation();

  const senhaChecks = getPasswordChecks(password);

  const afterAuth = async () => {
    // Revalida o auth.me (o token já vai no header) e entra na área do papel.
    await utils.auth.me.invalidate();
    const me = await utils.auth.me.fetch();
    const isTherapist = me?.role === "admin" || me?.role === "therapist";
    setLocation(isTherapist ? "/dashboard" : "/consultas");
  };

  const handleLogin = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Bem-vinda de volta!");
      await afterAuth();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no login");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!supabase) return;

    const erroSenha = validatePassword(password);
    if (erroSenha) {
      toast.error(erroSenha);
      return;
    }

    if (isPsychologist && !isValidCrp(crp)) {
      toast.error("Informe o CRP no formato 06/123456");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) throw error;

      if (!data.session) {
        toast.success("Conta criada! Confirme o e-mail para entrar.");
        return;
      }

      // Psicólogo(a): registra a solicitação (o acesso clínico só sai após
      // aprovação manual — o CRP é público e não prova identidade).
      if (isPsychologist) {
        try {
          await requestTherapist.mutateAsync({ fullName: name, crp: crp.trim() });
          toast.success(
            "Solicitação enviada! Seu acesso profissional será liberado após a verificação do CRP.",
            { duration: 8000 },
          );
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Conta criada, mas a solicitação falhou.",
          );
        }
      } else {
        toast.success("Conta criada!");
      }

      await afterAuth();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no cadastro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-secondary/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          {/* A imagem já traz o nome e "Atendimento Psicológico Online"; repetir
              em texto seria dizer a mesma coisa duas vezes. */}
          <LogoFull className="mx-auto w-52" />
          <CardTitle className="sr-only">
            {APP_NAME} — {APP_TAGLINE}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!isSupabaseConfigured ? (
            <p className="text-sm text-muted-foreground text-center">
              Login indisponível: defina <code>VITE_SUPABASE_URL</code> e{" "}
              <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> no ambiente.
            </p>
          ) : (
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button onClick={handleLogin} disabled={loading} className="w-full bg-primary hover:bg-primary/90">
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </TabsContent>

              <TabsContent value="signup" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-s">E-mail</Label>
                  <Input id="email-s" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-s">Senha</Label>
                  <Input
                    id="password-s"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {/* Requisitos visíveis enquanto digita: errar e só descobrir
                      no "Criar conta" é o que faz a pessoa desistir. */}
                  {password.length > 0 && (
                    <ul className="space-y-1 pt-1">
                      {PASSWORD_RULE_LABELS.map(({ key, label }) => {
                        const ok = senhaChecks[key];
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

                {/* Paciente (padrão) x psicólogo(a) — este vira solicitação. */}
                <div className="rounded-lg border border-border p-3 space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    Você é psicólogo(a)?
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={isPsychologist ? "outline" : "default"}
                      size="sm"
                      className="flex-1"
                      onClick={() => setIsPsychologist(false)}
                    >
                      Não, sou paciente
                    </Button>
                    <Button
                      type="button"
                      variant={isPsychologist ? "default" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => setIsPsychologist(true)}
                    >
                      Sim, sou psicólogo(a)
                    </Button>
                  </div>

                  {isPsychologist && (
                    <div className="space-y-2 pt-1">
                      <Label htmlFor="crp">CRP *</Label>
                      <Input
                        id="crp"
                        value={crp}
                        onChange={(e) => setCrp(maskCrp(e.target.value))}
                        placeholder="06/123456"
                        // inputMode numérico: no celular abre o teclado de
                        // números direto. A barra o campo põe sozinho.
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={9}
                      />
                      <p className="text-xs text-muted-foreground">
                        Seu acesso profissional é liberado após a verificação do CRP
                        no Cadastro Nacional de Psicólogos. Até lá, sua conta fica
                        como paciente.
                      </p>
                    </div>
                  )}
                </div>

                <Button onClick={handleSignup} disabled={loading} className="w-full bg-primary hover:bg-primary/90">
                  {loading ? "Criando..." : "Criar conta"}
                </Button>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
