/**
 * Testes de PROPRIEDADE (fast-check): em vez de alguns exemplos escritos à mão,
 * cada teste gera centenas de entradas e confere uma regra que tem de valer para
 * todas. Quando falha, o fast-check encolhe a entrada até o menor caso que quebra
 * e mostra a semente para repetir (`seed` no erro).
 *
 * Foco no que mexe com dinheiro e dado pessoal: o Pix do paciente, os dígitos de
 * CPF/CNPJ, a conversão de valores, as máscaras do cadastro e o filtro que tira
 * dados pessoais antes da IA.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { crc16Pix, lerPixCopiaECola, montarPixEstatico, normalizarChavePix, pixComValor } from "../shared/pix";
import { centavosParaInput, formatarBRL, reaisParaCentavos, VALOR_MAXIMO_DA_CONSULTA } from "../shared/dinheiro";
import { celularValido, mascaraTelefone, soDigitos } from "../shared/telefone";
import { isValidCrp, maskCrp } from "../shared/crp";
import { mascararParaIA } from "./ai/data-loss-prevention";

// ── Referências independentes (regra oficial escrita de outro jeito) ──────────

/** CPF pela regra da Receita: pesos 10..2 e 11..2, resto < 2 vira 0. */
function cpfReferencia(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || new Set(cpf).size === 1) return false;
  const d = [...cpf].map(Number);
  const digito = (n: number) => {
    const soma = d.slice(0, n).reduce((s, x, i) => s + x * (n + 1 - i), 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(9) === d[9] && digito(10) === d[10];
}

/** CNPJ (inclusive alfanumérico) pela tabela de pesos da Receita; valor do caractere = ASCII − 48. */
function cnpjReferencia(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const valor = (c: string) => c.charCodeAt(0) - 48;
  const PESOS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const PESOS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const digito = (pesos: number[]) => {
    const resto = pesos.reduce((s, p, i) => s + valor(cnpj[i]) * p, 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(PESOS_1) === Number(cnpj[12]) && digito(PESOS_2) === Number(cnpj[13]);
}

/** Completa 9 dígitos com os 2 verificadores (pela referência). */
function completarCpf(nove: number[]): string {
  const d = [...nove];
  for (const n of [9, 10]) {
    const soma = d.reduce((s, x, i) => s + x * (n + 1 - i), 0);
    const resto = soma % 11;
    d.push(resto < 2 ? 0 : 11 - resto);
  }
  return d.join("");
}

// ── Geradores ─────────────────────────────────────────────────────────────────

const digito = fc.integer({ min: 0, max: 9 });
const cpfValido = fc
  .array(digito, { minLength: 9, maxLength: 9 })
  .filter((d) => new Set(d).size > 1)
  .map(completarCpf);
const celular = fc
  .tuple(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 1, max: 9 }), fc.array(digito, { minLength: 8, maxLength: 8 }))
  .map(([a, b, resto]) => `${a}${b}9${resto.join("")}`);
const emailSimples = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9][a-z0-9._-]{0,15}$/),
    fc.stringMatching(/^[a-z0-9]{1,12}$/),
    fc.stringMatching(/^[a-z]{2,4}$/),
  )
  .map(([local, dominio, tld]) => `${local}@${dominio}.${tld}`);

/** Chave Pix válida, no formato que o sistema guarda (DICT). */
const chavePix = fc.oneof(
  cpfValido.map((c) => ({ tipo: "cpf_cnpj" as const, chave: c })),
  celular.map((c) => ({ tipo: "celular" as const, chave: `+55${c}` })),
  emailSimples.map((e) => ({ tipo: "email" as const, chave: e })),
  fc.uuid().map((u) => ({ tipo: "aleatoria" as const, chave: u })),
);
/** Nome e cidade com qualquer caractere (acento, emoji, símbolo): o BR Code tem de sair legível. */
const textoQualquer = fc.string({ unit: "binary", maxLength: 60 });

// ── Pix ───────────────────────────────────────────────────────────────────────

