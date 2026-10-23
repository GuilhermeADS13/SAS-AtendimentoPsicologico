import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

/**
 * Sinalização da chamada em GRUPO (até 4 pessoas), com sockets de verdade. Só o
 * login e o banco são simulados: o token "tok-<id>" é o usuário <id>; o 1 é a
 * psicóloga, o 99 não tem acesso à sala.
 */
vi.mock("./supabaseAuth", () => ({
  verifySupabaseToken: async (t: string) => (t.startsWith("tok-") ? { sub: t.slice(4) } : null),
}));
vi.mock("./db", () => ({
  getDb: async () => ({}),
  getUserByOpenId: async (openId: string) => {
    const id = Number(openId.replace("sb:", ""));
    return { id, name: `Pessoa ${id}` };
  },
}));
vi.mock("./roomAccess", () => ({
  resolverAcessoSala: async (_db: unknown, user: { id: number }) =>
    user.id === 99 ? null : { role: user.id === 1 ? "therapist" : "patient", appointmentId: 1, patientId: 2 },
}));

const { createSignalingWss, CODIGO_SALA_CHEIA } = await import("./signaling");

let servidor: Server;
let porta = 0;
beforeAll(async () => {
  const wss = createSignalingWss();
  servidor = createServer();
  servidor.on("upgrade", (req, socket, head) => wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req)));
  await new Promise<void>((r) => servidor.listen(0, r));
  porta = (servidor.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((r) => servidor.close(() => r())));

type Msg = Record<string, unknown> & { type: string };
/** Um participante: guarda as mensagens recebidas e espera por tipo. */
function conectar(sala: string, usuario: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${porta}/api/ws/rtc?room=${sala}`);
  const recebidas: Msg[] = [];
  let fechou: number | null = null;
  ws.on("message", (d) => recebidas.push(JSON.parse(d.toString())));
  ws.on("close", (code) => (fechou = code));
  ws.on("open", () => ws.send(JSON.stringify({ type: "auth", token: `tok-${usuario}` })));
  const esperar = async (pred: (m: Msg) => boolean, ms = 2000) => {
    const ate = Date.now() + ms;
    while (Date.now() < ate) {
      const m = recebidas.find(pred);
      if (m) return m;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`não chegou: ${JSON.stringify(recebidas)}`);
  };
  return { ws, recebidas, esperar, fechou: () => fechou, enviar: (m: unknown) => ws.send(JSON.stringify(m)) };
}
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("sinalização em grupo", () => {
  it("quem entra recebe quem já estava; quem estava é avisado", async () => {
    const psi = conectar("s1", 1);
    const boasVindasPsi = await psi.esperar((m) => m.type === "welcome");
    expect(boasVindasPsi.peers).toEqual([]);
    const ana = conectar("s1", 2);
    const boasVindasAna = await ana.esperar((m) => m.type === "welcome");
    expect(boasVindasAna.peers).toEqual([{ id: boasVindasPsi.id, role: "therapist", nome: "Pessoa 1" }]);
    const aviso = await psi.esperar((m) => m.type === "peer-joined");
    expect(aviso).toMatchObject({ id: boasVindasAna.id, role: "patient", nome: "Pessoa 2" });
    psi.ws.close();
    ana.ws.close();
  });

  it("a negociação vai só para o destino, com o remetente carimbado pelo servidor", async () => {
    const a = conectar("s2", 1);
    const b = conectar("s2", 2);
    const c = conectar("s2", 3);
    const idA = (await a.esperar((m) => m.type === "welcome")).id;
    const idB = (await b.esperar((m) => m.type === "welcome")).id;
    await c.esperar((m) => m.type === "welcome");
    // C tenta se passar por B no "from": o servidor sobrescreve.
    c.enviar({ type: "offer", to: idA, from: idB, sdp: "v=0" });
    const oferta = await a.esperar((m) => m.type === "offer");
    expect(oferta.from).not.toBe(idB);
    expect(oferta.sdp).toBe("v=0");
    await pausa(150);
    expect(b.recebidas.some((m) => m.type === "offer")).toBe(false);
    [a, b, c].forEach((p) => p.ws.close());
  });

  it("a 5ª pessoa é recusada (sala cheia)", async () => {
    const quatro = [1, 2, 3, 4].map((u) => conectar("s3", u));
    for (const p of quatro) await p.esperar((m) => m.type === "welcome");
    const quinta = conectar("s3", 5);
    await pausa(300);
    expect(quinta.fechou()).toBe(CODIGO_SALA_CHEIA);
    quatro.forEach((p) => p.ws.close());
  });

  it("quem não tem acesso à consulta é barrado", async () => {
    const intruso = conectar("s4", 99);
    await pausa(300);
    expect(intruso.fechou()).toBe(4003);
  });

  it("a mesma pessoa entrando de novo derruba a conexão antiga (sem fantasma)", async () => {
    const psi = conectar("s5", 1);
    const ana1 = conectar("s5", 2);
    await psi.esperar((m) => m.type === "welcome");
    const idAntigo = (await ana1.esperar((m) => m.type === "welcome")).id;
    const ana2 = conectar("s5", 2);
    const bv = await ana2.esperar((m) => m.type === "welcome");
    await psi.esperar((m) => m.type === "peer-left" && m.id === idAntigo);
    expect((bv.peers as unknown[]).length).toBe(1); // só a psicóloga; a Ana antiga saiu
    await pausa(200);
    expect(ana1.fechou()).toBe(4000);
    [psi, ana2].forEach((p) => p.ws.close());
  });
});
