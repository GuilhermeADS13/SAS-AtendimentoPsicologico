import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Clock, CheckCircle } from "lucide-react";

interface WaitingRoomProps {
  appointmentId: string;
  patientName: string;
  therapistName: string;
  scheduledTime: string;
}

export default function WaitingRoom() {
  const [, setLocation] = useLocation();
  const [isWaiting, setIsWaiting] = useState(true);
  const [waitTime, setWaitTime] = useState(0);
  const [therapistReady, setTherapistReady] = useState(false);

  // Simular verificação de status da psicóloga
  useEffect(() => {
    const timer = setInterval(() => {
      setWaitTime((prev) => prev + 1);
      // Simular: psicóloga entra após 30 segundos
      if (waitTime > 30) {
        setTherapistReady(true);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [waitTime]);

  const handleEnterCall = () => {
    // Redirecionar para videochamada
    setLocation("/videocall-jitsi");
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-12 pb-12 space-y-8 text-center">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-foreground">
              Sala de Espera
            </h1>
            <p className="text-muted-foreground">
              Aguardando a psicóloga entrar na consulta
            </p>
          </div>

          {/* Status Animation */}
          <div className="flex justify-center">
            {therapistReady ? (
              <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center animate-pulse">
                <CheckCircle className="w-12 h-12 text-green-600" />
              </div>
            ) : (
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
              </div>
            )}
          </div>

          {/* Info Cards */}
          <div className="space-y-3">
            <div className="bg-secondary/10 rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">
                Tempo de Espera
              </p>
              <div className="flex items-center justify-center gap-2">
                <Clock className="w-5 h-5 text-secondary" />
                <p className="text-2xl font-bold text-foreground">
                  {formatTime(waitTime)}
                </p>
              </div>
            </div>

            <div className="bg-muted/10 rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Status</p>
              <p className="text-lg font-semibold text-foreground">
                {therapistReady ? (
                  <span className="text-green-600">✓ Psicóloga Pronta</span>
                ) : (
                  <span className="text-amber-600">⏳ Aguardando...</span>
                )}
              </p>
            </div>
          </div>

          {/* Tips */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
            <p className="text-sm font-semibold text-blue-900 mb-2">
              💡 Dicas:
            </p>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>✓ Verifique sua câmera e microfone</li>
              <li>✓ Teste sua conexão de internet</li>
              <li>✓ Procure um local tranquilo</li>
              <li>✓ Tenha água à mão</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 pt-4">
            {therapistReady && (
              <Button
                onClick={handleEnterCall}
                size="lg"
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                Entrar na Videochamada
              </Button>
            )}
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => setLocation("/dashboard")}
            >
              Cancelar Consulta
            </Button>
          </div>

          {/* Footer Info */}
          <div className="text-xs text-muted-foreground">
            <p>Consulta agendada para hoje às 14:30</p>
            <p>Psicóloga: Beatriz Chagas</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
