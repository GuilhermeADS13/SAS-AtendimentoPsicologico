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

/**
 * Horário/data COM hora sempre no fuso de Brasília, independentemente de onde a
 * pessoa abre. O caso "perto da meia-noite" é o que prova o valor: 02:00 UTC do
 * dia 16 é ainda 23:00 do dia 15 em Brasília — sem fixar o fuso, a tela mostraria
 * o dia errado (e o navegador de teste, em UTC, mostrava a hora +3).
 */
import { formatarData, formatarHora, formatarDataHora, formatarMesAno } from "@shared/datas";

describe("data/hora no fuso de Brasília", () => {
  it("converte a hora UTC para Brasília (17:00Z → 14:00)", () => {
    expect(formatarHora("2026-09-15T17:00:00Z")).toBe("14:00");
  });

  it("formata data e data+hora em Brasília", () => {
    expect(formatarData("2026-09-15T17:00:00Z")).toBe("15/09/2026");
    expect(formatarDataHora("2026-09-15T17:00:00Z")).toBe("15/09/2026, 14:00");
  });

  it("perto da meia-noite, mantém o dia de Brasília (02:00Z do dia 16 = dia 15)", () => {
    expect(formatarData("2026-09-16T02:00:00Z")).toBe("15/09/2026");
    expect(formatarHora("2026-09-16T02:00:00Z")).toBe("23:00");
  });

  it("mês/ano por extenso e fallback para valor ausente", () => {
    expect(formatarMesAno("2026-09-15T17:00:00Z")).toBe("setembro de 2026");
    expect(formatarData(null)).toBe("—");
    expect(formatarHora("não é data")).toBe("—");
  });
});
