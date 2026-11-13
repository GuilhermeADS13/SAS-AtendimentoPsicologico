import { describe, expect, it } from "vitest";
import {
  ehMaiorDeIdade,
  faltaParaAparecer,
  horarioPodeSerAberto,
  horarioPodeSerPedido,
  idadeEmAnos,
  modalidadeAtende,
  motivoParaNaoPedir,
  normalizarBusca,
  perfilCasaComTexto,
  separarNome,
  statusVisivel,
} from "../shared/conhecer";

// 13/11/2026 12:00 em Brasília (15:00 UTC).
const AGORA = new Date("2026-11-13T15:00:00Z");
const MIN = 60 * 1000;

describe("encontrar uma psicóloga: regras", () => {
  it("idade completa, virando no dia do aniversário (horário de Brasília)", () => {
    expect(idadeEmAnos("2008-11-13", AGORA)).toBe(18);
    expect(idadeEmAnos("2008-11-14", AGORA)).toBe(17);
    expect(idadeEmAnos("1990-01-01", AGORA)).toBe(36);
    // 13/11 às 01:00 UTC ainda é 12/11 em Brasília: não fez 18.
    expect(idadeEmAnos("2008-11-13", new Date("2026-11-13T01:00:00Z"))).toBe(17);
  });

  it("data inválida ou absurda não vale como idade", () => {
    expect(idadeEmAnos("2008-02-30", AGORA)).toBeNull();
    expect(idadeEmAnos("13/11/2008", AGORA)).toBeNull();
    expect(idadeEmAnos("2030-01-01", AGORA)).toBeNull();
    expect(idadeEmAnos(null, AGORA)).toBeNull();
    expect(ehMaiorDeIdade("2008-11-14", AGORA)).toBe(false);
    expect(ehMaiorDeIdade("2008-11-13", AGORA)).toBe(true);
  });

  it("o paciente só pede horário que começa daqui a 2 horas ou mais", () => {
    expect(horarioPodeSerPedido(new Date(AGORA.getTime() + 120 * MIN), AGORA)).toBe(true);
    expect(horarioPodeSerPedido(new Date(AGORA.getTime() + 119 * MIN), AGORA)).toBe(false);
  });

  it("a psicóloga abre horário no futuro e até 60 dias", () => {
    expect(horarioPodeSerAberto(new Date(AGORA.getTime() + 60 * MIN), AGORA)).toBe(true);
    expect(horarioPodeSerAberto(new Date(AGORA.getTime() + 10 * MIN), AGORA)).toBe(false);
    expect(horarioPodeSerAberto(new Date(AGORA.getTime() + 61 * 24 * 60 * MIN), AGORA)).toBe(false);
    expect(horarioPodeSerAberto(new Date("data ruim"), AGORA)).toBe(false);
  });

  it("pedido pendente com horário vencido aparece como expirado", () => {
    expect(statusVisivel({ status: "pendente", inicio: new Date(AGORA.getTime() - MIN) }, AGORA)).toBe("expirado");
    expect(statusVisivel({ status: "pendente", inicio: new Date(AGORA.getTime() + MIN) }, AGORA)).toBe("pendente");
    expect(statusVisivel({ status: "aceito", inicio: new Date(AGORA.getTime() - MIN) }, AGORA)).toBe("aceito");
  });

  it("busca ignora acento e caixa, e exige todas as palavras", () => {
    expect(normalizarBusca("  Psicanálise   LACANIANA ")).toBe("psicanalise lacaniana");
    const perfil = {
      nome: "Ana Lúcia",
      specialties: "Ansiedade, Depressão",
      abordagem: "Psicanálise",
      publicoAtendido: "Adultos",
      bio: "Atendo há 10 anos.",
      cidade: "Recife",
    };
    expect(perfilCasaComTexto(perfil, "psicanalise ansiedade")).toBe(true);
    expect(perfilCasaComTexto(perfil, "lucia recife")).toBe(true);
    expect(perfilCasaComTexto(perfil, "psicanalise criancas")).toBe(false);
    expect(perfilCasaComTexto(perfil, "   ")).toBe(true);
  });

  it("modalidade: 'ambos' atende online e presencial; sem modalidade conta como online", () => {
    expect(modalidadeAtende("ambos", "presencial")).toBe(true);
    expect(modalidadeAtende("online", "presencial")).toBe(false);
    expect(modalidadeAtende(null, "online")).toBe(true);
    expect(modalidadeAtende(null, "presencial")).toBe(false);
    expect(modalidadeAtende("presencial", null)).toBe(true);
  });

  it("separa o nome para a ficha do paciente", () => {
    expect(separarNome("Maria da Silva Souza")).toEqual({ firstName: "Maria", lastName: "da Silva Souza" });
    expect(separarNome("Cher")).toEqual({ firstName: "Cher", lastName: "" });
    expect(separarNome("  ")).toEqual({ firstName: "Paciente", lastName: "" });
  });

  it("perfil vazio não aparece na busca", () => {
    expect(faltaParaAparecer({ specialties: " , ", bio: "Oi" })).toHaveLength(2);
    expect(faltaParaAparecer({ specialties: "Ansiedade", bio: "Atendo adultos com ansiedade há oito anos, online." })).toEqual([]);
  });

  it("quem pode pedir uma primeira conversa", () => {
    const base = { role: "user", vinculoAtivo: false, perfilCompleto: true, nascimento: "1990-05-05", temPedidoPendente: false, agora: AGORA };
    expect(motivoParaNaoPedir(base)).toBeNull();
    expect(motivoParaNaoPedir({ ...base, role: "therapist" })).toBe("psicologa");
    expect(motivoParaNaoPedir({ ...base, role: "admin" })).toBe("psicologa");
    expect(motivoParaNaoPedir({ ...base, vinculoAtivo: true })).toBe("vinculado");
    expect(motivoParaNaoPedir({ ...base, perfilCompleto: false })).toBe("perfil");
    expect(motivoParaNaoPedir({ ...base, nascimento: "2010-01-01" })).toBe("menor");
    expect(motivoParaNaoPedir({ ...base, temPedidoPendente: true })).toBe("pendente");
  });
});
