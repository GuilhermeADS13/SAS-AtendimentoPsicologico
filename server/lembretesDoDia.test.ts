/**
 * Lembretes de amanhã pelo WhatsApp (shared/lembretesDoDia.ts): quais consultas entram
 * na lista de um dia, no calendário de Brasília.
 */
import { describe, expect, it } from "vitest";
import { consultasDoDia, hojeEmBrasilia, somarDias } from "../shared/lembretesDoDia";

describe("dias no calendário de Brasília", () => {
  it("hoje é o de Brasília, não o do servidor", () => {
    // 01:00 em UTC do dia 20 ainda é dia 19 no Brasil.
    expect(hojeEmBrasilia(new Date("2026-11-20T01:00:00Z"))).toBe("2026-11-19");
  });

  it("somar dias vira o mês e o ano", () => {
    expect(somarDias("2026-11-19", 1)).toBe("2026-11-20");
    expect(somarDias("2026-11-30", 1)).toBe("2026-12-01");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("consultas do dia", () => {
  const consulta = (id: number, scheduledAt: string, status = "scheduled") => ({ id, scheduledAt, status });

  it("só as marcadas do dia, pela hora", () => {
    const lista = [
      consulta(1, "2026-11-20T18:00:00-03:00"),
      consulta(2, "2026-11-20T09:00:00-03:00"),
      consulta(3, "2026-11-20T10:00:00-03:00", "cancelled"),
      consulta(4, "2026-11-20T11:00:00-03:00", "completed"),
      consulta(5, "2026-11-20T12:00:00-03:00", "no_show"),
      consulta(6, "2026-11-21T09:00:00-03:00"),
      // 22:30 do dia 20 em Brasília é dia 21 em UTC: continua sendo do dia 20.
      consulta(7, "2026-11-21T01:30:00Z"),
    ];
    expect(consultasDoDia(lista, "2026-11-20").map((c) => c.id)).toEqual([2, 1, 7]);
  });
});
