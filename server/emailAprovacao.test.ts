import { describe, expect, it } from "vitest";
import { emailDoResultadoDaSolicitacao } from "./notifications";

const base = "https://sistema.exemplo";

describe("e-mail do resultado da análise do CRP", () => {
  it("aprovada com teste: papel timbrado, botão de entrar e o prazo", () => {
    const { assunto, html } = emailDoResultadoDaSolicitacao({ fullName: "Ana Souza", approved: true, ganhouTeste: true }, base);
    expect(assunto).toBe("Seu cadastro foi aprovado — VozInterior");
    expect(html).toContain(`${base}/vozinterior-mark.png`);
    expect(html).toContain("Olá, Ana!");
    expect(html).toContain(`href="${base}/login"`);
    expect(html).toContain("14 dias");
    expect(html).toContain("30 dias");
  });

  it("aprovada sem teste não promete dias grátis: o acesso depende do Pix", () => {
    const { html } = emailDoResultadoDaSolicitacao({ fullName: "Ana", approved: true, ganhouTeste: false }, base);
    expect(html).not.toContain("14 dias");
    expect(html).toContain("já usou o teste grátis");
    expect(html).toContain("Pix");
  });

  it("recusada: sem botão de entrar e com a conta mantida", () => {
    const { assunto, html } = emailDoResultadoDaSolicitacao({ fullName: "Ana", approved: false }, base);
    expect(assunto).toBe("Sobre sua solicitação de acesso — VozInterior");
    expect(html).not.toContain(`${base}/login`);
    expect(html).toContain("continua ativa como paciente");
  });

  it("nome digitado no cadastro não vira HTML", () => {
    const { html } = emailDoResultadoDaSolicitacao({ fullName: "<img/src=x>", approved: true, ganhouTeste: true }, base);
    expect(html).not.toContain("<img/src=x>");
  });
});
