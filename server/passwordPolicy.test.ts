import { describe, expect, it } from "vitest";
import {
  getPasswordChecks,
  isStrongPassword,
  validatePassword,
  PASSWORD_MAX_LENGTH,
} from "@shared/passwordPolicy";

describe("política de senha", () => {
  it("aceita uma senha que cumpre todos os requisitos", () => {
    expect(isStrongPassword("Consulta@2026")).toBe(true);
    expect(validatePassword("Consulta@2026")).toBe("");
  });

  it.each([
    ["Ab@1", "curta demais"],
    ["consulta@2026", "sem maiúscula"],
    ["CONSULTA@2026", "sem minúscula"],
    ["Consulta@abc", "sem número"],
    ["Consulta2026", "sem símbolo"],
  ])("rejeita %s (%s)", (senha) => {
    expect(isStrongPassword(senha)).toBe(false);
    expect(validatePassword(senha)).not.toBe("");
  });

  it("rejeita senha com espaço", () => {
    expect(isStrongPassword("Consulta @2026")).toBe(false);
    expect(validatePassword("Consulta @2026")).toMatch(/espaços/i);
  });

  it("rejeita senha acima do limite", () => {
    const longa = "A1@" + "a".repeat(PASSWORD_MAX_LENGTH);
    expect(validatePassword(longa)).toMatch(/no máximo/i);
  });

  it("exige a senha quando vazia", () => {
    expect(validatePassword("")).toBe("Informe a senha.");
  });

  it("aponta exatamente qual requisito faltou", () => {
    const checks = getPasswordChecks("consulta2026");
    expect(checks.hasUppercase).toBe(false);
    expect(checks.hasSymbol).toBe(false);
    expect(checks.hasLowercase).toBe(true);
    expect(checks.hasNumber).toBe(true);
    expect(checks.minLength).toBe(true);
  });
});
