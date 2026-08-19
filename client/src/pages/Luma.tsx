import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { LockKeyhole, MessageCircle, ShieldCheck } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { AIChatBox, type LumaFeedback, type Message } from "@/components/AIChatBox";
import { useRole } from "@/hooks/useRole";
import { isLumaTestAccount } from "@/lib/lumaAccess";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { LumaOwlIcon } from "@/components/Logo";

export default function Luma() {
  const [, setLocation] = useLocation();
  const { user, isTherapist, isAdmin, loading: roleLoading } = useRole();
  const isTestSiteSupport = isAdmin && isLumaTestAccount(user?.email);
  const isClinicalUser = isTherapist && !isAdmin;
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [feedbackByMessageId, setFeedbackByMessageId] = useState<Record<number, LumaFeedback>>({});

  const patientsQuery = trpc.patients.list.useQuery(undefined, {
    enabled: isClinicalUser,
    retry: false,
  });
  const chatMutation = trpc.ai.chat.useMutation();
  const siteHelpMutation = trpc.ai.siteHelp.useMutation();
  const feedbackMutation = trpc.ai.feedback.useMutation({
    onSuccess: () => toast.success("Obrigada pelo retorno!"),
    onError: (e) => toast.error(e.message || "Não foi possível registrar a avaliação"),
  });

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

  function changePatient(value: string) {
    setSelectedPatientId(value);
    setMessages([]);
    setConversationId(undefined);
    setFeedbackByMessageId({});
  }

  async function handleSend(content: string) {
    if (isAdmin && !isTestSiteSupport) {
      toast.error("A Luma não está disponível para acesso clínico administrativo.");
      return;
    }
    if (isClinicalUser && !selectedPatientId) {
      toast.error("Selecione um paciente antes de consultar registros clínicos.");
      return;
    }

    const requestId = crypto.randomUUID();
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
        return;
      }

      const result = await chatMutation.mutateAsync({
        messages: nextMessages.filter((message): message is Message & { role: "user" | "assistant" } => message.role !== "system"),
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
    } catch {
      setMessages(current => [...current, {
        role: "assistant",
        content: isClinicalUser
          ? "A Luma clínica não conseguiu concluir esta conversa agora. O sistema registrou a falha com segurança. Tente novamente em instantes; se persistir, informe a equipe responsável pelo sistema."
          : "O apoio de navegação está temporariamente indisponível. Tente novamente em instantes.",
      }]);
    }
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
              <h1 id="luma-title" className="text-3xl font-bold">{isClinicalUser ? "Luma Clínica" : "Luma Site Support"}
</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">{isClinicalUser ? "Uma coruja de apoio para organizar informações autorizadas. A Luma não diagnostica, prescreve nem altera prontuários." : "Uma coruja de apoio para encontrar funções do SAS. Este modo não acessa prontuários e não oferece orientação clínica."}
</p>
            </div>
          </div>

          {isClinicalUser && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="space-y-2 p-4">
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
            agentName={isClinicalUser ? "Luma Clínica" : "Luma Site Support"}
            agentSubtitle={isClinicalUser ? "Coruja de apoio à leitura clínica autorizada" : "Ajuda para navegar no SAS"}
            processingLabel={isClinicalUser ? "Luma está consultando somente registros autorizados..." : "Luma está localizando essa área no site..."}
            placeholder={isClinicalUser
              ? (selectedPatientId ? "Pergunte sobre os registros autorizados deste paciente..." : "Selecione um paciente para começar...")
              : "Escreva uma pergunta sobre o uso do site..."}
            emptyStateMessage={isClinicalUser ? "Olá! Eu sou a Luma. Posso resumir e buscar os registros autorizados, consultar a agenda e as sessões, e agendar consultas (sempre com a sua confirmação). Escolha um paciente e uma sugestão para começar." : "Olá! Eu sou a Luma, sua coruja de apoio no SAS. Escolha uma sugestão para aprender a usar o sistema."}
            suggestedPrompts={isClinicalUser ? ["Resumir os últimos registros autorizados", "Ver os próximos agendamentos", "Agendar uma consulta", "Organizar os próximos pontos para a sessão"] : ["Ver minhas consultas", "Entrar na videochamada", "Atualizar meu perfil", "Encontrar minha psicóloga"]}
            onMessageFeedback={handleFeedback}
            feedbackByMessageId={feedbackByMessageId}
            height="620px"
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

