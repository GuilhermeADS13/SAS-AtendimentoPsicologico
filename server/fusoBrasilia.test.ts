import { afterEach, describe, expect, it } from "vitest";
import { DESLOCAMENTO_BR, instanteEmBrasilia, partesEmBrasilia } from "../shared/datas";

/**
 * A agenda inteira é exibida no horário de Brasília. Agendar, portanto, também
 * tem de gravar em Brasília — independentemente do fuso do aparelho de quem
 * agenda. Antes a tela de Agendamentos usava `new Date("2026-10-10T14:00")`, que é
 * lido no fuso DO APARELHO: num computador fora de UTC-3 a consulta era gravada
 * deslocada.
 *
 * Estes testes mudam o fuso do próprio processo para provar a propriedade que
 * importa: o resultado não depende de onde a máquina está.
 */
const fusoOriginal = process.env.TZ;
afterEach(() => {
  process.env.TZ = fusoOriginal;
});

describe("agendar grava no horário de Brasília", () => {
  it("14h de Brasília é 17h UTC", () => {
    expect(instanteEmBrasilia("2026-10-10", "14:00").toISOString()).toBe("2026-10-10T17:00:00.000Z");
  });

  it.each(["America/Manaus", "America/Rio_Branco", "Europe/Lisbon", "Asia/Tokyo", "UTC"])(
    "dá o mesmo instante com o aparelho em %s",
    (fuso) => {
      process.env.TZ = fuso;
      expect(instanteEmBrasilia("2026-10-10", "14:00").toISOString()).toBe("2026-10-10T17:00:00.000Z");
    },
  );

  /**
   * A regressão, explícita: é isto que a tela fazia. Com o aparelho em Manaus,
   * "14:00" virava 18h UTC — que em Brasília é 15h. O paciente via 15:00.
   */
  it("o jeito antigo dependia do aparelho (é por isso que mudou)", () => {
    process.env.TZ = "America/Manaus";
    const antigo = new Date("2026-10-10T14:00").toISOString();
    expect(antigo).not.toBe(instanteEmBrasilia("2026-10-10", "14:00").toISOString());
  });

  it("vira o dia corretamente perto da meia-noite", () => {
    expect(instanteEmBrasilia("2026-10-10", "22:30").toISOString()).toBe("2026-10-11T01:30:00.000Z");
  });
});

describe("editar mostra o horário de Brasília", () => {
  it("17h UTC aparece como 14:00 no formulário", () => {
    expect(partesEmBrasilia("2026-10-10T17:00:00.000Z")).toEqual({ data: "2026-10-10", hora: "14:00" });
  });

  it.each(["America/Manaus", "Asia/Tokyo", "UTC"])("independe do aparelho (%s)", (fuso) => {
    process.env.TZ = fuso;
    expect(partesEmBrasilia("2026-10-10T17:00:00.000Z")).toEqual({ data: "2026-10-10", hora: "14:00" });
  });

  /** 01:30 UTC ainda é o dia anterior em Brasília. */
  it("respeita o dia de Brasília, não o UTC", () => {
    expect(partesEmBrasilia("2026-10-11T01:30:00.000Z")).toEqual({ data: "2026-10-10", hora: "22:30" });
  });

  /** Ida e volta: o que se grava é exatamente o que o formulário de edição mostra. */
  it("gravar e reabrir dá o mesmo horário", () => {
    process.env.TZ = "America/Manaus";
    const gravado = instanteEmBrasilia("2026-12-01", "09:15");
    expect(partesEmBrasilia(gravado)).toEqual({ data: "2026-12-01", hora: "09:15" });
  });
});

describe("uma regra só para cliente e servidor", () => {
  /** A Luma (servidor) e a tela (cliente) usam esta mesma constante. */
  it("o deslocamento de Brasília é -03:00", () => {
    expect(DESLOCAMENTO_BR).toBe("-03:00");
  });
});
