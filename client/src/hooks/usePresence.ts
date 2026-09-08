import { useEffect, useRef } from "react";
import { getAccessToken } from "@/lib/supabase";

export type PresenceMessage = {
  type: "patient-joined" | "patient-left";
  name: string;
};

/**
 * Conecta ao WebSocket de presença da sala (/api/ws/presence).
 * A psicóloga (role "therapist") recebe avisos quando o paciente entra/sai.
 *
 * O papel e o nome exibido vêm do SERVIDOR (a partir de quem está logado); os
 * parâmetros `role`/`name` ficam só para compatibilidade dos chamadores. A
 * conexão autentica com o token do Supabase na primeira mensagem — sem sessão
 * válida e sem ser parte daquela consulta, o servidor recusa.
 */
export function usePresence(
  room: string,
  _role: "therapist" | "patient",
  _name: string,
  onMessage: (msg: PresenceMessage) => void,
) {
  // Mantém o callback atual sem reabrir a conexão a cada render.
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    if (!room) return;
    let ws: WebSocket | null = null;
    let cancelado = false;

    (async () => {
      const token = await getAccessToken();
      if (cancelado || !token) return; // sem sessão, não há presença a mostrar.
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const params = new URLSearchParams({ room });
      ws = new WebSocket(
        `${proto}://${window.location.host}/api/ws/presence?${params.toString()}`,
      );

      ws.onopen = () => ws?.send(JSON.stringify({ type: "auth", token }));

      ws.onmessage = (event) => {
        try {
          cbRef.current(JSON.parse(event.data) as PresenceMessage);
        } catch {
          /* ignora payload inválido */
        }
      };

      // Em hosts serverless (ex.: Vercel) não há WebSocket: falha em silêncio,
      // a presença apenas não fica em tempo real (o sininho segue via polling).
      ws.onerror = () => {};
    })();

    return () => {
      cancelado = true;
      try {
        ws?.close();
      } catch {
        /* já fechado */
      }
    };
  }, [room]);
}
