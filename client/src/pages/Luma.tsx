import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  FileText,
  HeartHandshake,
  ListChecks,
  LockKeyhole,
  MessageCircle,
  Receipt,
  Settings,
  ShieldCheck,
  Video,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { AIChatBox, type LumaFeedback, type Message, type PendingAction } from "@/components/AIChatBox";
import { useRole } from "@/hooks/useRole";
import { isLumaTestAccount } from "@/lib/lumaAccess";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
    if (isClinicalUser && !selectedPatientId) {
      toast.error("Selecione um paciente antes de consultar registros clínicos.");
      return;
    }

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
    return <DashboardLayout><div className="flex min-h-[60vh] items-center justify-center">Carregando a Luma...</div></DashboardLayout>;
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

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="space-y-4" aria-labelledby="luma-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-primary"><LumaOwlIcon className="h-7 w-7" /><span className="text-sm font-medium">{isClinicalUser ? "Assistente clínico de leitura" : "Assistente de navegação do site"}
</span></div>
              <h1 id="luma-title" className="text-3xl font-bold">{isClinicalUser ? "Luma Clínica" : "Luma Apoio"}
</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">{isClinicalUser ? "Uma coruja de apoio para organizar informações autorizadas. A Luma não diagnostica, prescreve nem altera prontuários." : "Uma coruja de apoio para encontrar as funções do VozInterior. Este modo não acessa prontuários e não oferece orientação clínica."}
</p>
            </div>
          </div>

          {isClinicalUser && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="space-y-1.5 p-3">
                <Label htmlFor="luma-patient">Paciente no escopo da conversa</Label>
                <Select value={selectedPatientId} onValueChange={changePatient}>
                  <SelectTrigger id="luma-patient" aria-label="Selecionar paciente para a conversa com a Luma">
                    <SelectValue placeholder={patientsQuery.isLoading ? "Carregando pacientes..." : "Selecione um paciente"} />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map(patient => <SelectItem key={patient.id} value={String(patient.id)}>{patient.firstName} {patient.lastName}</SelectItem>)}
                  </SelectContent>
                </Select>
                {selectedPatient && <p className="text-xs text-muted-foreground">As buscas ficam restritas a {selectedPatient.firstName} {selectedPatient.lastName} e à sua autorização profissional.</p>}
              </CardContent>
            </Card>
          )}

          <AIChatBox
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
            height="min(620px, calc(100dvh - 220px))"
          />
        </section>

        <aside className="space-y-4" aria-label="Informações de segurança da Luma">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" />Escopo protegido</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p className="flex gap-2"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />{isClinicalUser ? "A Luma só acessa dados autorizados pelo seu perfil." : "O apoio do site não acessa prontuários, sessões ou documentos clínicos."}</p>
              {isClinicalUser && <p className="flex gap-2"><MessageCircle className="mt-0.5 h-4 w-4 shrink-0" />As respostas podem ser avaliadas por profissionais para melhorar o sistema.</p>}
            </CardContent>
          </Card>
        </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