describe("Pix copia e cola", () => {
  it("CRC16 confere com o vetor padrão do CCITT-FALSE", () => {
    expect(crc16Pix("123456789")).toBe("29B1");
  });

  it("trocar um caractere sempre muda o CRC", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 200 }), fc.nat(), fc.string({ minLength: 1, maxLength: 1 }), (texto, pos, novo) => {
        const i = pos % texto.length;
        fc.pre(texto[i] !== novo);
        const alterado = texto.slice(0, i) + novo + texto.slice(i + 1);
        expect(crc16Pix(alterado)).not.toBe(crc16Pix(texto));
      }),
    );
  });

  it("montar e ler de volta devolve a mesma chave, com qualquer nome e cidade", () => {
    fc.assert(
      fc.property(chavePix, textoQualquer, textoQualquer, ({ tipo, chave }, nome, cidade) => {
        const codigo = montarPixEstatico({ chave, nome, cidade });
        expect(codigo).toMatch(/^000201/);
        const lido = lerPixCopiaECola(codigo);
        expect(lido.chave).toBe(chave);
        expect(lido.tipo).toBe(tipo);
        expect(lido.cidade).toMatch(/^[A-Za-z0-9 .,-]{1,15}$/);
      }),
      { numRuns: 300 },
    );
  });

  it("o valor embutido é exatamente o da consulta, e trocar o valor não deixa o anterior", () => {
    fc.assert(
      fc.property(
        chavePix,
        fc.integer({ min: 1, max: VALOR_MAXIMO_DA_CONSULTA }),
        fc.integer({ min: 1, max: VALOR_MAXIMO_DA_CONSULTA }),
        ({ chave }, primeiro, segundo) => {
          const base = montarPixEstatico({ chave, nome: "Ana", cidade: "Recife" });
          const comValor = pixComValor(base, primeiro);
          // Ainda é um Pix válido (CRC refeito) e com a mesma chave.
          expect(lerPixCopiaECola(comValor).chave).toBe(chave);
          const campo54 = comValor.match(/5303986(54)(\d{2})([\d.]+)5802BR/);
          expect(campo54, comValor).not.toBeNull();
          expect(Number(campo54![2])).toBe(campo54![3].length);
          expect(reaisParaCentavos(campo54![3])).toBe(primeiro);
          // Trocar o valor substitui, não acumula.
          expect(pixComValor(comValor, segundo)).toBe(pixComValor(base, segundo));
        },
      ),
      { numRuns: 300 },
    );
  });

  it("código adulterado (um caractere trocado) é recusado", () => {
    fc.assert(
      fc.property(chavePix, fc.nat(), ({ chave }, pos) => {
        const codigo = montarPixEstatico({ chave, nome: "Ana", cidade: "Recife" });
        const i = pos % (codigo.length - 4);
        const trocado = codigo[i] === "1" ? "2" : "1";
        const adulterado = codigo.slice(0, i) + trocado + codigo.slice(i + 1);
        expect(() => lerPixCopiaECola(adulterado)).toThrow();
      }),
    );
  });
});

// ── CPF e CNPJ ────────────────────────────────────────────────────────────────

