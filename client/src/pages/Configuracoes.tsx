import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { useRole } from "@/hooks/useRole";
import { iniciais } from "@/lib/iniciais";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { getPasswordChecks, validatePassword, PASSWORD_RULE_LABELS } from "@shared/passwordPolicy";
import { Check, X, Mail, KeyRound, Phone, ShieldCheck, Info } from "lucide-react";

/**
 * Configurações da conta: e-mail, senha e telefone.
 *
 * Uma página só para os dois papéis, porque e-mail e senha são da CONTA
 * (Supabase Auth), não do papel. O telefone mora em tabelas diferentes
 * (`therapists` ou `patients`), mas o servidor resolve isso — aqui é um campo só.
 *
 * Layout em linhas (rótulo à esquerda, valor e ação à direita): os rótulos viram
 * um índice que se lê de cima a baixo, sem precisar ler campo por campo. Cada
 * linha mostra o VALOR ATUAL antes de qualquer campo de edição — numa tela de
 * configurações a primeira pergunta é "o que está valendo hoje?", não "o que eu
 * quero escrever?".
 *
 * As trocas sensíveis (e-mail e senha) acontecem em diálogo, não em campo solto
 * na página. Dois motivos: a senha atual só aparece quando ela é realmente
 * necessária (um campo de senha permanente na tela convida o navegador a
 * preencher sozinho e confunde quem só passou para conferir o telefone), e a
 * ação fica explícita — ninguém troca o e-mail sem ter aberto "Alterar e-mail".
 *
 * Por que pedir a senha atual: o Supabase permite `updateUser` com a sessão
 * aberta, sem reconfirmar nada. Num sistema com dado clínico isso é perigoso —
 * quem alcançar um computador destravado trocaria e-mail e senha e tomaria a
 * conta. Reautenticar fecha essa porta.
 */

