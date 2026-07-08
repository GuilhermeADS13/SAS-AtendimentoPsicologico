import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  Phone,
  Settings,
  Users,
  MessageCircle,
} from "lucide-react";

export default function VideoCall() {
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Initialize camera
    if (isVideoOn) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch((error) => {
          console.error("Error accessing camera:", error);
        });
    }
  }, [isVideoOn]);

  const handleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        setIsScreenSharing(true);
      } catch (error) {
        console.error("Error sharing screen:", error);
      }
    } else {
      setIsScreenSharing(false);
    }
  };

  const handleEndCall = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Videochamada</h1>
          <p className="text-muted-foreground">
            Consulta com paciente - 14:30
          </p>
        </div>

        {/* Video Container */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Video */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="bg-black overflow-hidden aspect-video">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            </Card>

            {/* Video Controls */}
            <div className="flex justify-center gap-4 pb-4">
              <Button
                onClick={() => setIsMicOn(!isMicOn)}
                variant={isMicOn ? "default" : "destructive"}
                size="lg"
                className="rounded-full w-14 h-14 p-0"
              >
                {isMicOn ? (
                  <Mic className="w-6 h-6" />
                ) : (
                  <MicOff className="w-6 h-6" />
                )}
              </Button>

              <Button
                onClick={() => setIsVideoOn(!isVideoOn)}
                variant={isVideoOn ? "default" : "destructive"}
                size="lg"
                className="rounded-full w-14 h-14 p-0"
              >
                {isVideoOn ? (
                  <Video className="w-6 h-6" />
                ) : (
                  <VideoOff className="w-6 h-6" />
                )}
              </Button>

              <Button
                onClick={handleScreenShare}
                variant={isScreenSharing ? "secondary" : "outline"}
                size="lg"
                className="rounded-full w-14 h-14 p-0"
              >
                <Monitor className="w-6 h-6" />
              </Button>

              <Button
                onClick={() => setShowSettings(!showSettings)}
                variant="outline"
                size="lg"
                className="rounded-full w-14 h-14 p-0"
              >
                <Settings className="w-6 h-6" />
              </Button>

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

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Participants */}
            <Card className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-foreground">Participantes</h3>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-2 rounded-lg bg-secondary/10">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-xs font-semibold text-primary">BC</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Você</p>
                    <p className="text-xs text-muted-foreground">Psicóloga</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/10">
                  <div className="w-8 h-8 rounded-full bg-muted/20 flex items-center justify-center">
                    <span className="text-xs font-semibold text-muted-foreground">PA</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Paciente</p>
                    <p className="text-xs text-muted-foreground">Aguardando...</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Chat */}
            <Card className="p-4 space-y-4 flex-1 flex flex-col">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-secondary" />
                <h3 className="font-semibold text-foreground">Chat</h3>
              </div>
              <div className="flex-1 bg-muted/5 rounded-lg p-3 text-sm text-muted-foreground text-center">
                Nenhuma mensagem ainda
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Digite uma mensagem..."
                  className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground"
                />
                <Button size="sm" className="bg-primary hover:bg-primary/90">
                  Enviar
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
