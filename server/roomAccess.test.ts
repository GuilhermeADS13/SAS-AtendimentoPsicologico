import { describe, it, expect } from "vitest";
import { pacienteDoUsuario, resolverAcessoSala, salaDisponivel } from "./roomAccess";

describe("validade da sala de vídeo", () => {
  const scheduledAt = new Date("2026-11-03T20:00:00Z");
  const consulta = { status: "scheduled", scheduledAt, duration: 60 };
  const em = (iso: string) => new Date(iso);

  it("o paciente entra antes e durante a consulta", () => {
    expect(salaDisponivel(consulta, "patient", em("2026-11-03T19:50:00Z"))).toBe(true);
    expect(salaDisponivel(consulta, "patient", em("2026-11-03T20:30:00Z"))).toBe(true);
  });

  it("a sala aguenta a queda de conexão depois do fim previsto, mas não para sempre", () => {
    expect(salaDisponivel({ ...consulta, status: "completed" }, "patient", em("2026-11-03T22:59:00Z"))).toBe(true);
    expect(salaDisponivel(consulta, "patient", em("2026-11-03T23:01:00Z"))).toBe(false);
    expect(salaDisponivel(consulta, "patient", em("2027-02-01T20:00:00Z"))).toBe(false);
  });

  it("consulta cancelada não abre para ninguém", () => {
    const cancelada = { ...consulta, status: "cancelled" };
    expect(salaDisponivel(cancelada, "patient", em("2026-11-03T20:00:00Z"))).toBe(false);
    expect(salaDisponivel(cancelada, "therapist", em("2026-11-03T20:00:00Z"))).toBe(false);
  });

  it("a psicóloga segue entrando em consulta passada", () => {
    expect(salaDisponivel(consulta, "therapist", em("2027-02-01T20:00:00Z"))).toBe(true);
  });
});

/**
 * A regra de acesso à sala é a barreira da videochamada (sinalização e presença).
 * Aqui garantimos o caminho determinístico: um `roomId` fora do formato
 * `apt<id>-<token>` é recusado ANTES de qualquer consulta — nada de mandar lixo
 * para o banco. A autorização completa (token certo + ser dono/paciente) depende
 * do banco e é exercida pelo E2E de segurança da sinalização.
 */

// Um "db" que explode se for tocado: se algum roomId malformado escapar do
// parsing e chegar a uma query, o teste falha em vez de passar despercebido.
const dbProibido = new Proxy(
  {},
  {
    get() {
      throw new Error("resolverAcessoSala tocou o banco com um roomId inválido");
    },
  },
);

describe("resolverAcessoSala — parsing do roomId", () => {
  const user = { id: 1, email: "paciente@example.com" };

  it("recusa roomId fora do formato apt<id>-<token>, sem tocar o banco", async () => {
    const invalidos = ["", "lixo", "apt", "apt-token", "aptX-token", "12-token", "apt5", "sala/../etc"];
    for (const roomId of invalidos) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(await resolverAcessoSala(dbProibido as any, user, roomId)).toBeNull();
    }
  });
});

/**
 * Fecho do vínculo: a psicóloga cadastra o paciente (linha "pending", sem
 * userId) e, quando ele entra pela primeira vez, `pacienteDoUsuario` casa o
 * convite pelo e-mail, grava o userId e — só se estava "pending" — passa a
 * "active". Um paciente inativado/arquivado de propósito NÃO revive ao entrar.
 */
describe("pacienteDoUsuario — vínculo e ativação", () => {
  // Fake db: 1º select (por userId) devolve []; 2º (convite por e-mail) devolve
  // o convite; o update captura o payload do .set() para conferência.
  function fakeDb(convite: Record<string, unknown>, capture: { set?: Record<string, unknown> }) {
    let selectCall = 0;
    const selectChain = (call: number) => {
      const chain = {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => Promise.resolve(call === 0 ? [] : [convite]),
      };
      return chain;
    };
    return {
      select: () => selectChain(selectCall++),
      update: () => {
        const chain = {
          set: (payload: Record<string, unknown>) => {
            capture.set = payload;
            return chain;
          },
          where: () => Promise.resolve(),
        };
        return chain;
      },
    };
  }

  const user = { id: 42, email: "Paciente@Example.com" };

  it("vincula o userId e ativa um paciente que estava pending", async () => {
    const convite = { id: 9, status: "pending", email: "paciente@example.com", userId: null };
    const capture: { set?: Record<string, unknown> } = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await pacienteDoUsuario(fakeDb(convite, capture) as any, user);
    expect(capture.set).toEqual({ userId: 42, status: "active" });
    expect(result).toMatchObject({ id: 9, userId: 42, status: "active" });
  });

  it("não reativa um paciente arquivado ao vincular a conta", async () => {
    const convite = { id: 9, status: "archived", email: "paciente@example.com", userId: null };
    const capture: { set?: Record<string, unknown> } = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await pacienteDoUsuario(fakeDb(convite, capture) as any, user);
    expect(capture.set).toEqual({ userId: 42, status: "archived" });
    expect(result).toMatchObject({ id: 9, userId: 42, status: "archived" });
  });
});
