import { WebSocketServer, WebSocket } from "ws";
import { verifySupabaseToken } from "./supabaseAuth";
import { getDb, getUserByOpenId } from "./db";
import { resolverAcessoSala } from "./roomAccess";

/**
 * Sinalização WebRTC 1:1 das salas de videochamada.
 *
 * O vídeo em si é peer-to-peer (terapeuta <-> paciente, com STUN grátis); este
 * servidor só repassa os metadados da negociação (offer/answer/ICE) entre os dois
 * lados da MESMA sala. Não vê nem grava mídia — só o handshake.
 *
 * Autenticação: abrir o WebSocket não basta. O cliente precisa mandar, como
 * PRIMEIRA mensagem, `{ type: "auth", token }` com o access token do Supabase.
 * O servidor valida o token, resolve quem é a pessoa e confere no banco que ela
 * é a psicóloga dona ou o paciente DAQUELA consulta (ver ./roomAccess). Sem isso,
 * saber o nome da sala não dava para conectar — o papel também vem do servidor,
 * então um paciente não consegue se declarar "therapist". O token vai numa
 * mensagem (não na URL) para não vazar em log de acesso.
 *
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

// Tempo para o cliente mandar a mensagem de auth antes de o servidor desistir.
const AUTH_TIMEOUT_MS = 5000;

function sendTo(client: Client, payload: unknown) {
  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(payload));
  }
}

export const SIGNALING_PATH = "/api/ws/rtc";

// `noServer`: upgrade despachado pelo roteador único em _core/index.ts (ver presence.ts).
export function createSignalingWss(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", "http://localhost");
    const room = (url.searchParams.get("room") || "").trim();

    if (!room) {
      ws.close();
      return;
    }

    // Enquanto `client` é null, a conexão está só autenticada pela metade: aceita
    // apenas a mensagem de auth. Se ela não vier a tempo, fecha.
    let client: Client | null = null;
    const authTimer = setTimeout(() => {
      if (!client) ws.close(4001, "auth timeout");
    }, AUTH_TIMEOUT_MS);

    // Entra na sala com o papel DERIVADO do servidor e dispara o fluxo de início.
    const entrar = (role: Role) => {
      const c: Client = { ws, role };
      client = c;
      let existing = rooms.get(room);
      if (!existing) {
        existing = new Set();
        rooms.set(room, existing);
      }
      const clients = existing;
      clients.add(c);

      // Com os dois lados presentes, manda a terapeuta iniciar a oferta. Roda a
      // cada entrada (inclusive quando o paciente reconecta), sempre com a
      // terapeuta como único iniciador — então não há oferta cruzada.
      let hasTherapist = false;
      let hasPatient = false;
      clients.forEach((o) => {
        if (o.role === "therapist") hasTherapist = true;
        else hasPatient = true;
      });
      if (hasTherapist && hasPatient) {
        clients.forEach((o) => {
          if (o.role === "therapist") sendTo(o, { type: "start" });
        });
      }
    };

    ws.on("message", async (raw) => {
      let msg: { type?: string; token?: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      // Fase 1: autenticação. Só a mensagem de auth é aceita antes de entrar.
      if (!client) {
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
        entrar(acesso.role);
        return;
      }

      // Fase 2: já autenticado. Só repassa os tipos da negociação.
      if (msg.type === "offer" || msg.type === "answer" || msg.type === "candidate") {
        const clients = rooms.get(room);
        clients?.forEach((c) => {
          if (c !== client) sendTo(c, msg);
        });
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimer);
      if (!client) return; // nunca autenticou: não entrou em nenhuma sala.
      const clients = rooms.get(room);
      if (!clients) return;
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
