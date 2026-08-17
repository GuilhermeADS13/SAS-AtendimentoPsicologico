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
