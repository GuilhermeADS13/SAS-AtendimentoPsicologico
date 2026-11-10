import { describe, expect, it } from "vitest";
import { lerCsv, lerNascimento, lerPacientes, mapearColunas, oQueFaltaNasColunas } from "../shared/importarPacientes";

const agora = new Date("2026-11-10T12:00:00-03:00");

describe("cabeçalho da planilha", () => {
  it("reconhece os nomes comuns, com e sem acento, em qualquer ordem", () => {
    expect(mapearColunas(["E-mail", "Nome completo", "Celular", "Data de Nascimento", "CPF", "Endereço"])).toEqual({
      email: 0, nomeCompleto: 1, telefone: 2, nascimento: 3, cpf: 4, endereco: 5,
    });
    expect(mapearColunas(["Nome", "Sobrenome", "EMAIL", "WhatsApp"])).toEqual({ nome: 0, sobrenome: 1, email: 2, telefone: 3 });
  });

  it("'Nome' sozinho é o nome completo", () => {
    expect(mapearColunas(["Nome", "Email"])).toEqual({ nomeCompleto: 0, email: 1 });
  });

  it("diz o que falta para importar", () => {
    expect(oQueFaltaNasColunas(mapearColunas(["Paciente", "Telefone"]))).toEqual(["uma coluna “E-mail”"]);
    expect(oQueFaltaNasColunas(mapearColunas(["Email"]))).toEqual(["uma coluna “Nome”"]);
  });
});

describe("CSV", () => {
  it("lê o ponto e vírgula do Excel brasileiro, com aspas e BOM", () => {
    expect(lerCsv('﻿Nome;E-mail\r\n"Silva; Ana";ana@x.com\r\nBia;"b""@x.com"\r\n')).toEqual([
      ["Nome", "E-mail"],
      ["Silva; Ana", "ana@x.com"],
      ["Bia", 'b"@x.com'],
    ]);
  });

  it("aceita vírgula quando é ela que separa o cabeçalho", () => {
    expect(lerCsv("nome,email\nAna,ana@x.com")).toEqual([["nome", "email"], ["Ana", "ana@x.com"]]);
  });
});

describe("data de nascimento", () => {
  it("entende dd/mm/aaaa, ISO, ano com 2 dígitos e o número do Excel", () => {
    expect(lerNascimento("05/03/1990", agora)).toBe("1990-03-05");
    expect(lerNascimento("5/3/90", agora)).toBe("1990-03-05");
    expect(lerNascimento("1/2/05", agora)).toBe("2005-02-01");
    expect(lerNascimento("1990-03-05", agora)).toBe("1990-03-05");
    expect(lerNascimento(32937, agora)).toBe("1990-03-05");
    expect(lerNascimento("ontem", agora)).toBeNull();
  });
});

describe("linhas viram pacientes", () => {
  it("separa nome e sobrenome, normaliza o e-mail e formata o telefone", () => {
    const { linhas } = lerPacientes(
      [
        ["Nome completo", "E-mail", "Celular", "Nascimento", "CPF"],
        ["Ana Maria Souza", " Ana@Gmail.com ", "55 81 99999-0000", "05/03/1990", 11144477735],
      ],
      1,
      agora,
    );
    expect(linhas).toEqual([
      {
        linha: 2,
        avisos: [],
        paciente: {
          firstName: "Ana",
          lastName: "Maria Souza",
          email: "ana@gmail.com",
          phone: "(81) 99999-0000",
          dateOfBirth: "1990-03-05",
          cpf: "11144477735",
        },
      },
    ]);
  });

  it("devolve o zero que o Excel come do CPF", () => {
    // 012.345.678-90 guardado como número vira 1234567890.
    const { linhas } = lerPacientes([["Nome", "Email", "CPF"], ["Ana", "a@x.com", 1234567890]], 1, agora);
    expect(linhas[0].paciente?.cpf).toBe("01234567890");
  });

  it("linha sem nome, sem e-mail, com e-mail inválido ou repetido fica de fora com o motivo", () => {
    const { linhas } = lerPacientes(
      [
        ["Nome", "Email"],
        ["", "a@x.com"],
        ["Bia", ""],
        ["Caio", "caio@"],
        ["Davi", "davi@x.com"],
        ["Davi 2", "DAVI@x.com"],
        ["", ""],
      ],
      1,
      agora,
    );
    expect(linhas.map((l) => [l.linha, l.erro ?? "ok"])).toEqual([
      [2, "sem nome"],
      [3, "sem e-mail"],
      [4, "e-mail inválido (caio@)"],
      [5, "ok"],
      [6, "e-mail repetido na planilha"],
    ]);
  });

  it("opcional errado não barra a linha: fica em branco e avisa", () => {
    const { linhas } = lerPacientes(
      [["Nome", "Email", "Telefone", "Nascimento", "CPF"], ["Ana", "a@x.com", "9999-0000", "31/02/1990", "123"]],
      1,
      agora,
    );
    expect(linhas[0].paciente).toEqual({ firstName: "Ana", lastName: "", email: "a@x.com" });
    expect(linhas[0].avisos).toEqual(["telefone sem DDD ou incompleto", "data de nascimento inválida", "CPF inválido"]);
  });

  it("numera as linhas a partir do cabeçalho real", () => {
    const { linhas } = lerPacientes([["Nome", "Email"], ["Ana", "a@x.com"]], 3, agora);
    expect(linhas[0].linha).toBe(4);
  });
});
