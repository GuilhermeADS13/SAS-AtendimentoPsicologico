import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  ArrowUpRight,
  CalendarCheck2,
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronRight,
  CircleDashed,
  MessageSquare,
  Sparkles,
  UserPlus,
  Users,
  Video,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LumaOwlIcon } from "@/components/Logo";
import { isLumaTestAccount } from "@/lib/lumaAccess";
import { useRole } from "@/hooks/useRole";
import { useAgora } from "@/hooks/useAgora";
import { urlDaSala } from "@/lib/sala";
import { cn } from "@/lib/utils";
import { FUSO_BR, formatarHora } from "@shared/datas";
import { formatarBRL } from "@shared/dinheiro";
import { sugestoesDaVez } from "@shared/sugestoesLuma";

// ── Datas no fuso de Brasília ──────────────────────────────────────────────
// Tudo aqui compara pelo fuso da clínica, não pelo do navegador: com o isToday
// antigo (fuso local), quem abrisse o painel fora do Brasil via "hoje" errado.

/** "2026-10-05" no fuso de Brasília — chave para comparar dias. */
const chaveDoDia = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: FUSO_BR });
const chaveDoMes = (d: Date) => chaveDoDia(d).slice(0, 7);
const horaEmBrasilia = (d: Date) =>
  Number(new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO_BR, hour: "numeric", hourCycle: "h23" }).format(d));
const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

