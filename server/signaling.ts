import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { verifySupabaseToken } from "./supabaseAuth";
import { getDb, getUserByOpenId } from "./db";
import { resolverAcessoSala } from "./roomAccess";
import { MAX_PESSOAS_NA_CHAMADA } from "../shared/chamadaEmGrupo";

/**
 * Sinalização WebRTC das salas de videochamada — a dois ou em GRUPO (até
 * MAX_PESSOAS_NA_CHAMADA: terapia de casal; pais separados + criança).
 *
 * O vídeo em si é peer-to-peer em MALHA (cada pessoa conecta direto com cada
 * outra, com STUN grátis); este servidor só repassa os metadados da negociação
 * (offer/answer/ICE) entre as pessoas da MESMA sala. Não vê nem grava mídia.
 *
 * Autenticação: abrir o WebSocket não basta. O cliente precisa mandar, como
 * PRIMEIRA mensagem, `{ type: "auth", token }` com o access token do Supabase.
 * O servidor valida o token, resolve quem é a pessoa e confere no banco que ela
 * é a psicóloga dona, o paciente ou um participante DAQUELA consulta (ver
 * ./roomAccess). O papel também vem do servidor, nunca do cliente. O token vai
 * numa mensagem (não na URL) para não vazar em log de acesso.
 *
 * Protocolo (cada pessoa ganha um `id` na sala):
 *  - quem entra recebe `welcome { id, peers: [{ id, role, nome }] }`, e os que
 *    já estavam recebem `peer-joined { id, role, nome }`;
 *  - QUEM CHEGOU POR ÚLTIMO oferece para cada um que já estava. Só um lado sabe
 *    que é o novo, então nunca os dois oferecem ao mesmo tempo ("glare"); quem
 *    recarrega a página vira o novo de novo;
 *  - offer/answer/candidate levam `to` (o destino) e chegam com `from`
 *    carimbado pelo servidor — ninguém se passa por outro;
 *  - ao sair, os outros recebem `peer-left { id }`.
 */

type Role = "therapist" | "patient";

interface Client {
  ws: WebSocket;
  id: string;
  role: Role;
  userId: number;
  nome: string;
}

// room -> clientes conectados naquela sala.
const rooms = new Map<string, Set<Client>>();

// Tempo para o cliente mandar a mensagem de auth antes de o servidor desistir.
const AUTH_TIMEOUT_MS = 5000;

/** Fechamento com este código = sala cheia (o cliente mostra a mensagem certa). */
export const CODIGO_SALA_CHEIA = 4009;

function sendTo(client: Client, payload: unknown) {
  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(payload));
  }
}

export const SIGNALING_PATH = "/api/ws/rtc";

// `noServer`: upgrade despachado pelo roteador único em _core/index.ts (ver presence.ts).
export function createSignalingWss(): WebSocketServer {
  // Teto por mensagem: o padrao da biblioteca e 100 MB, e qualquer conta logada
  // poderia mandar mensagens enormes para derrubar o processo (plano free, pouca
  // memoria). Oferta/resposta SDP tem poucos KB; 256 KB sobra.
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

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

    /** Tira o cliente da sala e avisa os outros. */
    const sair = (c: Client) => {
      const clients = rooms.get(room);
      if (!clients || !clients.delete(c)) return;
      if (clients.size === 0) {
        rooms.delete(room);
        return;
      }
      clients.forEach((o) => sendTo(o, { type: "peer-left", id: c.id }));
    };

    // Entra na sala com o papel DERIVADO do servidor.
    const entrar = (role: Role, userId: number, nome: string) => {
      let clients = rooms.get(room);
      if (!clients) {
        clients = new Set();
        rooms.set(room, clients);
      }
      // A MESMA pessoa entrando de novo (recarregou a página, outra aba): derruba
      // a conexão antiga. Pelo Cloudflare do Render o "close" de um WebSocket nem
      // sempre chega — a antiga ficaria na sala como fantasma, e os outros
      // tentariam conectar com ela para sempre ("conectando…" num quadro vazio).
      Array.from(clients)
        .filter((o) => o.userId === userId)
        .forEach((velho) => {
          sair(velho);
          try {
            velho.ws.close(4000, "substituído");
          } catch {
            /* já fechado */
          }
        });
      clients = rooms.get(room) ?? new Set<Client>();
      rooms.set(room, clients);

      if (clients.size >= MAX_PESSOAS_NA_CHAMADA) {
        ws.close(CODIGO_SALA_CHEIA, "sala cheia");
        return;
      }

      const c: Client = { ws, id: randomUUID(), role, userId, nome };
      const quemJaEstava = Array.from(clients);
      client = c;
      clients.add(c);
      // Primeiro avisa quem já estava (para eles esperarem a oferta), depois
      // dá as boas-vindas ao novo — que é quem oferece.
      quemJaEstava.forEach((o) => sendTo(o, { type: "peer-joined", id: c.id, role, nome }));
      sendTo(c, {
        type: "welcome",
        id: c.id,
        peers: quemJaEstava.map((o) => ({ id: o.id, role: o.role, nome: o.nome })),
      });
    };

    ws.on("message", async (raw) => {
      let msg: { type?: string; token?: unknown; to?: unknown };
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
        entrar(acesso.role, user.id, (user.name ?? "").trim());
        return;
      }

      // Fase 2: já autenticado. Só repassa a negociação, para UM destino da sala,
      // com o remetente carimbado aqui.
      if ((msg.type === "offer" || msg.type === "answer" || msg.type === "candidate") && typeof msg.to === "string") {
        const destino = Array.from(rooms.get(room) ?? []).find((c) => c.id === msg.to);
        if (destino && destino !== client) sendTo(destino, { ...msg, to: undefined, from: client.id });
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimer);
      if (client) sair(client); // nunca autenticou: não entrou em nenhuma sala.
    });

    // Ignora erros de socket individuais; o "close" cuida da limpeza.
    ws.on("error", () => {});
  });

  return wss;
}
