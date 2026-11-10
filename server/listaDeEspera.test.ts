import { describe, expect, it } from "vitest";
import { descricaoDaPreferencia, linkDoWhatsApp, periodoDoHorario, querEsteHorario } from "../shared/listaDeEspera";

// Quinta, 12/11/2026.
const quintaAs = (hora: string) => new Date(`2026-11-12T${hora}:00-03:00`);

describe("lista de espera: quem quer o horário que vagou", () => {
  it("período pelo horário de Brasília, mesmo com o servidor em UTC", () => {
    expect(periodoDoHorario(quintaAs("08:00"))).toBe("manha");
    expect(periodoDoHorario(quintaAs("11:59"))).toBe("manha");
    expect(periodoDoHorario(quintaAs("12:00"))).toBe("tarde");
    expect(periodoDoHorario(quintaAs("17:30"))).toBe("tarde");
    // 21h em Brasília já é sexta em UTC: o dia e o período não podem virar.
    expect(periodoDoHorario(quintaAs("21:00"))).toBe("noite");
    expect(querEsteHorario({ diasDaSemana: [4], periodos: ["noite"] }, quintaAs("21:00"))).toBe(true);
  });

  it("dia e período precisam servir; vazio quer dizer qualquer um", () => {
    const quinta14h = quintaAs("14:00");
    expect(querEsteHorario({ diasDaSemana: [], periodos: [] }, quinta14h)).toBe(true);
    expect(querEsteHorario({ diasDaSemana: [4], periodos: [] }, quinta14h)).toBe(true);
    expect(querEsteHorario({ diasDaSemana: [1, 3], periodos: [] }, quinta14h)).toBe(false);
    expect(querEsteHorario({ diasDaSemana: [], periodos: ["manha"] }, quinta14h)).toBe(false);
    expect(querEsteHorario({ diasDaSemana: [4], periodos: ["tarde", "noite"] }, quinta14h)).toBe(true);
  });

  it("descreve a preferência em português", () => {
    expect(descricaoDaPreferencia({ diasDaSemana: [3, 1], periodos: ["manha"] })).toBe("Seg e Qua · Manhã");
    expect(descricaoDaPreferencia({ diasDaSemana: [1, 3, 5], periodos: ["noite", "tarde"] })).toBe("Seg, Qua e Sex · Tarde ou Noite");
    expect(descricaoDaPreferencia({ diasDaSemana: [], periodos: [] })).toBe("Qualquer dia · Qualquer horário");
  });

  it("link do WhatsApp com o 55 do Brasil, e nada sem telefone", () => {
    expect(linkDoWhatsApp("(81) 99999-0000", "Oi")).toBe("https://wa.me/5581999990000?text=Oi");
    expect(linkDoWhatsApp("+55 81 99999-0000", "Oi")).toBe("https://wa.me/5581999990000?text=Oi");
    expect(linkDoWhatsApp(null, "Oi")).toBeNull();
    expect(linkDoWhatsApp("9999", "Oi")).toBeNull();
  });
});
