import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { usePresence } from "@/hooks/usePresence";
import { playPresenceChime } from "@/lib/sound";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import WebRTCCall from "@/components/WebRTCCall";
import VideoCallLobby from "@/components/VideoCallLobby";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { AlertCircle, ChevronUp, CheckCircle2, Copy, ShieldAlert, Loader2, MessageSquare } from "lucide-react";
import { useLocation } from "wouter";
import { formatarData, formatarDataHora, formatarNascimento } from "@shared/datas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MODELOS_INTERNOS } from "@shared/prontuario";
import EditorDeAnotacao from "@/components/EditorDeAnotacao";
import ChatConversa from "@/components/ChatConversa";

interface VideoCallDynamicProps {
  /** Nome da sala (apt<id>-<token>), sempre vindo da rota /videocall/:roomId. */
  roomId: string;
}

export default function VideoCallDynamic({ roomId }: VideoCallDynamicProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const room = roomId;
  const [error, setError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showChat, setShowChat] = useState(false);
  // Confirmações de encerrar a chamada / marcar como realizada (modal, no lugar
  // do window.confirm).
  const [confirmarEncerrar, setConfirmarEncerrar] = useState(false);
  const [perguntarRealizada, setPerguntarRealizada] = useState(false);
  const [salvarNoProntuario, setSalvarNoProntuario] = useState(true);
  const [patientPresent, setPatientPresent] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");

  // Edição de markdown no textarea controlado: aplica a transformação e restaura
  // o cursor (senão o caret pula para o fim a cada clique da barra).
  // Só entra na chamada depois de passar pela tela de preparação.
  const [joined, setJoined] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const joinedAtRef = useRef(0);
  // O cronômetro da SESSÃO conta a partir de quando o paciente entra na sala.
  const sessionStartRef = useRef(0);

  // Controle de acesso da sala. O servidor confere, pelo token embutido no nome
  // da sala (apt<id>-<token>), que o usuário logado é participante DESTA consulta
  // — a psicóloga dona ou o paciente dela. Ninguém mais entra, mesmo com o link.
  // (Anônimo nem chega aqui: o DashboardLayout exige login, sem acesso sem conta.)
  const roomAccess = trpc.appointments.roomAccess.useQuery(
    { roomId: room },
    { enabled: !!user, retry: false },
  );
  const access = roomAccess.data;
  const allowed = access?.allowed === true;
  // IDs vêm do servidor, não da query string: o token é a fonte da verdade, então
  // não dá para entrar noutra consulta trocando ?apt= na URL.
  const appointmentId = access?.allowed ? access.appointmentId : 0;
  const patientId = access?.allowed ? access.patientId : 0;
  const scheduledAt = access?.allowed ? access.scheduledAt : undefined;
  const durationMin = access?.allowed ? access.duration : undefined;
  // Prontuário/anotações/gravação são exclusivos da psicóloga DESTA consulta.
  const isTherapist = access?.allowed ? access.role === "therapist" : false;
  const notesEnabled = isTherapist && appointmentId > 0 && patientId > 0;

  // Chat DENTRO da chamada (estilo Meet), no MESMO thread da aba Mensagens
  // (conectados). Disponível quando há thread: psicóloga com paciente, ou o
  // próprio paciente. O badge de não lidas ajuda a achar o chat.
  const podeChat = allowed && (isTherapist ? patientId > 0 : true);
  const chatUnread = trpc.chat.unreadCount.useQuery(undefined, {
    enabled: podeChat,
    refetchInterval: 15000,
    retry: false,
  });
  const chatNaoLidas = chatUnread.data ?? 0;
  // Nome da psicóloga no cabeçalho do chat do paciente (em vez de "Minha psicóloga").
  const psicologa = trpc.me.therapist.useQuery(undefined, {
    enabled: allowed && !isTherapist,
    retry: false,
  });

  // Carrega as anotações já salvas para este agendamento.
  const savedNotes = trpc.sessionNotes.getByAppointment.useQuery(
    { appointmentId },
    { enabled: notesEnabled },
  );
  // Modelos do psicólogo (para os botões de inserir e o padrão que pré-carrega).
  const templatesQuery = trpc.noteTemplates.list.useQuery(undefined, { enabled: notesEnabled });
  const templates = templatesQuery.data ?? [];
  const modeloPadrao = templates.find((t) => t.padrao);

  // Inicializa as anotações UMA vez: carrega o que já foi salvo; se a anotação
  // está em branco e existe um modelo padrão, pré-carrega esse modelo. O ref
  // impede que um refetch sobrescreva o que a psicóloga já está digitando.
  const notesInitRef = useRef(false);
  useEffect(() => {
    if (notesInitRef.current || !notesEnabled) return;
    if (savedNotes.isLoading || templatesQuery.isLoading) return;
    notesInitRef.current = true;
    const saved = savedNotes.data?.[0]?.notes;
    if (typeof saved === "string" && saved.trim()) {
      setSessionNotes(saved);
    } else if (modeloPadrao?.corpo) {
      setSessionNotes(modeloPadrao.corpo);
    }
  }, [notesEnabled, savedNotes.isLoading, savedNotes.data, templatesQuery.isLoading, modeloPadrao]);

  // Auto-save real: persiste no router sessionNotes (debounce de 1,5s).
  const saveNotes = trpc.sessionNotes.save.useMutation();
  useEffect(() => {
    if (!notesEnabled || !sessionNotes.trim()) return;
    const timer = setTimeout(() => {
      saveNotes.mutate({ appointmentId, patientId, notes: sessionNotes });
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionNotes, appointmentId, patientId, notesEnabled]);

  const autoSaveStatus: "idle" | "saving" | "saved" | "error" = saveNotes.isPending
    ? "saving"
    : saveNotes.isError
      ? "error"
      : saveNotes.isSuccess
        ? "saved"
        : "idle";

  // Registro da videochamada + histórico de gravações no banco (videoCalls).
  const startCall = trpc.videoCalls.start.useMutation();
  const finishCall = trpc.videoCalls.finish.useMutation();
  const markStatus = trpc.appointments.updateStatus.useMutation();
  const criarSessao = trpc.sessions.create.useMutation();
  const recordings = trpc.videoCalls.getByPatient.useQuery(
    { patientId },
    { enabled: notesEnabled },
  );
  const startedAtRef = useRef<number>(Date.now());
  const startedRef = useRef(false);
  useEffect(() => {
    // Só registra a sessão depois que a pessoa entrou de fato (passou pela tela
    // de preparação) e o acesso está liberado. Dispara uma única vez por sala.
    if (joined && notesEnabled && !startedRef.current) {
      startedRef.current = true;
      startedAtRef.current = Date.now();
      startCall.mutate({ appointmentId, patientId, roomId: room });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, notesEnabled, appointmentId, patientId, room]);

  // Cronômetro da sessão: atualiza a cada segundo enquanto a chamada estiver ativa.
  useEffect(() => {
    if (!joined) return;
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [joined]);

  // O cronômetro só COMEÇA quando o paciente entra na sala.
  useEffect(() => {
    if (patientPresent && sessionStartRef.current === 0) sessionStartRef.current = Date.now();
  }, [patientPresent]);

  // Para o paciente, "presente" é ele mesmo — marca ao entrar.
  useEffect(() => {
    if (joined && !isTherapist) setPatientPresent(true);
  }, [joined, isTherapist]);

  // Presença em tempo real: o papel vem do usuário (paciente também loga).
  // A psicóloga recebe o aviso quando o paciente entra na sala.
  const presenceRole: "therapist" | "patient" = isTherapist ? "therapist" : "patient";
  const presenceName = user?.name || "Paciente";
  // Só conecta a presença quando o acesso foi liberado (sala vazia = não conecta).
  usePresence(joined && allowed ? room : "", presenceRole, presenceName, (msg) => {
    if (msg.type === "patient-joined") {
      setPatientPresent(true);
      // Só a psicóloga é avisada (som + toast) quando o paciente entra.
      if (isTherapist) {
        playPresenceChime();
        toast.info(`${msg.name} entrou na sala`);
      }
    }
    if (msg.type === "patient-left") setPatientPresent(false);
  });

  // A confirmação de presença saiu da sala (era redundante — quem está na sala
  // já está presente). Agora o paciente confirma ANTES, em "Minhas Consultas",
  // e a psicóloga é avisada na sineta. Ver me.confirmAppointment.

  // Prontuário real do paciente vinculado à sala (?pat=). Em sala avulsa
  // (sem paciente) o painel não é exibido — prontuário e vídeo ficam separados.
  const { data: patient } = trpc.patients.get.useQuery(
    { id: patientId },
    { enabled: isTherapist && patientId > 0 },
  );
  const { data: patientSessions = [] } = trpc.sessions.getByPatient.useQuery(
    { patientId },
    { enabled: isTherapist && patientId > 0 },
  );
  const lastSession = patientSessions[0];

  /**
   * Dá para virar sessão do prontuário? Precisa de anotação escrita, de consulta
   * vinculada e de NÃO existir já uma sessão desta mesma consulta — senão
   * encerrar a chamada duas vezes gravaria o registro repetido.
   */
  const jaTemSessaoDesteAtendimento = patientSessions.some(
    (s) => (s as { appointmentId?: number }).appointmentId === appointmentId,
  );
  const podeRegistrarSessao =
    notesEnabled && appointmentId > 0 && sessionNotes.trim().length > 0 && !jaTemSessaoDesteAtendimento;

  // Sala fechada. Quem não está logado já foi barrado pelo DashboardLayout
  // (tela "Entre para continuar"). Aqui tratamos o usuário logado: enquanto o
  // servidor verifica, e quando ele não é participante da consulta.
  if (user && roomAccess.isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="p-6 flex items-center gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            Verificando seu acesso à sala…
          </Card>
        </div>
      </DashboardLayout>
    );
  }
  if (user && !allowed) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-md p-6 text-center space-y-4">
            <ShieldAlert className="w-9 h-9 text-destructive mx-auto" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">Você não tem acesso a esta sala</p>
              <p className="text-sm text-muted-foreground">
                Esta videochamada é reservada à psicóloga e ao paciente da consulta.
                Se você deveria estar aqui, entre pela sua própria lista de consultas.
              </p>
            </div>
            <Button variant="outline" onClick={() => window.history.back()}>
              Voltar
            </Button>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Tela de preparação (checar câmera/mic) antes de entrar na chamada.
  if (user && allowed && !joined) {
    return (
      <DashboardLayout>
        <VideoCallLobby
          title="Pronto para entrar?"
          subtitle={patient ? `Consulta com ${patient.firstName} ${patient.lastName}` : "Confira sua câmera e seu microfone"}
          onJoin={() => {
            joinedAtRef.current = Date.now();
            setJoined(true);
          }}
        />
      </DashboardLayout>
    );
  }

  const sairDaChamada = () => setLocation(isTherapist ? "/dashboard" : "/consultas");

  // Botão "Encerrar": abre o modal de confirmação.
  const handleEndCall = () => setConfirmarEncerrar(true);

  // Passo 1 (confirmado): registra o fim da sessão e decide se ainda pergunta
  // sobre marcar como realizada, ou já sai.
  const encerrarChamada = async () => {
    setConfirmarEncerrar(false);
    if (notesEnabled) {
      const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);
      try {
        await finishCall.mutateAsync({ roomId: room, durationSeconds });
      } catch (err) {
        console.error("Falha ao registrar fim da videochamada:", err);
      }
      if (appointmentId > 0) {
        setPerguntarRealizada(true);
        return;
      }
    }
    sairDaChamada();
  };

  // Passo 2: opcionalmente marca como realizada e sai (a chamada já foi encerrada,
  // então qualquer escolha leva embora — igual ao fluxo anterior).
  const marcarRealizadaESair = async (marcar: boolean) => {
    setPerguntarRealizada(false);
    // Primeiro o registro clínico: se algo falhar, é o que a psicóloga menos
    // pode perder (o status da consulta ela corrige em dois cliques na agenda).
    if (podeRegistrarSessao && salvarNoProntuario) {
      try {
        await criarSessao.mutateAsync({ appointmentId, patientId, clinicalNotes: sessionNotes.trim() });
        toast.success("Anotação registrada no prontuário.");
      } catch (err) {
        console.error("Falha ao registrar a sessão no prontuário:", err);
        toast.error("Não consegui registrar no prontuário. A anotação continua salva nesta consulta.");
      }
    }
    if (marcar && appointmentId > 0) {
      try {
        await markStatus.mutateAsync({ id: appointmentId, status: "completed" });
      } catch (err) {
        console.error("Falha ao marcar consulta como realizada:", err);
      }
    }
    sairDaChamada();
  };

  const copyRoomLink = () => {
    const url = `${window.location.origin}/videocall/${room}`;
    navigator.clipboard.writeText(url);
    toast.success("Link da sala copiado! Envie para o paciente.");
  };

  // Cronômetro: conta a partir de quando o paciente entrou (fica vermelho se passar da duração).
  const elapsedSec = patientPresent && sessionStartRef.current > 0
    ? Math.max(0, Math.floor((nowTs - sessionStartRef.current) / 1000))
    : 0;
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");
  const overtime = durationMin != null && durationMin > 0 && elapsedSec > durationMin * 60;

  return (
    <DashboardLayout>
      {/* Celular DEITADO (~390px de altura): o título grande, a linha do horário e
          os botões ocupavam a tela inteira e o VÍDEO — que é o motivo da página —
          começava abaixo da dobra. Abaixo de 560px de altura, o cabeçalho encolhe
          para uma linha: o nome do paciente basta (a barra do topo já diz
          "Videochamada") e a data sai, porque a consulta é agora. */}
      <div className="space-y-4 h-full flex flex-col [@media(max-height:560px)]:space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl [@media(max-height:560px)]:hidden">Videochamada</h1>
            <p className="truncate font-medium text-muted-foreground [@media(max-height:560px)]:text-sm">
              {patient ? `Consulta com ${patient.firstName} ${patient.lastName}` : "Consulta em tempo real"}
            </p>
            {scheduledAt && (
              <p className="text-sm text-muted-foreground [@media(max-height:560px)]:hidden">
                {new Date(scheduledAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                {durationMin ? ` · ${durationMin} min` : ""}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Chat dentro da chamada. Mesmo nome/ícone do menu "Mensagens" e
                sempre visível — uma cliente não achava o chat na sessão. */}
            {podeChat && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowChat(true)}
                className="relative"
                title="Abrir mensagens"
              >
                <MessageSquare className="w-4 h-4 mr-1.5" />
                Mensagens
                {chatNaoLidas > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                    {chatNaoLidas}
                  </span>
                )}
              </Button>
            )}
            {/* No mobile o prontuário é uma gaveta; este botão abre/fecha. */}
            {isTherapist && patient && (
              <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setShowSidebar((v) => !v)}>
                Prontuário
              </Button>
            )}
            {/* Só a psicóloga compartilha a sala — o link não serve ao paciente. */}
            {isTherapist && (
              <Button variant="outline" size="sm" onClick={copyRoomLink}>
                <Copy className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Copiar link da sala</span>
              </Button>
            )}
          </div>
        </div>

        {error && (
          <Card className="bg-destructive/10 border-destructive/30 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
              <div>
                <p className="font-semibold text-destructive">Erro</p>
                <p className="text-sm text-destructive/80">{error}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Main Content — empilha no mobile, lado a lado no desktop */}
        <div className="flex-1 flex flex-col gap-4 min-h-0 lg:flex-row">
          {/* Vídeo (WebRTC P2P) */}
          {/* Deitado, 55vh = ~215px e ainda sobrava página para rolar; aí o vídeo
              usa a altura que restou na tela, sem empurrar nada para baixo. */}
          <div className="relative flex-1 min-h-[55vh] bg-black rounded-lg overflow-hidden flex flex-col lg:min-h-0 [@media(max-height:560px)]:min-h-0">
            {isTherapist && !patientPresent && !error && (
              <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-xs font-medium text-white shadow">
                Aguardando o paciente entrar…
              </div>
            )}
            {patientPresent && (
              <div className={`pointer-events-none absolute right-3 top-3 z-10 rounded-full px-3 py-1 text-xs font-medium text-white shadow ${overtime ? "bg-red-600/85" : "bg-black/70"}`}>
                {mm}:{ss}{durationMin ? ` · ${durationMin} min` : ""}
              </div>
            )}
            {!error && (
              <WebRTCCall
                roomName={room}
                role={presenceRole}
                onError={(err) => setError(err)}
                onEndCall={handleEndCall}
              />
            )}
          </div>

          {/* Chat da chamada — painel que desliza sobre o vídeo (estilo Meet),
              nos dois papéis. É o MESMO thread da aba Mensagens (conectados). */}
          {podeChat && (
            <>
              <div
                className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${showChat ? "opacity-100" : "pointer-events-none opacity-0"}`}
                onClick={() => setShowChat(false)}
                aria-hidden="true"
              />
              <div
                className={`fixed inset-y-0 right-0 z-50 flex w-96 max-w-[92vw] flex-col overflow-hidden border-l border-border bg-card shadow-xl transition-transform ${showChat ? "translate-x-0" : "translate-x-full"}`}
              >
                <ChatConversa
                  patientId={isTherapist ? patientId : undefined}
                  titulo={isTherapist ? (patient ? `${patient.firstName} ${patient.lastName}` : "Mensagens") : psicologa.data?.nome?.trim() || "Minha psicóloga"}
                  onClose={() => setShowChat(false)}
                  ativo={showChat}
                />
              </div>
            </>
          )}

          {/* Prontuário — gaveta sobre o vídeo no mobile, painel fixo no desktop */}
          {patient && (
            <>
              <div
                className={`fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden ${showSidebar ? "opacity-100" : "pointer-events-none opacity-0"}`}
                onClick={() => setShowSidebar(false)}
                aria-hidden="true"
              />
              <div className={`fixed inset-y-0 right-0 z-50 flex w-80 max-w-[85vw] flex-col overflow-hidden border-l border-border bg-card shadow-xl transition-transform lg:static lg:z-auto lg:max-w-none lg:translate-x-0 lg:rounded-lg lg:border lg:shadow-none ${showSidebar ? "translate-x-0" : "translate-x-full"}`}>
                <div className="bg-primary/10 p-4 border-b border-border">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-foreground">Prontuário</h2>
                    <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setShowSidebar(false)}>
                      <ChevronUp className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

              <div className="flex-1 overflow-y-auto">
                <Tabs defaultValue="info" className="w-full">
                  <TabsList className="w-full rounded-none border-b">
                    <TabsTrigger value="info" className="flex-1">
                      Info
                    </TabsTrigger>
                    <TabsTrigger value="notes" className="flex-1">
                      Anotações
                    </TabsTrigger>
                  </TabsList>

                  {/* Info Tab */}
                  <TabsContent value="info" className="p-4 space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase">
                        Nome
                      </p>
                      <p className="font-semibold text-foreground">
                        {patient?.firstName} {patient?.lastName}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground uppercase">
                        E-mail
                      </p>
                      <p className="text-sm text-foreground">{patient?.email}</p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground uppercase">
                        Telefone
                      </p>
                      <p className="text-sm text-foreground">{patient?.phone || "—"}</p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground uppercase">
                        Data de Nascimento
                      </p>
                      <p className="text-sm text-foreground">
                        {formatarNascimento(patient?.dateOfBirth)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground uppercase">
                        Histórico Médico
                      </p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {patient?.medicalHistory || "—"}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground uppercase mb-2">
                        Última Sessão
                      </p>
                      <p className="text-sm text-foreground">
                        {lastSession
                          ? formatarDataHora(lastSession.startedAt)
                          : "Nenhuma sessão registrada"}
                      </p>
                    </div>
                  </TabsContent>

                  {/* Notes Tab — SOAP/markdown, modelos e auto-save */}
                  <TabsContent value="notes" className="flex min-h-0 flex-col gap-3 p-4">
                        <EditorDeAnotacao
                          valor={sessionNotes}
                          aoMudar={setSessionNotes}
                          modelos={[...MODELOS_INTERNOS, ...templates.map((t) => ({ nome: t.nome, corpo: t.corpo }))]}
                          placeholder="O que você quer registrar desta sessão. Um modelo acima já monta a estrutura, e o que você escreve salva sozinho."
                          rodape={
                            <>
                              <span className="text-muted-foreground">
                                {!notesEnabled && "Sala avulsa — a anotação não fica vinculada a uma consulta"}
                                {notesEnabled && autoSaveStatus === "saving" && (
                                  <span className="flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> Salvando…</span>
                                )}
                                {notesEnabled && autoSaveStatus === "saved" && (
                                  <span className="flex items-center gap-1 text-green-600">
                                    <CheckCircle2 className="size-3" /> Salvo
                                  </span>
                                )}
                                {notesEnabled && autoSaveStatus === "error" && (
                                  <span className="text-destructive">Não consegui salvar — verifique a conexão</span>
                                )}
                                {notesEnabled && autoSaveStatus === "idle" && "Salva sozinho enquanto você escreve."}
                              </span>
                              {sessionNotes.trim() && (
                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                  {sessionNotes.trim().split(/\s+/).length} palavras
                                </span>
                              )}
                            </>
                          }
                        />

                        <div className="border-t border-border pt-3">
                          <p className="text-xs font-semibold text-foreground mb-2">
                            Histórico de Sessões
                          </p>
                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            {patientSessions.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                Nenhuma sessão registrada ainda.
                              </p>
                            ) : (
                              patientSessions.map((session) => (
                                <div key={session.id} className="bg-muted/30 rounded p-2 text-xs border border-border/50">
                                  <p className="font-semibold text-foreground">
                                    {formatarData(session.startedAt)}
                                  </p>
                                  <p className="text-muted-foreground mt-1 line-clamp-2">
                                    {session.clinicalNotes || session.subjective || session.assessment || "—"}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {notesEnabled && (recordings.data?.length ?? 0) > 0 && (
                          <div className="border-t border-border pt-3">
                            <p className="text-xs font-semibold text-foreground mb-2">
                              Gravações
                            </p>
                            <div className="space-y-2 max-h-32 overflow-y-auto">
                              {recordings.data?.map((rec) => (
                                <div key={rec.id} className="bg-muted/30 rounded p-2 text-xs border border-border/50 flex items-center justify-between gap-2">
                                  <span className="text-muted-foreground">
                                    {rec.startedAt ? formatarDataHora(rec.startedAt) : "—"}
                                    {rec.duration ? ` · ${Math.round(rec.duration / 60)}min` : ""}
                                  </span>
                                  {rec.recordingUrl ? (
                                    <a
                                      href={rec.recordingUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-primary underline shrink-0"
                                    >
                                      Ver
                                    </a>
                                  ) : (
                                    <span className="text-muted-foreground shrink-0">sem gravação</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                  </TabsContent>
                </Tabs>
              </div>
            </div>
            </>
          )}
        </div>

        {/* O botão de encerrar mudou para DENTRO da barra de controles do vídeo
            (ver WebRTCCall): aqui embaixo ele centralizava na largura da página,
            não na do vídeo, e ficava desalinhado dos outros controles. */}
      </div>

      <AlertDialog open={confirmarEncerrar} onOpenChange={(o) => !o && setConfirmarEncerrar(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar a videochamada?</AlertDialogTitle>
            <AlertDialogDescription>
              A chamada vai terminar para você.
              {isTherapist ? " Em seguida você pode registrar a consulta como realizada." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => { e.preventDefault(); setConfirmarEncerrar(false); }}>
              Voltar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); encerrarChamada(); }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={perguntarRealizada} onOpenChange={(o) => { if (!o) marcarRealizadaESair(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar consulta como realizada?</AlertDialogTitle>
            <AlertDialogDescription>
              A videochamada foi encerrada. Deseja marcar esta consulta como realizada?
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* A anotação feita durante a chamada ficava SÓ presa ao link da sala:
              não aparecia no prontuário nem no histórico de sessões, e a
              psicóloga teria de digitar tudo de novo em "Nova Sessão". Aqui ela
              vira uma sessão do prontuário — marcado por padrão, porque é onde o
              registro deve estar (Resolução CFP 001/2009). */}
          {podeRegistrarSessao && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border bg-muted/40 p-3 text-sm">
              <input
                type="checkbox"
                checked={salvarNoProntuario}
                onChange={(e) => setSalvarNoProntuario(e.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <span className="font-medium text-foreground">Registrar a anotação no prontuário</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  O que você escreveu na aba “Anotações” entra como uma sessão no histórico do paciente.
                </span>
              </span>
            </label>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => { e.preventDefault(); marcarRealizadaESair(false); }}>
              Agora não
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); marcarRealizadaESair(true); }}
              className="bg-primary hover:bg-primary/90"
            >
              Marcar como realizada
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
