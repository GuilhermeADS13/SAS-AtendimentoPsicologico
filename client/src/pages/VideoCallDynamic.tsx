import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { usePresence } from "@/hooks/usePresence";
import { playPresenceChime } from "@/lib/sound";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import MiroTalkMeeting from "@/components/MiroTalkMeeting";
import VideoCallLobby from "@/components/VideoCallLobby";
import DailyMeeting from "@/components/DailyMeeting";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Phone, AlertCircle, ChevronUp, CheckCircle2, Copy, ShieldAlert, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { formatarNascimento } from "@shared/datas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

// Servidor MiroTalk SFU. Por padrão usa a instância pública do projeto (funciona
// sem hospedar nada). Para self-host (ex.: docker compose local, com gravação),
// aponte VITE_MIROTALK_URL para o seu servidor — ex.: https://localhost:3010.
const mirotalkUrl = import.meta.env.VITE_MIROTALK_URL || "https://sfu.mirotalk.com";

interface VideoCallDynamicProps {
  /** Nome da sala (apt<id>-<token>), sempre vindo da rota /videocall/:roomId. */
  roomId: string;
}

export default function VideoCallDynamic({ roomId }: VideoCallDynamicProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const room = roomId;
  const [isCallReady, setIsCallReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [patientPresent, setPatientPresent] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");
  // Só entra na chamada (MiroTalk) depois de passar pela tela de preparação.
  const [joined, setJoined] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const joinedAtRef = useRef(0);

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

  // Carrega as anotações já salvas para este agendamento.
  const savedNotes = trpc.sessionNotes.getByAppointment.useQuery(
    { appointmentId },
    { enabled: notesEnabled },
  );
  useEffect(() => {
    const saved = savedNotes.data?.[0]?.notes;
    if (typeof saved === "string") setSessionNotes(saved);
  }, [savedNotes.data]);

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
  const recordings = trpc.videoCalls.getByPatient.useQuery(
    { patientId },
    { enabled: notesEnabled },
  );
  // Sala do Daily.co (URL + meeting token). null = Daily não configurado → MiroTalk.
  const dailyJoin = trpc.appointments.dailyJoin.useQuery(
    { roomId: room },
    { enabled: joined && allowed, staleTime: Infinity, refetchOnWindowFocus: false, retry: false },
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

  const displayName = user?.name || "Psicóloga";

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

  const handleEndCall = async () => {
    if (!window.confirm("Encerrar a videochamada agora?")) return;
    if (notesEnabled) {
      const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);
      // Persiste fim da sessão (e a URL da gravação, quando disponível do MiroTalk).
      try {
        await finishCall.mutateAsync({ roomId: room, durationSeconds });
      } catch (err) {
        console.error("Falha ao registrar fim da videochamada:", err);
      }
      // Oferece fechar o fluxo marcando a consulta como realizada.
      if (appointmentId > 0 && window.confirm("Marcar esta consulta como realizada?")) {
        try {
          await markStatus.mutateAsync({ id: appointmentId, status: "completed" });
        } catch (err) {
          console.error("Falha ao marcar consulta como realizada:", err);
        }
      }
    }
    setLocation(isTherapist ? "/dashboard" : "/consultas");
  };

  const copyRoomLink = () => {
    const url = `${window.location.origin}/videocall/${room}`;
    navigator.clipboard.writeText(url);
    toast.success("Link da sala copiado! Envie para o paciente.");
  };

  // Cronômetro: tempo decorrido desde que entrou (fica vermelho se passar da duração).
  const elapsedSec = joined ? Math.max(0, Math.floor((nowTs - joinedAtRef.current) / 1000)) : 0;
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");
  const overtime = durationMin != null && durationMin > 0 && elapsedSec > durationMin * 60;

  return (
    <DashboardLayout>
      <div className="space-y-4 h-full flex flex-col">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Videochamada</h1>
            <p className="truncate text-muted-foreground">
              {patient ? `Consulta com ${patient.firstName} ${patient.lastName}` : "Consulta em tempo real"}
            </p>
            {scheduledAt && (
              <p className="text-sm text-muted-foreground">
                {new Date(scheduledAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                {durationMin ? ` · ${durationMin} min` : ""}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
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
          {/* MiroTalk Container */}
          <div className="relative flex-1 min-h-[55vh] bg-black rounded-lg overflow-hidden flex flex-col lg:min-h-0">
            {isTherapist && !patientPresent && !error && (
              <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-xs font-medium text-white shadow">
                Aguardando o paciente entrar…
              </div>
            )}
            <div className={`pointer-events-none absolute right-3 top-3 z-10 rounded-full px-3 py-1 text-xs font-medium text-white shadow ${overtime ? "bg-red-600/85" : "bg-black/70"}`}>
              {mm}:{ss}{durationMin ? ` · ${durationMin} min` : ""}
            </div>
            {!error && (
              dailyJoin.isLoading ? (
                <div className="flex flex-1 items-center justify-center text-white">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : dailyJoin.data ? (
                <DailyMeeting
                  url={dailyJoin.data.url}
                  token={dailyJoin.data.token}
                  onError={(err) => setError(err)}
                />
              ) : (
                <MiroTalkMeeting
                  roomName={room}
                  displayName={displayName}
                  email={user?.email || undefined}
                  apiUrl={mirotalkUrl}
                  onReady={() => setIsCallReady(true)}
                  onError={(err) => {
                    console.error("Erro no MiroTalk:", err);
                    setError("Erro ao conectar à videochamada. Verifique se o servidor MiroTalk está ativo.");
                  }}
                />
              )
            )}
          </div>

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
                          ? new Date(lastSession.startedAt).toLocaleString("pt-BR")
                          : "Nenhuma sessão registrada"}
                      </p>
                    </div>
                  </TabsContent>

                  {/* Notes Tab — sempre editável, com auto-save */}
                  <TabsContent value="notes" className="p-4 space-y-3">
                        <Textarea
                          value={sessionNotes}
                          onChange={(e) => setSessionNotes(e.target.value)}
                          placeholder="Digite suas anotações da sessão... (salva sozinho)"
                          rows={6}
                          className="resize-none"
                        />
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {!notesEnabled && "Sala avulsa — anotações não vinculadas a um agendamento"}
                            {notesEnabled && autoSaveStatus === "saving" && "Salvando..."}
                            {notesEnabled && autoSaveStatus === "saved" && (
                              <span className="text-green-600 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Salvo automaticamente
                              </span>
                            )}
                            {notesEnabled && autoSaveStatus === "error" && (
                              <span className="text-destructive">Erro ao salvar</span>
                            )}
                            {notesEnabled && autoSaveStatus === "idle" && "As anotações salvam sozinhas."}
                          </span>
                        </div>

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
                                    {new Date(session.startedAt).toLocaleDateString("pt-BR")}
                                  </p>
                                  <p className="text-muted-foreground mt-1 line-clamp-2">
                                    {session.clinicalNotes}
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
                                    {rec.startedAt ? new Date(rec.startedAt).toLocaleString("pt-BR") : "—"}
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

        {/* End Call Button */}
        <div className="flex justify-center gap-4 pb-4">
          <Button
            onClick={handleEndCall}
            variant="destructive"
            size="lg"
            className="rounded-full w-14 h-14 p-0"
          >
            <Phone className="w-6 h-6" />
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
