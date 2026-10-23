import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Maximize,
  Mic,
  MicOff,
  Minimize,
  MonitorUp,
  Paperclip,
  PhoneOff,
  Settings,
  Video as VideoIcon,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { getAccessToken } from "@/lib/supabase";
import { toast } from "sonner";
import {
  carregarImagemFundo,
  iniciarFundoVirtual,
  type ControleFundo,
} from "@/lib/virtualBackground";
import { videoDaCamera } from "@/lib/camera";
import { reducaoDeResolucao, tetoDeVideoPorPessoa } from "@shared/chamadaEmGrupo";

/**
 * Videochamada peer-to-peer (WebRTC), sem provedor externo nem cartão — a dois
 * ou em GRUPO (até 4: terapia de casal; pais separados + criança).
 *
 * Em grupo é uma MALHA: uma conexão direta com cada outra pessoa (um "par" por
 * pessoa, em paresRef). O vídeo/áudio nunca passa pelo servidor, que só repassa
 * o handshake (/api/ws/rtc — ver server/signaling.ts). NAT é atravessado por STUN
 * grátis do Google; o TURN (opcional) cobre as redes mais fechadas e vem do
 * SERVIDOR com credenciais temporárias — ver server/turn.ts.
 *
 * A interface é nossa: todos os controles (microfone, câmera, compartilhar tela,
 * tela cheia e ENCERRAR) ficam numa barra única sobre o vídeo, como nos apps de vídeo.
 */

type Role = "therapist" | "patient";

/** Uma pessoa do outro lado: a conexão direta com ela e o que ela envia. */
type Par = {
  id: string;
  nome: string;
  role: Role;
  pc: RTCPeerConnection;
  /** O áudio e o vídeo que chegam dela. */
  stream: MediaStream;
  /** Canal de "mostrar arquivo" com ela. */
  dc: RTCDataChannel | null;
  /** Candidatos ICE que chegaram antes da descrição remota. */
  pendentes: RTCIceCandidateInit[];
  /** Fui eu que ofereci? (quem entra por último oferece — ver signaling.ts). */
  ofertante: boolean;
  tentativasIce: number;
  avisoDeQueda: ReturnType<typeof setTimeout> | null;
};

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
 * Selinho de engrenagem no CANTO de um ícone (microfone/câmera/alto-falante) que
 * abre a escolha do dispositivo daquele ícone — em vez de uma engrenagem central.
 * É irmão do botão principal (não aninhado), para não virar botão dentro de botão.
 */
function BadgeConfig({
  titulo,
  valor,
  lista,
  aoTrocar,
  aoAbrir,
  container,
}: {
  titulo: string;
  valor: string;
  lista: MediaDeviceInfo[];
  aoTrocar: (deviceId: string) => void;
  aoAbrir: () => void;
  /** O elemento da chamada: em tela cheia, o menu precisa nascer dentro dele. */
  container?: HTMLElement | null;
}) {
  return (
    <Popover onOpenChange={(o) => { if (o) aoAbrir(); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="absolute -bottom-1 -right-1 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-800 shadow hover:bg-neutral-100"
          aria-label={`Configurar ${titulo.toLowerCase()}`}
          title={`Escolher ${titulo.toLowerCase()}`}
        >
          <Settings className="h-2.5 w-2.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-64 p-3" container={container}>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">{titulo}</label>
        <select
          value={valor}
          onChange={(e) => aoTrocar(e.target.value)}
          className="w-full rounded-md border bg-background p-2 text-sm"
        >
          <option value="">Padrão do sistema</option>
          {lista.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || titulo}</option>
          ))}
        </select>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Qualidade da chamada, ajustada no PRÓPRIO cliente (setParameters do WebRTC) —
 * não exige servidor de mídia. Um SFU daria controle mais fino, mas faria a mídia
 * passar pelo servidor, com custo por minuto de consulta; num 1:1 não compensa.
 *
 * Numa consulta, o que não pode falhar é o ÁUDIO e a fluidez do rosto:
 *  - áudio com prioridade alta de rede;
 *  - teto de bitrate no vídeo (economiza o TURN, que é cobrado pelo tráfego
 *    relayado). O teto da câmera é 2,5 Mbps: com 1 Mbps o 720p virava papa;
 *    é só um TETO — em rede fraca o navegador manda menos;
 *  - câmera em "balanced": com "maintain-framerate" o navegador derrubava a
 *    RESOLUÇÃO primeiro a qualquer aperto de banda, e o rosto ficava borrado;
 *  - ao compartilhar a TELA a preferência inverte: aí o que importa é enxergar o
 *    texto, então preserva-se resolução em vez de fluidez.
 */
//
// Em GRUPO a banda de subida é uma só e vai para N-1 pessoas: o teto é repartido
// e, com 4 pessoas, a resolução enviada cai um pouco (ver shared/chamadaEmGrupo).
async function ajustarQualidade(pc: RTCPeerConnection, modo: "camera" | "tela", pessoas = 2) {
  for (const sender of pc.getSenders()) {
    const tipo = sender.track?.kind;
    if (!tipo) continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      if (tipo === "video") {
        params.degradationPreference = modo === "tela" ? "maintain-resolution" : "balanced";
        params.encodings[0].maxBitrate =
          modo === "tela" ? Math.max(500_000, Math.round(1_500_000 / Math.max(1, pessoas - 1))) : tetoDeVideoPorPessoa(pessoas);
        params.encodings[0].scaleResolutionDownBy = modo === "tela" ? 1 : reducaoDeResolucao(pessoas);
      } else {
        params.encodings[0].networkPriority = "high";
      }
      await sender.setParameters(params);
    } catch {
      /* navegador que não aceita o ajuste simplesmente segue no padrão dele */
    }
  }
}

/**
 * Áudio com REDUNDÂNCIA (RED, RFC 2198): cada pacote leva também uma cópia do
 * anterior, então um pacote perdido na rede não vira "picote" na fala. É o
 * `audio_codec_red` que o app do Discord declara. Custa poucos kbps a mais, nada
 * perto do vídeo — e numa consulta o que não pode falhar é a voz.
 *
 * Só reordena a preferência: se o outro navegador não tiver RED, a negociação
 * cai no Opus normal sozinha. Precisa rodar ANTES da oferta/resposta.
 */
