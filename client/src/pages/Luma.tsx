import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  FileText,
  HeartHandshake,
  LifeBuoy,
  ListChecks,
  LockKeyhole,
  MessageCircle,
  MessageSquare,
  Receipt,
  RotateCcw,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { AIChatBox, type LumaFeedback, type Message, type PendingAction } from "@/components/AIChatBox";
import { useRole } from "@/hooks/useRole";
import { isLumaTestAccount } from "@/lib/lumaAccess";
import { iniciais } from "@/lib/iniciais";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { LumaOwlIcon } from "@/components/Logo";

// Menu inicial da Luma clínica (terapeuta): as coisas que ela faz bem — agenda e
// leitura de registros autorizados.
const MENU_CLINICO = [
  { label: "Ver os próximos agendamentos", hint: "A agenda deste paciente", icon: <CalendarDays className="size-5" /> },
  { label: "Agendar uma consulta", hint: "Eu proponho, você confirma", icon: <CalendarPlus className="size-5" /> },
  { label: "Resumir os últimos registros autorizados", hint: "Sessões e documentos", icon: <FileText className="size-5" /> },
  { label: "Organizar os próximos pontos para a sessão", hint: "Preparar o atendimento", icon: <ListChecks className="size-5" /> },
];

// Menu inicial da Luma de apoio (paciente): navegação pelo site.
const MENU_PACIENTE = [
  { label: "Ver minhas consultas", hint: "Próximas e anteriores", icon: <CalendarDays className="size-5" /> },
  { label: "Como entro na videochamada?", hint: "Passo a passo", icon: <Video className="size-5" /> },
  { label: "Atualizar meus dados", hint: "Telefone, e-mail e senha", icon: <Settings className="size-5" /> },
  { label: "Encontrar minha psicóloga", hint: "Contato e informações", icon: <HeartHandshake className="size-5" /> },
];

// Cartão "O que a Luma faz" na lateral — o resumo do que cada modo sabe fazer.
const CAPACIDADES_CLINICAS: { icone: LucideIcon; titulo: string; texto: string }[] = [
  { icone: CalendarDays, titulo: "Agenda do paciente", texto: "Mostra, agenda, remarca e cancela — sempre como proposta." },
  { icone: FileText, titulo: "Registros autorizados", texto: "Resume sessões e documentos, citando de onde tirou." },
  { icone: Receipt, titulo: "Pagamentos", texto: "Registra o pagamento de uma consulta." },
];

const CAPACIDADES_PACIENTE: { icone: LucideIcon; titulo: string; texto: string }[] = [
  { icone: CalendarDays, titulo: "Suas consultas", texto: "Mostra onde ver as datas e os horários." },
  { icone: Video, titulo: "Videochamada", texto: "Explica, passo a passo, como entrar na sala." },
  { icone: Settings, titulo: "Seus dados", texto: "Ensina a atualizar telefone, e-mail e senha." },
];

const ATALHOS_PACIENTE: { icone: LucideIcon; rotulo: string; destino: string }[] = [
  { icone: CalendarDays, rotulo: "Minhas consultas", destino: "/consultas" },
  { icone: MessageSquare, rotulo: "Mensagens com a psicóloga", destino: "/mensagens" },
  { icone: UserRound, rotulo: "Perfil da psicóloga", destino: "/psicologa" },
];

