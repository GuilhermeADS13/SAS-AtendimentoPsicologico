import { describe, expect, it } from "vitest";
import { duracaoEmPalavras, frequenciaDasSessoes, momentosDaEvolucao, resumoDaEvolucao } from "@shared/evolucao";

// 14h em Brasília = 17h UTC.
const s = (id: number, dia: string) => ({ id, startedAt: `${dia}T17:00:00.000Z` });

describe("momentosDaEvolucao", () => {
  it("numera em ordem cronológica e devolve do mais recente para o mais antigo", () => {
    const m = momentosDaEvolucao([s(3, "2026-03-15"), s(1, "2026-03-01"), s(2, "2026-03-08")]);
    expect(m.map((x) => [x.sessao.id, x.numero])).toEqual([[3, 3], [2, 2], [1, 1]]);
    expect(m[2].marcos).toEqual([{ tipo: "inicio", texto: "Início do acompanhamento" }]);
    expect(m[0].diasDesdeAnterior).toBe(7);
  });

  it("marca o retorno depois de 30+ dias sem sessão, e não antes", () => {
    const m = momentosDaEvolucao([s(1, "2026-01-05"), s(2, "2026-02-03"), s(3, "2026-03-10")]);
    expect(m.find((x) => x.numero === 2)?.marcos).toEqual([]); // 29 dias
    expect(m.find((x) => x.numero === 3)?.marcos).toEqual([{ tipo: "retorno", texto: "Retorno após 35 dias sem sessão" }]);
  });

  it("marca a cada 10 sessões", () => {
    const dez = Array.from({ length: 10 }, (_, i) => s(i + 1, `2026-01-${String(i + 1).padStart(2, "0")}`));
    expect(momentosDaEvolucao(dez)[0].marcos).toEqual([{ tipo: "contagem", texto: "10ª sessão" }]);
  });

  it("separa por mês no horário de Brasília (23h do dia 31 ainda é o mês dele)", () => {
    const m = momentosDaEvolucao([{ id: 1, startedAt: "2026-02-01T02:00:00.000Z" }]); // 31/01 23h em Brasília
    expect(m[0].mes).toBe("2026-01");
  });
});

describe("resumoDaEvolucao", () => {
  it("total, início, última, tempo e frequência", () => {
    const r = resumoDaEvolucao([s(1, "2026-01-05"), s(2, "2026-01-12"), s(3, "2026-01-19")], new Date("2026-04-05T17:00:00Z"));
    expect(r.total).toBe(3);
    expect(r.diasDeAcompanhamento).toBe(90);
    expect(r.frequencia).toBe("semanal");
  });

  it("sem sessões: tudo vazio", () => {
    expect(resumoDaEvolucao([])).toEqual({ total: 0, inicio: null, ultima: null, diasDeAcompanhamento: null, frequencia: null });
  });
});

describe("frequenciaDasSessoes", () => {
  it("usa a mediana: uma pausa de férias não faz a semanal virar 'a cada 12 dias'", () => {
    expect(frequenciaDasSessoes([7, 7, 7, 7, 35])).toBe("semanal");
    expect(frequenciaDasSessoes([14, 14, 15])).toBe("quinzenal");
    expect(frequenciaDasSessoes([30, 31])).toBe("mensal");
    expect(frequenciaDasSessoes([60])).toBe("a cada 60 dias");
    expect(frequenciaDasSessoes([])).toBeNull();
  });
});

describe("duracaoEmPalavras", () => {
  it("dias, meses e anos", () => {
    expect(duracaoEmPalavras(1)).toBe("1 dia");
    expect(duracaoEmPalavras(12)).toBe("12 dias");
    expect(duracaoEmPalavras(95)).toBe("3 meses");
    expect(duracaoEmPalavras(365)).toBe("1 ano");
    expect(duracaoEmPalavras(430)).toBe("1 ano e 2 meses");
  });
});
