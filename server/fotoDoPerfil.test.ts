/**
 * A foto do perfil só pode ser a da pasta da própria conta (`<uid>/avatar.<ext>`).
 *
 * A busca pública assina a foto da psicóloga com a service role, que fura a regra do
 * bucket: sem esta conferência, uma conta gravava como "sua" o caminho da foto de um
 * paciente (que aparece nas URLs assinadas da lista dela) e a busca a mostrava a
 * qualquer visitante. Roda sem banco: a recusa vem antes de qualquer consulta.
 */
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "";
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function conta(role: "therapist" | "user", openId: string): TrpcContext {
  return {
    user: {
      id: 7, openId, email: "conta@exemplo.com", name: "Conta Teste", loginMethod: "supabase",
      role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    aparelhoVerificado: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  } as TrpcContext;
}

const perfil = { crp: "02/12345", specialties: "Ansiedade", bio: "Bio." };

describe("foto do perfil", () => {
  it("psicóloga não grava como dela a foto de outra conta", async () => {
    const psi = appRouter.createCaller(conta("therapist", "sb:uid-da-psicologa"));
    await expect(psi.therapists.upsert({ ...perfil, photoKey: "uid-do-paciente/avatar.jpg" })).rejects.toThrow(/Foto inválida/);
    await expect(psi.therapists.upsert({ ...perfil, photoKey: "uid-da-psicologa/../uid-do-paciente/avatar.jpg" })).rejects.toThrow(/Foto inválida/);
    // A própria foto passa da conferência (e só para no banco, que aqui não existe).
    await expect(psi.therapists.upsert({ ...perfil, photoKey: "uid-da-psicologa/avatar.webp" })).rejects.toThrow(/Database not available/);
    // Sem foto também passa.
    await expect(psi.therapists.upsert({ ...perfil, photoKey: "" })).rejects.toThrow(/Database not available/);
  });

  it("paciente não grava como dele a foto de outra conta", async () => {
    const paciente = appRouter.createCaller(conta("user", "sb:uid-do-paciente"));
    const dados = { firstName: "Ana", lastName: "Souza", phone: "(81) 99999-9999" };
    await expect(paciente.me.saveProfile({ ...dados, photoKey: "uid-da-psicologa/avatar.jpg" })).rejects.toThrow(/Foto inválida/);
    await expect(paciente.me.saveProfile({ ...dados, photoKey: "uid-do-paciente/avatar.png" })).rejects.toThrow(/Database not available/);
  });

  it("textos do perfil público têm teto", async () => {
    const psi = appRouter.createCaller(conta("therapist", "sb:uid-da-psicologa"));
    await expect(psi.therapists.upsert({ ...perfil, bio: "x".repeat(1001) })).rejects.toThrow();
  });
});