export default function Luma() {
  const [, setLocation] = useLocation();
  const { user, isTherapist, isAdmin, loading: roleLoading } = useRole();
  const isTestSiteSupport = isAdmin && isLumaTestAccount(user?.email);
  const isClinicalUser = isTherapist && !isAdmin;
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [feedbackByMessageId, setFeedbackByMessageId] = useState<Record<number, LumaFeedback>>({});
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  // Sugestões de "e agora?" (em cartões) mostradas só depois de concluir uma ação.
  const [sugestoesPosAcao, setSugestoesPosAcao] = useState<{ label: string; hint?: string; icon?: ReactNode }[]>([]);
  // Sugestão clicada no Dashboard (/luma?pergunta=...). A URL é limpa para um F5
  // não repetir a pergunta.
  const [perguntaInicial] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    const pergunta = params.get("pergunta")?.trim().slice(0, 500) ?? "";
    if (pergunta) window.history.replaceState(null, "", window.location.pathname);
    return pergunta;
  });

  const patientsQuery = trpc.patients.list.useQuery(undefined, {
    enabled: isClinicalUser,
    retry: false,
  });
  const chatMutation = trpc.ai.chat.useMutation();
  const siteHelpMutation = trpc.ai.siteHelp.useMutation();
  const confirmActionMutation = trpc.ai.confirmAction.useMutation();
  const feedbackMutation = trpc.ai.feedback.useMutation({
    onSuccess: () => toast.success("Obrigada pelo retorno!"),
    onError: (e) => toast.error(e.message || "Não foi possível registrar a avaliação"),
  });
  const historyQuery = trpc.ai.history.useQuery(
    isClinicalUser && selectedPatientId ? { patientId: Number(selectedPatientId) } : undefined,
    {
      enabled: !roleLoading && (!isClinicalUser || !!selectedPatientId) && (!isAdmin || isTestSiteSupport),
      retry: false,
    },
  );

  const patients = patientsQuery.data ?? [];
  const selectedPatient = useMemo(
    () => patients.find(patient => String(patient.id) === selectedPatientId),
    [patients, selectedPatientId],
  );

  useEffect(() => {
    if (!selectedPatientId && patients.length === 1) {
      setSelectedPatientId(String(patients[0].id));
    }
  }, [patients, selectedPatientId]);

  useEffect(() => {
    if (!historyQuery.data) return;
    setConversationId(historyQuery.data.conversationId);
    const restoredMessages: Message[] = historyQuery.data.messages.flatMap(message => {
      if (message.role !== "user" && message.role !== "assistant") return [];
      return [{
        id: message.id,
        role: message.role as "user" | "assistant",
        content: message.content,
      }];
    });
    setMessages(restoredMessages);
  }, [historyQuery.data]);

  /**
   * A pergunta clicada no Dashboard é ENVIADA, não só escrita no campo.
   *
   * Antes ela só preenchia o input: quem clicava em "Quem eu atendo hoje?" caía na
   * tela de chat com o texto parado e precisava apertar enviar — parecia que o
   * botão não tinha feito nada.
   *
   * Os três `return` são obrigatórios, não cautela à toa:
   * - sem o papel carregado, `isClinicalUser` ainda é falso e a pergunta da
   *   psicóloga iria para a Luma de navegação, que não lê agenda nem financeiro;
   * - a lista de pacientes auto-seleciona quando há só um, e isso LIGA o histórico;
   * - o efeito do histórico faz `setMessages(restoredMessages)` e apagaria a
   *   pergunta recém-enviada se ela chegasse antes.
   */
  const perguntaInicialEnviada = useRef(false);
  // O histórico só é buscado nestas condições (mesma regra do `enabled` acima).
  const historicoHabilitado = (!isClinicalUser || !!selectedPatientId) && (!isAdmin || isTestSiteSupport);
  // Há um paciente único prestes a ser auto-selecionado: isso vai LIGAR o
  // histórico, então ainda não dá para enviar.
  const vaiAutoSelecionarPaciente = isClinicalUser && !selectedPatientId && patients.length === 1;
  useEffect(() => {
    if (perguntaInicialEnviada.current || !perguntaInicial) return;
    if (roleLoading) return;
    if (isClinicalUser && patientsQuery.isLoading) return;
    if (vaiAutoSelecionarPaciente) return;
    if (historicoHabilitado && !historyQuery.isFetched) return;
    perguntaInicialEnviada.current = true;
    void handleSend(perguntaInicial);
    // handleSend é estável (declaração de função) e só deve disparar uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    perguntaInicial,
    roleLoading,
    isClinicalUser,
    patientsQuery.isLoading,
    vaiAutoSelecionarPaciente,
    historicoHabilitado,
    historyQuery.isFetched,
  ]);

  function changePatient(value: string) {
    setSelectedPatientId(value);
    setMessages([]);
    setConversationId(undefined);
    setFeedbackByMessageId({});
    setPendingAction(null);
    setSugestoesPosAcao([]);
  }

  // Volta ao "menu" (estado inicial com as sugestões) e começa uma conversa nova.
  // Não apaga nada: as conversas anteriores ficam salvas e viram memória da Luma.
  function resetConversation() {
    setMessages([]);
    setConversationId(undefined);
    setFeedbackByMessageId({});
    setPendingAction(null);
    setSugestoesPosAcao([]);
  }

  async function handleSend(content: string) {
    // As sugestões de "e agora?" valem para o momento logo após a ação; assim que
    // a conversa segue, elas saem de cena.
    setSugestoesPosAcao([]);
    if (isAdmin && !isTestSiteSupport) {
      toast.error("A Luma não está disponível para acesso clínico administrativo.");
      return;
    }
    // Sem paciente selecionado a conversa segue: perguntas de navegação/uso do
    // sistema não dependem de um paciente. Se a pergunta for sobre REGISTROS, a
    // própria Luma pede para selecionar o paciente (ver clinicalSystemPrompt).

    const requestId = crypto.randomUUID();
    // Uma mensagem nova invalida a proposta anterior: o resumo que a terapeuta
    // leu pode não corresponder mais ao que ela acabou de pedir.
    setPendingAction(null);
    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    try {
      if (!isClinicalUser) {
        const result = await siteHelpMutation.mutateAsync({
          question: content,
          requestId,
          conversationId,
        });
        setConversationId(result.conversationId);
        setMessages(current => [...current, {
          role: "assistant",
          content: result.content,
        }]);
        // O paciente não executa "ações" (a Luma dele é navegação), então o menu
        // "E agora?" nunca aparecia. Depois de cada resposta, ofereço os próximos
        // passos do dia a dia dele — para não deixar a conversa parada.
        setSugestoesPosAcao(proximosPassosPaciente());
        return;
      }

      // O servidor aceita no máximo 20 mensagens (e ainda trima o histórico). Numa
      // conversa longa, mandar tudo estourava o limite e derrubava a Luma inteira
      // ("Too big: expected array to have <=20 items"). Enviamos as ~20 mais
      // recentes como uma fatia CONTÍGUA: o histórico alterna user/assistant, então
      // fatiar contíguo preserva a alternância (juntar "1ª + últimas 19" podia
      // colar duas mensagens do mesmo papel e quebrar provedores estritos). Só
      // garantimos que começa numa mensagem do usuário.
      const semSistema = nextMessages.filter(
        (message): message is Message & { role: "user" | "assistant" } => message.role !== "system",
      );
      const recentes = semSistema.slice(-20);
      const messagesParaEnviar =
        recentes[0]?.role === "assistant" ? recentes.slice(1) : recentes;

      const result = await chatMutation.mutateAsync({
        messages: messagesParaEnviar,
        patientId: selectedPatientId ? Number(selectedPatientId) : undefined,
        conversationId,
        requestId,
      });
      setConversationId(result.conversationId);
      setMessages(current => [...current, {
        id: result.messageId,
        role: "assistant",
        content: result.content,
        sources: result.sources,
      }]);
      setPendingAction(result.pendingAction ?? null);
      // Sem proposta pendente para confirmar, oferece o "e agora?" da terapeuta —
      // para a conversa não parar depois de cada resposta (como já acontece com o
      // paciente). Com proposta pendente, o foco é confirmar/descartar, então não
      // polui com sugestões.
      if (!result.pendingAction) setSugestoesPosAcao(proximosPassosTerapeuta());
    } catch (err) {
      // Rate limit do provedor de IA (429/TPM do plano) é temporário e não é
      // "falha do sistema": a mensagem genérica assustava ("informe a equipe")
      // quando bastava esperar alguns segundos.
      const msg = err instanceof Error ? err.message : String(err);
      const semCota = /\b429\b|rate limit|too many requests|tokens per minute|\btpm\b/i.test(msg);
      setMessages(current => [...current, {
        role: "assistant",
        content: semCota
          ? "Estou recebendo muitos pedidos ao mesmo tempo e preciso de alguns segundos. Tente de novo em instantes — nada do que você fez foi perdido."
          : isClinicalUser
          ? "A Luma clínica não conseguiu concluir esta conversa agora. O sistema registrou a falha com segurança. Tente novamente em instantes; se persistir, informe a equipe responsável pelo sistema."
          : "O apoio de navegação está temporariamente indisponível. Tente novamente em instantes.",
      }]);
    }
  }

  /** Próximos passos do PACIENTE — o "e agora?" dele, no contexto de navegação. */
  function proximosPassosPaciente(): { label: string; icon: ReactNode }[] {
    return [
      { label: "Ver minhas consultas", icon: <CalendarDays className="size-5" /> },
      { label: "Como entro na videochamada?", icon: <Video className="size-5" /> },
      { label: "Atualizar meus dados", icon: <Settings className="size-5" /> },
    ];
  }

  /** "E agora?" geral da terapeuta — depois de uma resposta normal (sem proposta). */
  function proximosPassosTerapeuta(): { label: string; icon: ReactNode }[] {
    return [
      { label: "Ver os próximos agendamentos", icon: <CalendarDays className="size-5" /> },
      { label: "Agendar uma consulta", icon: <CalendarPlus className="size-5" /> },
      { label: "Registrar um pagamento", icon: <Receipt className="size-5" /> },
    ];
  }

  /** O que costuma vir depois de cada ação — o "e agora?" da terapeuta. */
  function proximosPassos(acao: string): { label: string; icon: ReactNode }[] {
    const verAgenda = { label: "Ver os próximos agendamentos", icon: <CalendarDays className="size-5" /> };
    switch (acao) {
      case "agendar_consulta":
        return [verAgenda, { label: "Agendar outra consulta", icon: <CalendarPlus className="size-5" /> }, { label: "Registrar pagamento", icon: <Receipt className="size-5" /> }];
      case "remarcar_consulta":
        return [verAgenda, { label: "Remarcar outra consulta", icon: <CalendarClock className="size-5" /> }];
      case "cancelar_consulta":
        return [verAgenda, { label: "Agendar uma nova consulta", icon: <CalendarPlus className="size-5" /> }];
      case "registrar_pagamento":
        return [verAgenda, { label: "Registrar outro pagamento", icon: <Receipt className="size-5" /> }];
      default:
        return [verAgenda];
    }
  }

  // O clique confirma no servidor: a ação executada é a que foi registrada na
  // proposta, e o modelo não participa da decisão.
  async function handleConfirmAction() {
    if (!pendingAction) return;
    try {
      const acao = pendingAction.toolName;
      const result = await confirmActionMutation.mutateAsync({ code: pendingAction.code, conversationId });
      setPendingAction(null);
      setMessages(current => [...current, { id: result.messageId, role: "assistant", content: result.content }]);
      // Depois de concluir, oferece o próximo passo em vez de deixar a conversa
      // parada num "pronto, agendei".
      setSugestoesPosAcao(proximosPassos(acao));
      toast.success("Alteração confirmada.");
    } catch (error) {
      setPendingAction(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível confirmar a ação.");
    }
  }

  function handleDismissAction() {
    setPendingAction(null);
    toast.info("Proposta descartada. Nada foi alterado na agenda.");
  }

  function handleFeedback(message: Message, rating: LumaFeedback) {
    if (!message.id) return;
    setFeedbackByMessageId(current => ({ ...current, [message.id as number]: rating }));
    feedbackMutation.mutate({ messageId: message.id, rating });
  }

  if (roleLoading) {
    return (
      <DashboardLayout>
        <div className="mx-auto w-full max-w-6xl space-y-6 pb-8 sm:pt-2" aria-label="Carregando a Luma">
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-5 w-full max-w-xl" />
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Skeleton className="h-[max(420px,min(620px,calc(100dvh-280px)))] rounded-2xl" />
            <Skeleton className="hidden h-64 rounded-2xl lg:block" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (isAdmin && !isTestSiteSupport) {
    return (
      <DashboardLayout>
        <Card className="mx-auto max-w-2xl border-amber-300 bg-amber-50">
          <CardHeader><CardTitle>Acesso clínico restrito</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">A Luma clínica não consulta prontuários em contas administrativas. Use uma conta de terapeuta ou paciente autorizada.</p>
            <Button onClick={() => setLocation("/dashboard")}>Voltar ao dashboard</Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const nomeDoPaciente = selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}`.trim() : "";
  const capacidades = isClinicalUser ? CAPACIDADES_CLINICAS : CAPACIDADES_PACIENTE;

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-6xl space-y-6 pb-8 sm:pt-2">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 space-y-1.5">
            <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
              <LumaOwlIcon className="size-5" />
              {isClinicalUser ? "Assistente clínico de leitura" : "Assistente de navegação do site"}
            </p>
            <h1 id="luma-title" className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {isClinicalUser ? "Luma Clínica" : "Luma Apoio"}
            </h1>
            <p className="max-w-2xl text-muted-foreground">
              {isClinicalUser
                ? "Organiza informações autorizadas e cuida da agenda com a sua confirmação. Não diagnostica, não prescreve e não altera prontuários."
                : "Tire dúvidas sobre como usar o VozInterior. Este modo não acessa prontuários e não oferece orientação clínica."}
            </p>
          </div>
          {messages.length > 0 && (
            <Button variant="outline" className="bg-card md:shrink-0" onClick={resetConversation}>
              <RotateCcw className="size-4" />
              Nova conversa
            </Button>
          )}
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <section className="min-w-0 space-y-4" aria-labelledby="luma-title" data-tour="luma-composer">
          {isClinicalUser && (
            <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] sm:flex-row sm:items-center">
              <span
                aria-hidden
                className={cn(
                  "hidden size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold sm:flex",
                  selectedPatient ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                )}
              >
                {selectedPatient ? iniciais(nomeDoPaciente) : <Users className="size-[18px]" />}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <Label htmlFor="luma-patient" className="text-sm font-semibold">Paciente no escopo da conversa</Label>
                <p className="text-xs text-muted-foreground">
                  {selectedPatient
                    ? `As buscas ficam restritas a ${nomeDoPaciente} e à sua autorização profissional.`
                    : "Escolha um paciente para a Luma ler os registros e a agenda dele."}
                </p>
              </div>
              <Select value={selectedPatientId} onValueChange={changePatient}>
                <SelectTrigger id="luma-patient" className="w-full bg-background sm:w-60" aria-label="Selecionar paciente para a conversa com a Luma">
                  <SelectValue placeholder={patientsQuery.isLoading ? "Carregando pacientes..." : "Selecione um paciente"} />
                </SelectTrigger>
                <SelectContent>
                  {patients.map(patient => <SelectItem key={patient.id} value={String(patient.id)}>{patient.firstName} {patient.lastName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <AIChatBox
            className="rounded-2xl shadow-[0_1px_2px_rgb(0_0_0/0.04)]"
            messages={messages}
            onSendMessage={handleSend}
            isLoading={isClinicalUser ? chatMutation.isPending : siteHelpMutation.isPending}
            lumaStatus={(isClinicalUser ? chatMutation.isPending : siteHelpMutation.isPending) ? "attentive" : "sleeping"}
            agentName={isClinicalUser ? "Luma Clínica" : "Luma Apoio"}
            agentSubtitle={isClinicalUser ? "Coruja de apoio à leitura clínica autorizada" : "Ajuda para navegar no VozInterior"}
            processingLabel={isClinicalUser ? "Luma está consultando somente registros autorizados..." : "Luma está localizando essa área no site..."}
            placeholder={isClinicalUser
              ? (selectedPatientId ? "Pergunte sobre os registros deste paciente" : "Selecione um paciente acima")
              : "Pergunte sobre o uso do site"}
            emptyStateMessage={isClinicalUser ? "Olá! Eu sou a Luma, sua coruja de apoio clínico. Consulto os registros autorizados (sessões e documentos) e cuido da agenda do paciente: agendar, remarcar, cancelar e registrar pagamento. Toda alteração na agenda aparece como uma proposta, e só acontece quando você clicar em Confirmar. Selecione um paciente e uma sugestão abaixo para começar." : "Olá! Eu sou a Luma, sua coruja de apoio no VozInterior. Escolha uma sugestão para aprender a usar o sistema."}
            followUpMenu={sugestoesPosAcao}
            onRestart={resetConversation}
            suggestedMenu={isClinicalUser ? MENU_CLINICO : MENU_PACIENTE}
            onMessageFeedback={handleFeedback}
            feedbackByMessageId={feedbackByMessageId}
            pendingAction={isClinicalUser ? pendingAction : null}
            onConfirmAction={handleConfirmAction}
            onDismissAction={handleDismissAction}
            isConfirmingAction={confirmActionMutation.isPending}
            // Cabe na tela sem rolar a página: na clínica o seletor de paciente
            // ocupa ~90px a mais acima do chat. O piso de 420px evita um chat
            // espremido em tela baixa (aí a página rola, o que é melhor).
            height={isClinicalUser
              ? "max(420px, min(620px, calc(100dvh - 370px)))"
              : "max(420px, min(620px, calc(100dvh - 280px)))"}
          />
        </section>

        <aside className="space-y-4" aria-label="Sobre a Luma">
          {/* O que ela sabe fazer — mesmo cartão da Luma no Dashboard. */}
          <section
            aria-labelledby="luma-capacidades"
            className="relative overflow-hidden rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm"
          >
            <span aria-hidden className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-white/[0.07]" />
            <span aria-hidden className="pointer-events-none absolute -bottom-16 -right-4 size-32 rounded-full bg-white/[0.05]" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                <LumaOwlIcon className="size-8" />
              </span>
              <div>
                <h2 id="luma-capacidades" className="font-semibold leading-tight">O que a Luma faz</h2>
                <p className="text-xs text-primary-foreground/75">
                  {isClinicalUser ? "Você decide, ela organiza" : "Seu guia pelo VozInterior"}
                </p>
              </div>
            </div>
            <ul className="relative mt-4 space-y-3">
              {capacidades.map(({ icone: Icone, titulo, texto }) => (
                <li key={titulo} className="flex gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                    <Icone className="size-4" />
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="block font-medium">{titulo}</span>
                    <span className="block text-xs leading-relaxed text-primary-foreground/80">{texto}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="luma-escopo"
            className="rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)]"
          >
            <h2 id="luma-escopo" className="flex items-center gap-2 font-semibold text-foreground">
              <ShieldCheck className="size-4 text-primary" />
              Escopo protegido
            </h2>
            <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
              {(isClinicalUser
                ? [
                    { icone: LockKeyhole, texto: "Só acessa dados autorizados pelo seu perfil, de um paciente por vez." },
                    { icone: CheckCircle2, texto: "Nada muda na agenda sem o seu clique em Confirmar." },
                    { icone: MessageCircle, texto: "As respostas podem ser avaliadas por profissionais para melhorar o sistema." },
                  ]
                : [
                    { icone: LockKeyhole, texto: "Não acessa prontuários, sessões ou documentos clínicos." },
                    { icone: HeartHandshake, texto: "Não oferece orientação clínica — para isso, fale com a sua psicóloga." },
                  ]
              ).map(({ icone: Icone, texto }) => (
                <li key={texto} className="flex gap-2.5">
                  <Icone className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{texto}</span>
                </li>
              ))}
            </ul>
          </section>

          {!isClinicalUser && (
            <>
              <section
                aria-labelledby="luma-atalhos"
                className="rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)]"
              >
                <h2 id="luma-atalhos" className="font-semibold text-foreground">Ir direto</h2>
                <ul className="mt-2 space-y-0.5">
                  {ATALHOS_PACIENTE.map(({ icone: Icone, rotulo, destino }) => (
                    <li key={destino}>
                      <button
                        type="button"
                        onClick={() => setLocation(destino)}
                        className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icone className="size-4" />
                        </span>
                        <span className="flex-1 text-foreground">{rotulo}</span>
                        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              {/* A Luma de apoio não é canal de crise; quem precisar, precisa saber AGORA. */}
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <LifeBuoy className="size-4 shrink-0" />
                  Precisa de ajuda agora?
                </p>
                <p className="mt-1.5 text-sm leading-relaxed">
                  Em uma crise, ligue <strong>188</strong> (CVV, 24 horas e gratuito) ou <strong>192</strong> (SAMU).
                </p>
              </section>
            </>
          )}
        </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

