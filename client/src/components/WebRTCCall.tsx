import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video as VideoIcon, VideoOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Videochamada 1:1 peer-to-peer (WebRTC), sem provedor externo nem cartão.
 *
 * O vídeo/áudio trafega direto entre terapeuta e paciente; o servidor só repassa
 * o handshake (/api/ws/rtc — ver server/signaling.ts). NAT é atravessado por STUN
 * grátis do Google; um TURN opcional (VITE_TURN_*) cobre as redes mais fechadas.
 *
 * A interface é nossa: câmera/microfone aqui, e o botão de ENCERRAR fica na página
 * (VideoCallDynamic) — por isso não há "desligar" duplicado.
 */

type Role = "therapist" | "patient";

const LS = { mic: "sas-video-mic", cam: "sas-video-cam", spk: "sas-video-spk" };
const readLS = (k: string) => {
  try {
    return localStorage.getItem(k) || "";
  } catch {
    return "";
  }
};

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: (import.meta.env.VITE_TURN_USERNAME as string | undefined) || undefined,
      credential: (import.meta.env.VITE_TURN_CREDENTIAL as string | undefined) || undefined,
    });
  }
  return servers;
}

export default function WebRTCCall({
  roomName,
  role,
  onError,
}: {
  roomName: string;
  role: Role;
  onError?: (error: string) => void;
}) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  // Candidatos ICE que chegam antes de termos a descrição remota ficam na fila.
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  const [connected, setConnected] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  useEffect(() => {
    let disposed = false;
    const onErr = onError;

    const send = (payload: unknown) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    };

    const drainCandidates = async (pc: RTCPeerConnection) => {
      const fila = pendingCandidates.current;
      pendingCandidates.current = [];
      for (const cand of fila) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch {
          /* candidato inválido/duplicado — ignora */
        }
      }
    };

    const setup = async () => {
      // 1) Mídia local, com os dispositivos escolhidos no lobby (se houver).
      const micId = readLS(LS.mic);
      const camId = readLS(LS.cam);
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: camId ? { deviceId: { exact: camId } } : true,
          audio: micId ? { deviceId: { exact: micId } } : true,
        });
      } catch {
        onErr?.("Não foi possível acessar câmera/microfone. Verifique as permissões do navegador.");
        return;
      }
      if (disposed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      // 2) Conexão peer-to-peer.
      const pc = new RTCPeerConnection({ iceServers: iceServers() });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
        remoteStreamRef.current.addTrack(event.track);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStreamRef.current;
          // Aplica o alto-falante escolhido no lobby, quando o navegador permite.
          const spkId = readLS(LS.spk);
          const el = remoteVideoRef.current as HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> };
          if (spkId && el.setSinkId) el.setSinkId(spkId).catch(() => {});
          el.play?.().catch(() => {});
        }
        setConnected(true);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) send({ type: "candidate", candidate: event.candidate.toJSON() });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          onErr?.("A conexão de vídeo caiu. Tente sair e entrar de novo.");
        }
        if (pc.connectionState === "disconnected") setConnected(false);
      };

      // 3) Sinalização. Abre DEPOIS da mídia/pc prontos: quando o "start" ou a
      //    oferta chegar, já está tudo montado para responder.
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const params = new URLSearchParams({ room: roomName, role });
      const ws = new WebSocket(`${proto}://${window.location.host}/api/ws/rtc?${params.toString()}`);
      wsRef.current = ws;

      ws.onmessage = async (event) => {
        let msg: { type?: string; sdp?: string; candidate?: RTCIceCandidateInit };
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        const conn = pcRef.current;
        if (!conn) return;

        // Terapeuta é o iniciador: cria a oferta quando os dois estão presentes.
        if (msg.type === "start" && role === "therapist" && conn.signalingState === "stable") {
          const offer = await conn.createOffer();
          await conn.setLocalDescription(offer);
          send({ type: "offer", sdp: offer.sdp });
          return;
        }
        if (msg.type === "offer" && msg.sdp) {
          await conn.setRemoteDescription({ type: "offer", sdp: msg.sdp });
          await drainCandidates(conn);
          const answer = await conn.createAnswer();
          await conn.setLocalDescription(answer);
          send({ type: "answer", sdp: answer.sdp });
          return;
        }
        if (msg.type === "answer" && msg.sdp) {
          await conn.setRemoteDescription({ type: "answer", sdp: msg.sdp });
          await drainCandidates(conn);
          return;
        }
        if (msg.type === "candidate" && msg.candidate) {
          if (conn.remoteDescription) {
            try {
              await conn.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } catch {
              /* ignora */
            }
          } else {
            pendingCandidates.current.push(msg.candidate);
          }
          return;
        }
        if (msg.type === "peer-left") {
          setConnected(false);
          if (remoteStreamRef.current) {
            remoteStreamRef.current.getTracks().forEach((t) => remoteStreamRef.current?.removeTrack(t));
          }
        }
      };

      ws.onerror = () => onErr?.("Falha na conexão de sinalização da videochamada.");
    };

    setup();

    return () => {
      disposed = true;
      try {
        wsRef.current?.close();
      } catch {
        /* já fechado */
      }
      try {
        pcRef.current?.close();
      } catch {
        /* já fechado */
      }
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      wsRef.current = null;
      pcRef.current = null;
      localStreamRef.current = null;
      remoteStreamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, role]);

  const toggleMic = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    }
  };
  const toggleCam = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCamOn(track.enabled);
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-black">
      {/* Vídeo do outro lado ocupa a tela toda. */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="h-full w-full object-contain"
      />

      {/* Enquanto o outro lado não conecta, um aviso discreto. */}
      {!connected && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm text-white">
            <Loader2 className="h-4 w-4 animate-spin" />
            {role === "therapist" ? "Aguardando o paciente conectar…" : "Conectando com a psicóloga…"}
          </div>
        </div>
      )}

      {/* Meu próprio vídeo em miniatura (canto). */}
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className="absolute bottom-3 right-3 h-28 w-40 rounded-md border border-white/20 object-cover shadow-lg sm:h-32 sm:w-48"
      />

      {/* Controles nossos (mic/câmera). Encerrar fica na página. */}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2">
        <Button
          variant={micOn ? "secondary" : "destructive"}
          size="icon"
          onClick={toggleMic}
          className="rounded-full"
          aria-label={micOn ? "Desligar microfone" : "Ligar microfone"}
          title={micOn ? "Desligar microfone" : "Ligar microfone"}
        >
          {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </Button>
        <Button
          variant={camOn ? "secondary" : "destructive"}
          size="icon"
          onClick={toggleCam}
          className="rounded-full"
          aria-label={camOn ? "Desligar câmera" : "Ligar câmera"}
          title={camOn ? "Desligar câmera" : "Ligar câmera"}
        >
          {camOn ? <VideoIcon className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
