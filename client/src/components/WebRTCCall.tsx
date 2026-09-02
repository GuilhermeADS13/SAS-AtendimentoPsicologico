import { useCallback, useEffect, useRef, useState } from "react";
import {
  Focus,
  Loader2,
  Maximize,
  Mic,
  MicOff,
  Minimize,
  MonitorUp,
  PhoneOff,
  Video as VideoIcon,
  VideoOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Videochamada 1:1 peer-to-peer (WebRTC), sem provedor externo nem cartão.
 *
 * O vídeo/áudio trafega direto entre terapeuta e paciente; o servidor só repassa
 * o handshake (/api/ws/rtc — ver server/signaling.ts). NAT é atravessado por STUN
 * grátis do Google; um TURN opcional (VITE_TURN_*) cobre as redes mais fechadas.
 *
 * A interface é nossa: todos os controles (microfone, câmera, compartilhar tela,
 * tela cheia e ENCERRAR) ficam numa barra única sobre o vídeo, como nos apps de vídeo.
 */

type Role = "therapist" | "patient";

/**
 * `backgroundBlur` é o desfoque de fundo que o próprio navegador/sistema aplica
 * na trilha da câmera. Ainda não está nos tipos padrão do DOM, daí estes tipos.
 * Escolhido de propósito no lugar de segmentação por modelo (MediaPipe): não
 * baixa modelo nem processa quadro a quadro, então não rouba CPU/bateria durante
 * a consulta. Em troca, só existe em alguns navegadores — onde não houver, o
 * botão aparece desabilitado, explicando o motivo.
 */
type CapacidadesComDesfoque = MediaTrackCapabilities & { backgroundBlur?: boolean[] };
type RestricaoComDesfoque = MediaTrackConstraintSet & { backgroundBlur?: boolean };

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
  onEndCall,
}: {
  roomName: string;
  role: Role;
  onError?: (error: string) => void;
  /** Encerrar fica na MESMA barra dos outros controles, como nos apps de vídeo. */
  onEndCall?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const telaStreamRef = useRef<MediaStream | null>(null);
  // Candidatos ICE que chegam antes de termos a descrição remota ficam na fila.
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  const [connected, setConnected] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [compartilhando, setCompartilhando] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);
  const [desfoqueSuportado, setDesfoqueSuportado] = useState(false);
  const [desfoqueLigado, setDesfoqueLigado] = useState(false);

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

      // O desfoque de fundo só existe em alguns navegadores/sistemas: pergunta à
      // trilha se ela sabe fazer, em vez de supor e falhar na hora do clique.
      const capacidades = stream.getVideoTracks()[0]?.getCapabilities?.() as CapacidadesComDesfoque | undefined;
      setDesfoqueSuportado(Array.isArray(capacidades?.backgroundBlur) && capacidades.backgroundBlur.includes(true));

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

  /**
   * Compartilhar tela: troca a trilha de vídeo que já está sendo enviada
   * (replaceTrack) em vez de renegociar a conexão — o outro lado nem percebe
   * corte. Ao parar, a câmera volta na mesma trilha.
   */
  const pararCompartilhamento = useCallback(async () => {
    telaStreamRef.current?.getTracks().forEach(t => t.stop());
    telaStreamRef.current = null;
    const camera = localStreamRef.current?.getVideoTracks()[0];
    const sender = pcRef.current?.getSenders().find(s => s.track?.kind === "video");
    if (camera && sender) await sender.replaceTrack(camera);
    setCompartilhando(false);
  }, []);

  const compartilharTela = async () => {
    if (compartilhando) {
      await pararCompartilhamento();
      return;
    }
    try {
      const tela = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const trilha = tela.getVideoTracks()[0];
      const sender = pcRef.current?.getSenders().find(s => s.track?.kind === "video");
      if (!trilha || !sender) {
        tela.getTracks().forEach(t => t.stop());
        return;
      }
      telaStreamRef.current = tela;
      await sender.replaceTrack(trilha);
      setCompartilhando(true);
      // O navegador tem o próprio botão "parar de compartilhar": sem isto, a
      // pessoa pararia por lá e o outro lado ficaria vendo a tela congelada.
      trilha.onended = () => void pararCompartilhamento();
    } catch {
      /* a pessoa cancelou a escolha da tela */
    }
  };

  const alternarDesfoque = async () => {
    const trilha = localStreamRef.current?.getVideoTracks()[0];
    if (!trilha) return;
    const novo = !desfoqueLigado;
    try {
      await trilha.applyConstraints({ advanced: [{ backgroundBlur: novo } as RestricaoComDesfoque] });
      setDesfoqueLigado(novo);
    } catch {
      // Declarou a capacidade mas recusou aplicar: some com o botão em vez de
      // deixar a pessoa clicando em algo que não funciona.
      setDesfoqueSuportado(false);
    }
  };

  const alternarTelaCheia = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void containerRef.current?.requestFullscreen?.();
  };

  useEffect(() => {
    const aoMudar = () => setTelaCheia(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden rounded-lg bg-black">
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

      {/* Barra única de controles, como nos apps de vídeo: encerrar fica AQUI,
          junto do resto — antes ele ficava fora do vídeo e desalinhado. */}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/50 p-1.5 backdrop-blur">
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
        <Button
          variant={compartilhando ? "default" : "secondary"}
          size="icon"
          onClick={compartilharTela}
          className="rounded-full"
          aria-label={compartilhando ? "Parar de compartilhar a tela" : "Compartilhar a tela"}
          title={compartilhando ? "Parar de compartilhar a tela" : "Compartilhar a tela"}
        >
          <MonitorUp className="h-4 w-4" />
        </Button>
        <Button
          variant={desfoqueLigado ? "default" : "secondary"}
          size="icon"
          onClick={alternarDesfoque}
          disabled={!desfoqueSuportado}
          className="rounded-full"
          aria-label={desfoqueLigado ? "Desligar desfoque do fundo" : "Desfocar o fundo"}
          title={
            desfoqueSuportado
              ? desfoqueLigado
                ? "Desligar desfoque do fundo"
                : "Desfocar o fundo"
              : "Seu navegador não oferece desfoque de fundo"
          }
        >
          <Focus className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={alternarTelaCheia}
          className="rounded-full"
          aria-label={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
          title={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
        >
          {telaCheia ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </Button>
        {onEndCall && (
          <Button
            variant="destructive"
            size="icon"
            onClick={onEndCall}
            className="ml-1 rounded-full"
            aria-label="Encerrar a chamada"
            title="Encerrar a chamada"
          >
            <PhoneOff className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
