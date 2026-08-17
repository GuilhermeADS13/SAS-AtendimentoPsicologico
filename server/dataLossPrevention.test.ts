import { describe, expect, it } from "vitest";
import {
  detectSensitiveIdentifiers,
  minimizeTelemetryMetadata,
  redactForTelemetry,
} from "./ai/data-loss-prevention";

describe("DLP e minimização de telemetria", () => {
  it("detecta identificadores comuns sem salvar o valor original", () => {
    const kinds = detectSensitiveIdentifiers("CPF 123.456.789-09, contato teste@example.com e telefone (11) 99999-9999");
    expect(kinds).toEqual(expect.arrayContaining(["cpf", "email", "phone"]));
    expect(kinds).toHaveLength(3);
  });

  it("detecta em chamadas repetidas (não vaza por lastIndex do regex /g)", () => {
    // O bug: regex global compartilhado guarda lastIndex entre chamadas, então a
    // 2ª/3ª detecção começava adiantada e dava falso negativo. Cada chamada tem
    // que ser independente.
    expect(detectSensitiveIdentifiers("cpf 123.456.789-09")).toContain("cpf");
    expect(detectSensitiveIdentifiers("111.222.333-44")).toContain("cpf");
    expect(detectSensitiveIdentifiers("222.333.444-55")).toContain("cpf");
    expect(detectSensitiveIdentifiers("outro@dominio.com")).toContain("email");
    expect(detectSensitiveIdentifiers("mais.um@teste.com")).toContain("email");
  });

  it("mascara segredos conhecidos", () => {
    expect(redactForTelemetry("token sk_live_123456789abc")).toBe("token [REDACTED]");
  });

  it("limita tamanho e mascara apenas metadata permitido", () => {
    const result = minimizeTelemetryMetadata({
      reason: "contato teste@example.com",
      latencyMs: 42,
      long: "x".repeat(300),
    });
    expect(result.reason).toBe("contato [REDACTED]");
    expect(result.latencyMs).toBe(42);
    expect(String(result.long)).toHaveLength(160);
  });
});
