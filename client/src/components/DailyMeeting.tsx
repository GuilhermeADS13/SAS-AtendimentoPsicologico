import { useState } from "react";

/**
 * Embute a sala do Daily.co (UI pronta) em um iframe. O acesso é pela sala
 * privada + meeting token (?t=), gerados no backend (appointments.dailyJoin).
 * O Daily cuida de conexão, reconexão, chat, compartilhar tela e qualidade.
 */
export default function DailyMeeting({
  url,
  token,
  onError,
}: {
  url: string;
  token: string;
  onError?: (error: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const src = `${url}?t=${encodeURIComponent(token)}`;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg bg-black">
      {loading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
            <p className="text-muted-foreground">Carregando videochamada...</p>
          </div>
        </div>
      )}
      <iframe
        src={src}
        className="h-full w-full flex-1 border-0"
        allow="camera; microphone; fullscreen; display-capture; autoplay; speaker-selection"
        title="Videochamada"
        onLoad={() => setLoading(false)}
        onError={() => onError?.("Erro ao carregar a videochamada")}
      />
    </div>
  );
}
