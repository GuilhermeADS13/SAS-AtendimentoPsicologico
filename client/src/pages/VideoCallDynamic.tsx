import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import JitsiMeeting from "@/components/JitsiMeeting";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Phone, AlertCircle, ChevronDown, ChevronUp, Edit2, Save, CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface VideoCallDynamicProps {
  roomId: string;
}

export default function VideoCallDynamic({ roomId }: VideoCallDynamicProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [isJitsiReady, setIsJitsiReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const displayName = user?.name || "Psicóloga";

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

  // Auto-save notes a cada 2 segundos
  useEffect(() => {
    const timer = setTimeout(() => {
      if (sessionNotes && sessionNotes.trim()) {
        setAutoSaveStatus("saving");
        // Simular salvamento
        setTimeout(() => setAutoSaveStatus("saved"), 500);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [sessionNotes]);

  const handleEndCall = () => {
    setLocation("/dashboard");
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 h-full flex flex-col">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Videochamada</h1>
          <p className="text-muted-foreground">
            Consulta em tempo real com Jitsi Meet - Sala: {roomId}
          </p>
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
          {/* Jitsi Container */}
          <div className="flex-1 bg-black rounded-lg overflow-hidden flex flex-col">
            {!error && (
              <JitsiMeeting
                roomName={roomId}
                displayName={displayName}
                email={user?.email || undefined}
                onReady={() => setIsJitsiReady(true)}
                onError={(err) => {
                  console.error("Erro no Jitsi:", err);
                  setError("Erro ao conectar à videochamada. Tente novamente.");
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
                            {autoSaveStatus === "saving" && "Salvando..."}
                            {autoSaveStatus === "saved" && (
                              <span className="text-green-600 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Salvo
                              </span>
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