/** Linha de configuração: rótulo e explicação à esquerda, conteúdo à direita. */
function Linha({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 py-5 sm:grid-cols-[minmax(0,220px)_1fr] sm:gap-8">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">{descricao}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

/** Valor atual de um campo. Sem valor, diz isso em vez de ficar em branco. */
function ValorAtual({ valor, vazio }: { valor?: string | null; vazio: string }) {
  if (!valor) {
    return <p className="text-sm italic text-muted-foreground">{vazio}</p>;
  }
  return <p className="text-sm font-medium break-all text-foreground">{valor}</p>;
}

export default function Configuracoes() {
  const utils = trpc.useUtils();
  const { data: contato, isLoading } = trpc.me.contato.useQuery();
  const { user, isTherapist, isAdmin } = useRole();

  const [dialogoEmail, setDialogoEmail] = useState(false);
  const [novoEmail, setNovoEmail] = useState("");
  const [senhaParaEmail, setSenhaParaEmail] = useState("");
  const [salvandoEmail, setSalvandoEmail] = useState(false);

  const [dialogoSenha, setDialogoSenha] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const checks = getPasswordChecks(novaSenha);

  const [editandoTelefone, setEditandoTelefone] = useState(false);
  const [telefone, setTelefone] = useState("");

  // Só preenche quando os dados chegam: iniciar o input com "" e sobrescrever
  // depois apagaria o que a pessoa já tivesse digitado.
  useEffect(() => {
    if (contato) setTelefone(contato.phone ?? "");
  }, [contato]);

  const salvarTelefone = trpc.me.updatePhone.useMutation({
    onSuccess: () => {
      toast.success("Telefone atualizado.");
      setEditandoTelefone(false);
      utils.me.contato.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  /**
   * Confirma que quem está na frente do computador sabe a senha.
   * Reautenticar renova a sessão do próprio usuário — não desloga nem troca de
   * conta. Devolve `true` se a senha confere.
   */
  const conferirSenhaAtual = async (senha: string) => {
    if (!supabase || !contato?.email) return false;
    const { error } = await supabase.auth.signInWithPassword({
      email: contato.email,
      password: senha,
    });
    if (error) {
      toast.error("Senha atual incorreta.");
      return false;
    }
    return true;
  };

  const trocarEmail = async () => {
    if (!supabase) return;
    const alvo = novoEmail.trim();
    if (!alvo) {
      toast.error("Digite o novo e-mail.");
      return;
    }
    if (alvo.toLowerCase() === (contato?.email ?? "").toLowerCase()) {
      toast.error("Este já é o seu e-mail atual.");
      return;
    }
    setSalvandoEmail(true);
    try {
      if (!(await conferirSenhaAtual(senhaParaEmail))) return;
      const { error } = await supabase.auth.updateUser({ email: alvo });
      if (error) throw error;
      // A troca NÃO vale ainda: o Supabase manda um link para o endereço novo e
      // só efetiva quando a pessoa clica. Dizer isso evita ela achar que já
      // pode entrar com o e-mail novo.
      toast.success(`Link de confirmação enviado para ${alvo}. A troca vale depois que você confirmar.`);
      setNovoEmail("");
      setSenhaParaEmail("");
      setDialogoEmail(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível trocar o e-mail");
    } finally {
      setSalvandoEmail(false);
    }
  };

  const trocarSenha = async () => {
    if (!supabase) return;
    const erro = validatePassword(novaSenha);
    if (erro) {
      toast.error(erro);
      return;
    }
    if (novaSenha === senhaAtual) {
      toast.error("A nova senha precisa ser diferente da atual.");
      return;
    }
    setSalvandoSenha(true);
    try {
      if (!(await conferirSenhaAtual(senhaAtual))) return;
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw error;
      toast.success("Senha alterada.");
      setSenhaAtual("");
      setNovaSenha("");
      setDialogoSenha(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível trocar a senha");
    } finally {
      setSalvandoSenha(false);
    }
  };

  const papel = isAdmin ? "Administradora" : isTherapist ? "Psicóloga" : "Paciente";
  const desde = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    : null;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Configurações da conta</h1>
          <p className="text-muted-foreground">
            Seus dados de acesso e contato. Alterações aqui valem para todos os seus
            dispositivos.
          </p>
        </div>

        {/* Identificação: quem está logado, antes de qualquer campo editável.
            Evita a pessoa trocar a senha achando que está em outra conta. */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 py-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
              {iniciais(user?.name || contato?.email || "?")}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate font-semibold text-foreground">
                {user?.name || "Sua conta"}
              </p>
              <p className="truncate text-sm text-muted-foreground">{contato?.email}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant="secondary">{papel}</Badge>
              {desde && (
                <span className="text-xs text-muted-foreground">Desde {desde}</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Acesso
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Linha
              titulo="E-mail de acesso"
              descricao="É com ele que você entra no sistema e recebe os avisos das consultas."
            >
              <div className="flex flex-wrap items-center gap-3">
                <Mail className="w-4 h-4 shrink-0 text-muted-foreground" />
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Carregando...</p>
                ) : (
                  <ValorAtual valor={contato?.email} vazio="Nenhum e-mail definido" />
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setDialogoEmail(true)}>
                Alterar e-mail
              </Button>
            </Linha>

            <Separator />

            <Linha
              titulo="Senha"
              descricao="Usada para entrar. Pedimos a senha atual antes de trocar, para ninguém alterar seus dados de acesso por você."
            >
              <div className="flex items-center gap-3">
                <KeyRound className="w-4 h-4 shrink-0 text-muted-foreground" />
                <p className="text-sm font-medium tracking-widest text-foreground">••••••••</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setDialogoSenha(true)}>
                Alterar senha
              </Button>
            </Linha>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-primary" />
              Contato
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Linha
              titulo="Telefone"
              descricao={
                isTherapist
                  ? "Contato que aparece para os seus pacientes."
                  : "É por ele que a sua psicóloga fala com você fora do sistema."
              }
            >
              {editandoTelefone ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="telefone" className="sr-only">
                      Telefone de contato
                    </Label>
                    <Input
                      id="telefone"
                      type="tel"
                      autoComplete="tel"
                      autoFocus
                      placeholder="(00) 00000-0000"
                      maxLength={20}
                      value={telefone}
                      onChange={(e) => setTelefone(e.target.value)}
                      className="max-w-xs"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => salvarTelefone.mutate({ phone: telefone.trim() })}
                      disabled={salvarTelefone.isPending}
                      className="bg-primary hover:bg-primary/90"
                    >
                      {salvarTelefone.isPending ? "Salvando..." : "Salvar"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={salvarTelefone.isPending}
                      onClick={() => {
                        // Volta ao valor do servidor: sair da edição não pode
                        // deixar o rascunho na tela como se fosse o salvo.
                        setTelefone(contato?.phone ?? "");
                        setEditandoTelefone(false);
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 shrink-0 text-muted-foreground" />
                    {isLoading ? (
                      <p className="text-sm text-muted-foreground">Carregando...</p>
                    ) : (
                      <ValorAtual valor={contato?.phone} vazio="Nenhum telefone cadastrado" />
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isLoading}
                    onClick={() => setEditandoTelefone(true)}
                  >
                    {contato?.phone ? "Alterar telefone" : "Adicionar telefone"}
                  </Button>
                </>
              )}
            </Linha>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogoEmail} onOpenChange={setDialogoEmail}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar e-mail de acesso</DialogTitle>
            <DialogDescription>
              Hoje sua conta usa <strong className="break-all">{contato?.email}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="novo-email">Novo e-mail</Label>
              <Input
                id="novo-email"
                type="email"
                /* "off": com autoComplete="email" o navegador preenchia o campo
                   com o e-mail ATUAL, e a tela nascia parecendo já preenchida. */
                autoComplete="off"
                value={novoEmail}
                onChange={(e) => setNovoEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha-email">Senha atual</Label>
              <Input
                id="senha-email"
                type="password"
                autoComplete="current-password"
                value={senhaParaEmail}
                onChange={(e) => setSenhaParaEmail(e.target.value)}
              />
            </div>
            <p className="flex gap-2 rounded-md bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Enviaremos um link para o endereço novo. A troca só vale depois que você
                clicar nesse link — até lá, continue entrando com o e-mail atual.
              </span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogoEmail(false)}>
              Cancelar
            </Button>
            <Button
              onClick={trocarEmail}
              disabled={salvandoEmail || !novoEmail || !senhaParaEmail}
              className="bg-primary hover:bg-primary/90"
            >
              {salvandoEmail ? "Enviando..." : "Enviar confirmação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogoSenha} onOpenChange={setDialogoSenha}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>
              Você continua conectada neste dispositivo depois de trocar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="senha-atual">Senha atual</Label>
              <Input
                id="senha-atual"
                type="password"
                autoComplete="current-password"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nova-senha">Nova senha</Label>
              <Input
                id="nova-senha"
                type="password"
                autoComplete="new-password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
              />
              {novaSenha.length > 0 && (
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogoSenha(false)}>
              Cancelar
            </Button>
            <Button
              onClick={trocarSenha}
              disabled={salvandoSenha || !senhaAtual || !novaSenha}
              className="bg-primary hover:bg-primary/90"
            >
              {salvandoSenha ? "Salvando..." : "Salvar nova senha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
