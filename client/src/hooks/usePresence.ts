import { useEffect, useRef } from "react";

export type PresenceMessage = {
  type: "patient-joined" | "patient-left";
  name: string;
};

/**
 * Conecta ao WebSocket de presença da sala (/api/ws/presence).
 * A psicóloga (role "therapist") recebe avisos quando o paciente entra/sai.
 */
export function usePresence(
  room: string,
  role: "therapist" | "patient",
  name: string,
  onMessage: (msg: PresenceMessage) => void,
) {
  // Mantém o callback atual sem reabrir a conexão a cada render.
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    if (!room) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const params = new URLSearchParams({ room, role, name });
    const ws = new WebSocket(
      `${proto}://${window.location.host}/api/ws/presence?${params.toString()}`,
    );

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

    return () => {
      try {
        ws.close();
      } catch {
        /* já fechado */
      }
    };
  }, [room, role, name]);
}
