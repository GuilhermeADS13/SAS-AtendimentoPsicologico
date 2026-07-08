import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { usePresence } from "@/hooks/usePresence";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import MiroTalkMeeting from "@/components/MiroTalkMeeting";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Phone, AlertCircle, ChevronDown, ChevronUp, Edit2, Save, CheckCircle2, Copy } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

// URL do servidor MiroTalk SFU (self-hosted). Configure VITE_MIROTALK_URL no
// deploy; em dev cai no default do container local (docker compose do MiroTalk).
const mirotalkUrl = import.meta.env.VITE_MIROTALK_URL || "https://localhost:3010";

interface VideoCallDynamicProps {
  // Opcional: quando ausente (rota /videocall), geramos uma sala ad-hoc.
  roomId?: string;
}

export default function VideoCallDynamic({ roomId }: VideoCallDynamicProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();
  // Sala estável: usa o roomId da rota ou gera uma sala ad-hoc uma única vez.
  const [room] = useState(() => roomId || `sala-${Date.now()}`);
  const [isCallReady, setIsCallReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");

  // IDs do agendamento/paciente chegam por query string (?apt=&pat=), enviados
  // pela página de Agendamentos. Sem eles (sala ad-hoc), o auto-save fica inerte.
  const params = new URLSearchParams(search);
  const appointmentId = Number(params.get("apt")) || 0;
  const patientId = Number(params.get("pat")) || 0;
  const notesEnabled = appointmentId > 0 && patientId > 0;

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
  const recordings = trpc.videoCalls.getByPatient.useQuery(
    { patientId },
    { enabled: notesEnabled },
  );
  const startedAtRef = useRef<number>(Date.now());
  useEffect(() => {
    if (notesEnabled) {
      startCall.mutate({ appointmentId, patientId, roomId: room });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayName = user?.name || "Psicóloga";

  // Presença em tempo real: usuário autenticado é a psicóloga; sem login, é o
  // paciente que abriu o link. A psicóloga recebe um aviso quando o paciente entra.
  const presenceRole: "therapist" | "patient" = user ? "therapist" : "patient";
  const presenceName = user?.name || "Paciente";
  usePresence(room, presenceRole, presenceName, (msg) => {
    if (msg.type === "patient-joined") {
      toast.info(`${msg.name} entrou na sala`);
    }
  });

  // Mock data do paciente
  const patientData = {
    id: 1,
    firstName: "Maria",
    lastName: "Silva",
    email: "maria@example.com",
    phone: "(81) 99999-1111",
    dateOfBirth: "1990-05-15",
    medicalHistory: "Ansiedade, depressão leve",
    lastSession: "2026-07-07 às 15:00",
    nextAppointment: "2026-07-15 às 14:30",
    sessionHistory: [
      {
        date: "2026-07-07",
        notes: "Paciente apresentou melhora nos sintomas de ansiedade. Continuaremos com técnicas de respiração.",
      },
      {
        date: "2026-06-30",
        notes: "Primeira sessão. Paciente relata histórico de ansiedade há 2 anos. Iniciamos com técnicas de mindfulness.",
      },
    ],
  };

  const handleEndCall = async () => {
    if (notesEnabled) {
      const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);
      // Persiste fim da sessão (e a URL da gravação, quando disponível do MiroTalk).
      try {
        await finishCall.mutateAsync({ roomId: room, durationSeconds });
      } catch (err) {
        console.error("Falha ao registrar fim da videochamada:", err);
      }
    }
    setLocation("/dashboard");
  };

  const copyRoomLink = () => {
    const url = `${window.location.origin}/videocall/${room}`;
    navigator.clipboard.writeText(url);
    toast.success("Link da sala copiado! Envie para o paciente.");
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 h-full flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-foreground">Videochamada</h1>
            <p className="text-muted-foreground">
              Consulta em tempo real — Sala: {room}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={copyRoomLink}>
            <Copy className="w-4 h-4 mr-2" />
            Copiar link da sala
          </Button>
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

        {/* Main Content */}
        <div className="flex-1 flex gap-4 min-h-0">
          {/* MiroTalk Container */}
          <div className="flex-1 bg-black rounded-lg overflow-hidden flex flex-col">
            {!error && (
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
            )}
          </div>

          {/* Sidebar - Prontuário */}
          {showSidebar && (
            <div className="w-80 bg-card border border-border rounded-lg overflow-hidden flex flex-col">
              <div className="bg-primary/10 p-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-foreground">Prontuário</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSidebar(false)}
                  >
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
                        {patientData.firstName} {patientData.lastName}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground uppercase">
                        E-mail
                      </p>
                      <p className="text-sm text-foreground">
                        {patientData.email}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground uppercase">
                        Telefone
                      </p>
                      <p className="text-sm text-foreground">
                        {patientData.phone}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground uppercase">
                        Data de Nascimento
                      </p>
                      <p className="text-sm text-foreground">
                        {new Date(patientData.dateOfBirth).toLocaleDateString(
                          "pt-BR"
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground uppercase">
                        Histórico Médico
                      </p>
                      <p className="text-sm text-foreground">
                        {patientData.medicalHistory}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground uppercase mb-2">
                        Últimas Consultas
                      </p>
                      <p className="text-sm text-foreground">
                        {patientData.lastSession}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground uppercase mb-2">
                        Próxima Consulta
                      </p>
                      <p className="text-sm text-foreground">
                        {patientData.nextAppointment}
                      </p>
                    </div>
                  </TabsContent>

                  {/* Notes Tab */}
                  <TabsContent value="notes" className="p-4 space-y-3">
                    {isEditingNotes ? (
                      <>
                        <Textarea
                          value={sessionNotes}
                          onChange={(e) => setSessionNotes(e.target.value)}
                          placeholder="Digite suas anotações da sessão..."
                          rows={6}
                          className="resize-none"
                        />
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {!notesEnabled && "Sala avulsa — anotações não vinculadas a um agendamento"}
                            {notesEnabled && autoSaveStatus === "saving" && "Salvando..."}
                            {notesEnabled && autoSaveStatus === "saved" && (
                              <span className="text-green-600 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Salvo
                              </span>
                            )}
                            {notesEnabled && autoSaveStatus === "error" && (
                              <span className="text-destructive">Erro ao salvar</span>
                            )}
                          </span>
                        </div>
                        <Button
                          onClick={() => setIsEditingNotes(false)}
                          size="sm"
                          className="w-full bg-primary hover:bg-primary/90"
                        >
                          <Save className="w-4 h-4 mr-2" />
                          Concluir
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="bg-muted/50 rounded-lg p-3 min-h-24">
                          <p className="text-sm text-foreground">
                            {sessionNotes || (
                              <span className="text-muted-foreground">
                                Nenhuma anotação ainda...
                              </span>
                            )}
                          </p>
                        </div>

                        <div className="border-t border-border pt-3">
                          <p className="text-xs font-semibold text-foreground mb-2">
                            Histórico de Sessões
                          </p>
                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            {patientData.sessionHistory.map((session, idx) => (
                              <div key={idx} className="bg-muted/30 rounded p-2 text-xs border border-border/50">
                                <p className="font-semibold text-foreground">{session.date}</p>
                                <p className="text-muted-foreground mt-1 line-clamp-2">
                                  {session.notes}
                                </p>
                              </div>
                            ))}
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

                        <Button
                          onClick={() => setIsEditingNotes(true)}
                          variant="outline"
                          size="sm"
                          className="w-full"
                        >
                          <Edit2 className="w-4 h-4 mr-2" />
                          Editar Anotações
                        </Button>
                      </>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )}

          {/* Sidebar Toggle */}
          {!showSidebar && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSidebar(true)}
              className="absolute right-4 top-24"
            >
              <ChevronDown className="w-4 h-4" />
            </Button>
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
