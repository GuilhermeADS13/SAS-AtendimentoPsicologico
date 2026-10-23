import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import {
  MAX_PARTICIPANTES_EXTRAS,
  TETO_VIDEO_BPS,
  motivoParaRecusarParticipante,
  reducaoDeResolucao,
  tetoDeVideoPorPessoa,
} from "@shared/chamadaEmGrupo";

describe("chamada em grupo: participantes", () => {
  it("até 2 extras (4 pessoas com a psicóloga e o principal)", () => {
    expect(MAX_PARTICIPANTES_EXTRAS).toBe(2);
    expect(motivoParaRecusarParticipante({ ehPrincipal: false, jaParticipa: false, extras: 1 })).toBeNull();
    expect(motivoParaRecusarParticipante({ ehPrincipal: false, jaParticipa: false, extras: 2 })).toMatch(/até 4 pessoas/);
  });

  it("não deixa repetir nem adicionar o próprio paciente principal", () => {
    expect(motivoParaRecusarParticipante({ ehPrincipal: true, jaParticipa: false, extras: 0 })).toMatch(/principal/);
    expect(motivoParaRecusarParticipante({ ehPrincipal: false, jaParticipa: true, extras: 1 })).toMatch(/já participa/);
  });
});

describe("chamada em grupo: participantes ao agendar", () => {
  it("o servidor recusa mais de 2 participantes na Nova Consulta", async () => {
    const psicologa = appRouter.createCaller({
      user: { id: 1, role: "therapist", openId: "x", name: "Beatriz", email: "b@exemplo.com" },
      req: { get: () => undefined, headers: {}, socket: { remoteAddress: "127.0.0.1" } },
      res: {},
    } as never);
    await expect(
      psicologa.appointments.create({ patientId: 1, scheduledAt: new Date().toISOString(), participantes: [2, 3, 4] }),
    ).rejects.toThrow();
  });
});

describe("chamada em grupo: banda repartida (ideia do Discord)", () => {
  it("a dois, o teto de sempre; com mais gente, dividido entre os destinos", () => {
    expect(tetoDeVideoPorPessoa(2)).toBe(TETO_VIDEO_BPS);
    expect(tetoDeVideoPorPessoa(3)).toBe(TETO_VIDEO_BPS / 2);
    expect(tetoDeVideoPorPessoa(4)).toBeLessThan(TETO_VIDEO_BPS / 2);
    // Subida total com 4 pessoas não passa do teto de uma chamada a dois.
    expect(tetoDeVideoPorPessoa(4) * 3).toBeLessThanOrEqual(TETO_VIDEO_BPS + 3);
  });

  it("resolução só reduz com 4 pessoas", () => {
    expect(reducaoDeResolucao(2)).toBe(1);
    expect(reducaoDeResolucao(3)).toBe(1);
    expect(reducaoDeResolucao(4)).toBe(1.5);
  });
});
