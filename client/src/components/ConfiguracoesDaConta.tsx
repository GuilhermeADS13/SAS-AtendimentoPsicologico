import { ReactNode, useState } from "react";
import { toast } from "sonner";
import { Bell, Download, LogOut, ShieldCheck, UserX } from "lucide-react";
import { LogoDoNavegador } from "@/components/LogoDoNavegador";
import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import { formatarDataHora } from "@shared/datas";
import { TIPOS_DE_AVISO, type AvisosPorEmail } from "@shared/avisosPorEmail";

/**
 * Seções de Configurações pedidas em 2026-11-04: aparelhos conectados, sair de
 * todos os aparelhos, avisos por e-mail e "meus dados" (LGPD).
 */

const SUPORTE_EMAIL = "suportevozinterior@gmail.com";

/** Mesmo desenho das linhas de Configuracoes.tsx: rótulo à esquerda, ação à direita. */
function Linha({ titulo, descricao, children }: { titulo: string; descricao: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 py-5 sm:grid-cols-[minmax(0,220px)_1fr] sm:gap-8">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{descricao}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}


/**
 * Aparelhos conectados e "sair de todos". Psicóloga e admin veem os aparelhos
 * confirmados por código; o paciente, os logins abertos (server/sessoesDaConta.ts).
 */
export function SegurancaDaConta({ confirmaAparelho }: { confirmaAparelho: boolean }) {
  const utils = trpc.useUtils();
  const { data: aparelhos = [], isLoading } = trpc.aparelho.listar.useQuery(undefined, { enabled: confirmaAparelho });
  const [paraRemover, setParaRemover] = useState<{ id: number; nome: string; esteAparelho: boolean } | null>(null);
  const [sairDeTodos, setSairDeTodos] = useState(false);
  const [saindo, setSaindo] = useState(false);

  const remover = trpc.aparelho.remover.useMutation({
    onSuccess: (_r, vars) => {
      const eraEste = paraRemover?.id === vars.id && paraRemover.esteAparelho;
      setParaRemover(null);
      if (eraEste) {
        // Este aparelho deixou de ser confiável: recarregar mostra a tela do código.
        window.location.reload();
        return;
      }
      toast.success("Aparelho removido. Ele vai pedir o código de novo para entrar.");
      utils.aparelho.listar.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const removerTodos = trpc.aparelho.sairDeTodos.useMutation();

  // Paciente não confirma aparelho por código: os aparelhos dele são os logins abertos.
  const { data: sessoes = [], isLoading: carregandoSessoes } = trpc.aparelho.sessoes.useQuery(undefined, {
    enabled: !confirmaAparelho,
  });
  const [sessaoParaEncerrar, setSessaoParaEncerrar] = useState<{ id: string; nome: string; estaSessao: boolean } | null>(null);
  const encerrar = trpc.aparelho.encerrarSessao.useMutation({
    onSuccess: async () => {
      const eraEsta = sessaoParaEncerrar?.estaSessao;
      setSessaoParaEncerrar(null);
      if (eraEsta) {
        await supabase?.auth.signOut({ scope: "local" });
        window.location.href = "/login";
        return;
      }
      toast.success("Pronto. Esse aparelho sai da sua conta em até 1 hora.");
      utils.aparelho.sessoes.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const confirmarSairDeTodos = async () => {
    setSaindo(true);
    try {
      await removerTodos.mutateAsync();
      // Encerra as sessões do Supabase em todos os aparelhos, inclusive este.
      await supabase?.auth.signOut({ scope: "global" });
      window.location.href = "/login";
    } catch {
      toast.error("Não foi possível sair de todos os aparelhos. Tente de novo.");
      setSaindo(false);
    }
  };

  return (
    <Card data-tour="config-seguranca">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Segurança
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {confirmaAparelho && (
          <>
            <Linha
              titulo="Aparelhos conectados"
              descricao="Onde você já confirmou o código de acesso. Cada navegador conta como um aparelho. Remova o que não reconhecer ou que não usa mais."
            >
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : aparelhos.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">Nenhum aparelho confirmado.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {aparelhos.map((a) => {
                    const nome = a.navegador ?? "Aparelho confirmado antes de novembro de 2026";
                    return (
                      <li key={a.id} className="flex flex-wrap items-center gap-3 p-3">
                        <LogoDoNavegador navegador={a.navegador} />
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                            {nome}
                            {a.esteAparelho && <Badge variant="secondary">Este aparelho</Badge>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {a.ultimoUsoEm ? `Último uso: ${formatarDataHora(a.ultimoUsoEm)}` : `Confirmado em ${formatarDataHora(a.confirmadoEm)}`}
                            {" · "}vale até {formatarDataHora(a.expiraEm)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-10 sm:h-8"
                          onClick={() => setParaRemover({ id: a.id, nome, esteAparelho: a.esteAparelho })}
                        >
                          Remover
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Linha>
            <Separator />
          </>
        )}
        {!confirmaAparelho && (
          <>
            <Linha
              titulo="Aparelhos conectados"
              descricao="Onde a sua conta está aberta. Cada navegador conta como um aparelho. Não reconhece algum? Toque em “Sair”."
            >
              {carregandoSessoes ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : sessoes.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">Nenhum aparelho encontrado.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {sessoes.map((s) => {
                    return (
                      <li key={s.id} className="flex flex-wrap items-center gap-3 p-3">
                        <LogoDoNavegador navegador={s.navegador} />
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                            {s.navegador}
                            {s.estaSessao && <Badge variant="secondary">Este aparelho</Badge>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Último uso: {formatarDataHora(s.ultimoUso)}
                            {" · "}entrou em {formatarDataHora(s.criadaEm)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-10 sm:h-8"
                          onClick={() => setSessaoParaEncerrar({ id: s.id, nome: s.navegador, estaSessao: s.estaSessao })}
                        >
                          Sair
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Linha>
            <Separator />
          </>
        )}
        <Linha
          titulo="Sair de todos os aparelhos"
          descricao="Encerra a sua conta em todos os aparelhos, inclusive neste. Use se perdeu o celular ou acha que alguém entrou na sua conta."
        >
          <Button variant="outline" size="sm" className="h-10 sm:h-8" onClick={() => setSairDeTodos(true)}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair de todos os aparelhos
          </Button>
        </Linha>
      </CardContent>

      <AlertDialog open={!!paraRemover} onOpenChange={(o) => !o && setParaRemover(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {paraRemover?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              {paraRemover?.esteAparelho
                ? "É o aparelho que você está usando agora: logo em seguida o sistema vai pedir um código novo, enviado para o seu e-mail."
                : "Quem estiver nesse aparelho vai precisar de um código novo, enviado para o seu e-mail, para continuar."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={remover.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (paraRemover) remover.mutate({ id: paraRemover.id });
              }}
            >
              {remover.isPending ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!sessaoParaEncerrar} onOpenChange={(o) => !o && setSessaoParaEncerrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair do {sessaoParaEncerrar?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              {sessaoParaEncerrar?.estaSessao
                ? "É o aparelho que você está usando agora: você sai da conta em seguida e precisa entrar de novo."
                : "Esse aparelho sai da sua conta em até 1 hora e, para voltar, vai precisar entrar de novo."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={encerrar.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (sessaoParaEncerrar) encerrar.mutate({ id: sessaoParaEncerrar.id });
              }}
            >
              {encerrar.isPending ? "Saindo..." : "Sair"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={sairDeTodos} onOpenChange={(o) => !saindo && setSairDeTodos(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair de todos os aparelhos?</AlertDialogTitle>
            <AlertDialogDescription>
              Você vai precisar entrar de novo, com a senha, em todos os aparelhos, inclusive neste
              {confirmaAparelho ? ", e confirmar o código enviado para o seu e-mail" : ""}. Se acha que alguém sabe a sua
              senha, troque-a depois de entrar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={saindo}
              onClick={(e) => {
                e.preventDefault();
                void confirmarSairDeTodos();
              }}
            >
              {saindo ? "Saindo..." : "Sair de todos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/** Quais avisos de agenda a pessoa quer por e-mail. Salva a cada clique. */
export function AvisosPorEmailCard() {
  const utils = trpc.useUtils();
  const { data: avisos, isLoading } = trpc.me.avisosPorEmail.useQuery();
  const salvar = trpc.me.definirAvisosPorEmail.useMutation({
    onMutate: async (novo) => {
      await utils.me.avisosPorEmail.cancel();
      const antes = utils.me.avisosPorEmail.getData();
      utils.me.avisosPorEmail.setData(undefined, novo);
      return { antes };
    },
    onError: (_e, _novo, contexto) => {
      if (contexto?.antes) utils.me.avisosPorEmail.setData(undefined, contexto.antes);
      toast.error("Não foi possível salvar. Tente de novo.");
    },
    onSuccess: () => toast.success("Preferência salva."),
  });

  const alternar = (id: keyof AvisosPorEmail, ligado: boolean) => {
    if (!avisos) return;
    salvar.mutate({ ...avisos, [id]: ligado });
  };

  return (
    <Card data-tour="config-avisos">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          Avisos por e-mail
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Linha
          titulo="Avisos de consulta"
          descricao="Escolha quais avisos da agenda chegam no seu e-mail. Código de acesso, troca de senha e avisos do plano sempre chegam."
        >
          {isLoading || !avisos ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <ul className="space-y-3">
              {TIPOS_DE_AVISO.map((t) => (
                <li key={t.id}>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={avisos[t.id]}
                      onChange={(e) => alternar(t.id, e.target.checked)}
                      disabled={salvar.isPending}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                    />
                    <span>
                      <span className="block text-sm font-medium text-foreground">{t.rotulo}</span>
                      <span className="block text-xs text-muted-foreground">{t.descricao}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Linha>
      </CardContent>
    </Card>
  );
}

/** "Meus dados" (LGPD, art. 18): baixar o que o sistema guarda e pedir a exclusão. */
export function MeusDados({ psicologa }: { psicologa: boolean }) {
  const exportar = trpc.me.exportarMeusDados.useMutation({
    onSuccess: (dados) => {
      const arquivo = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(arquivo);
      link.download = `vozinterior-meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success("Arquivo baixado.");
    },
    onError: () => toast.error("Não foi possível gerar o arquivo. Tente de novo."),
  });
  const pedidoDeExclusao = `mailto:${SUPORTE_EMAIL}?subject=${encodeURIComponent("Pedido de exclusão de conta")}&body=${encodeURIComponent(
    "Olá! Quero excluir a minha conta do VozInterior.",
  )}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="w-5 h-5 text-primary" />
          Meus dados
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Linha
          titulo="Baixar meus dados"
          descricao={
            psicologa
              ? "Um arquivo com os dados da sua conta: cadastro, perfil profissional, plano e aparelhos. Os dados dos seus pacientes não entram aqui."
              : "Um arquivo com os dados da sua conta: cadastro, consultas e documentos que a sua psicóloga compartilhou."
          }
        >
          <Button variant="outline" size="sm" className="h-10 sm:h-8" disabled={exportar.isPending} onClick={() => exportar.mutate()}>
            <Download className="mr-2 h-4 w-4" />
            {exportar.isPending ? "Gerando..." : "Baixar meus dados"}
          </Button>
        </Linha>
        <Separator />
        <Linha
          titulo="Excluir minha conta"
          descricao={
            psicologa
              ? "O pedido vai para o suporte. Os prontuários dos seus pacientes precisam ficar guardados por 5 anos (Resolução CFP nº 001/2009); o resto é apagado."
              : "O pedido vai para o suporte. O seu prontuário fica guardado pela psicóloga por 5 anos, como exige o Conselho Federal de Psicologia; o resto é apagado."
          }
        >
          <Button variant="outline" size="sm" className="h-10 sm:h-8" asChild>
            <a href={pedidoDeExclusao}>
              <UserX className="mr-2 h-4 w-4" />
              Pedir a exclusão da conta
            </a>
          </Button>
        </Linha>
      </CardContent>
    </Card>
  );
}
