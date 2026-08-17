import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Brain, LockKeyhole, MessageCircle, ShieldCheck, UserRound } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { AIChatBox, type LumaFeedback, type Message } from "@/components/AIChatBox";
import { useRole } from "@/hooks/useRole";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { LogoLockup } from "@/components/Logo";

export default function Luma() {
  const [, setLocation] = useLocation();
  const { isTherapist, isAdmin, loading: roleLoading } = useRole();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [feedbackByMessageId, setFeedbackByMessageId] = useState<Record<number, LumaFeedback>>({});

  const patientsQuery = trpc.patients.list.useQuery(undefined, {
    enabled: isTherapist && !isAdmin,
    retry: false,
  });
  const chatMutation = trpc.ai.chat.useMutation();
  const feedbackMutation = trpc.ai.feedback.useMutation();

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
    if (isAdmin) {
      toast.error("A Luma não está disponível para acesso clínico administrativo.");
      return;
    }
    if (isTherapist && !selectedPatientId) {
      toast.error("Selecione um paciente antes de consultar registros clínicos.");
      return;
    }

    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    try {
      const result = await chatMutation.mutateAsync({
        messages: nextMessages.filter((message): message is Message & { role: "user" | "assistant" } => message.role !== "system"),
        patientId: selectedPatientId ? Number(selectedPatientId) : undefined,
        conversationId,
      });
      setConversationId(result.conversationId);
      setMessages(current => [...current, {
        id: result.messageId,
        role: "assistant",
        content: result.content,
        sources: result.sources,
      }]);
    } catch (error) {
      setMessages(current => [...current, {
        role: "assistant",
        content: error instanceof Error ? error.message : "Não foi possível responder agora.",
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

  if (isAdmin) {
    return (
      <DashboardLayout>
        <Card className="mx-auto max-w-2xl border-amber-300 bg-amber-50">
          <CardHeader><CardTitle>Acesso clínico restrito</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">A Luma não consulta prontuários em contas administrativas. Use uma conta de terapeuta ou paciente autorizada.</p>
            <Button onClick={() => setLocation("/dashboard")}>Voltar ao dashboard</Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex items-center justify-between rounded-2xl border border-primary/15 bg-white/80 px-5 py-3 shadow-sm" aria-label="Identidade da plataforma">
          <LogoLockup markClassName="h-9 w-9" />
          <span className="text-sm text-muted-foreground">Assistência segura para o atendimento psicológico</span>
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="space-y-4" aria-labelledby="luma-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-primary"><Brain className="h-5 w-5" /><span className="text-sm font-medium">Assistente clínico de leitura</span></div>
              <h1 id="luma-title" className="text-3xl font-bold">Luma</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">Uma coruja de apoio para organizar informações autorizadas. A Luma não diagnostica, prescreve nem altera prontuários.</p>
            </div>
          </div>

          {isTherapist && (
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
            isLoading={chatMutation.isPending}
            lumaStatus={chatMutation.isPending ? "attentive" : "sleeping"}
            processingLabel="Luma está consultando somente registros autorizados..."
            placeholder={isTherapist && !selectedPatientId ? "Selecione um paciente para começar..." : "Escreva uma pergunta para a Luma..."}
            emptyStateMessage={isTherapist ? "Selecione um paciente e pergunte sobre os registros autorizados." : "Pergunte à Luma sobre seus próprios registros e consultas."}
            suggestedPrompts={isTherapist ? ["Resuma os últimos registros autorizados.", "Organize os próximos pontos para a sessão."] : ["Ajude-me a organizar minhas dúvidas para a próxima sessão.", "Quais informações minhas estão registradas? "]}
            onMessageFeedback={handleFeedback}
            feedbackByMessageId={feedbackByMessageId}
            height="620px"
          />
        </section>

        <aside className="space-y-4" aria-label="Informações de segurança da Luma">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" />Escopo protegido</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p className="flex gap-2"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />A Luma só acessa dados autorizados pelo seu perfil.</p>
              <p className="flex gap-2"><MessageCircle className="mt-0.5 h-4 w-4 shrink-0" />As respostas podem ser avaliadas por profissionais para melhorar o sistema.</p>
              <p className="flex gap-2"><UserRound className="mt-0.5 h-4 w-4 shrink-0" />Em situações de crise, procure ajuda humana e serviços de emergência.</p>
            </CardContent>
          </Card>
        </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