function saudacao(agora: Date): string {
  const hora = horaEmBrasilia(agora);
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

/** "Hoje", "Amanhã" ou "Qui, 08/10". */
function rotuloDoDia(d: Date, agora: Date): string {
  const chave = chaveDoDia(d);
  if (chave === chaveDoDia(agora)) return "Hoje";
  if (chave === chaveDoDia(new Date(agora.getTime() + 86_400_000))) return "Amanhã";
  const semana = d.toLocaleDateString("pt-BR", { timeZone: FUSO_BR, weekday: "short" }).replace(".", "");
  const dia = d.toLocaleDateString("pt-BR", { timeZone: FUSO_BR, day: "2-digit", month: "2-digit" });
  return `${capitalizar(semana)}, ${dia}`;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Conta as entradas no Dashboard para girar as sugestões da Luma. Fica no
 * localStorage porque é conveniencia por navegador, nao estado que alguem precise
 * ler de volta — e se o armazenamento estiver bloqueado (aba anonima), cai no 0 e
 * o cartao so mostra sempre o primeiro trio, sem quebrar nada.
 */
function proximaVisitaAoPainel(): number {
  const CHAVE = "luma-sugestoes-visita";
  try {
    const atual = Number(localStorage.getItem(CHAVE)) || 0;
    localStorage.setItem(CHAVE, String(atual + 1));
    return atual;
  } catch {
    return 0;
  }
}

// O atalho "Entrar" aparece a partir de 15 min antes do horário (até o fim da
// consulta). A sala em si não tem trava de horário — pela Agenda dá para entrar
// quando quiser; aqui é só para o botão certo estar à mão na hora certa.
const ANTECEDENCIA_SALA_MS = 15 * 60_000;

export default function Dashboard() {
  const { user, loading } = useAuth();
  const { isTherapist } = useRole();
  const [, setLocation] = useLocation();
  const agora = useAgora();
  // Uma vez por montagem: a cada entrada no painel, outro trio de perguntas.
  const [sugestoesLuma] = useState(() => sugestoesDaVez(proximaVisitaAoPainel()));

  const pacientesQuery = trpc.patients.list.useQuery();
  const consultasQuery = trpc.appointments.list.useQuery();
  const { data: naoLidas = 0 } = trpc.chat.unreadCount.useQuery(undefined, { refetchInterval: 30_000 });
  const pacientes = pacientesQuery.data ?? [];
  const consultas = consultasQuery.data ?? [];

  const showLumaShortcut = isTherapist || isLumaTestAccount(user?.email);
  const primeiroNome = user?.name?.trim().split(/\s+/)[0] || "";

  const painel = useMemo(() => {
    const nomePorId = new Map(pacientes.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()]));
    const hojeChave = chaveDoDia(agora);
    const mesChave = chaveDoMes(agora);
    const t = agora.getTime();

    const comHorario = consultas.map((c) => {
      const inicio = new Date(c.scheduledAt);
      const fim = new Date(inicio.getTime() + (c.duration ?? 60) * 60_000);
      return { ...c, inicio, fim, paciente: nomePorId.get(c.patientId) ?? "Paciente" };
    });

    const deHoje = comHorario.filter(
      (c) => chaveDoDia(c.inicio) === hojeChave && (c.status === "scheduled" || c.status === "completed"),
    );
    const aConfirmarHoje = deHoje.filter(
      (c) => c.status === "scheduled" && !c.confirmedAt && c.fim.getTime() > t,
    ).length;

    const proximas = comHorario
      .filter((c) => c.status === "scheduled" && c.fim.getTime() > t)
      .sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
      .slice(0, 6);

    const atendidasNoMes = comHorario.filter(
      (c) => c.status === "completed" && chaveDoMes(c.inicio) === mesChave,
    ).length;

    const naoPagas = comHorario.filter((c) => c.status === "completed" && !c.paid && c.price != null);
    const aReceberCentavos = naoPagas.reduce((soma, c) => soma + (c.price ?? 0), 0);

    const ativos = pacientes.filter((p) => p.status === "active").length;
    const aguardando = pacientes.filter((p) => p.status === "pending").length;

    return { deHoje, aConfirmarHoje, proximas, atendidasNoMes, naoPagas, aReceberCentavos, ativos, aguardando };
  }, [pacientes, consultas, agora]);

  const resumoDoDia = (() => {
    const restantes = painel.deHoje.filter((c) => c.status === "scheduled" && c.fim.getTime() > agora.getTime());
    const proxima = painel.proximas[0];
    if (restantes.length > 0 && proxima) {
      return `Você tem ${plural(restantes.length, "consulta", "consultas")} pela frente hoje. A próxima é às ${formatarHora(proxima.inicio)}, com ${proxima.paciente}.`;
    }
    if (painel.deHoje.length > 0) return "As consultas de hoje já terminaram. Bom descanso!";
    if (proxima) {
      return `Nenhuma consulta hoje. A próxima é ${rotuloDoDia(proxima.inicio, agora).toLowerCase()} às ${formatarHora(proxima.inicio)}, com ${proxima.paciente}.`;
    }
    return "Sua agenda está livre. Que tal marcar a próxima consulta?";
  })();

  const carregando = loading || pacientesQuery.isLoading || consultasQuery.isLoading;

  const dataPorExtenso = capitalizar(
    agora.toLocaleDateString("pt-BR", { timeZone: FUSO_BR, weekday: "long", day: "numeric", month: "long" }),
  );
  const nomeDoMes = agora.toLocaleDateString("pt-BR", { timeZone: FUSO_BR, month: "long" });

  const pendencias: Array<{ texto: string; destino: string; icone: ComponentType<{ className?: string }> }> = [];
  if (painel.aConfirmarHoje > 0) {
    pendencias.push({
      texto: `${plural(painel.aConfirmarHoje, "consulta de hoje", "consultas de hoje")} sem confirmação do paciente`,
      destino: "/appointments",
      icone: CalendarClock,
    });
  }
  if (naoLidas > 0) {
    pendencias.push({ texto: plural(naoLidas, "mensagem não lida", "mensagens não lidas"), destino: "/mensagens", icone: MessageSquare });
  }
  if (painel.aguardando > 0) {
    pendencias.push({
      texto: `${plural(painel.aguardando, "paciente ainda não criou", "pacientes ainda não criaram")} a conta`,
      destino: "/records",
      icone: UserPlus,
    });
  }

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-6xl space-y-6 pb-8 sm:pt-2">
        {/* Cabeçalho: saudação pelo horário + o que importa hoje */}
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 space-y-1.5">
            <p className="text-sm font-medium text-primary">{dataPorExtenso}</p>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {saudacao(agora)}{primeiroNome ? `, ${primeiroNome}` : ""}
            </h1>
            {carregando ? (
              <Skeleton className="h-5 w-72 max-w-full" />
            ) : (
              <p className="max-w-2xl text-muted-foreground">{resumoDoDia}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            <Button variant="outline" className="bg-card" onClick={() => setLocation("/records?novo=1")}>
              <UserPlus className="size-4" />
              Novo paciente
            </Button>
            <Button onClick={() => setLocation("/appointments?novo=1")}>
              <CalendarPlus className="size-4" />
              Nova consulta
            </Button>
          </div>
        </header>

        {/* Indicadores */}
        <section aria-label="Resumo" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <Indicador
            icone={CalendarClock}
            rotulo="Consultas hoje"
            valor={painel.deHoje.length}
            carregando={carregando}
            detalhe={
              painel.deHoje.length === 0
                ? "Agenda livre hoje"
                : painel.aConfirmarHoje > 0
                  ? `${painel.aConfirmarHoje} a confirmar`
                  : "Todas confirmadas"
            }
            atencao={painel.aConfirmarHoje > 0}
            onClick={() => setLocation("/appointments")}
          />
          <Indicador
            icone={Users}
            rotulo="Pacientes"
            valor={painel.ativos + painel.aguardando}
            carregando={carregando}
            detalhe={
              painel.aguardando > 0
                ? `${painel.aguardando} aguardando cadastro`
                : "Todos com conta criada"
            }
            onClick={() => setLocation("/records")}
          />
          <Indicador
            icone={CalendarCheck2}
            rotulo="Atendimentos no mês"
            valor={painel.atendidasNoMes}
            carregando={carregando}
            detalhe={`Realizados em ${nomeDoMes}`}
            onClick={() => setLocation("/appointments")}
          />
          <Indicador
            icone={Wallet}
            rotulo="A receber"
            valor={formatarBRL(painel.aReceberCentavos)}
            carregando={carregando}
            detalhe={
              painel.naoPagas.length > 0
                ? `De ${plural(painel.naoPagas.length, "consulta realizada", "consultas realizadas")}`
                : "Nada pendente"
            }
            onClick={() => setLocation("/financeiro")}
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          {/* Próximas consultas */}
          <section
            aria-labelledby="proximas-titulo"
            className="rounded-2xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04)]"
          >
            <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
              <div>
                <h2 id="proximas-titulo" className="font-semibold text-foreground">
                  Próximas consultas
                </h2>
                <p className="text-sm text-muted-foreground">Hoje e nos próximos dias</p>
              </div>
              <Button variant="ghost" size="sm" className="shrink-0 text-primary" onClick={() => setLocation("/appointments")}>
                Ver agenda
                <ChevronRight className="size-4" />
              </Button>
            </div>

            {carregando ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : painel.proximas.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <CalendarPlus className="size-6" />
                </span>
                <p className="mt-4 font-medium text-foreground">Nenhuma consulta marcada</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Quando você agendar, as próximas consultas aparecem aqui, com o botão para entrar na sala.
                </p>
                <Button className="mt-5" onClick={() => setLocation("/appointments?novo=1")}>
                  <CalendarPlus className="size-4" />
                  Agendar consulta
                </Button>
              </div>
            ) : (
              <ol className="divide-y">
                {agruparPorDia(painel.proximas, agora).map(({ rotulo, itens }) => (
                  <li key={rotulo}>
                    <p className="bg-muted/50 px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {rotulo}
                    </p>
                    <ul className="divide-y divide-border/60">
                      {itens.map((c) => {
                        const t = agora.getTime();
                        const emAndamento = c.inicio.getTime() <= t && t < c.fim.getTime();
                        const salaAberta = c.inicio.getTime() - ANTECEDENCIA_SALA_MS <= t && t < c.fim.getTime();
                        return (
                          <li key={c.id} className="flex items-center gap-3 px-5 py-3 sm:gap-4">
                            <div className="w-12 shrink-0 text-base font-semibold tabular-nums text-foreground sm:w-14 sm:text-lg">
                              {formatarHora(c.inicio)}
                            </div>
                            <span
                              aria-hidden
                              className="hidden size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground sm:flex"
                            >
                              {iniciais(c.paciente)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-foreground">{c.paciente}</p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                <span>{c.duration ?? 60} min</span>
                                <span aria-hidden>·</span>
                                {emAndamento ? (
                                  <Selo tom="ativo">
                                    <span className="size-1.5 animate-pulse rounded-full bg-current" />
                                    Em andamento
                                  </Selo>
                                ) : c.confirmedAt ? (
                                  <Selo tom="ok">
                                    <Check className="size-3" />
                                    Confirmada
                                  </Selo>
                                ) : (
                                  <Selo tom="atencao">
                                    <CircleDashed className="size-3" />
                                    A confirmar
                                  </Selo>
                                )}
                              </div>
                            </div>
                            {salaAberta ? (
                              <Button size="sm" onClick={() => setLocation(urlDaSala(c.id, c.patientId, c.roomToken))}>
                                <Video className="size-4" />
                                Entrar
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-muted-foreground"
                                onClick={() => setLocation(`/appointments?ap=${c.id}`)}
                                aria-label={`Ver a consulta de ${c.paciente}`}
                              >
                                Ver
                                <ChevronRight className="size-4" />
                              </Button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* No celular, as pendências sobem para antes da Luma (são o que pede ação). */}
          <div className="flex flex-col gap-6">
            {/* Luma */}
            {showLumaShortcut && (
              <section
                aria-labelledby="luma-titulo"
                className="relative overflow-hidden rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm"
              >
                <span aria-hidden className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-white/[0.07]" />
                <span aria-hidden className="pointer-events-none absolute -bottom-16 -right-4 size-32 rounded-full bg-white/[0.05]" />
                <div className="relative flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                    <LumaOwlIcon className="size-8" />
                  </span>
                  <div>
                    <h2 id="luma-titulo" className="font-semibold leading-tight">
                      Pergunte à Luma
                    </h2>
                    <p className="text-xs text-primary-foreground/75">Agenda, pacientes e registros</p>
                  </div>
                </div>
                <p className="relative mt-4 text-sm leading-relaxed text-primary-foreground/90">
                  Ela consulta só o que você autoriza e, para mexer na agenda, propõe e espera o seu clique.
                </p>
                <div className="relative mt-4 space-y-2">
                  {sugestoesLuma.map((pergunta) => (
                    <button
                      key={pergunta}
                      type="button"
                      onClick={() => setLocation(`/luma?pergunta=${encodeURIComponent(pergunta)}`)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-left text-sm ring-1 ring-white/15 transition-colors hover:bg-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                    >
                      <span className="flex items-center gap-2">
                        <Sparkles className="size-3.5 shrink-0 opacity-70" />
                        {pergunta}
                      </span>
                      <ArrowUpRight className="size-4 shrink-0 opacity-70" />
                    </button>
                  ))}
                </div>
                <Button
                  variant="secondary"
                  className="relative mt-4 w-full bg-white text-primary hover:bg-white/90"
                  onClick={() => setLocation("/luma")}
                >
                  Abrir a Luma
                </Button>
              </section>
            )}

            {/* Pendências */}
            <section
              aria-labelledby="pendencias-titulo"
              className="order-first rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] lg:order-none"
            >
              <h2 id="pendencias-titulo" className="font-semibold text-foreground">
                Precisa da sua atenção
              </h2>
              {carregando ? (
                <Skeleton className="mt-4 h-10 w-full rounded-xl" />
              ) : pendencias.length === 0 ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="size-3.5" />
                  </span>
                  Tudo em dia por aqui.
                </p>
              ) : (
                <ul className="mt-3 space-y-1">
                  {pendencias.map(({ texto, destino, icone: Icone }) => (
                    <li key={texto}>
                      <button
                        type="button"
                        onClick={() => setLocation(destino)}
                        className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                          <Icone className="size-4" />
                        </span>
                        <span className="flex-1 text-foreground">{texto}</span>
                        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Indicador({
  icone: Icone,
  rotulo,
  valor,
  detalhe,
  atencao = false,
  carregando,
  onClick,
}: {
  icone: ComponentType<{ className?: string }>;
  rotulo: string;
  valor: ReactNode;
  detalhe: string;
  atencao?: boolean;
  carregando: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-2xl border bg-card p-4 text-left shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{rotulo}</span>
        <span className="hidden size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground sm:flex">
          <Icone className="size-[18px]" />
        </span>
      </div>
      {carregando ? (
        <Skeleton className="mt-3 h-8 w-20" />
      ) : (
        <div className="mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums text-foreground sm:text-3xl">
          {valor}
        </div>
      )}
      <p
        className={cn(
          "mt-1 flex items-center gap-1.5 text-xs",
          atencao ? "font-medium text-amber-800" : "text-muted-foreground",
        )}
      >
        {atencao && <span className="size-1.5 rounded-full bg-amber-500" />}
        {detalhe}
      </p>
    </button>
  );
}

function Selo({ tom, children }: { tom: "ok" | "atencao" | "ativo"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
        tom === "ok" && "bg-primary/10 text-primary",
        tom === "ativo" && "bg-primary text-primary-foreground",
        tom === "atencao" && "bg-amber-100 text-amber-800",
      )}
    >
      {children}
    </span>
  );
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] ?? "" : "";
  return (primeira + ultima).toUpperCase();
}

function agruparPorDia<T extends { inicio: Date }>(itens: T[], agora: Date): Array<{ rotulo: string; itens: T[] }> {
  const grupos: Array<{ rotulo: string; itens: T[] }> = [];
  for (const item of itens) {
    const rotulo = rotuloDoDia(item.inicio, agora);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.rotulo === rotulo) ultimo.itens.push(item);
    else grupos.push({ rotulo, itens: [item] });
  }
  return grupos;
}
