import { describe, expect, it } from "vitest";
import { podeEnviarRecuperacao } from "./routers";
import { emailComMarca } from "./emailLayout";

/**
 * "Esqueci minha senha" é público: sem limite, qualquer um lotaria a caixa de
 * outra pessoa (ou a cota da Brevo) disparando o pedido em laço.
 */
describe("esqueci minha senha", () => {
  it("um envio a cada 2 minutos para o mesmo e-mail", () => {
    const t = 1_000_000;
    expect(podeEnviarRecuperacao("a@exemplo.com", "ip-a", t)).toBe(true);
    expect(podeEnviarRecuperacao("a@exemplo.com", "ip-b", t + 60_000)).toBe(false);
    expect(podeEnviarRecuperacao("a@exemplo.com", "ip-b", t + 121_000)).toBe(true);
  });

  it("no máximo 5 pedidos a cada 10 minutos do mesmo IP", () => {
    const t = 50_000_000;
    for (let i = 0; i < 5; i++) expect(podeEnviarRecuperacao(`p${i}@exemplo.com`, "ip-laco", t + i)).toBe(true);
    expect(podeEnviarRecuperacao("p6@exemplo.com", "ip-laco", t + 10)).toBe(false);
    expect(podeEnviarRecuperacao("p7@exemplo.com", "ip-laco", t + 10 * 60_000 + 1)).toBe(true);
  });

  it("o e-mail sai com a marca, o nome da pessoa e o botão", () => {
    const html = emailComMarca({
      nome: "Ana Souza",
      titulo: "Redefinir sua senha",
      corpo: "<p>x</p>",
      botao: { texto: "Criar nova senha", url: "https://exemplo/link" },
      base: "https://sas.exemplo",
    });
    expect(html).toContain("Olá, Ana!");
    expect(html).toContain("https://sas.exemplo/vozinterior-mark.png");
    expect(html).toContain('href="https://exemplo/link"');
    expect(html).not.toContain("Supabase");
  });

  it("nome com marcação vira texto", () => {
    const html = emailComMarca({ nome: "<script>x", titulo: "t", corpo: "", base: "https://s" });
    expect(html).not.toContain("<script>");
  });
});
