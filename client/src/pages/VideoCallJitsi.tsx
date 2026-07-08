import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import JitsiMeeting from "@/components/JitsiMeeting";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Phone, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function VideoCallJitsi() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [isJitsiReady, setIsJitsiReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gerar nome da sala baseado no ID do paciente (você pode passar via URL params)
  const roomName = `psicologia-atendimento-${Date.now()}`;
  const displayName = user?.name || "Psicóloga";

  const handleEndCall = () => {
    setLocation("/dashboard");
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 h-full">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Videochamada</h1>
          <p className="text-muted-foreground">
            Consulta em tempo real com Jitsi Meet
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

        {/* Jitsi Container */}
        <div className="flex-1 bg-black rounded-lg overflow-hidden" style={{ minHeight: "600px" }}>
          {!error && (
            <JitsiMeeting
              roomName={roomName}
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
