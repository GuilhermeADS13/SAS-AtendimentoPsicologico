import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Video, VideoOff, Mic, MicOff, Loader2, AlertCircle } from "lucide-react";

/**
 * Tela de preparação antes de entrar na videochamada: mostra o preview da câmera
 * e deixa testar câmera/microfone. Ao entrar, o stream do preview é liberado — o
 * MiroTalk pede o seu próprio dentro do iframe. Também serve de "sala de espera"
 * leve (a pessoa entra quando estiver pronta).
 */
export default function VideoCallLobby({
  title,
  subtitle,
  onJoin,
}: {
  title: string;
  subtitle?: string;
  onJoin: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "denied">("loading");
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatus("ok");
      })
      .catch(() => setStatus("denied"));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const toggleCam = () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCamOn(track.enabled);
    }
  };
  const toggleMic = () => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    }
  };
  const enter = () => {
    // Libera a câmera/mic do preview para o MiroTalk poder usá-los.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onJoin();
  };

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 py-4 sm:py-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      </div>

      <Card className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {status === "denied" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-white">
            <AlertCircle className="h-6 w-6" />
            Não foi possível acessar câmera/microfone. Verifique as permissões do navegador — você ainda pode entrar.
          </div>
        )}
        {status === "ok" && !camOn && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <VideoOff className="h-8 w-8 opacity-80" />
          </div>
        )}
      </Card>

      <div className="flex items-center gap-2">
        <Button variant={micOn ? "outline" : "destructive"} size="icon" onClick={toggleMic} disabled={status !== "ok"} title="Microfone" aria-label="Alternar microfone">
          {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </Button>
        <Button variant={camOn ? "outline" : "destructive"} size="icon" onClick={toggleCam} disabled={status !== "ok"} title="Câmera" aria-label="Alternar câmera">
          {camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
        </Button>
      </div>

      <Button size="lg" className="w-full max-w-xs" onClick={enter}>
        Entrar na chamada
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Teste sua câmera e seu microfone antes de entrar.
      </p>
    </div>
  );
}
