import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getPasswordChecks,
  validatePassword,
  PASSWORD_RULE_LABELS,
} from "@shared/passwordPolicy";
import { AlertCircle, Check, X } from "lucide-react";
import { emailValido, mensagemDeErroDeAcesso } from "@shared/erroDeAcesso";
import { celularValido, mascaraTelefone, soDigitos } from "@shared/telefone";
import { LogoFull, APP_NAME, APP_TAGLINE } from "@/components/Logo";
import { maskCrp, isValidCrp } from "@shared/crp";

export default function Login() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  // Celular no cadastro (profissional e paciente): contato e, quando o SMS for
  // ligado, outro jeito de recuperar o acesso.
  const [celular, setCelular] = useState("");
  const [loading, setLoading] = useState(false);
  // Erros NA TELA, junto do campo (borda vermelha + frase embaixo). Antes era só
  // um aviso no canto, em inglês ("Invalid login credentials"), e o campo errado
  // não ficava marcado. `credenciais` = e-mail/senha não conferem: marca os dois.
  const [erros, setErros] = useState<{ nome?: string; email?: string; senha?: string; celular?: string; geral?: string; credenciais?: boolean }>({});
  const mudarEmail = (valor: string) => {
    setEmail(valor);
    setErros((e) => ({ ...e, email: undefined, geral: undefined, credenciais: false }));
  };
  const mudarSenha = (valor: string) => {
    setPassword(valor);
    setErros((e) => ({ ...e, senha: undefined, geral: undefined, credenciais: false }));
  };
  /** Confere o e-mail antes de ir ao servidor; devolve a frase do erro ou null. */
  const erroDoEmail = (valor: string) => {
    if (!valor.trim()) return "Digite seu e-mail.";
    if (!emailValido(valor)) return "E-mail incompleto. Confira se está assim: nome@gmail.com";
    return null;
  };

  // Cadastro: paciente (padrão) ou psicólogo(a) — este último vira solicitação
  // pendente com o CRP, aprovada manualmente pelo admin.
  const [isPsychologist, setIsPsychologist] = useState(false);
  const [crp, setCrp] = useState("");
  // LGPD: dado de saúde exige consentimento explícito — sem marcar, não cria conta.
  const [aceitouPolitica, setAceitouPolitica] = useState(false);

  const pedirRecuperacao = trpc.auth.requestPasswordReset.useMutation();
  const cadastrar = trpc.auth.signUp.useMutation();

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
    const erroEmail = erroDoEmail(email);
    const erroSenha = password ? null : "Digite sua senha.";
    if (erroEmail || erroSenha) {
      setErros({ email: erroEmail ?? undefined, senha: erroSenha ?? undefined });
      return;
    }
    setErros({});
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      toast.success("Bem-vinda de volta!");
      await afterAuth();
    } catch (e) {
      const codigo = (e as { code?: string }).code;
      const msg = e instanceof Error ? e.message : "";
      setErros({
        geral: mensagemDeErroDeAcesso(e, "Não foi possível entrar. Tente de novo."),
        credenciais: codigo === "invalid_credentials" || /invalid login credentials/i.test(msg),
      });
    } finally {
      setLoading(false);
    }
  };

  // "Esqueci minha senha": o link sai pelo NOSSO e-mail (marca VozInterior, logo e
  // o nome da pessoa), gerado no servidor — antes era o e-mail padrão do Supabase,
  // com o nome dele. O link leva a /redefinir-senha, como antes.
  const handleForgotPassword = async () => {
    const alvo = email.trim().toLowerCase();
    if (!alvo) {
      setErros({ email: "Digite seu e-mail aqui para receber o link." });
      return;
    }
    const erroEmail = erroDoEmail(alvo);
    if (erroEmail) {
      setErros({ email: erroEmail });
      return;
    }
    setLoading(true);
    try {
      await pedirRecuperacao.mutateAsync({ email: alvo });
      // Mensagem genérica de propósito: não revela se o e-mail tem conta.
      toast.success(
        "Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha. Confira também o spam.",
        { duration: 9000 },
      );
    } catch {
      // O erro do servidor seria a validação crua (JSON); a frase basta.
      toast.error("Não foi possível enviar o link. Confira o e-mail digitado e tente de novo.");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Cadastro pelo NOSSO servidor, com confirmação de e-mail (ver auth.signUp):
   * ninguém entra com o e-mail de outra pessoa. A conta só abre depois do clique
   * no link que chega por e-mail; o pedido de acesso profissional (CRP) sai
   * sozinho no primeiro login confirmado.
   */
  const handleSignup = async () => {
    // Todos os erros de uma vez, cada um embaixo do seu campo.
    const nome = name.trim();
    const erroNome = !nome ? "Digite seu nome." : nome.length < 2 ? "Digite seu nome completo." : null;
    const erroEmail = erroDoEmail(email);
    const erroCelular = celularValido(celular) ? null : "Informe um celular com DDD, por exemplo (81) 99999-0000.";
    const erroSenha = password ? validatePassword(password) : "Crie uma senha.";
    if (erroNome || erroEmail || erroCelular || erroSenha) {
      setErros({
        nome: erroNome ?? undefined,
        email: erroEmail ?? undefined,
        celular: erroCelular ?? undefined,
        senha: erroSenha ?? undefined,
      });
      return;
    }

    if (isPsychologist && !isValidCrp(crp)) {
      toast.error("Informe o CRP no formato 06/123456");
      return;
    }
    if (!aceitouPolitica) {
      toast.error("Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.");
      return;
    }
    setLoading(true);
    try {
      await cadastrar.mutateAsync({
        email: email.trim().toLowerCase(),
        senha: password,
        nome: name.trim(),
        celular: soDigitos(celular),
        crp: isPsychologist ? crp.trim() : undefined,
        aceitouPolitica: true,
      });
      // Mensagem igual tenha ou não conta (não revela quem está cadastrado): quem
      // já tem conta recebe, no próprio e-mail, o aviso com o "criar nova senha".
      toast.success(`Enviamos um e-mail para ${email.trim()}. Abra para continuar (confira também o spam).`, {
        duration: 15000,
      });
    } catch (e) {
      toast.error(e instanceof Error && !e.message.startsWith("[") ? e.message : "Não foi possível criar a conta. Confira os dados.");
    } finally {
      setLoading(false);
    }
  };

  // Voltou pelo link de confirmação (/login?confirmado=1#access_token=…): o
  // Supabase abre a sessão sozinho a partir do endereço; aqui só segue para a área.
  useEffect(() => {
    if (!supabase || !new URLSearchParams(window.location.search).has("confirmado")) return;
    let feito = false;
    const entrar = () => {
      if (feito) return;
      feito = true;
      toast.success("E-mail confirmado! Bem-vinda ao VozInterior.");
      void afterAuth();
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      if (sessao) entrar();
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) entrar();
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background via-background to-secondary/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          {/* A imagem já traz o nome e "Atendimento Psicológico Online"; repetir
              em texto seria dizer a mesma coisa duas vezes. */}
          <LogoFull className="mx-auto w-52" />
          <h1 className="sr-only">
            {APP_NAME} — {APP_TAGLINE}
          </h1>
        </CardHeader>
        <CardContent>
          {!isSupabaseConfigured ? (
            <p className="text-sm text-muted-foreground text-center">
              Login indisponível: defina <code>VITE_SUPABASE_URL</code> e{" "}
              <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> no ambiente.
            </p>
          ) : (
            // Alvos de toque: campos e botões vinham com 36px de altura (abas com
            // 29px) — abaixo dos ~44px confortáveis para dedo, logo na primeira
            // tela que o paciente toca no celular. Em vez de repetir classe em
            // cada controle, a altura é ajustada aqui de uma vez, e volta ao
            // padrão do app no desktop (sm:).
            <Tabs
              defaultValue="login"
              // As duas abas dividem e-mail/senha: o erro de uma não pode aparecer na outra.
              onValueChange={() => setErros({})}
              className="w-full [&_button[data-slot=tabs-trigger]]:h-10 [&_input]:h-11 sm:[&_button[data-slot=tabs-trigger]]:h-9 sm:[&_input]:h-9"
            >
              <TabsList className="grid h-auto w-full grid-cols-2">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="space-y-4 pt-4">
                {/* <form>: o Enter em qualquer campo já entra. */}
                <form
                  className="space-y-4"
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleLogin();
                  }}
                >
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => mudarEmail(e.target.value)}
                    aria-invalid={Boolean(erros.email || erros.credenciais)}
                    aria-describedby={erros.email ? "email-erro" : undefined}
                  />
                  {erros.email && (
                    <p id="email-erro" className="text-sm text-destructive">
                      {erros.email}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => mudarSenha(e.target.value)}
                    aria-invalid={Boolean(erros.senha || erros.credenciais)}
                    aria-describedby={erros.senha ? "senha-erro" : undefined}
                  />
                  {erros.senha && (
                    <p id="senha-erro" className="text-sm text-destructive">
                      {erros.senha}
                    </p>
                  )}
                </div>
                {erros.geral && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>{erros.geral}</span>
                  </div>
                )}
                <Button type="submit" disabled={loading} className="h-11 w-full bg-primary hover:bg-primary/90 sm:h-9">
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="w-full text-center text-sm text-primary hover:underline disabled:opacity-50"
                >
                  Esqueci minha senha
                </button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setErros((er) => ({ ...er, nome: undefined }));
                    }}
                    aria-invalid={Boolean(erros.nome)}
                    aria-describedby={erros.nome ? "name-erro" : undefined}
                  />
                  {erros.nome && (
                    <p id="name-erro" className="text-sm text-destructive">
                      {erros.nome}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-s">E-mail</Label>
                  <Input
                    id="email-s"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => mudarEmail(e.target.value)}
                    aria-invalid={Boolean(erros.email)}
                    aria-describedby={erros.email ? "email-s-erro" : undefined}
                  />
                  {erros.email && (
                    <p id="email-s-erro" className="text-sm text-destructive">
                      {erros.email}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="celular-s">Celular (com DDD)</Label>
                  <Input
                    id="celular-s"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="(81) 99999-0000"
                    value={celular}
                    onChange={(e) => {
                      setCelular(mascaraTelefone(e.target.value));
                      setErros((er) => ({ ...er, celular: undefined }));
                    }}
                    aria-invalid={Boolean(erros.celular)}
                    aria-describedby={erros.celular ? "celular-s-erro" : undefined}
                  />
                  {erros.celular && (
                    <p id="celular-s-erro" className="text-sm text-destructive">
                      {erros.celular}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-s">Senha</Label>
                  <Input
                    id="password-s"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => mudarSenha(e.target.value)}
                    aria-invalid={Boolean(erros.senha)}
                    aria-describedby={erros.senha ? "password-s-erro" : undefined}
                  />
                  {erros.senha && (
                    <p id="password-s-erro" className="text-sm text-destructive">
                      {erros.senha}
                    </p>
                  )}
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
                              ok ? "text-green-700 dark:text-green-400" : "text-muted-foreground"
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
                      className="h-auto min-h-9 flex-1 whitespace-normal py-2"
                      onClick={() => setIsPsychologist(false)}
                    >
                      Não, sou paciente
                    </Button>
                    <Button
                      type="button"
                      variant={isPsychologist ? "default" : "outline"}
                      size="sm"
                      className="h-auto min-h-9 flex-1 whitespace-normal py-2"
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

                {/* LGPD: o app trata dado de saúde (categoria sensível) — o
                    consentimento precisa ser explícito, não presumido. */}
                <label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aceitouPolitica}
                    onChange={(e) => setAceitouPolitica(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span>
                    Li e concordo com os{" "}
                    <a
                      href="/termos"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline underline-offset-4"
                    >
                      Termos de Uso
                    </a>{" "}
                    e com a{" "}
                    <a
                      href="/privacidade"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline underline-offset-4"
                    >
                      Política de Privacidade
                    </a>
                    , incluindo o tratamento dos meus dados de saúde para o
                    atendimento, o uso da assistente de IA e a transferência dos
                    dados a operadores no exterior, conforme a política.
                  </span>
                </label>

                <Button
                  onClick={handleSignup}
                  disabled={loading || !aceitouPolitica}
                  className="h-11 w-full bg-primary hover:bg-primary/90 sm:h-9"
                >
                  {loading ? "Criando..." : "Criar conta"}
                </Button>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Fora do cartão, sempre visível: quem não consegue entrar está nesta
          tela, e é exatamente essa a pessoa que precisa da ajuda. */}
      <p className="mt-6 text-sm text-muted-foreground">
        Problemas para entrar?{" "}
        <a href="/ajuda" className="text-primary underline underline-offset-4">
          Veja a ajuda
        </a>
        {" · "}
        <a href="/precos" className="text-primary underline underline-offset-4">
          Planos e preços
        </a>
      </p>
    </main>
  );
}
