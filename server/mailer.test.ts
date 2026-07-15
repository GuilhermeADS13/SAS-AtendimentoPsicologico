import { describe, expect, it } from "vitest";
import { pickProvider } from "./mailer";

const smtp = {
  SMTP_HOST: "smtp.gmail.com",
  SMTP_USER: "alguem@gmail.com",
  SMTP_PASS: "senha",
} as NodeJS.ProcessEnv;

describe("escolha do provedor de e-mail", () => {
  /**
   * A regra que importa: no Render, SMTP é bloqueado (portas 25/465/587 fechadas
   * na saída do plano free) e todo envio morre em "Connection timeout". Se a
   * Brevo estiver configurada, ela TEM que ganhar — mesmo com SMTP presente,
   * como acontece em produção, onde as duas variáveis convivem.
   */
  it("prefere a Brevo quando as duas estão configuradas", () => {
    expect(pickProvider({ ...smtp, BREVO_API_KEY: "xkeysib-abc" })).toBe("brevo");
  });

  it("usa SMTP quando não há Brevo (é o caso do desenvolvimento local)", () => {
    expect(pickProvider(smtp)).toBe("smtp");
  });

  it("cai em dry-run sem nenhuma configuração", () => {
    expect(pickProvider({})).toBe("dry-run");
  });

  it("SMTP incompleto não conta como configurado", () => {
    expect(pickProvider({ SMTP_HOST: "smtp.gmail.com" })).toBe("dry-run");
    expect(pickProvider({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "a@b.c" })).toBe("dry-run");
  });

  it("só a chave da Brevo já basta", () => {
    expect(pickProvider({ BREVO_API_KEY: "xkeysib-abc" })).toBe("brevo");
  });
});
