import { describe, expect, it } from "vitest";
import { assertAiScope, canAccessAiRecord } from "./ai/access";

describe("acesso ao escopo do agente", () => {
  it("exige identificador clínico para memórias clínicas", () => {
    expect(() => assertAiScope("patient", { userId: 10 })).toThrow("patientId");
    expect(() => assertAiScope("therapist", { userId: 10 })).toThrow("therapistId");
    expect(() =>
      assertAiScope("user", { userId: 10, patientId: 20 }),
    ).toThrow("vínculo clínico");
  });

  it("permite somente o próprio usuário ou o escopo profissional correspondente", () => {
    const record = { userId: 10, therapistId: 30, patientId: 20 };
    expect(canAccessAiRecord({ userId: 10, role: "patient", patientId: 20 }, record)).toBe(true);
    expect(canAccessAiRecord({ userId: 99, role: "patient", patientId: 20 }, record)).toBe(true);
    expect(canAccessAiRecord({ userId: 98, role: "therapist", therapistId: 30 }, record)).toBe(true);
    expect(canAccessAiRecord({ userId: 97, role: "therapist", therapistId: 31 }, record)).toBe(false);
    expect(canAccessAiRecord({ userId: 96, role: "admin" }, record)).toBe(false);
  });
});
