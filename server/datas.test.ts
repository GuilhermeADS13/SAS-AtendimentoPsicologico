import { describe, expect, it } from "vitest";
import { formatarNascimento } from "@shared/datas";

/**
 * O bug que isto trava: nascimento é gravado como meia-noite UTC. Formatado no
 * fuso de Brasília, virava o dia anterior (15/05 aparecia como 14/05). A suíte
 * roda com TZ=America/Sao_Paulo (ver vitest.config.ts) para reproduzir o fuso
 * onde o bug aparecia — se o helper formatasse no fuso local, quebraria aqui.
 */
describe("formatarNascimento", () => {
  it("mantém o dia digitado, sem recuar por causa do fuso", () => {
    // Como o servidor grava: new Date('2000-05-15') = 2000-05-15T00:00:00Z.
    const gravado = new Date("2000-05-15");
    expect(formatarNascimento(gravado)).toBe("15/05/2000");
  });

  it("aceita a string ISO vinda do banco", () => {
    expect(formatarNascimento("2000-05-15T00:00:00.000Z")).toBe("15/05/2000");
  });

  it("vira o dia 1º sem escorregar para o mês anterior", () => {
    expect(formatarNascimento(new Date("2001-01-01"))).toBe("01/01/2001");
  });

  it("devolve o traço para data ausente ou inválida", () => {
    expect(formatarNascimento(null)).toBe("—");
    expect(formatarNascimento(undefined)).toBe("—");
    expect(formatarNascimento("")).toBe("—");
    expect(formatarNascimento("não é data")).toBe("—");
  });

  it("aceita um fallback próprio", () => {
    expect(formatarNascimento(null, "")).toBe("");
  });
});
