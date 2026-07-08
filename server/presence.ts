import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";

/**
 * Presença em tempo real das salas de videochamada.
 *
 * A psicóloga (role "therapist") abre a sala e fica ouvindo; quando o paciente
 * (role "patient") abre o mesmo link, o servidor avisa a psicóloga via WebSocket.
 * É independente do backend de vídeo (MiroTalk/Jitsi) — só sinaliza presença.
 */

type Role = "therapist" | "patient";

interface Client {
  ws: WebSocket;
  role: Role;
  name: string;
}

// room -> conjunto de clientes conectados naquela sala.
const rooms = new Map<string, Set<Client>>();

function broadcastToRole(room: string, role: Role, payload: unknown) {
  const set = rooms.get(room);
  if (!set) return;
  const data = JSON.stringify(payload);
  set.forEach((client) => {
    if (client.role === role && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  });
}

export function registerPresence(server: Server) {
  // `path` garante que só tratamos os upgrades desta rota, deixando o HMR do
  // Vite (que usa outro path) passar sem conflito no mesmo servidor HTTP.
  const wss = new WebSocketServer({ server, path: "/api/ws/presence" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", "http://localhost");
    const room = (url.searchParams.get("room") || "").trim();
    const role: Role = url.searchParams.get("role") === "patient" ? "patient" : "therapist";
    const name =
      (url.searchParams.get("name") || "").trim() ||
      (role === "patient" ? "Paciente" : "Psicóloga");

    if (!room) {
      ws.close();
      return;
    }

    const client: Client = { ws, role, name };
    let existing = rooms.get(room);
    if (!existing) {
      existing = new Set();
      rooms.set(room, existing);
    }
    const clients = existing;
    clients.add(client);

    // Avisa a psicóloga assim que um paciente entra na sala.
    if (role === "patient") {
      broadcastToRole(room, "therapist", { type: "patient-joined", name });
    }

    ws.on("close", () => {
      clients.delete(client);
      if (clients.size === 0) rooms.delete(room);
      if (role === "patient") {
        broadcastToRole(room, "therapist", { type: "patient-left", name });
      }
    });

    // Ignora erros de socket individuais; o "close" cuida da limpeza.
    ws.on("error", () => {});
  });

  return wss;
}
