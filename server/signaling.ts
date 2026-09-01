import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";

/**
 * Sinalização WebRTC 1:1 das salas de videochamada.
 *
 * O vídeo em si é peer-to-peer (terapeuta <-> paciente, com STUN grátis); este
 * servidor só repassa os metadados da negociação (offer/answer/ICE) entre os dois
 * lados da MESMA sala. Não vê nem grava mídia — só o handshake.
 *
 * É separado do /api/ws/presence de propósito: presença (cronômetro/sineta) e
 * sinalização têm ciclos de vida diferentes, e cada cliente abre a sua conexão.
 * Papel do iniciador: a terapeuta cria a oferta (evita "glare" — o paciente nunca
 * oferece, só responde), disparada quando os dois lados estão presentes.
 */

type Role = "therapist" | "patient";

interface Client {
  ws: WebSocket;
  role: Role;
}

// room -> clientes conectados naquela sala.
const rooms = new Map<string, Set<Client>>();

function sendTo(client: Client, payload: unknown) {
  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(payload));
  }
}

export function registerSignaling(server: Server) {
  // `path` próprio: convive com /api/ws/presence e com o HMR do Vite no mesmo
  // servidor HTTP (o ws ignora upgrades cujo path não bate).
  const wss = new WebSocketServer({ server, path: "/api/ws/rtc" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", "http://localhost");
    const room = (url.searchParams.get("room") || "").trim();
    const role: Role = url.searchParams.get("role") === "patient" ? "patient" : "therapist";

    if (!room) {
      ws.close();
      return;
    }

    const client: Client = { ws, role };
    let existing = rooms.get(room);
    if (!existing) {
      existing = new Set();
      rooms.set(room, existing);
    }
    const clients = existing;
    clients.add(client);

    const bothPresent = () => {
      let hasTherapist = false;
      let hasPatient = false;
      clients.forEach((c) => {
        if (c.role === "therapist") hasTherapist = true;
        else hasPatient = true;
      });
      return hasTherapist && hasPatient;
    };

    // Com os dois lados presentes, manda a terapeuta iniciar a oferta. Roda a cada
    // entrada (inclusive quando o paciente reconecta), sempre com a terapeuta como
    // único iniciador — então não há oferta cruzada.
    const startIfReady = () => {
      if (!bothPresent()) return;
      clients.forEach((c) => {
        if (c.role === "therapist") sendTo(c, { type: "start" });
      });
    };
    startIfReady();

    ws.on("message", (raw) => {
      let msg: { type?: string };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      // Só repassa os tipos da negociação; qualquer outra coisa é ignorada.
      if (msg.type === "offer" || msg.type === "answer" || msg.type === "candidate") {
        clients.forEach((c) => {
          if (c !== client) sendTo(c, msg);
        });
      }
    });

    ws.on("close", () => {
      clients.delete(client);
      if (clients.size === 0) {
        rooms.delete(room);
        return;
      }
      // Avisa o outro lado para voltar ao estado de espera/reconexão.
      clients.forEach((c) => sendTo(c, { type: "peer-left" }));
    });

    // Ignora erros de socket individuais; o "close" cuida da limpeza.
    ws.on("error", () => {});
  });

  return wss;
}
