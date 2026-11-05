import { useState, type FormEvent, type ReactNode } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { origemGuardada } from "@/lib/origem";
import { LogoFull } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { celularValido, mascaraTelefone, soDigitos } from "@shared/telefone";
import { isValidCrp, maskCrp } from "@shared/crp";
import { ROTAS_ABERTAS } from "./PortaoDoAparelho";

/** Quem tocou em "Entrar com Google" no cadastro de psicóloga: a tela já vem com "Sim" marcado. */
export const CHAVE_QUER_SER_PSICOLOGA = "vozinterior:google-psicologa";

/**
 * Conta criada pelo Google, sem o que o cadastro por e-mail já pede: aceite dos
 * Termos e da Privacidade (LGPD), celular e, para psicóloga, o CRP. Fica ACIMA das
 * rotas, como o portão do aparelho. Quem barra de verdade é o servidor
 * (shared/cadastroPendente.ts); esta tela só pede o que falta.
 */
export default function PortaoDoCadastro({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [local] = useLocation();
  if (!user?.cadastroPendente || ROTAS_ABERTAS.includes(local)) return <>{children}</>;
  return <CompletarCadastro nome={user.name} aoSair={() => void logout()} />;
}

function lerPreferencia(): boolean {
  try {
    return localStorage.getItem(CHAVE_QUER_SER_PSICOLOGA) === "1";
  } catch {
    return false;
  }
}

function CompletarCadastro({ nome, aoSair }: { nome: string | null; aoSair: () => void }) {
  const utils = trpc.useUtils();
  const [celular, setCelular] = useState("");
  const [psicologa, setPsicologa] = useState(lerPreferencia);
  const [crp, setCrp] = useState("");
  const [aceitou, setAceitou] = useState(false);
  const [erro, setErro] = useState("");
  const completar = trpc.auth.completarCadastro.useMutation();
  const primeiroNome = (nome ?? "").trim().split(/\s+/)[0];

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    if (!celularValido(celular)) return setErro("Informe um celular com DDD, por exemplo (81) 99999-0000.");
    if (psicologa && !isValidCrp(crp)) return setErro("Informe o CRP no formato 06/123456.");
    if (!aceitou) return setErro("Para continuar, aceite os Termos de Uso e a Política de Privacidade.");
    try {
      await completar.mutateAsync({
        celular: soDigitos(celular),
        crp: psicologa ? crp.trim() : undefined,
        origem: origemGuardada(),
        aceitouPolitica: true,
      });
      // Token novo, já com o aceite: é ele que libera a API.
      await supabase?.auth.refreshSession();
      try {
        localStorage.removeItem(CHAVE_QUER_SER_PSICOLOGA);
      } catch {}
      await utils.auth.me.invalidate();
      toast.success(psicologa ? "Cadastro completo! Agora o seu CRP passa pela verificação." : "Cadastro completo!");
    } catch (falha) {
      setErro(falha instanceof Error && !falha.message.startsWith("[") ? falha.message : "Não foi possível salvar. Tente de novo.");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-5 pt-6">
          <LogoFull className="mx-auto w-40" />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Falta pouco{primeiroNome ? `, ${primeiroNome}` : ""}</h1>
            <p className="text-sm text-muted-foreground">
              Você entrou com o Google. Para usar o VozInterior, complete o seu cadastro.
            </p>
          </div>

          <form onSubmit={enviar} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="celular-cadastro">Celular (com DDD)</Label>
              <Input
                id="celular-cadastro"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(81) 99999-0000"
                value={celular}
                onChange={(e) => setCelular(mascaraTelefone(e.target.value))}
                className="h-11 sm:h-9"
              />
            </div>

            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm font-medium text-foreground">Você é psicólogo(a)?</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={psicologa ? "outline" : "default"} className="h-auto min-h-9 flex-1 whitespace-normal py-2" onClick={() => setPsicologa(false)}>
                  Não, sou paciente
                </Button>
                <Button type="button" size="sm" variant={psicologa ? "default" : "outline"} className="h-auto min-h-9 flex-1 whitespace-normal py-2" onClick={() => setPsicologa(true)}>
                  Sim, sou psicólogo(a)
                </Button>
              </div>
              {psicologa && (
                <div className="space-y-2">
                  <Label htmlFor="crp-cadastro">CRP</Label>
                  <Input
                    id="crp-cadastro"
                    value={crp}
                    onChange={(e) => setCrp(maskCrp(e.target.value))}
                    placeholder="06/123456"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={9}
                    className="h-11 sm:h-9"
                  />
                  <p className="text-xs text-muted-foreground">
                    O acesso profissional é liberado depois da verificação do CRP no Cadastro Nacional de Psicólogos.
                  </p>
                </div>
              )}
            </div>

            {/* LGPD: dado de saúde exige consentimento explícito, o mesmo do cadastro por e-mail. */}
            <label className="flex cursor-pointer items-start gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={aceitou} onChange={(e) => setAceitou(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
              <span>
                Li e concordo com os{" "}
                <a href="/termos" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
                  Termos de Uso
                </a>{" "}
                e com a{" "}
                <a href="/privacidade" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
                  Política de Privacidade
                </a>
                , incluindo o tratamento dos meus dados de saúde para o atendimento, o uso da assistente de IA e a
                transferência dos dados a operadores no exterior, conforme a política.
              </span>
            </label>

            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={completar.isPending || !aceitou}>
              {completar.isPending ? "Salvando..." : "Continuar"}
            </Button>
          </form>

          <div className="border-t pt-4 text-center">
            <Button type="button" variant="ghost" size="sm" onClick={aoSair}>
              Sair
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
