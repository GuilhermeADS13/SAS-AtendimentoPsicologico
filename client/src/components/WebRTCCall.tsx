import { useCallback, useEffect, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  Focus,
  Image as ImageIcon,
  Loader2,
  Maximize,
  Mic,
  MicOff,
  Minimize,
  MonitorUp,
  Paperclip,
  PhoneOff,
  Video as VideoIcon,
  VideoOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { getAccessToken } from "@/lib/supabase";
import {
  carregarImagemFundo,
  iniciarFundoVirtual,
  type ControleFundo,
} from "@/lib/virtualBackground";

/**
 * Videochamada 1:1 peer-to-peer (WebRTC), sem provedor externo nem cartão.
 *
 * O vídeo/áudio trafega direto entre terapeuta e paciente; o servidor só repassa
 * o handshake (/api/ws/rtc — ver server/signaling.ts). NAT é atravessado por STUN
 * grátis do Google; o TURN (opcional) cobre as redes mais fechadas e vem do
 * SERVIDOR com credenciais temporárias — ver server/turn.ts.
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

const LS = {
  mic: "sas-video-mic",
  cam: "sas-video-cam",
  spk: "sas-video-spk",
  // Preferências on/off, compartilhadas com o lobby (VideoCallLobby): "0" = off.
  micOn: "sas-video-mic-on",
  camOn: "sas-video-cam-on",
  // Ocultar a própria miniatura no canto: "1" = oculta.
  selfView: "sas-video-selfview",
};
const readLS = (k: string) => {
  try {
    return localStorage.getItem(k) || "";
  } catch {
    return "";
  }
};
const writeLS = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

/**
 * STUN de reserva. A configuração real (com TURN) vem do SERVIDOR — as credenciais
 * TURN são temporárias e não podem morar no bundle, que é público. Isto aqui só
 * entra se a busca no servidor falhar: melhor conectar sem TURN do que não conectar.
 */
const STUN_RESERVA: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

/**
 * Fundos virtuais (imagens em client/public/backgrounds). Oferecidos só no
 * desktop: a segmentação processa cada quadro e pesaria demais no celular.
 */
const FUNDOS = [
  { nome: "Biblioteca", url: "/backgrounds/biblioteca.jpg" },
  { nome: "Escritório", url: "/backgrounds/escritorio-plantas.jpg" },
  { nome: "Floresta", url: "/backgrounds/floresta.jpg" },
  { nome: "Sala clara", url: "/backgrounds/sala-clara.jpg" },
  { nome: "Home office", url: "/backgrounds/home-office.jpg" },
] as const;

/**
 * Qualidade da chamada, ajustada no PRÓPRIO cliente (setParameters do WebRTC) —
 * não exige servidor de mídia. Um SFU daria controle mais fino, mas faria a mídia
 * passar pelo servidor, com custo por minuto de consulta; num 1:1 não compensa.
 *
 * Numa consulta, o que não pode falhar é o ÁUDIO e a fluidez do rosto:
 *  - áudio com prioridade alta de rede;
 *  - teto de bitrate no vídeo (não adianta banda alta para um rosto falando, e
 *    isso ainda economiza o TURN, que é cobrado pelo tráfego relayado);
 *  - ao compartilhar a TELA a preferência inverte: aí o que importa é enxergar o
 *    texto, então preserva-se resolução em vez de fluidez.
 */
async function ajustarQualidade(pc: RTCPeerConnection, modo: "camera" | "tela") {
  for (const sender of pc.getSenders()) {
    const tipo = sender.track?.kind;
    if (!tipo) continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      if (tipo === "video") {
        params.degradationPreference = modo === "tela" ? "maintain-resolution" : "maintain-framerate";
        params.encodings[0].maxBitrate = modo === "tela" ? 1_500_000 : 1_000_000;
      } else {
        params.encodings[0].networkPriority = "high";
      }
      await sender.setParameters(params);
    } catch {
      /* navegador que não aceita o ajuste simplesmente segue no padrão dele */
    }
  }
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
  const utils = trpc.useUtils();
  const containerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const telaStreamRef = useRef<MediaStream | null>(null);
  // Pipeline de fundo virtual (null = desligado) e a trilha de vídeo do "lado da
  // câmera" atualmente enviada — câmera crua OU o canvas do fundo. É a que o
  // compartilhamento de tela restaura ao parar.
  const fundoRef = useRef<ControleFundo | null>(null);
  const trilhaCameraRef = useRef<MediaStreamTrack | null>(null);
  // Canal de dados (P2P) para "mostrar arquivo": envia imagem/PDF direto ao outro
  // lado, sem passar pelo servidor. recebendoRef junta os pedaços que chegam;
  // arquivoUrlRef guarda a URL do blob atual para liberar depois.
  const dcRef = useRef<RTCDataChannel | null>(null);
  const recebendoRef = useRef<{ mime: string; nome: string; partes: ArrayBuffer[] } | null>(null);
  const arquivoUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Candidatos ICE que chegam antes de termos a descrição remota ficam na fila.
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  const [connected, setConnected] = useState(false);
  // Estado inicial vem da preferência escolhida no lobby (só é "off" se salvou "0").
  const [micOn, setMicOn] = useState(() => readLS(LS.micOn) !== "0");
  const [camOn, setCamOn] = useState(() => readLS(LS.camOn) !== "0");
  // Ocultar a própria miniatura (canto). "1" = oculta; padrão visível.
  const [selfViewHidden, setSelfViewHidden] = useState(() => readLS(LS.selfView) === "1");
  const [compartilhando, setCompartilhando] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);
  const [desfoqueSuportado, setDesfoqueSuportado] = useState(false);
  const [desfoqueLigado, setDesfoqueLigado] = useState(false);
  const [fundoAtual, setFundoAtual] = useState<string | null>(null);
  const [fundoCarregando, setFundoCarregando] = useState(false);
  const [canalPronto, setCanalPronto] = useState(false);
  const [arquivo, setArquivo] = useState<{ url: string; tipo: "imagem" | "pdf"; nome: string } | null>(null);

  // Compartilhar tela usa getDisplayMedia, uma API só de DESKTOP: o iOS Safari não
  // tem e o Chrome no Android não a suporta. Sem esta checagem, o botão aparecia no
  // celular e o clique não fazia nada (o erro caía no catch, sem feedback). Feature
  // detection: some com o botão onde a API não existe, como já fazemos no desfoque.
  const podeCompartilharTela =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function";

  // "Desktop" = tem mouse (hover + ponteiro fino). O fundo virtual roda MediaPipe
  // quadro a quadro; no celular pesaria a consulta, então só é oferecido aqui.
  const ehDesktop =
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;

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
      trilhaCameraRef.current = stream.getVideoTracks()[0] ?? null;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      // Respeita o que a pessoa escolheu no lobby: se desligou câmera/microfone
      // lá, entra na sala já desligado (antes a sala sempre começava ligada).
      const vtInicial = stream.getVideoTracks()[0];
      if (vtInicial) vtInicial.enabled = readLS(LS.camOn) !== "0";
      const atInicial = stream.getAudioTracks()[0];
      if (atInicial) atInicial.enabled = readLS(LS.micOn) !== "0";

      // O desfoque de fundo só existe em alguns navegadores/sistemas: pergunta à
      // trilha se ela sabe fazer, em vez de supor e falhar na hora do clique.
      const capacidades = stream.getVideoTracks()[0]?.getCapabilities?.() as CapacidadesComDesfoque | undefined;
      setDesfoqueSuportado(Array.isArray(capacidades?.backgroundBlur) && capacidades.backgroundBlur.includes(true));

      // 2) Conexão peer-to-peer. Os servidores ICE vêm do servidor (credenciais
      //    TURN temporárias); se a busca falhar, segue com STUN em vez de abortar.
      let servidoresIce: RTCIceServer[] = STUN_RESERVA;
      try {
        const config = await utils.videoCalls.iceServers.fetch();
        if (config?.iceServers?.length) servidoresIce = config.iceServers as RTCIceServer[];
      } catch {
        /* sem TURN: a maioria das redes conecta só com STUN */
      }
      if (disposed) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      const pc = new RTCPeerConnection({ iceServers: servidoresIce });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Canal de dados para "mostrar arquivo". Quem cria é a ofertante (terapeuta),
      // ANTES da oferta, para já ir na negociação; o paciente recebe por ondatachannel.
      if (role === "therapist") {
        configurarCanal(pc.createDataChannel("arquivos"));
      } else {
        pc.ondatachannel = (e) => configurarCanal(e.channel);
      }

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
        // Só depois de conectar os parâmetros do remetente existem de fato.
        if (pc.connectionState === "connected") void ajustarQualidade(pc, "camera");
        if (pc.connectionState === "failed") {
          onErr?.("A conexão de vídeo caiu. Tente sair e entrar de novo.");
        }
        if (pc.connectionState === "disconnected") setConnected(false);
      };

      // 3) Sinalização. Abre DEPOIS da mídia/pc prontos: quando o "start" ou a
      //    oferta chegar, já está tudo montado para responder.
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      // Sem `role` na URL: o servidor deriva o papel de quem é o usuário. O token
      // também não vai na query (evita vazar em log de acesso) — segue na 1ª
      // mensagem, abaixo.
      const token = await getAccessToken();
      const params = new URLSearchParams({ room: roomName });
      const ws = new WebSocket(`${proto}://${window.location.host}/api/ws/rtc?${params.toString()}`);
      wsRef.current = ws;

      // Autentica antes de qualquer negociação: o servidor confere no banco que
      // esta pessoa é a psicóloga ou o paciente DESTA consulta e só então repassa
      // offer/answer/ICE. Sem sessão válida, não há como iniciar a chamada.
      ws.onopen = () => {
        if (token) ws.send(JSON.stringify({ type: "auth", token }));
        else onErr?.("Sua sessão expirou. Entre novamente para iniciar a chamada.");
      };

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
      fundoRef.current?.parar();
      fundoRef.current = null;
      if (arquivoUrlRef.current) URL.revokeObjectURL(arquivoUrlRef.current);
      arquivoUrlRef.current = null;
      dcRef.current = null;
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
      writeLS(LS.micOn, track.enabled ? "1" : "0");
    }
  };
  const toggleCam = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCamOn(track.enabled);
      writeLS(LS.camOn, track.enabled ? "1" : "0");
    }
  };
  const toggleSelfView = () =>
    setSelfViewHidden((oculta) => {
      const nova = !oculta;
      writeLS(LS.selfView, nova ? "1" : "0");
      return nova;
    });

  /**
   * Compartilhar tela: troca a trilha de vídeo que já está sendo enviada
   * (replaceTrack) em vez de renegociar a conexão — o outro lado nem percebe
   * corte. Ao parar, a câmera volta na mesma trilha.
   */
  const pararCompartilhamento = useCallback(async () => {
    telaStreamRef.current?.getTracks().forEach(t => t.stop());
    telaStreamRef.current = null;
    // Volta ao "lado da câmera" atual: o fundo virtual, se estiver ligado, ou a
    // câmera crua.
    const volta = trilhaCameraRef.current ?? localStreamRef.current?.getVideoTracks()[0];
    const sender = pcRef.current?.getSenders().find(s => s.track?.kind === "video");
    if (volta && sender) await sender.replaceTrack(volta);
    // Voltou a camera: prioridade e a fluidez do rosto de novo.
    if (pcRef.current) await ajustarQualidade(pcRef.current, "camera");
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
      // Tela: preservar resolucao (ler texto) em vez de fluidez.
      if (pcRef.current) await ajustarQualidade(pcRef.current, "tela");
      setCompartilhando(true);
      // O navegador tem o próprio botão "parar de compartilhar": sem isto, a
      // pessoa pararia por lá e o outro lado ficaria vendo a tela congelada.
      trilha.onended = () => void pararCompartilhamento();
    } catch {
      /* a pessoa cancelou a escolha da tela */
    }
  };

  /**
   * Fundo virtual: substitui o fundo real por uma imagem (ou desliga). Troca a
   * trilha enviada (replaceTrack) pela do canvas processado. É mutuamente
   * exclusivo com o desfoque nativo — os dois sobre a mesma câmera se anulariam.
   */
  const trocarFundo = async (url: string | null) => {
    const camera = localStreamRef.current;
    if (!camera) return;
    const sender = pcRef.current?.getSenders().find(s => s.track?.kind === "video");
    try {
      if (url === null) {
        fundoRef.current?.parar();
        fundoRef.current = null;
        const trilhaCam = camera.getVideoTracks()[0] ?? null;
        trilhaCameraRef.current = trilhaCam;
        if (localVideoRef.current) localVideoRef.current.srcObject = camera;
        if (!compartilhando && sender && trilhaCam) await sender.replaceTrack(trilhaCam);
        setFundoAtual(null);
        return;
      }
      const img = await carregarImagemFundo(url);
      if (fundoRef.current) {
        fundoRef.current.definirImagem(img); // já rodando: só troca a imagem
      } else {
        setFundoCarregando(true);
        // Desliga o desfoque nativo antes: ele agiria sobre a câmera que alimenta
        // o fundo, borrando a própria pessoa.
        if (desfoqueLigado) {
          try {
            await camera.getVideoTracks()[0]?.applyConstraints({ advanced: [{ backgroundBlur: false } as RestricaoComDesfoque] });
          } catch { /* ignora */ }
          setDesfoqueLigado(false);
        }
        const controle = await iniciarFundoVirtual(camera, img);
        fundoRef.current = controle;
        trilhaCameraRef.current = controle.trilha;
        if (localVideoRef.current) localVideoRef.current.srcObject = controle.stream;
        if (!compartilhando && sender) await sender.replaceTrack(controle.trilha);
        setFundoCarregando(false);
      }
      setFundoAtual(url);
    } catch {
      setFundoCarregando(false);
      onError?.("Não foi possível ativar o fundo. Tente de novo.");
    }
  };

  /** Mostra um arquivo (imagem/PDF), enviado ou recebido, como overlay sobre o vídeo. */
  const mostrarArquivo = (blob: Blob, mime: string, nome: string) => {
    if (arquivoUrlRef.current) URL.revokeObjectURL(arquivoUrlRef.current);
    const url = URL.createObjectURL(blob);
    arquivoUrlRef.current = url;
    setArquivo({ url, tipo: mime === "application/pdf" ? "pdf" : "imagem", nome });
  };

  /** Fecha o arquivo em exibição. `notificar` avisa o outro lado para fechar também. */
  const fecharArquivo = (notificar = true) => {
    if (arquivoUrlRef.current) {
      URL.revokeObjectURL(arquivoUrlRef.current);
      arquivoUrlRef.current = null;
    }
    setArquivo(null);
    if (notificar && dcRef.current?.readyState === "open") {
      dcRef.current.send(JSON.stringify({ t: "fechar" }));
    }
  };

  // Prepara o canal de dados: recebe os metadados (JSON) e depois os pedaços
  // binários, remonta o arquivo e o exibe. Usado nos dois lados.
  const configurarCanal = (dc: RTCDataChannel) => {
    dc.binaryType = "arraybuffer";
    dcRef.current = dc;
    dc.onopen = () => setCanalPronto(true);
    dc.onclose = () => setCanalPronto(false);
    dc.onmessage = (e: MessageEvent) => {
      if (typeof e.data === "string") {
        let msg: { t?: string; mime?: string; nome?: string };
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg.t === "inicio") {
          recebendoRef.current = { mime: msg.mime || "", nome: msg.nome || "arquivo", partes: [] };
        } else if (msg.t === "fim" && recebendoRef.current) {
          const r = recebendoRef.current;
          mostrarArquivo(new Blob(r.partes, { type: r.mime }), r.mime, r.nome);
          recebendoRef.current = null;
        } else if (msg.t === "fechar") {
          fecharArquivo(false);
        }
      } else if (recebendoRef.current) {
        recebendoRef.current.partes.push(e.data as ArrayBuffer);
      }
    };
  };

  /** Envia um arquivo (imagem/PDF) pelo canal de dados, em pedaços, e mostra localmente. */
  const enviarArquivo = async (file: File) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    if (file.size > 20 * 1024 * 1024) {
      onError?.("Arquivo muito grande (máximo 20 MB).");
      return;
    }
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      onError?.("Envie uma imagem ou um PDF.");
      return;
    }
    const buf = await file.arrayBuffer();
    dc.send(JSON.stringify({ t: "inicio", nome: file.name, mime: file.type }));
    const CHUNK = 16 * 1024;
    for (let off = 0; off < buf.byteLength; off += CHUNK) {
      // Espera a fila baixar antes de continuar (evita estourar o buffer do canal).
      while (dc.bufferedAmount > 1_000_000) await new Promise((r) => setTimeout(r, 20));
      dc.send(buf.slice(off, off + CHUNK));
    }
    dc.send(JSON.stringify({ t: "fim" }));
    mostrarArquivo(new Blob([buf], { type: file.type }), file.type, file.name);
  };

  const alternarDesfoque = async () => {
    const trilha = localStreamRef.current?.getVideoTracks()[0];
    if (!trilha) return;
    const novo = !desfoqueLigado;
    // Desfoque e fundo virtual não convivem (agiriam sobre a mesma câmera).
    if (novo && fundoRef.current) await trocarFundo(null);
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

      {/* Meu próprio vídeo em miniatura (canto), com opção de ocultar. O <video>
          fica sempre montado (mesmo oculto) para não perder o srcObject/ref.
          bottom-16 (não bottom-3): a barra de controles é centralizada e tem
          ~272px; com a miniatura à direita na MESMA altura, as duas se cruzavam
          e os botões da direita (inclusive encerrar) caíam por cima do vídeo.
          Só deixaria de colidir acima de ~680px de largura útil — então ela sobe
          em qualquer tamanho, e encolhe no celular. */}
      <div
        className={`absolute bottom-16 right-3 h-20 w-28 sm:h-28 sm:w-40 lg:h-32 lg:w-48 ${
          selfViewHidden ? "hidden" : ""
        }`}
      >
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full rounded-md border border-white/20 object-cover shadow-lg"
        />
        <button
          type="button"
          onClick={toggleSelfView}
          title="Ocultar minha imagem"
          aria-label="Ocultar minha imagem"
          className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
        >
          <EyeOff className="h-3.5 w-3.5" />
        </button>
      </div>
      {selfViewHidden && (
        <button
          type="button"
          onClick={toggleSelfView}
          title="Mostrar minha imagem"
          className="absolute bottom-16 right-3 flex items-center gap-1.5 rounded-md border border-white/20 bg-black/60 px-2.5 py-1.5 text-xs text-white shadow-lg transition-colors hover:bg-black/80"
        >
          <Eye className="h-3.5 w-3.5" /> Minha imagem
        </button>
      )}

      {/* Arquivo (imagem/PDF) que um lado está mostrando, sobre o vídeo. A barra de
          controles fica DEPOIS no DOM, então continua por cima e acessível. */}
      {arquivo && (
        <div className="absolute inset-0 flex flex-col bg-black/95">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="truncate text-sm text-white">{arquivo.nome}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fecharArquivo(true)}
              className="shrink-0"
            >
              Fechar
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            {arquivo.tipo === "imagem" ? (
              <img src={arquivo.url} alt={arquivo.nome} className="h-full w-full object-contain" />
            ) : (
              <iframe src={arquivo.url} title={arquivo.nome} className="h-full w-full border-0 bg-white" />
            )}
          </div>
        </div>
      )}

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
        {podeCompartilharTela && (
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
        )}
        <Button
          variant="secondary"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canalPronto}
          className="rounded-full"
          aria-label="Mostrar uma imagem ou PDF"
          title={canalPronto ? "Mostrar uma imagem ou PDF" : "Disponível quando a chamada conectar"}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void enviarArquivo(f);
            e.target.value = "";
          }}
        />
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
        {ehDesktop && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={fundoAtual ? "default" : "secondary"}
                size="icon"
                className="rounded-full"
                disabled={fundoCarregando}
                aria-label="Trocar o fundo do vídeo"
                title="Trocar o fundo do vídeo"
              >
                {fundoCarregando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImageIcon className="h-4 w-4" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" className="w-64 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Fundo do vídeo</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => void trocarFundo(null)}
                  className={cn(
                    "flex aspect-video items-center justify-center rounded-md border text-[11px] text-muted-foreground transition hover:bg-muted",
                    fundoAtual === null && "ring-2 ring-primary",
                  )}
                >
                  Nenhum
                </button>
                {FUNDOS.map((f) => (
                  <button
                    key={f.url}
                    type="button"
                    onClick={() => void trocarFundo(f.url)}
                    title={f.nome}
                    aria-label={f.nome}
                    className={cn(
                      "aspect-video rounded-md border bg-cover bg-center transition hover:opacity-90",
                      fundoAtual === f.url && "ring-2 ring-primary",
                    )}
                    style={{ backgroundImage: `url(${f.url})` }}
                  />
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-tight text-muted-foreground">
                Só no computador. Pode pesar em máquinas mais fracas.
              </p>
            </PopoverContent>
          </Popover>
        )}
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
