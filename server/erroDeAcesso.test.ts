import { describe, expect, it } from "vitest";
import { emailValido, mensagemDeErroDeAcesso } from "@shared/erroDeAcesso";

describe("emailValido", () => {
  it("aceita e-mails completos", () => {
    expect(emailValido("ana@gmail.com")).toBe(true);
    expect(emailValido("  ana.souza@empresa.com.br ")).toBe(true);
  });

  it("recusa e-mail sem a extensão do domínio (o caso do print: nome@outlook)", () => {
    expect(emailValido("ana.souza@outlook")).toBe(false);
  });

  it("recusa vazio, sem @, com espaço ou com ponto sobrando", () => {
    for (const e of ["", "ana", "ana@", "@gmail.com", "ana souza@gmail.com", "ana@gmail.", "ana@.com", "ana@gmail..com"]) {
      expect(emailValido(e), e).toBe(false);
    }
  });
});

describe("mensagemDeErroDeAcesso", () => {
  it("traduz pelo código do Supabase", () => {
    expect(mensagemDeErroDeAcesso({ code: "invalid_credentials", message: "Invalid login credentials" }, "x")).toBe(
      "E-mail ou senha incorretos. Confira e tente de novo.",
    );
    expect(mensagemDeErroDeAcesso({ code: "email_not_confirmed" }, "x")).toMatch(/^Confirme seu e-mail/);
  });

  it("sem código, traduz pela mensagem em inglês", () => {
    expect(mensagemDeErroDeAcesso(new Error("Invalid login credentials"), "x")).toMatch(/^E-mail ou senha incorretos/);
    expect(mensagemDeErroDeAcesso(new TypeError("Failed to fetch"), "x")).toMatch(/^Sem conexão/);
  });

  it("nunca deixa passar inglês desconhecido: usa a frase padrão", () => {
    expect(mensagemDeErroDeAcesso(new Error("Something unexpected happened"), "Não foi possível entrar.")).toBe(
      "Não foi possível entrar.",
    );
    expect(mensagemDeErroDeAcesso(null, "padrão")).toBe("padrão");
  });
});
