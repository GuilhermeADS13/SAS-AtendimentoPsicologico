import { describe, expect, it } from "vitest";
import { crc16Pix, lerPixCopiaECola, montarPixEstatico, normalizarChavePix, palpiteDoTipoDeChave, pixComValor } from "../shared/pix";

// Código FICTÍCIO no mesmo formato do da conta (estático, chave aleatória, sem
// valor) — o real fica só em client/src/lib/suporte.ts.
const semCrc =
  "00020126580014BR.GOV.BCB.PIX0136123e4567-e89b-12d3-a456-4266141740005204000053039865802BR5913FULANO DE TAL6006RECIFE62140510ABCDE123456304";
const ESTATICO = semCrc + crc16Pix(semCrc);

describe("Pix copia e cola com valor", () => {
  it("CRC16 do padrão (vetor de teste '123456789' = 29B1)", () => {
    expect(crc16Pix("123456789")).toBe("29B1");
  });

  it("põe o valor no campo 54, logo depois da moeda, e refaz o CRC", () => {
    const codigo = pixComValor(ESTATICO, 7600);
    expect(codigo).toContain("5303986540576.005802BR");
    expect(codigo.slice(-8, -4)).toBe("6304");
    expect(codigo.slice(-4)).toBe(crc16Pix(codigo.slice(0, -4)));
  });

  it("mantém a chave, o nome e a cidade", () => {
    const codigo = pixComValor(ESTATICO, 105000);
    expect(codigo).toContain("0136123e4567-e89b-12d3-a456-426614174000");
    expect(codigo).toContain("5913FULANO DE TAL6006RECIFE");
    expect(codigo).toContain("54071050.00");
  });

  it("monta o código da psicóloga a partir da chave (nome sem acento, cidade cortada)", () => {
    const codigo = montarPixEstatico({ chave: "+5581999990000", nome: "Ana Lúcia Conceição", cidade: "São José dos Campos" });
    expect(codigo).toContain("0014br.gov.bcb.pix0114+5581999990000");
    expect(codigo).toContain("5919Ana Lucia Conceicao");
    expect(codigo).toContain("6015Sao Jose dos Ca");
    expect(codigo.slice(-4)).toBe(crc16Pix(codigo.slice(0, -4)));
    // E aceita o valor depois, como o da conta do VozInterior.
    const comValor = pixComValor(codigo, 15000);
    expect(comValor).toContain("5406150.00");
    expect(comValor.slice(-4)).toBe(crc16Pix(comValor.slice(0, -4)));
  });

  it.each([
    ["cpf_cnpj", "123.456.789-09", "12345678909"],
    ["cpf_cnpj", "12.345.678/0001-95", "12345678000195"],
    ["cpf_cnpj", "123", null],
    ["celular", "(81) 99999-0000", "+5581999990000"],
    ["celular", "+55 81 99999-0000", "+5581999990000"],
    ["celular", "(81) 3333-0000", null],
    ["email", " Ana@Exemplo.com ", "ana@exemplo.com"],
    ["email", "ana@", null],
    ["aleatoria", "123E4567-E89B-12D3-A456-426614174000", "123e4567-e89b-12d3-a456-426614174000"],
    ["aleatoria", "nao-e-chave", null],
  ] as const)("chave %s %s → %s", (tipo, valor, esperado) => {
    expect(normalizarChavePix(tipo, valor)).toBe(esperado);
  });

  it("trocar o valor não acumula campos", () => {
    const duas = pixComValor(pixComValor(ESTATICO, 7600), 9500);
    expect(duas.match(/5303986(54\d\d[\d.]+)5802/)?.[1]).toBe("540595.00");
  });
});

describe("Pix copia e cola colado pela psicóloga", () => {
  const campo = (id: string, valor: string) => `${id}${String(valor.length).padStart(2, "0")}${valor}`;
  const comCrc = (s: string) => s + crc16Pix(s);

  it("tira a chave aleatória e a cidade do código do banco (GUI em maiúsculas)", () => {
    expect(lerPixCopiaECola(ESTATICO)).toEqual({ tipo: "aleatoria", chave: "123e4567-e89b-12d3-a456-426614174000", cidade: "RECIFE" });
  });

  it("aceita quebra de linha e espaços nas pontas (colado de mensagem)", () => {
    expect(lerPixCopiaECola(`  ${ESTATICO.slice(0, 40)}\n${ESTATICO.slice(40)}\n`).chave).toBe("123e4567-e89b-12d3-a456-426614174000");
  });

  it.each([
    ["+5581999990000", "celular", "+5581999990000"],
    ["ana@exemplo.com", "email", "ana@exemplo.com"],
    ["12345678909", "cpf_cnpj", "12345678909"],
    ["12345678000195", "cpf_cnpj", "12345678000195"],
  ] as const)("reconhece a chave %s como %s", (chave, tipo, esperado) => {
    const codigo = montarPixEstatico({ chave, nome: "Ana", cidade: "Olinda" });
    expect(lerPixCopiaECola(codigo)).toEqual({ tipo, chave: esperado, cidade: "Olinda" });
  });

  it("ignora o valor e a descrição que o banco tenha posto (o da consulta entra depois)", () => {
    const conta = campo("00", "br.gov.bcb.pix") + campo("01", "+5581999990000") + campo("02", "Consultas");
    const codigo = comCrc(`000201010211${campo("26", conta)}520400005303986${campo("54", "1.00")}5802BR5903Ana6006Olinda62070503***6304`);
    expect(lerPixCopiaECola(codigo)).toEqual({ tipo: "celular", chave: "+5581999990000", cidade: "Olinda" });
  });

  it("recusa Pix dinâmico (cobrança com link), que não deixa trocar o valor", () => {
    const conta = campo("00", "br.gov.bcb.pix") + campo("25", "qr.banco.com.br/cobv/abc123456");
    const codigo = comCrc(`000201010212${campo("26", conta)}5204000053039865802BR5903Ana6006Olinda62070503***6304`);
    expect(() => lerPixCopiaECola(codigo)).toThrow(/dinâmico/);
  });

  it("recusa código cortado (CRC não confere) e texto qualquer", () => {
    expect(() => lerPixCopiaECola(ESTATICO.slice(0, -1) + "0")).toThrow(/incompleto/);
    expect(() => lerPixCopiaECola("minha chave é ana@exemplo.com")).toThrow(/não parece/);
  });

  it.each([
    ["(81) 99999-0000", "celular"],
    ["+55 81 99999-0000", "celular"],
    ["81999990000", "celular"],
    ["123.456.789-09", "cpf_cnpj"],
    ["12345678909", "cpf_cnpj"],
    ["12.345.678/0001-95", "cpf_cnpj"],
    ["ana@exemplo.com", "email"],
    ["123E4567-E89B-12D3-A456-426614174000", "aleatoria"],
    ["oi", null],
  ] as const)("chave colada no lugar do copia e cola: %s → %s", (valor, tipo) => {
    expect(palpiteDoTipoDeChave(valor)).toBe(tipo);
  });

  it("o código remontado a partir da leitura aceita o valor da consulta", () => {
    const lido = lerPixCopiaECola(ESTATICO);
    const comValor = pixComValor(montarPixEstatico({ chave: lido.chave, nome: "Ana", cidade: lido.cidade }), 15000);
    expect(comValor).toContain("0136123e4567-e89b-12d3-a456-426614174000");
    expect(comValor).toContain("5406150.00");
    expect(comValor.slice(-4)).toBe(crc16Pix(comValor.slice(0, -4)));
  });
});
