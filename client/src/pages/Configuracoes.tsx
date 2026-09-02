import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPasswordChecks, validatePassword, PASSWORD_RULE_LABELS } from "@shared/passwordPolicy";
import { Check, X, Mail, KeyRound, Phone } from "lucide-react";

/**
 * Configurações da conta: e-mail, senha e telefone.
 *
 * Uma página só para os dois papéis, porque e-mail e senha são da CONTA
 * (Supabase Auth), não do papel. O telefone mora em tabelas diferentes
 * (`therapists` ou `patients`), mas o servidor resolve isso — aqui é um campo só.
 *
 * Por que pedir a senha atual antes de trocar e-mail ou senha: o Supabase
 * permite `updateUser` com a sessão aberta, sem reconfirmar nada. Num sistema
 * com dado clínico isso é perigoso — quem alcançar um computador destravado
 * trocaria e-mail e senha e tomaria a conta. Reautenticar fecha essa porta.
 */
export default function Configuracoes() {
  const utils = trpc.useUtils();
  const { data: contato, isLoading } = trpc.me.contato.useQuery();

  const [novoEmail, setNovoEmail] = useState("");
  const [senhaParaEmail, setSenhaParaEmail] = useState("");
  const [salvandoEmail, setSalvandoEmail] = useState(false);

  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const checks = getPasswordChecks(novaSenha);

  const [telefone, setTelefone] = useState("");

  // Só preenche quando os dados chegam: iniciar o input com "" e sobrescrever
  // depois apagaria o que a pessoa já tivesse digitado.
  useEffect(() => {
    if (contato) setTelefone(contato.phone ?? "");
  }, [contato]);

  const salvarTelefone = trpc.me.updatePhone.useMutation({
    onSuccess: () => {
      toast.success("Telefone atualizado.");
      utils.me.contato.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  /**
   * Confirma que quem está na frente do computador sabe a senha.
   * Devolve `true` se a senha confere. Reautenticar renova a sessão do próprio
   * usuário — não desloga nem troca de conta.
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
      toast.success(`Enviamos um link de confirmação para ${alvo}. A troca vale depois que você confirmar.`);
      setNovoEmail("");
      setSenhaParaEmail("");
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível trocar a senha");
    } finally {
      setSalvandoSenha(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground">
            Dados de acesso e contato da sua conta.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              E-mail
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label className="text-muted-foreground">E-mail atual</Label>
              <p className="text-sm font-medium text-foreground">
                {isLoading ? "Carregando..." : contato?.email || "—"}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="novo-email">Novo e-mail</Label>
              <Input
                id="novo-email"
                type="email"
                autoComplete="email"
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
            <Button
              onClick={trocarEmail}
              disabled={salvandoEmail || !novoEmail || !senhaParaEmail}
              className="bg-primary hover:bg-primary/90"
            >
              {salvandoEmail ? "Enviando..." : "Trocar e-mail"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              Senha
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
            <Button
              onClick={trocarSenha}
              disabled={salvandoSenha || !senhaAtual || !novaSenha}
              className="bg-primary hover:bg-primary/90"
            >
              {salvandoSenha ? "Salvando..." : "Trocar senha"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-primary" />
              Telefone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone de contato</Label>
              <Input
                id="telefone"
                type="tel"
                autoComplete="tel"
                placeholder="(00) 00000-0000"
                maxLength={20}
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
              />
            </div>
            <Button
              onClick={() => salvarTelefone.mutate({ phone: telefone.trim() })}
              disabled={salvarTelefone.isPending || isLoading}
              className="bg-primary hover:bg-primary/90"
            >
              {salvarTelefone.isPending ? "Salvando..." : "Salvar telefone"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
