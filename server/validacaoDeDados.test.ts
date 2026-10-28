import { describe, expect, it } from "vitest";
import { nascimentoValido } from "../shared/datas";
import { VALOR_MAXIMO_DA_CONSULTA, VALOR_QUE_PEDE_CONFIRMACAO, reaisParaCentavos } from "../shared/dinheiro";
import { sugestaoDeEmail } from "../shared/email";
import { telefoneValido } from "../shared/telefone";

describe("e-mail: sugere o domínio certo quando parece erro de digitação", () => {
  it.each([
    ["ana@gmial.com", "ana@gmail.com"],
    ["ana@gmail.co", "ana@gmail.com"],
    ["ana@gmail.con", "ana@gmail.com"],
    ["Ana@Hotmial.com", "ana@hotmail.com"],
    ["ana@outlok.com", "ana@outlook.com"],
    ["ana@yahoo.com.bt", "ana@yahoo.com.br"],
  ])("%s → %s", (email, sugestao) => {
    expect(sugestaoDeEmail(email)).toBe(sugestao);
  });

  it.each(["ana@gmail.com", "ana@yahoo.com.br", "ana@clinicaesperanca.com.br", "ana@ufpe.br", "ana", "ana@"])(
    "%s: nada a sugerir",
    (email) => {
      expect(sugestaoDeEmail(email)).toBeNull();
    },
  );
});

describe("data de nascimento", () => {
  const agora = new Date("2026-10-28T12:00:00-03:00");
  it.each([
    ["", true],
    ["1990-05-20", true],
    ["2026-10-28", true],
    ["1900-01-01", true],
    ["2026-10-29", false], // amanhã
    ["2090-01-01", false],
    ["0202-05-20", false],
    ["1899-12-31", false],
    ["2001-02-29", false], // 2001 não é bissexto
    ["2000-02-29", true],
    ["20/05/1990", false],
  ])("%s → %s", (valor, ok) => {
    expect(nascimentoValido(valor, agora)).toBe(ok);
  });
});

describe("telefone de contato", () => {
  it.each([
    ["", true],
    ["(81) 99999-0000", true],
    ["(81) 3333-0000", true],
    ["+55 81 99999-0000", true],
    ["99999-0000", false], // sem DDD
    ["123", false],
    ["(01) 99999-0000", false], // DDD não existe
  ])("%s → %s", (valor, ok) => {
    expect(telefoneValido(valor)).toBe(ok);
  });
});

describe("valor da consulta", () => {
  it("R$ 150 não pede confirmação; R$ 15.000 pede; R$ 50.000 é o teto", () => {
    expect(reaisParaCentavos("150")! > VALOR_QUE_PEDE_CONFIRMACAO).toBe(false);
    expect(reaisParaCentavos("15000")! > VALOR_QUE_PEDE_CONFIRMACAO).toBe(true);
    expect(reaisParaCentavos("50.000,00")).toBe(VALOR_MAXIMO_DA_CONSULTA);
  });
});