function preferirAudioRedundante(pc: RTCPeerConnection) {
  const codecs = typeof RTCRtpReceiver !== "undefined" ? RTCRtpReceiver.getCapabilities?.("audio")?.codecs : undefined;
  if (!codecs?.some((c) => c.mimeType.toLowerCase() === "audio/red")) return;
  const red = codecs.filter((c) => c.mimeType.toLowerCase() === "audio/red");
  const resto = codecs.filter((c) => c.mimeType.toLowerCase() !== "audio/red");
  for (const t of pc.getTransceivers()) {
    if (t.sender.track?.kind !== "audio" || typeof t.setCodecPreferences !== "function") continue;
    try {
      t.setCodecPreferences([...red, ...resto]);
    } catch {
      /* navegador recusou a lista: segue com o padrão dele */
    }
  }
}

export default function WebRTCCall({
  roomName,
  role,
  onError,
  onEndCall,
  areaTelaCheia,
  extrasTelaCheia,
  aoMudarTelaCheia,
}: {
  roomName: string;
  role: Role;
  onError?: (error: string) => void;
  /** Encerrar fica na MESMA barra dos outros controles, como nos apps de vídeo. */
  onEndCall?: () => void;
  /**
   * O que cobre a tela na TELA CHEIA. Sem isto, só o vídeo — e o painel do
   * prontuário (com as Anotações) ficava de fora: a psicóloga punha tela cheia e
   * não conseguia mais escrever. Com ele, a área inteira (vídeo + prontuário +
   * chat) vai junto.
   */
  areaTelaCheia?: HTMLElement | null;
  /** Botões a mais na barra, só em tela cheia (o cabeçalho da página fica coberto). */
  extrasTelaCheia?: ReactNode;
  /** Avisa a página quando entra/sai da tela cheia (ela muda o layout do prontuário). */
  aoMudarTelaCheia?: (ativa: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const containerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  // Uma conexão por pessoa do outro lado (id da sinalização → par).
  const paresRef = useRef(new Map<string, Par>());
  // O <video> de cada pessoa na grade (id → elemento).
  const videosRemotosRef = useRef(new Map<string, HTMLVideoElement>());
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const telaStreamRef = useRef<MediaStream | null>(null);
  // Pipeline de fundo virtual (null = desligado) e a trilha de vídeo do "lado da
  // câmera" atualmente enviada — câmera crua OU o canvas do fundo. É a que o
  // compartilhamento de tela restaura ao parar.
  const fundoRef = useRef<ControleFundo | null>(null);
  const trilhaCameraRef = useRef<MediaStreamTrack | null>(null);
  // Canal de dados (P2P) para "mostrar arquivo": envia imagem/PDF direto a cada
  // pessoa, sem passar pelo servidor (um canal por par). arquivoUrlRef guarda a
  // URL do blob atual para liberar depois.
  const arquivoUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quem está do outro lado (para a grade). `conectado`: o vídeo já chegou.
  const [remotos, setRemotos] = useState<{ id: string; nome: string; role: Role; conectado: boolean }[]>([]);
  // Muda quando chega uma trilha nova: o detector de fala refaz os medidores.
  const [trilhasRemotas, setTrilhasRemotas] = useState(0);
  const connected = remotos.some((r) => r.conectado);
  // Estado inicial vem da preferência escolhida no lobby (só é "off" se salvou "0").
  const [micOn, setMicOn] = useState(() => readLS(LS.micOn) !== "0");
  const [camOn, setCamOn] = useState(() => readLS(LS.camOn) !== "0");
  // Ocultar a própria miniatura (canto). "1" = oculta; padrão visível.
  const [selfViewHidden, setSelfViewHidden] = useState(() => readLS(LS.selfView) === "1");
  const [compartilhando, setCompartilhando] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);
  /** Tela cheia simulada por CSS — o caminho do iPhone, que nao tem a API nativa. */
  const [telaCheiaPorCss, setTelaCheiaPorCss] = useState(false);
  /** Tela cheia da ÁREA (ver `areaTelaCheia`) e se ela usou a API nativa. */
  const [telaCheiaArea, setTelaCheiaArea] = useState(false);
  const nativoDaAreaRef = useRef(false);
  /**
   * O próprio elemento da chamada, para os menus (engrenagens e fundo) nascerem
   * DENTRO dele. No `<body>`, como é o padrão, eles abriam invisíveis em tela
   * cheia: na nativa só a subárvore dela é desenhada, e na por CSS ela cobre tudo.
   * Em estado, e não só no ref, porque o Radix lê o container quando o menu abre e
   * precisa que o React já tenha re-renderizado com o elemento montado.
   */
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [fundoAtual, setFundoAtual] = useState<string | null>(null);
  const [fundoCarregando, setFundoCarregando] = useState(false);
  const [canalPronto, setCanalPronto] = useState(false);
  const [arquivo, setArquivo] = useState<{ url: string; tipo: "imagem" | "pdf"; nome: string } | null>(null);
  // Dispositivos (mic/câmera/alto-falante) para trocar DENTRO da chamada.
  const [dispositivos, setDispositivos] = useState<{
    mics: MediaDeviceInfo[];
    cams: MediaDeviceInfo[];
    spks: MediaDeviceInfo[];
  }>({ mics: [], cams: [], spks: [] });
  const [micAtual, setMicAtual] = useState(() => readLS(LS.mic));
  const [camAtual, setCamAtual] = useState(() => readLS(LS.cam));
  const [spkAtual, setSpkAtual] = useState(() => readLS(LS.spk));
  // "Quem está falando": brilho verde na tela (o outro lado) e na miniatura (eu).
  const [localFalando, setLocalFalando] = useState(false);
  // Altura da barra de controles: no celular ela quebra em 2 linhas, e a
  // miniatura da própria câmera precisa subir junto para não ficar por cima.
  const barraRef = useRef<HTMLDivElement>(null);
  const [alturaBarra, setAlturaBarra] = useState(48);
  // Quem está falando, por pessoa (id → falando).
  const [falando, setFalando] = useState<Record<string, boolean>>({});
  // Volume do OUTRO lado (0–100), só no SEU aparelho — mexe no <video>, não na
  // trilha. Em 0 você para de ouvir a pessoa mesmo com o mic dela ligado.
  const [volumeRemoto, setVolumeRemoto] = useState(100);
  const volumeRef = useRef(100);

  // Compartilhar tela usa getDisplayMedia, uma API só de DESKTOP: o iOS Safari não
  // tem e o Chrome no Android não a suporta. Sem esta checagem, o botão aparecia no
  // celular e o clique não fazia nada (o erro caía no catch, sem feedback). Feature
  // detection: some com o botão onde a API não existe, como já fazemos no desfoque.
  const podeCompartilharTela =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function";

  // Trocar o ALTO-FALANTE depende de setSinkId, que o Safari não implementa (nem no
  // Mac nem no iPhone) — são ~47% de suporte global. Sem esta checagem o seletor
  // aparecia lá, a pessoa escolhia um dispositivo e nada acontecia, em silêncio: o
  // código fazia `if (!el?.setSinkId) return;`. Mesmo problema do botão de tela
  // cheia, e a mesma solução que já usamos no compartilhar tela.
  const podeTrocarAltoFalante =
    typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

  /** O vídeo que este aparelho está enviando AGORA: a tela, o fundo virtual ou a câmera. */
  const videoEnviado = () =>
    telaStreamRef.current?.getVideoTracks()[0] ??
    trilhaCameraRef.current ??
    localStreamRef.current?.getVideoTracks()[0] ??
    null;

  /** Troca a trilha enviada para TODAS as pessoas (replaceTrack: sem renegociar). */
  const trocarEnvio = async (tipo: "audio" | "video", trilha: MediaStreamTrack) => {
    await Promise.all(
      Array.from(paresRef.current.values()).map((par) =>
        par.pc
          .getSenders()
          .find((s) => s.track?.kind === tipo)
          ?.replaceTrack(trilha)
          .catch(() => {}),
      ),
    );
  };

  /** Teto de banda/resolução de cada envio, conforme quantas pessoas há na chamada. */
  const reajustarQualidade = () => {
    const pessoas = paresRef.current.size + 1;
    const modo = telaStreamRef.current ? "tela" : "camera";
    paresRef.current.forEach((par) => {
      if (par.pc.connectionState === "connected") void ajustarQualidade(par.pc, modo, pessoas);
    });
  };

  const atualizarCanalPronto = () =>
    setCanalPronto(Array.from(paresRef.current.values()).some((p) => p.dc?.readyState === "open"));

  /** Liga o <video> de uma pessoa ao que chega dela, com o alto-falante e o volume escolhidos. */
  const ligarVideo = (el: HTMLVideoElement, stream: MediaStream) => {
    if (el.srcObject !== stream) el.srcObject = stream;
    el.volume = volumeRef.current / 100;
    el.muted = volumeRef.current === 0;
    const spkId = readLS(LS.spk);
    const comSaida = el as HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> };
    if (spkId && comSaida.setSinkId) comSaida.setSinkId(spkId).catch(() => {});
    el.play?.().catch(() => {});
  };

  useEffect(() => {
    let disposed = false;
    const onErr = onError;
    const pares = paresRef.current;
    // Os servidores ICE vêm do servidor (credenciais TURN temporárias) em setup().
    let servidoresIce: RTCIceServer[] = STUN_RESERVA;

    const send = (payload: unknown) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    };

    const drainCandidates = async (par: Par) => {
      const fila = par.pendentes;
      par.pendentes = [];
      for (const cand of fila) {
        try {
          await par.pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch {
          /* candidato inválido/duplicado — ignora */
        }
      }
    };

    /** Fecha a conexão com uma pessoa (ela saiu da sala). */
    const fecharPar = (id: string) => {
      const par = pares.get(id);
      if (!par) return;
      if (par.avisoDeQueda) clearTimeout(par.avisoDeQueda);
      try {
        par.pc.close();
      } catch {
        /* já fechada */
      }
      pares.delete(id);
      videosRemotosRef.current.delete(id);
      setRemotos((rs) => rs.filter((r) => r.id !== id));
      setFalando(({ [id]: _saiu, ...resto }) => resto);
      atualizarCanalPronto();
      // Uma pessoa a menos: sobra banda para cada uma das outras.
      reajustarQualidade();
    };

    /**
     * Abre a conexão direta com uma pessoa. `ofertante`: sou eu quem oferece — o
     * que acontece quando EU cheguei depois dela (ver server/signaling.ts).
     */
    const criarPar = (id: string, nome: string, papel: Role, ofertante: boolean): Par => {
      const existente = pares.get(id);
      if (existente) return existente;
      const pc = new RTCPeerConnection({ iceServers: servidoresIce });
      const par: Par = {
        id,
        nome,
        role: papel,
        pc,
        stream: new MediaStream(),
        dc: null,
        pendentes: [],
        ofertante,
        tentativasIce: 0,
        avisoDeQueda: null,
      };
      pares.set(id, par);

      // Envia o que está saindo AGORA: quem entra no meio de um compartilhamento
      // de tela (ou com o fundo virtual ligado) já recebe a tela / o fundo.
      const local = localStreamRef.current;
      const audio = local?.getAudioTracks()[0];
      const video = videoEnviado();
      if (local && audio) pc.addTrack(audio, local);
      if (local && video) pc.addTrack(video, local);
      preferirAudioRedundante(pc);

      // Canal de "mostrar arquivo". Quem oferece cria, ANTES da oferta, para já ir
      // na negociação; o outro lado recebe por ondatachannel.
      if (ofertante) configurarCanal(par, pc.createDataChannel("arquivos"));
      else pc.ondatachannel = (e) => configurarCanal(par, e.channel);

      pc.ontrack = (event) => {
        par.stream.addTrack(event.track);
        const el = videosRemotosRef.current.get(id);
        if (el) ligarVideo(el, par.stream);
        setRemotos((rs) => rs.map((r) => (r.id === id ? { ...r, conectado: true } : r)));
        setTrilhasRemotas((n) => n + 1);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) send({ type: "candidate", to: id, candidate: event.candidate.toJSON() });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          par.tentativasIce = 0;
          if (par.avisoDeQueda) clearTimeout(par.avisoDeQueda);
          par.avisoDeQueda = null;
          setRemotos((rs) => rs.map((r) => (r.id === id ? { ...r, conectado: true } : r)));
          // Só depois de conectar os parâmetros do remetente existem de fato. E o
          // teto de cada envio depende de quantas pessoas há: reajusta todos.
          reajustarQualidade();
        }
        if (pc.connectionState === "failed") {
          // A rede caiu (troca de Wi-Fi para 4G, por exemplo). Antes a chamada
          // morria aqui e era preciso sair e entrar. Agora quem ofereceu esta
          // conexão renegocia só o caminho de rede (ICE restart): a mídia e a
          // sala continuam as mesmas. O outro lado responde pelo fluxo normal.
          if (par.ofertante && par.tentativasIce < 3 && pc.signalingState === "stable") {
            par.tentativasIce++;
            void (async () => {
              try {
                const offer = await pc.createOffer({ iceRestart: true });
                await pc.setLocalDescription(offer);
                send({ type: "offer", to: id, sdp: offer.sdp });
              } catch {
                /* a pc foi fechada no meio do caminho */
              }
            })();
          }
          // Só desiste e avisa se nem a reconexão resolver. A dois, a chamada
          // acabou; em grupo, só a ligação com ESSA pessoa — as outras seguem.
          par.avisoDeQueda ??= setTimeout(() => {
            if (disposed || pc.connectionState === "connected") return;
            if (pares.size <= 1) {
              onErr?.("A conexão de vídeo caiu. Tente sair e entrar de novo.");
              return;
            }
            // Em grupo, tira o quadro dela: se a pessoa fechou o navegador e o
            // aviso de saída não chegou (o Cloudflare do Render às vezes engole o
            // "close"), o quadro ficaria preso em "Conectando…" para sempre. Se
            // ela voltar, entra de novo como qualquer um.
            toast.error(`A conexão com ${par.nome || "um participante"} caiu.`);
            fecharPar(id);
          }, 20_000);
        }
        if (pc.connectionState === "disconnected") {
          setRemotos((rs) => rs.map((r) => (r.id === id ? { ...r, conectado: false } : r)));
        }
      };

      setRemotos((rs) => [...rs.filter((r) => r.id !== id), { id, nome, role: papel, conectado: false }]);
      return par;
    };

    const oferecer = async (par: Par) => {
      const offer = await par.pc.createOffer();
      await par.pc.setLocalDescription(offer);
      send({ type: "offer", to: par.id, sdp: offer.sdp });
    };

    const setup = async () => {
      // 1) Mídia local, com os dispositivos escolhidos no lobby (se houver).
      const micId = readLS(LS.mic);
      const camId = readLS(LS.cam);

      // `navigator.mediaDevices` NÃO EXISTE fora de contexto seguro e em vários
      // navegadores embutidos de aplicativo (o do WhatsApp, Instagram, Facebook).
      // Sem esta checagem o TypeError caía no catch abaixo e a pessoa lia "verifique
      // as permissões" — ela ia conferir permissões que já estavam certas e travava,
      // sem saber que o problema era o navegador. É o caso do paciente que abre o
      // link da consulta direto do WhatsApp.
      if (!navigator.mediaDevices?.getUserMedia) {
        onErr?.(
          "Este navegador não permite usar câmera e microfone. Se você abriu o link dentro de outro aplicativo (WhatsApp, Instagram), toque em 'Abrir no navegador' e use o Chrome ou o Safari.",
        );
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoDaCamera(camId || undefined),
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

      // 2) Servidores ICE do servidor (credenciais TURN temporárias); se a busca
      //    falhar, segue com STUN em vez de abortar.
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

      // 3) Sinalização. Abre DEPOIS da mídia pronta: quando a lista de pessoas ou
      //    uma oferta chegar, já dá para montar as conexões.
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      // Sem `role` na URL: o servidor deriva o papel de quem é o usuário. O token
      // também não vai na query (evita vazar em log de acesso) — segue na 1ª
      // mensagem, abaixo.
      const token = await getAccessToken();
      const params = new URLSearchParams({ room: roomName });
      const ws = new WebSocket(`${proto}://${window.location.host}/api/ws/rtc?${params.toString()}`);
      wsRef.current = ws;

      // Autentica antes de qualquer negociação: o servidor confere no banco que
      // esta pessoa é da consulta e só então repassa offer/answer/ICE.
      ws.onopen = () => {
        if (token) ws.send(JSON.stringify({ type: "auth", token }));
        else onErr?.("Sua sessão expirou. Entre novamente para iniciar a chamada.");
      };

      ws.onmessage = async (event) => {
        let msg: {
          type?: string;
          id?: string;
          from?: string;
          nome?: string;
          role?: Role;
          sdp?: string;
          candidate?: RTCIceCandidateInit;
          peers?: { id: string; nome: string; role: Role }[];
        };
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (disposed) return;

        // Cheguei: ofereço para cada pessoa que já estava na sala.
        if (msg.type === "welcome") {
          for (const p of msg.peers ?? []) await oferecer(criarPar(p.id, p.nome, p.role, true));
          return;
        }
        // Alguém chegou depois de mim: ele vai oferecer; preparo a conexão.
        if (msg.type === "peer-joined" && msg.id) {
          criarPar(msg.id, msg.nome ?? "", msg.role ?? "patient", false);
          return;
        }
        if (msg.type === "peer-left" && msg.id) {
          fecharPar(msg.id);
          return;
        }

        const de = msg.from;
        if (!de) return;
        if (msg.type === "offer" && msg.sdp) {
          const par = criarPar(de, "", "patient", false);
          await par.pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
          await drainCandidates(par);
          const answer = await par.pc.createAnswer();
          await par.pc.setLocalDescription(answer);
          send({ type: "answer", to: de, sdp: answer.sdp });
          return;
        }
        const par = pares.get(de);
        if (!par) return;
        if (msg.type === "answer" && msg.sdp) {
          await par.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
          await drainCandidates(par);
          return;
        }
        if (msg.type === "candidate" && msg.candidate) {
          if (par.pc.remoteDescription) {
            try {
              await par.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } catch {
              /* ignora */
            }
          } else {
            par.pendentes.push(msg.candidate);
          }
        }
      };

      ws.onclose = (e) => {
        if (disposed) return;
        if (e.code === 4009) onErr?.("Esta chamada já está com 4 pessoas, o máximo.");
        else if (e.code === 4000) onErr?.("Você entrou nesta chamada em outra aba ou aparelho.");
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
      pares.forEach((par) => {
        if (par.avisoDeQueda) clearTimeout(par.avisoDeQueda);
        try {
          par.pc.close();
        } catch {
          /* já fechada */
        }
      });
      pares.clear();
      videosRemotosRef.current.clear();
      fundoRef.current?.parar();
      fundoRef.current = null;
      if (arquivoUrlRef.current) URL.revokeObjectURL(arquivoUrlRef.current);
      arquivoUrlRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      wsRef.current = null;
      localStreamRef.current = null;
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
  const aplicarVolumeRemoto = (v: number) => {
    setVolumeRemoto(v);
    volumeRef.current = v;
    videosRemotosRef.current.forEach((el) => {
      el.volume = v / 100;
      el.muted = v === 0;
    });
  };

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
    if (volta) await trocarEnvio("video", volta);
    // Voltou a camera: prioridade e a fluidez do rosto de novo.
    reajustarQualidade();
    setCompartilhando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const compartilharTela = async () => {
    if (compartilhando) {
      await pararCompartilhamento();
      return;
    }
    try {
      const tela = await navigator.mediaDevices.getDisplayMedia({
        // Teto de 30 fps, como o Discord: tela não precisa de mais, e a banda que
        // sobra vai para a nitidez do texto.
        video: { frameRate: { max: 30 } },
        // Chrome: tira a PRÓPRIA aba da chamada da lista (compartilhá-la gera o
        // "espelho infinito") e oferece "compartilhar esta aba" para trocar de aba
        // sem parar e recomeçar. Os outros navegadores ignoram as duas opções.
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include",
      } as DisplayMediaStreamOptions);
      const trilha = tela.getVideoTracks()[0];
      // Avisa o codificador que é TEXTO/detalhe, não movimento: sob pouca banda ele
      // derruba quadros em vez de borrar a letra. Complementa o
      // "maintain-resolution" de ajustarQualidade.
      if (trilha && "contentHint" in trilha) trilha.contentHint = "detail";
      if (!trilha) {
        tela.getTracks().forEach(t => t.stop());
        return;
      }
      telaStreamRef.current = tela;
      // Para TODAS as pessoas da chamada.
      await trocarEnvio("video", trilha);
      // Tela: preservar resolucao (ler texto) em vez de fluidez.
      reajustarQualidade();
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
    try {
      if (url === null) {
        fundoRef.current?.parar();
        fundoRef.current = null;
        const trilhaCam = camera.getVideoTracks()[0] ?? null;
        trilhaCameraRef.current = trilhaCam;
        if (localVideoRef.current) localVideoRef.current.srcObject = camera;
        if (!compartilhando && trilhaCam) await trocarEnvio("video", trilhaCam);
        setFundoAtual(null);
        return;
      }
      const img = await carregarImagemFundo(url);
      if (fundoRef.current) {
        fundoRef.current.definirImagem(img); // já rodando: só troca a imagem
      } else {
        setFundoCarregando(true);
        const controle = await iniciarFundoVirtual(camera, img);
        fundoRef.current = controle;
        trilhaCameraRef.current = controle.trilha;
        if (localVideoRef.current) localVideoRef.current.srcObject = controle.stream;
        if (!compartilhando) await trocarEnvio("video", controle.trilha);
        setFundoCarregando(false);
      }
      setFundoAtual(url);
    } catch {
      setFundoCarregando(false);
      toast.error("Não foi possível ativar o fundo. Tente de novo.");
    }
  };

  // Lista os dispositivos disponíveis (para o seletor da chamada). Os rótulos só
  // vêm preenchidos depois da permissão de mídia — que já foi dada ao entrar.
  const atualizarDispositivos = async () => {
    try {
      const lista = await navigator.mediaDevices.enumerateDevices();
      setDispositivos({
        mics: lista.filter((d) => d.kind === "audioinput"),
        cams: lista.filter((d) => d.kind === "videoinput"),
        spks: lista.filter((d) => d.kind === "audiooutput"),
      });
    } catch {
      /* enumerateDevices pode falhar sem permissão; ignora */
    }
  };

  // Troca o MICROFONE em uso (ou recupera o áudio quando o dispositivo some, ex.:
  // tirar o fone): recaptura a trilha e a injeta na conexão sem renegociar.
  const aplicarMic = async (deviceId?: string) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    let novo: MediaStream;
    try {
      novo = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
    } catch {
      toast.error("Não foi possível acessar o microfone.");
      return;
    }
    const nova = novo.getAudioTracks()[0];
    if (!nova) return;
    const antiga = stream.getAudioTracks()[0];
    nova.enabled = antiga ? antiga.enabled : micOn; // preserva mudo/ligado
    await trocarEnvio("audio", nova);
    if (antiga) {
      stream.removeTrack(antiga);
      antiga.stop();
    }
    stream.addTrack(nova);
    const id = nova.getSettings().deviceId;
    if (id) {
      writeLS(LS.mic, id);
      setMicAtual(id);
    }
  };

  // Troca a CÂMERA em uso. Se o fundo virtual estiver ligado, reinicia o pipeline
  // com a câmera nova; senão manda a câmera direto (a não ser que a tela esteja
  // sendo compartilhada, aí só atualiza a fonte que volta ao parar de compartilhar).
  const aplicarCam = async (deviceId?: string) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    let novo: MediaStream;
    try {
      novo = await navigator.mediaDevices.getUserMedia({
        video: videoDaCamera(deviceId),
      });
    } catch {
      toast.error("Não foi possível acessar a câmera.");
      return;
    }
    const nova = novo.getVideoTracks()[0];
    if (!nova) return;
    const antiga = stream.getVideoTracks()[0];
    nova.enabled = antiga ? antiga.enabled : camOn;
    const tinhaFundo = fundoAtual;
    if (fundoRef.current) {
      fundoRef.current.parar();
      fundoRef.current = null;
    }
    if (antiga) {
      stream.removeTrack(antiga);
      antiga.stop();
    }
    stream.addTrack(nova);
    trilhaCameraRef.current = nova;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    if (tinhaFundo) {
      await trocarFundo(tinhaFundo); // reinicia o fundo com a câmera nova
    } else if (!compartilhando) {
      await trocarEnvio("video", nova);
    }
    const id = nova.getSettings().deviceId;
    if (id) {
      writeLS(LS.cam, id);
      setCamAtual(id);
    }
  };

  // Troca o ALTO-FALANTE (só onde o navegador oferece setSinkId) — de todas as
  // pessoas da chamada.
  const aplicarAltoFalante = async (deviceId: string) => {
    try {
      await Promise.all(
        Array.from(videosRemotosRef.current.values()).map((el) =>
          (el as HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(deviceId),
        ),
      );
      writeLS(LS.spk, deviceId);
      setSpkAtual(deviceId);
    } catch {
      toast.error("Não foi possível trocar o alto-falante.");
    }
  };

  // Recuperação automática quando um dispositivo é conectado/removido (ex.: tirar
  // o fone). Um ref sempre com a versão mais nova evita closure velha no listener.
  const aoTrocarDispositivos = () => {
    void atualizarDispositivos();
    const at = localStreamRef.current?.getAudioTracks()[0];
    if (at && at.readyState === "ended") void aplicarMic();
    const vt = localStreamRef.current?.getVideoTracks()[0];
    if (vt && vt.readyState === "ended") void aplicarCam();
  };
  const aoTrocarDispositivosRef = useRef(aoTrocarDispositivos);
  aoTrocarDispositivosRef.current = aoTrocarDispositivos;

  useEffect(() => {
    void atualizarDispositivos();
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const h = () => aoTrocarDispositivosRef.current();
    md.addEventListener("devicechange", h);
    return () => md.removeEventListener("devicechange", h);
  }, []);

  /** Mostra um arquivo (imagem/PDF), enviado ou recebido, como overlay sobre o vídeo. */
  const mostrarArquivo = (blob: Blob, mime: string, nome: string) => {
    if (arquivoUrlRef.current) URL.revokeObjectURL(arquivoUrlRef.current);
    const url = URL.createObjectURL(blob);
    arquivoUrlRef.current = url;
    setArquivo({ url, tipo: mime === "application/pdf" ? "pdf" : "imagem", nome });
  };

  /** Os canais de arquivo abertos (um por pessoa). */
  const canaisAbertos = () =>
    Array.from(paresRef.current.values())
      .map((p) => p.dc)
      .filter((dc): dc is RTCDataChannel => dc?.readyState === "open");

  /** Fecha o arquivo em exibição. `notificar` avisa as outras pessoas para fechar também. */
  const fecharArquivo = (notificar = true) => {
    if (arquivoUrlRef.current) {
      URL.revokeObjectURL(arquivoUrlRef.current);
      arquivoUrlRef.current = null;
    }
    setArquivo(null);
    if (notificar) canaisAbertos().forEach((dc) => dc.send(JSON.stringify({ t: "fechar" })));
  };

  // Prepara o canal de dados com uma pessoa: recebe os metadados (JSON) e depois
  // os pedaços binários, remonta o arquivo e o exibe. Cada canal junta os pedaços
  // do SEU arquivo (em grupo, duas pessoas podem mandar ao mesmo tempo).
  const configurarCanal = (par: Par, dc: RTCDataChannel) => {
    dc.binaryType = "arraybuffer";
    par.dc = dc;
    let recebendo: { mime: string; nome: string; partes: ArrayBuffer[] } | null = null;
    dc.onopen = () => atualizarCanalPronto();
    dc.onclose = () => atualizarCanalPronto();
    dc.onmessage = (e: MessageEvent) => {
      if (typeof e.data === "string") {
        let msg: { t?: string; mime?: string; nome?: string };
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg.t === "inicio") {
          recebendo = { mime: msg.mime || "", nome: msg.nome || "arquivo", partes: [] };
        } else if (msg.t === "fim" && recebendo) {
          mostrarArquivo(new Blob(recebendo.partes, { type: recebendo.mime }), recebendo.mime, recebendo.nome);
          recebendo = null;
        } else if (msg.t === "fechar") {
          fecharArquivo(false);
        }
      } else if (recebendo) {
        recebendo.partes.push(e.data as ArrayBuffer);
      }
    };
  };

  /** Envia um arquivo (imagem/PDF) a todas as pessoas, em pedaços, e mostra localmente. */
  const enviarArquivo = async (file: File) => {
    const canais = canaisAbertos();
    if (canais.length === 0) {
      toast.error("O envio de arquivos fica disponível quando a chamada conecta.");
      return;
    }
    // Erros de validação/envio usam toast: um erro aqui NÃO pode derrubar a
    // chamada (o onError do componente encerra a videochamada no pai).
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máximo 20 MB).");
      return;
    }
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Envie uma imagem ou um PDF.");
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const CHUNK = 16 * 1024;
      for (const dc of canais) {
        // Se uma pessoa sair no meio, as outras ainda recebem.
        try {
          dc.send(JSON.stringify({ t: "inicio", nome: file.name, mime: file.type }));
          for (let off = 0; off < buf.byteLength; off += CHUNK) {
            if (dc.readyState !== "open") throw new Error("canal fechado");
            // Espera a fila baixar antes de continuar (evita estourar o buffer do canal).
            while (dc.bufferedAmount > 1_000_000) await new Promise((r) => setTimeout(r, 20));
            dc.send(buf.slice(off, off + CHUNK));
          }
          dc.send(JSON.stringify({ t: "fim" }));
        } catch {
          /* este canal fechou: segue para os outros */
        }
      }
      mostrarArquivo(new Blob([buf], { type: file.type }), file.type, file.name);
    } catch {
      toast.error("Não foi possível enviar o arquivo. A chamada continua normalmente.");
    }
  };

  /**
   * Tela cheia. O iPhone (Safari) NÃO implementa requestFullscreen em elemento que
   * não seja <video> — e o `?.()` que estava aqui transformava isso num no-op
   * SILENCIOSO: a pessoa tocava no botão e não acontecia nada, sem erro nenhum.
   *
   * Não dá para usar `video.webkitEnterFullscreen()` (o único caminho nativo no
   * iPhone): ele abre o player NATIVO do iOS por cima, escondendo nossos controles.
   * Numa consulta, ficar sem o botão de desligar o microfone ou encerrar a chamada é
   * pior do que não ter tela cheia.
   *
   * Então: tenta a API real (com o prefixo webkit para navegadores mais antigos) e,
   * quando ela não existe, cai para uma tela cheia por CSS — que funciona em
   * qualquer navegador e preserva a barra de controles.
   */
  // Um estado so para a UI: o botao nao precisa saber QUAL mecanismo esta em uso.
  const emTelaCheia = areaTelaCheia ? telaCheiaArea : telaCheia || telaCheiaPorCss;
  useEffect(() => {
    aoMudarTelaCheia?.(emTelaCheia);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emTelaCheia]);

  /**
   * Onde os menus (engrenagens e fundo) nascem — e por que isso MUDA com a tela cheia.
   *
   * Fora da tela cheia, a chamada é uma caixa pequena com `overflow-hidden`; um
   * menu dentro dela seria CORTADO pela borda (medido: no celular deitado a caixa
   * tem ~210px e o menu passava do topo). Então ali vale o padrão, o `<body>`.
   *
   * Em tela cheia, o `<body>` é que não serve: na nativa só a subárvore da tela
   * cheia é desenhada e na por CSS ela cobre tudo — o menu abria invisível. Lá
   * dentro ele aparece, e sem risco de corte, porque a caixa é a tela inteira.
   */
  //
  // Com `areaTelaCheia` o caso é outro: a tela cheia nativa é da PÁGINA inteira,
  // então o `<body>` é desenhado; e a caixa do vídeo não é a tela toda (o
  // prontuário fica ao lado), então dentro dela o menu poderia ser cortado.
  const containerDosMenus = emTelaCheia && !areaTelaCheia ? containerEl : null;

  /**
   * Tela cheia da ÁREA (vídeo + prontuário + chat). O navegador põe em tela cheia
   * a PÁGINA (documentElement) e a área se estica por CSS sobre o resto. Pôr em
   * tela cheia só a área não serviria: menus e diálogos (emoji, GIF, modelos,
   * "Encerrar?") nascem no `<body>`, e na tela cheia nativa só a subárvore dela é
   * desenhada — abririam invisíveis. Sem a API (iPhone), fica só o CSS.
   */
  const alternarTelaCheiaDaArea = async () => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    if (telaCheiaArea) {
      setTelaCheiaArea(false);
      if (nativoDaAreaRef.current) {
        nativoDaAreaRef.current = false;
        if (document.fullscreenElement ?? doc.webkitFullscreenElement) {
          try {
            await (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
          } catch {
            /* já tinha saído */
          }
        }
      }
      return;
    }
    setTelaCheiaArea(true);
    const raiz = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    const pedir = raiz.requestFullscreen ?? raiz.webkitRequestFullscreen;
    if (!pedir) return;
    try {
      await pedir.call(raiz);
      nativoDaAreaRef.current = true;
    } catch {
      // Recusou (permissão, iframe): fica a versão por CSS, que já está valendo.
    }
  };

  const alternarTelaCheia = async () => {
    if (areaTelaCheia) {
      await alternarTelaCheiaDaArea();
      return;
    }
    const elemento = containerRef.current;
    if (!elemento) return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };

    if (document.fullscreenElement ?? doc.webkitFullscreenElement) {
      await (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      return;
    }
    if (telaCheiaPorCss) {
      setTelaCheiaPorCss(false);
      return;
    }

    const pedirNativo =
      elemento.requestFullscreen ??
      (elemento as HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen;
    if (pedirNativo) {
      try {
        await pedirNativo.call(elemento);
        return;
      } catch {
        // Alguns navegadores expõem a função e mesmo assim recusam (permissão,
        // iframe sem allow="fullscreen"). Cai para o CSS em vez de não fazer nada.
      }
    }
    setTelaCheiaPorCss(true);
  };

  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    const aoMudar = () => {
      const ativo = Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement);
      setTelaCheia(ativo);
      // Saiu pelo Esc ou pelo gesto do navegador: a área volta junto.
      if (!ativo && nativoDaAreaRef.current) {
        nativoDaAreaRef.current = false;
        setTelaCheiaArea(false);
      }
    };
    document.addEventListener("fullscreenchange", aoMudar);
    document.addEventListener("webkitfullscreenchange", aoMudar);
    return () => {
      document.removeEventListener("fullscreenchange", aoMudar);
      document.removeEventListener("webkitfullscreenchange", aoMudar);
    };
  }, []);

  // Na tela cheia por CSS não existe o "sair" do navegador: travamos a rolagem do
  // fundo (senão a página corre atrás do vídeo) e ouvimos o Esc, que a pessoa
  // espera que funcione por ser o atalho da tela cheia de verdade.
  useEffect(() => {
    if (!telaCheiaPorCss) return;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setTelaCheiaPorCss(false);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [telaCheiaPorCss]);

  // Área em tela cheia: a página marca o elemento (data-tela-cheia) e o estica
  // por CSS. Trava a rolagem do fundo e, sem a API nativa, ouve o Esc.
  useEffect(() => {
    if (!areaTelaCheia || !telaCheiaArea) return;
    areaTelaCheia.dataset.telaCheia = "sim";
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape" && !nativoDaAreaRef.current) setTelaCheiaArea(false);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      delete areaTelaCheia.dataset.telaCheia;
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [areaTelaCheia, telaCheiaArea]);

  // Saiu da página da chamada com a PÁGINA em tela cheia: sai dela também.
  useEffect(
    () => () => {
      if (nativoDaAreaRef.current && document.fullscreenElement) void document.exitFullscreen?.()?.catch(() => {});
    },
    [],
  );

  useEffect(() => {
    const barra = barraRef.current;
    if (!barra || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => setAlturaBarra(Math.round(barra.getBoundingClientRect().height)));
    obs.observe(barra);
    return () => obs.disconnect();
  }, []);

  // Detector de fala: mede o nível de áudio de cada pessoa e acende o brilho
  // verde de quem está falando. Refaz quando chega trilha nova ou alguém sai.
  const chaveDosRemotos = remotos.filter((r) => r.conectado).map((r) => r.id).join(",");
  useEffect(() => {
    if (!connected) return;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    type Item = { analyser: AnalyserNode; buf: Uint8Array<ArrayBuffer>; set: (v: boolean) => void; ate: number; ultimo: boolean };
    const itens: Item[] = [];
    const criar = (stream: MediaStream | null, set: (v: boolean) => void) => {
      if (!stream || stream.getAudioTracks().length === 0) return;
      try {
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an); // só para medir; NÃO liga no destino (não gera eco)
        itens.push({ analyser: an, buf: new Uint8Array(new ArrayBuffer(an.fftSize)), set, ate: 0, ultimo: false });
      } catch {
        /* navegador sem Web Audio p/ este stream: sem brilho, sem quebrar a chamada */
      }
    };
    criar(localStreamRef.current, setLocalFalando);
    paresRef.current.forEach((par, id) => criar(par.stream, (v) => setFalando((f) => ({ ...f, [id]: v }))));
    const id = window.setInterval(() => {
      const agora = Date.now();
      for (const it of itens) {
        it.analyser.getByteTimeDomainData(it.buf);
        let soma = 0;
        for (let i = 0; i < it.buf.length; i++) {
          const d = it.buf[i] - 128;
          soma += d * d;
        }
        const rms = Math.sqrt(soma / it.buf.length);
        if (rms > 8) it.ate = agora + 350; // falando; segura 350ms p/ não piscar
        const falando = agora < it.ate;
        if (falando !== it.ultimo) {
          it.ultimo = falando;
          it.set(falando);
        }
      }
    }, 120);
    return () => {
      window.clearInterval(id);
      void ctx.close().catch(() => {});
      setLocalFalando(false);
      setFalando({});
    };
  }, [connected, chaveDosRemotos, trilhasRemotas]);

  return (
    <div
      ref={(el) => {
        containerRef.current = el;
        setContainerEl(el);
      }}
      className={cn(
        "relative h-full w-full overflow-hidden rounded-lg bg-black",
        // z-[60] fica acima dos painéis de chat (z-50): na tela cheia NATIVA eles
        // ficariam de fora, então a versão por CSS cobre também, para o botão se
        // comportar igual nos dois caminhos. 100dvh (e não 100vh) por causa da barra
        // do navegador no celular, que no 100vh corta o rodapé com os controles.
        telaCheiaPorCss && "fixed inset-0 z-[60] h-[100dvh] w-screen rounded-none",
      )}
    >
      {/* As pessoas do outro lado. Uma só: ocupa a tela toda, como sempre foi.
          Em grupo: grade (2 lado a lado — no celular em pé, uma sobre a outra;
          3 = duas em cima e uma larga embaixo), com o nome e o brilho de quem fala. */}
      <div
        className={cn(
          "grid h-full w-full auto-rows-fr",
          remotos.length <= 1 ? "grid-cols-1" : "gap-1 p-1",
          remotos.length === 2 && "grid-cols-1 sm:grid-cols-2",
          remotos.length >= 3 && "grid-cols-2",
        )}
      >
        {remotos.map((r, i) => {
          const emGrupo = remotos.length > 1;
          return (
            <div
              key={r.id}
              data-pessoa={r.id}
              className={cn(
                "relative min-h-0 overflow-hidden bg-black",
                emGrupo && "rounded-md bg-neutral-900",
                remotos.length === 3 && i === 2 && "col-span-2",
              )}
            >
              <video
                ref={(el) => {
                  if (el) {
                    videosRemotosRef.current.set(r.id, el);
                    const par = paresRef.current.get(r.id);
                    if (par) ligarVideo(el, par.stream);
                  } else {
                    videosRemotosRef.current.delete(r.id);
                  }
                }}
                autoPlay
                playsInline
                className={cn("h-full w-full", emGrupo ? "object-cover" : "object-contain")}
              />
              {/* Brilho verde quando ESSA pessoa está falando. */}
              <div
                className={cn(
                  "pointer-events-none absolute inset-0 ring-4 ring-inset ring-green-400/80 transition-opacity duration-150",
                  emGrupo ? "rounded-md" : "rounded-lg",
                  falando[r.id] ? "opacity-100" : "opacity-0",
                )}
              />
              {emGrupo && (
                <span className="pointer-events-none absolute left-2 top-2 max-w-[80%] truncate rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-medium text-white">
                  {r.nome || (r.role === "therapist" ? "Psicóloga" : "Participante")}
                </span>
              )}
              {emGrupo && !r.conectado && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Conectando…
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

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
          Fica ACIMA da barra de controles (que é centralizada): na mesma altura,
          as duas se cruzavam e os botões da direita (inclusive encerrar) caíam
          por cima do vídeo. A altura vem medida, porque no celular a barra
          quebra em 2 linhas — com um `bottom` fixo, a miniatura cobria a de cima. */}
      <div
        className={`absolute right-3 h-20 w-28 sm:h-28 sm:w-40 lg:h-32 lg:w-48 ${
          selfViewHidden ? "hidden" : ""
        }`}
        style={{ bottom: alturaBarra + 20 }}
      >
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full rounded-md object-cover shadow-lg transition-all duration-150 ${
            localFalando ? "ring-2 ring-green-400" : "border border-white/20"
          }`}
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
          style={{ bottom: alturaBarra + 20 }}
          className="absolute right-3 flex items-center gap-1.5 rounded-md border border-white/20 bg-black/60 px-2.5 py-1.5 text-xs text-white shadow-lg transition-colors hover:bg-black/80"
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
          junto do resto — antes ele ficava fora do vídeo e desalinhado.
          Centralizada com inset-x-0 + mx-auto + w-fit (e não left-1/2 +
          translate): com `left: 50%` a largura disponível era só a METADE do
          vídeo, e no celular a barra quebrava em 3 linhas com a tela sobrando. */}
      <div
        ref={barraRef}
        className="absolute inset-x-0 bottom-3 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-center gap-2 rounded-3xl bg-black/50 p-1.5 backdrop-blur"
      >
        <div className="relative">
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
          <BadgeConfig
            titulo="Microfone"
            valor={micAtual}
            lista={dispositivos.mics}
            aoTrocar={(id) => void aplicarMic(id || undefined)}
            aoAbrir={() => void atualizarDispositivos()}
            container={containerDosMenus}
          />
        </div>
        <div className="relative">
          <Popover onOpenChange={(o) => { if (o) void atualizarDispositivos(); }}>
            <PopoverTrigger asChild>
              <Button
                variant={volumeRemoto === 0 ? "destructive" : "secondary"}
                size="icon"
                className="rounded-full"
                aria-label="Volume do outro lado"
                title="Volume do outro lado (só no seu aparelho)"
              >
                {volumeRemoto === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" className="w-64 p-3" container={containerDosMenus}>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Volume do outro lado</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => aplicarVolumeRemoto(0)}
                  title="Sem som"
                  aria-label="Silenciar (volume 0)"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <VolumeX className="h-4 w-4" />
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volumeRemoto}
                  onChange={(e) => aplicarVolumeRemoto(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer accent-primary"
                  aria-label="Ajustar o volume do outro lado"
                />
                <button
                  type="button"
                  onClick={() => aplicarVolumeRemoto(100)}
                  title="Volume máximo"
                  aria-label="Volume máximo (100)"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-[10px] leading-tight text-muted-foreground">
                Clique no ícone da esquerda para zerar ou no da direita para o máximo. Em 0 você para de ouvir a pessoa.
              </p>
            </PopoverContent>
          </Popover>
          {podeTrocarAltoFalante && (
            <BadgeConfig
              titulo="Alto-falante"
              valor={spkAtual}
              lista={dispositivos.spks}
              aoTrocar={(id) => void aplicarAltoFalante(id)}
              aoAbrir={() => void atualizarDispositivos()}
            container={containerDosMenus}
            />
          )}
        </div>
        <div className="relative">
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
          <BadgeConfig
            titulo="Câmera"
            valor={camAtual}
            lista={dispositivos.cams}
            aoTrocar={(id) => void aplicarCam(id || undefined)}
            aoAbrir={() => void atualizarDispositivos()}
            container={containerDosMenus}
          />
        </div>
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
            <PopoverContent side="top" className="w-64 p-3" container={containerDosMenus}>
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
                Pode pesar em aparelhos mais fracos.
              </p>
            </PopoverContent>
          </Popover>
        {emTelaCheia && extrasTelaCheia}
        <Button
          variant="secondary"
          size="icon"
          onClick={() => void alternarTelaCheia()}
          className="rounded-full"
          aria-label={emTelaCheia ? "Sair da tela cheia" : "Tela cheia"}
          title={emTelaCheia ? "Sair da tela cheia" : "Tela cheia"}
        >
          {emTelaCheia ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </Button>
        {onEndCall && (
          <Button
            variant="destructive"
            size="icon"
            onClick={() => {
              // Sai da tela cheia ANTES de encerrar: a confirmação ("Encerrar a
              // consulta?") é um diálogo da página, fora deste elemento — em tela
              // cheia ela abria invisível e o botão parecia não fazer nada.
              if (emTelaCheia) void alternarTelaCheia();
              onEndCall();
            }}
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
