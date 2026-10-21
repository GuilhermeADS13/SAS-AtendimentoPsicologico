import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/** Humor 0–10 e fase da sessão (aba "Evolução"): fora da regra, o servidor recusa. */
const psicologa = () =>
  appRouter.createCaller({
    user: { id: 1, role: "therapist", openId: "x", name: "Beatriz", email: "b@exemplo.com" } as TrpcContext["user"],
    req: { get: () => undefined, headers: {}, socket: { remoteAddress: "127.0.0.1" } } as unknown as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  });

describe("sessions.classificar", () => {
  it("recusa humor fora de 0 a 10 e fase que não existe", async () => {
    await expect(psicologa().sessions.classificar({ sessionId: 1, moodScore: 11, fase: null })).rejects.toThrow();
    await expect(psicologa().sessions.classificar({ sessionId: 1, moodScore: -1, fase: null })).rejects.toThrow();
    await expect(psicologa().sessions.classificar({ sessionId: 1, moodScore: 5.5, fase: null })).rejects.toThrow();
    await expect(
      psicologa().sessions.classificar({ sessionId: 1, moodScore: null, fase: "qualquer" as never }),
    ).rejects.toThrow();
  });

  it("paciente não classifica sessão (só psicóloga)", async () => {
    const paciente = appRouter.createCaller({
      user: { id: 2, role: "user", openId: "y", name: "Ana", email: "a@exemplo.com" } as TrpcContext["user"],
      req: { get: () => undefined, headers: {}, socket: { remoteAddress: "127.0.0.1" } } as unknown as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });
    await expect(paciente.sessions.classificar({ sessionId: 1, moodScore: 5, fase: "intervencao" })).rejects.toThrow();
  });
});
