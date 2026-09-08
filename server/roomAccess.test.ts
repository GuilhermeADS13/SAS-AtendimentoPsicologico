import { describe, it, expect } from "vitest";
import { resolverAcessoSala } from "./roomAccess";

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
