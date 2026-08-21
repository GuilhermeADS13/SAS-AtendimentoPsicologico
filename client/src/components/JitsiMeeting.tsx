import { useEffect, useRef, useState } from "react";

// Servidor Jitsi. Padrão: instância pública meet.jit.si (grátis, sem cartão nem
// conta). Para outra instância/self-host, aponte VITE_JITSI_DOMAIN.
const JITSI_DOMAIN = (import.meta.env.VITE_JITSI_DOMAIN as string | undefined) || "meet.jit.si";

type JitsiApi = {
  addEventListener: (event: string, listener: (...args: unknown[]) => void) => void;
  dispose: () => void;
};
type JitsiCtor = new (domain: string, options: Record<string, unknown>) => JitsiApi;

// Carrega o external_api.js do Jitsi uma única vez.
let scriptPromise: Promise<void> | null = null;
function loadJitsiScript(domain: string): Promise<void> {
  const w = window as unknown as { JitsiMeetExternalAPI?: JitsiCtor };
  if (w.JitsiMeetExternalAPI) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://${domain}/external_api.js`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha ao carregar o Jitsi"));
    document.body.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Embute a videochamada do Jitsi (via API oficial). O nome da sala é o nosso
 * (apt<id>-<token>, impossível de adivinhar) e o acesso continua sendo validado
 * pelo roomAccess antes de o usuário chegar aqui. Jitsi cuida de mídia, chat,
 * compartilhar tela, reconexão e qualidade.
 */
export default function JitsiMeeting({
  roomName,
  displayName,
  email,
  onError,
  onLeft,
}: {
  roomName: string;
  displayName: string;
  email?: string;
  onError?: (error: string) => void;
  onLeft?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    loadJitsiScript(JITSI_DOMAIN)
      .then(() => {
        if (disposed || !containerRef.current) return;
        const w = window as unknown as { JitsiMeetExternalAPI?: JitsiCtor };
        if (!w.JitsiMeetExternalAPI) {
          onError?.("Jitsi indisponível no momento.");
          return;
        }
        const api = new w.JitsiMeetExternalAPI(JITSI_DOMAIN, {
          roomName,
          parentNode: containerRef.current,
          width: "100%",
          height: "100%",
          userInfo: { displayName, email },
          configOverwrite: {
            // Já temos a nossa tela de preparação; pula a do Jitsi.
            prejoinPageEnabled: false,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            disableDeepLinking: true,
          },
          interfaceConfigOverwrite: {
            MOBILE_APP_PROMO: false,
            SHOW_JITSI_WATERMARK: false,
            SHOW_CHROME_EXTENSION_BANNER: false,
          },
        });
        apiRef.current = api;
        api.addEventListener("videoConferenceJoined", () => setLoading(false));
        api.addEventListener("readyToClose", () => onLeft?.());
      })
      .catch((e: unknown) => onError?.(e instanceof Error ? e.message : "Erro ao carregar a videochamada"));

    return () => {
      disposed = true;
      try {
        apiRef.current?.dispose();
      } catch {
        /* ignore */
      }
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg bg-black">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
            <p className="text-muted-foreground">Carregando videochamada...</p>
          </div>
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