describe("CPF e CNPJ da chave Pix", () => {
  it("CPF: aceita exatamente o que a regra oficial aceita, com ou sem pontuação", () => {
    const onzeDigitos = fc.array(digito, { minLength: 11, maxLength: 11 }).map((d) => d.join(""));
    fc.assert(
      fc.property(fc.oneof(onzeDigitos, cpfValido), (cpf) => {
        const formatado = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
        const esperado = cpfReferencia(cpf) ? cpf : null;
        expect(normalizarChavePix("cpf_cnpj", cpf)).toBe(esperado);
        expect(normalizarChavePix("cpf_cnpj", formatado)).toBe(esperado);
      }),
      { numRuns: 1000 },
    );
  });

  it("CNPJ (inclusive alfanumérico): aceita exatamente o que a regra oficial aceita", () => {
    const caractere = fc.constantFrom(..."0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    const doze = fc.array(caractere, { minLength: 12, maxLength: 12 }).map((c) => c.join(""));
    const comDigitosCertos = doze.map((base) => {
      for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) if (cnpjReferencia(`${base}${a}${b}`)) return `${base}${a}${b}`;
      return `${base}00`;
    });
    const qualquer = fc.tuple(doze, digito, digito).map(([base, a, b]) => `${base}${a}${b}`);
    fc.assert(
      fc.property(fc.oneof(qualquer, comDigitosCertos), (cnpj) => {
        expect(normalizarChavePix("cpf_cnpj", cnpj)).toBe(cnpjReferencia(cnpj) ? cnpj : null);
        // Minúsculas e pontuação não mudam o resultado.
        const formatado = `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
        expect(normalizarChavePix("cpf_cnpj", formatado.toLowerCase())).toBe(cnpjReferencia(cnpj) ? cnpj : null);
      }),
      { numRuns: 1000 },
    );
  });
});

// ── Dinheiro ──────────────────────────────────────────────────────────────────

describe("valores em centavos", () => {
  const centavos = fc.integer({ min: 0, max: 100_000_000_00 });

  it("o que vai para o campo de valor volta igual", () => {
    fc.assert(
      fc.property(centavos, (c) => {
        expect(reaisParaCentavos(centavosParaInput(c))).toBe(c);
      }),
    );
  });

  it("o valor formatado (R$ 1.234,56) volta igual", () => {
    fc.assert(
      fc.property(centavos, (c) => {
        expect(reaisParaCentavos(formatarBRL(c))).toBe(c);
      }),
    );
  });

  it("qualquer texto vira centavos inteiros ou nada, nunca número quebrado", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.stringMatching(/^[\d.,R$ ]{0,30}$/)), (texto) => {
        const r = reaisParaCentavos(texto);
        expect(r === null || Number.isSafeInteger(r)).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });
});

// ── Máscaras do cadastro ──────────────────────────────────────────────────────

describe("máscaras de telefone e CRP", () => {
  it("telefone: aplicar a máscara duas vezes dá o mesmo, e nenhum dígito se perde (até 11)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), (texto) => {
        const uma = mascaraTelefone(texto);
        expect(mascaraTelefone(uma)).toBe(uma);
        expect(soDigitos(uma)).toBe(soDigitos(texto).slice(0, 11));
      }),
    );
  });

  it("celular válido continua válido depois da máscara", () => {
    fc.assert(
      fc.property(celular, (c) => {
        expect(celularValido(mascaraTelefone(c))).toBe(true);
      }),
    );
  });

  it("CRP: máscara estável, só dígitos e barra, e 5 a 8 dígitos viram um CRP válido", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), (texto) => {
        const uma = maskCrp(texto);
        expect(maskCrp(uma)).toBe(uma);
        expect(uma).toMatch(/^(\d{0,2}|\d{2}\/\d{1,6})$/);
        const n = soDigitos(texto).length;
        if (n >= 5) expect(isValidCrp(uma)).toBe(true);
      }),
    );
  });
});

// ── Dados pessoais antes da IA ────────────────────────────────────────────────

describe("mascararParaIA", () => {
  /** Texto comum, sem dígito e sem @: o que sobrar de número depois do filtro veio do dado pessoal. */
  const textoSemNumero = fc.stringMatching(/^[A-Za-zÀ-ú ,.!?:;()-]{0,40}$/);
  const cpfEscrito = cpfValido.chain((c) =>
    fc.constantFrom(c, `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`),
  );
  const telefoneEscrito = celular.chain((c) =>
    fc.constantFrom(
      c,
      `(${c.slice(0, 2)}) ${c.slice(2, 7)}-${c.slice(7)}`,
      `${c.slice(0, 2)} ${c.slice(2, 7)}-${c.slice(7)}`,
      `+55 ${c.slice(0, 2)} ${c.slice(2, 7)}-${c.slice(7)}`,
      `+55${c}`,
      `${c.slice(2, 7)}-${c.slice(7)}`,
    ),
  );

  it("CPF e telefone no meio de uma frase não chegam à IA", () => {
    fc.assert(
      fc.property(textoSemNumero, fc.oneof(cpfEscrito, telefoneEscrito), textoSemNumero, (antes, dado, depois) => {
        const saida = mascararParaIA(`${antes} ${dado} ${depois}`);
        expect(soDigitos(saida), saida).toBe("");
      }),
      { numRuns: 1000 },
    );
  });

  it("e-mail no meio de uma frase não chega à IA", () => {
    fc.assert(
      fc.property(textoSemNumero, emailSimples, textoSemNumero, (antes, email, depois) => {
        const saida = mascararParaIA(`${antes} ${email} ${depois}`);
        expect(saida, saida).not.toContain("@");
        expect(saida).toContain("[e-mail retirado]");
      }),
      { numRuns: 1000 },
    );
  });

  it("texto sem dado pessoal passa intacto", () => {
    fc.assert(
      fc.property(textoSemNumero, (texto) => {
        expect(mascararParaIA(texto)).toBe(texto);
      }),
    );
  });
});
