import { WebSocketServer, WebSocket } from "ws";
import { verifySupabaseToken } from "./supabaseAuth";
import { getDb, getUserByOpenId } from "./db";
import { resolverAcessoSala } from "./roomAccess";

/**
 * Presença em tempo real das salas de videochamada.
 *
 * A psicóloga (role "therapist") abre a sala e fica ouvindo; quando o paciente
 * (role "patient") abre o mesmo link, o servidor avisa a psicóloga via WebSocket.
 * É independente do backend de vídeo — só sinaliza presença.
 *
 * Autenticação igual à da sinalização (ver signaling.ts): a primeira mensagem
 * precisa ser `{ type: "auth", token }`, o servidor confere no banco que a pessoa
 * tem acesso àquela consulta e DERIVA o papel — o cliente não escolhe se é
 * "therapist" nem inventa o nome exibido. Sem isso, saber o nome da sala não abria
 * a presença de uma consulta alheia.
 */

type Role = "therapist" | "patient";

interface Client {
  ws: WebSocket;
  role: Role;
  name: string;
}

// room -> conjunto de clientes conectados naquela sala.
const rooms = new Map<string, Set<Client>>();

const AUTH_TIMEOUT_MS = 5000;

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

export const PRESENCE_PATH = "/api/ws/presence";

// `noServer`: o upgrade é despachado por um roteador único em _core/index.ts.
// Dois WebSocketServer com `{ server, path }` no mesmo HTTP faziam o primeiro
// abortar (400) o upgrade do path do outro — quebrava a sinalização do vídeo.
export function createPresenceWss(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", "http://localhost");
    const room = (url.searchParams.get("room") || "").trim();

    if (!room) {
      ws.close();
      return;
    }

    let client: Client | null = null;
    const authTimer = setTimeout(() => {
      if (!client) ws.close(4001, "auth timeout");
    }, AUTH_TIMEOUT_MS);

    const entrar = (role: Role, name: string) => {
      const c: Client = { ws, role, name };
      client = c;
      let existing = rooms.get(room);
      if (!existing) {
        existing = new Set();
        rooms.set(room, existing);
      }
      existing.add(c);

      // Avisa a psicóloga assim que um paciente entra na sala.
      if (role === "patient") {
        broadcastToRole(room, "therapist", { type: "patient-joined", name });
      }
    };

    ws.on("message", async (raw) => {
      let msg: { type?: string; token?: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (client) return; // presença não recebe mais nada do cliente após entrar.

      if (msg.type !== "auth" || typeof msg.token !== "string") return;
      clearTimeout(authTimer);
      const sb = await verifySupabaseToken(msg.token);
      if (!sb) {
        ws.close(4001, "unauthorized");
        return;
      }
      const db = await getDb();
      if (!db) {
        ws.close(1011, "db indisponível");
        return;
      }
      const user = await getUserByOpenId(`sb:${sb.sub}`);
      if (!user) {
        ws.close(4003, "forbidden");
        return;
      }
      const acesso = await resolverAcessoSala(db, user, room);
      if (!acesso) {
        ws.close(4003, "forbidden");
        return;
      }
      // Nome exibido vem do servidor, não do cliente.
      const nome =
        user.name?.trim() || (acesso.role === "patient" ? "Paciente" : "Psicóloga");
      entrar(acesso.role, nome);
    });

    ws.on("close", () => {
      clearTimeout(authTimer);
      if (!client) return;
      const clients = rooms.get(room);
      if (!clients) return;
      clients.delete(client);
      if (clients.size === 0) rooms.delete(room);
      if (client.role === "patient") {
        broadcastToRole(room, "therapist", { type: "patient-left", name: client.name });
      }
    });

    // Ignora erros de socket individuais; o "close" cuida da limpeza.
    ws.on("error", () => {});
  });

  return wss;
}
