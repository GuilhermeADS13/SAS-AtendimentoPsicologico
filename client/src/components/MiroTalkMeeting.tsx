import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';

interface MiroTalkMeetingProps {
  roomName: string;
  displayName: string;
  email?: string;
  apiUrl?: string;
  onReady?: () => void;
  onError?: (error: string) => void;
  onParticipantJoined?: (participant: any) => void;
  onParticipantLeft?: (participant: any) => void;
}

/**
 * Componente MiroTalk SFU Meeting
 * Embute a interface do MiroTalk SFU em um iframe
 */
export default function MiroTalkMeeting({
  roomName,
  displayName,
  email,
  apiUrl = 'https://localhost:3010',
  onReady,
  onError,
  onParticipantJoined,
  onParticipantLeft,
}: MiroTalkMeetingProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Construir URL com parâmetros
    const params = new URLSearchParams({
      room: roomName,
      name: displayName,
      ...(email && { email }),
      // notify=0 desliga o popup "Share the room" do MiroTalk, que abre em
      // inglês ao entrar na sala. A UI deles não tem parâmetro de idioma, e o
      // popup é redundante: quem convida usa o botão "Copiar link" daqui.
      notify: "0",
      // Sem senha: o controle de acesso é nosso (a sala é sala-apt<id>).
      roomPassword: "0",
    });

    const iframeUrl = `${apiUrl}/join/${roomName}?${params.toString()}`;

    if (iframeRef.current) {
      iframeRef.current.src = iframeUrl;
    }

    // Listener para mensagens do iframe
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== new URL(apiUrl).origin) return;

      const { type, data } = event.data;

      switch (type) {
        case 'ready':
          setIsLoading(false);
          onReady?.();
          break;
        case 'error':
          setError(data.message);
          onError?.(data.message);
          break;
        case 'participantJoined':
          onParticipantJoined?.(data);
          break;
        case 'participantLeft':
          onParticipantLeft?.(data);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [roomName, displayName, email, apiUrl, onReady, onError, onParticipantJoined, onParticipantLeft]);

  return (
    <div className="w-full h-full flex flex-col bg-black rounded-lg overflow-hidden">
      {error && (
        <div className="bg-destructive/10 border-b border-destructive/30 p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
            <p className="text-muted-foreground">Carregando videochamada...</p>
          </div>
        </div>
      )}

      <iframe
        ref={iframeRef}
        className="flex-1 w-full h-full border-0"
        allow="camera *; microphone *; display-capture *; fullscreen"
        title="MiroTalk SFU Meeting"
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setError('Erro ao carregar a videochamada');
          onError?.('Erro ao carregar a videochamada');
        }}
      />
    </div>
  );
}
