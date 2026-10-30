import { describe, expect, it } from "vitest";
import { tempoDaSessao } from "../shared/tempoDaSessao";

describe("relógio da videochamada", () => {
  it("começa na duração e desce", () => {
    expect(tempoDaSessao(0, 60)).toEqual({ texto: "60:00", esgotado: false });
    expect(tempoDaSessao(61, 60)).toEqual({ texto: "58:59", esgotado: false });
    expect(tempoDaSessao(3599, 60)).toEqual({ texto: "00:01", esgotado: false });
  });

  it("no zero marca esgotado, e não fica negativo depois", () => {
    expect(tempoDaSessao(3600, 60)).toEqual({ texto: "00:00", esgotado: true });
    expect(tempoDaSessao(4000, 60)).toEqual({ texto: "00:00", esgotado: true });
  });

  it("sem duração cadastrada, mostra o tempo decorrido e nunca esgota", () => {
    expect(tempoDaSessao(75, undefined)).toEqual({ texto: "01:15", esgotado: false });
    expect(tempoDaSessao(75, 0)).toEqual({ texto: "01:15", esgotado: false });
  });
});
