import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useRole } from "@/hooks/useRole";
import { iniciais } from "@/lib/iniciais";
import { getAvatarSignedUrl } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { FUSO_BR, formatarHora } from "@shared/datas";
import DashboardLayout from "@/components/DashboardLayout";
import ChatConversa from "@/components/ChatConversa";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, CalendarDays, LockKeyhole, MessageSquare, Search, UserPlus, UserRound } from "lucide-react";

const chaveDoDia = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: FUSO_BR });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * `lastAt` vem de um `max()` em SQL cru, que o driver devolve como TEXTO no
 * formato do Postgres ("2026-10-07 14:00:00.123+00"). O Safari não entende o
 * espaço nem o fuso sem minutos, então normalizo para ISO antes do `new Date`.
 */
function paraData(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  const iso = valor.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Hora se foi hoje, "Ontem", ou dd/mm — como na lista de qualquer mensageiro. */
function quandoNaLista(d: Date | null, agora: Date): string {
  if (!d) return "";
  if (chaveDoDia(d) === chaveDoDia(agora)) return formatarHora(d);
  if (chaveDoDia(d) === chaveDoDia(new Date(agora.getTime() - 86_400_000))) return "Ontem";
  return d.toLocaleDateString("pt-BR", { timeZone: FUSO_BR, day: "2-digit", month: "2-digit" });
}

function Cabecalho({ resumo, carregando, className }: { resumo: string; carregando?: boolean; className?: string }) {
  return (
    <header data-tour="mensagens" className={cn("min-w-0 space-y-1.5", className)}>
      <p className="text-sm font-medium text-primary">Conversas privadas</p>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Mensagens</h1>
      {carregando ? (
        <Skeleton className="h-5 w-72 max-w-full" />
      ) : (
        <p className="max-w-2xl text-muted-foreground">{resumo}</p>
      )}
    </header>
  );
}

/** Lado da psicóloga: lista de pacientes + conversa selecionada. */
function MensagensTerapeuta() {
  const [, setLocation] = useLocation();
  const threads = trpc.chat.threads.useQuery(undefined, { refetchInterval: 8000 });
  const [selId, setSelId] = useState<number | null>(null);
  const [filtro, setFiltro] = useState("");
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const lista = threads.data ?? [];
  const agora = new Date();

  const naoLidas = lista.reduce((total, t) => total + t.unread, 0);
  const conversasComNaoLidas = lista.filter((t) => t.unread > 0).length;
  const sel = lista.find((t) => t.patientId === selId) ?? null;

  const visiveis = useMemo(() => {
    const termo = filtro.trim().toLocaleLowerCase("pt-BR");
    return lista.filter(
      (t) =>
        (!soNaoLidas || t.unread > 0) &&
        (!termo || `${t.firstName} ${t.lastName}`.toLocaleLowerCase("pt-BR").includes(termo)),
    );
  }, [lista, filtro, soNaoLidas]);

  // Sem não-lidas, o filtro "Não lidas" mostraria uma lista vazia sem motivo.
  useEffect(() => {
    if (soNaoLidas && naoLidas === 0) setSoNaoLidas(false);
  }, [soNaoLidas, naoLidas]);

  const resumo =
    lista.length === 0
      ? "Converse com seus pacientes entre as sessões."
      : naoLidas > 0
        ? `${plural(naoLidas, "mensagem não lida", "mensagens não lidas")} em ${plural(conversasComNaoLidas, "conversa", "conversas")}.`
        : `Tudo lido. ${plural(lista.length, "paciente disponível", "pacientes disponíveis")} para conversar.`;

  return (
    <div className="space-y-5">
      {/* No celular, com uma conversa aberta, o cabeçalho cede a altura para ela. */}
      <Cabecalho resumo={resumo} carregando={threads.isLoading} className={sel ? "hidden lg:block" : undefined} />

      <div
        className={cn(
          "grid min-h-[28rem] grid-cols-1 overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04)] lg:grid-cols-[320px_minmax(0,1fr)]",
          sel ? "h-[calc(100dvh-6rem)] lg:h-[calc(100dvh-13rem)]" : "h-[calc(100dvh-13rem)]",
        )}
      >
        {/* Lista de conversas */}
        <section aria-label="Conversas" className={cn("min-h-0 flex-col border-r", sel ? "hidden lg:flex" : "flex")}>
          <div className="space-y-3 border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Buscar paciente"
                aria-label="Buscar paciente"
                className="h-9 bg-muted/40 pl-9"
              />
            </div>
            <div className="flex gap-1.5" role="group" aria-label="Filtrar conversas">
              {[
                { rotulo: "Todas", ativo: !soNaoLidas, valor: false },
                { rotulo: naoLidas > 0 ? `Não lidas · ${naoLidas}` : "Não lidas", ativo: soNaoLidas, valor: true },
              ].map((f) => (
                <button
                  key={f.rotulo}
                  type="button"
                  aria-pressed={f.ativo}
                  disabled={f.valor && naoLidas === 0}
                  onClick={() => setSoNaoLidas(f.valor)}
                  className={cn(
                    // 32px de altura (36px em tela de toque): com 24px era fácil errar o dedo.
                    "h-8 rounded-full px-3 text-xs font-medium transition-colors pointer-coarse:h-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                    f.ativo ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {f.rotulo}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {threads.isLoading ? (
              <div className="space-y-1 p-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <Skeleton className="size-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : lista.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <UserPlus className="size-6" />
                </span>
                <p className="mt-4 font-medium text-foreground">Nenhum paciente ainda</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Cada paciente cadastrado ganha uma conversa aqui.
                </p>
                <Button className="mt-5" onClick={() => setLocation("/records?novo=1")}>
                  <UserPlus className="size-4" />
                  Novo paciente
                </Button>
              </div>
            ) : visiveis.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                Nenhuma conversa encontrada{filtro.trim() ? ` para “${filtro.trim()}”` : ""}.
              </p>
            ) : (
              <ul className="space-y-0.5 p-2">
                {visiveis.map((t) => {
                  const nome = `${t.firstName} ${t.lastName}`.trim();
                  const selecionada = selId === t.patientId;
                  const temNaoLida = t.unread > 0;
                  return (
                    <li key={t.patientId}>
                      <button
                        type="button"
                        onClick={() => setSelId(t.patientId)}
                        aria-current={selecionada ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selecionada ? "bg-primary/10" : "hover:bg-muted",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                            selecionada ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground",
                          )}
                        >
                          {iniciais(nome) || "?"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className={cn("truncate text-foreground", temNaoLida ? "font-semibold" : "font-medium")}>
                              {nome}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 text-[11px] tabular-nums",
                                temNaoLida ? "font-semibold text-primary" : "text-muted-foreground",
                              )}
                            >
                              {quandoNaLista(paraData(t.lastAt), agora)}
                            </span>
                          </span>
                          <span className="mt-0.5 flex items-center justify-between gap-2">
                            <span className={cn("truncate text-xs", temNaoLida ? "text-foreground" : "text-muted-foreground")}>
                              {t.preview ? (
                                <>
                                  {t.lastFromMe && <span className="text-muted-foreground">Você: </span>}
                                  {t.preview}
                                </>
                              ) : (
                                <span className="italic">Sem mensagens — toque para iniciar</span>
                              )}
                            </span>
                            {temNaoLida && (
                              <span
                                className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground"
                                aria-label={plural(t.unread, "mensagem não lida", "mensagens não lidas")}
                              >
                                {t.unread}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Conversa */}
        <section aria-label="Conversa selecionada" className={cn("min-h-0 flex-col", sel ? "flex" : "hidden lg:flex")}>
          {sel ? (
            <>
              <button
                type="button"
                onClick={() => setSelId(null)}
                className="flex items-center gap-1.5 border-b px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground lg:hidden"
              >
                <ArrowLeft className="size-4" /> Todas as conversas
              </button>
              <div className="min-h-0 flex-1">
                <ChatConversa
                  key={sel.patientId}
                  patientId={sel.patientId}
                  titulo={`${sel.firstName} ${sel.lastName}`.trim()}
                  subtitulo="Paciente · conversa privada"
                />
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center bg-muted/30 px-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MessageSquare className="size-6" />
              </span>
              <p className="mt-4 font-medium text-foreground">Escolha uma conversa</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {naoLidas > 0
                  ? "As conversas com mensagens novas aparecem no topo da lista, com o número de não lidas."
                  : "Selecione um paciente na lista para ver o histórico e enviar mensagens ou arquivos."}
              </p>
              <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
                <LockKeyhole className="size-3.5" />
                Só você e o paciente veem estas mensagens.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Lado do paciente: a conversa única com a psicóloga dele. */
function MensagensPaciente() {
  const [, setLocation] = useLocation();
  const { data: psi, isLoading } = trpc.me.therapist.useQuery();
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  // Bucket privado: a foto exige URL assinada (mesmo cuidado do perfil da psicóloga).
  useEffect(() => {
    let ativo = true;
    if (!psi?.photoKey) {
      setFotoUrl(null);
      return;
    }
    getAvatarSignedUrl(psi.photoKey).then((url) => {
      if (ativo) setFotoUrl(url);
    });
    return () => {
      ativo = false;
    };
  }, [psi?.photoKey]);

  const nome = psi?.nome?.trim() || "Minha psicóloga";

  return (
    <div className="space-y-5">
      <Cabecalho
        carregando={isLoading}
        resumo={psi?.nome ? `Fale com ${psi.nome} entre as sessões.` : "Fale com a sua psicóloga entre as sessões."}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="h-[calc(100dvh-14rem)] min-h-[28rem] overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04)] lg:h-[calc(100dvh-13rem)]">
          <ChatConversa titulo={nome} subtitulo={psi?.crp ? `Psicóloga · CRP ${psi.crp}` : "Sua psicóloga"} fotoUrl={fotoUrl} />
        </div>

        <aside className="hidden lg:block" aria-label="Sobre esta conversa">
          <section className="rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                {fotoUrl && <AvatarImage src={fotoUrl} alt="" className="object-cover" />}
                <AvatarFallback className="bg-accent font-semibold text-accent-foreground">
                  {iniciais(psi?.nome) || <UserRound className="size-5" />}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                {isLoading ? (
                  <Skeleton className="h-5 w-32" />
                ) : (
                  <p className="truncate font-semibold text-foreground">{nome}</p>
                )}
                {psi?.crp && <p className="text-xs text-muted-foreground">CRP {psi.crp}</p>}
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              <Button variant="outline" className="justify-start" onClick={() => setLocation("/psicologa")}>
                <UserRound className="size-4" />
                Ver perfil
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => setLocation("/consultas")}>
                <CalendarDays className="size-4" />
                Minhas consultas
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function Mensagens() {
  const { isTherapist, loading } = useRole();
  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-6xl pb-8 sm:pt-2">
        {/* Sem esperar o papel, a psicóloga via por um instante a tela do paciente. */}
        {loading ? (
          <div className="space-y-5">
            <Cabecalho resumo="" carregando />
            <Skeleton className="h-[calc(100dvh-13rem)] min-h-[28rem] w-full rounded-2xl" />
          </div>
        ) : isTherapist ? (
          <MensagensTerapeuta />
        ) : (
          <MensagensPaciente />
        )}
      </div>
    </DashboardLayout>
  );
}
