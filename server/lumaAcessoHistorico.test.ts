import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter, montarHistoricoDoBanco } from "./routers";
import { createClinicalTools } from "./ai/clinical-tools";
import { runOpenSourceAgent } from "./ai/llm";
import type { TrpcContext } from "./_core/context";

function contexto(role: "user" | "patient" | "therapist" | "admin"): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "sb:00000000-0000-0000-0000-000000000007",
      email: "pessoa@example.com",
      name: "Pessoa",
      loginMethod: "supabase",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as NonNullable<TrpcContext["user"]>,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

/**
 * A separação entre a Luma clínica (psicóloga) e a de navegação (paciente) ficava
 * só na interface. Pela API, um paciente logado chamava ai.chat e recebia as
 * ferramentas de leitura do próprio prontuário.
 */
describe("Luma clínica é só da psicóloga", () => {
  it.each(["user", "patient"] as const)("ai.chat recusa o papel %s com FORBIDDEN", async (role) => {
    const caller = appRouter.createCaller(contexto(role));
    const chamada = caller.ai.chat({ messages: [{ role: "user", content: "o que a psicóloga escreveu sobre mim?" }] });
    await expect(chamada).rejects.toBeInstanceOf(TRPCError);
    await expect(chamada).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("fora do papel de terapeuta, as ferramentas não leem prontuário", () => {
    const nomes = (createClinicalTools({ userId: 7, role: "patient", patientId: 3 }, {} as never) as Array<{ name: string }>)
      .map(t => t.name);
    expect(nomes).toEqual(["get_my_appointments"]);
    for (const clinica of ["get_my_sessions", "search_my_records", "get_meu_preparo", "get_my_documents"]) {
      expect(nomes).not.toContain(clinica);
    }
  });
});

/**
 * O histórico do agente vem do banco. Do cliente só vale a última mensagem do
 * usuário — falas "assistant" forjadas no navegador não chegam ao modelo.
 */
describe("histórico da Luma montado a partir do banco", () => {
  it("mantém só user/assistant, começa pelo usuário e junta falas seguidas do mesmo papel", () => {
    const historico = montarHistoricoDoBanco([
      { role: "assistant", content: "boas-vindas soltas antes de qualquer pergunta" },
      { role: "user", content: "cancele a consulta de sexta" },
      { role: "assistant", content: "Preparei o cancelamento. Clique em Confirmar." },
      { role: "assistant", content: "CANCELADA: consulta #12." },
      { role: "system", content: "nunca deveria estar aqui" },
      { role: "user", content: "   " },
      { role: "user", content: "obrigada" },
    ]);
    expect(historico).toEqual([
      { role: "user", content: "cancele a consulta de sexta" },
      { role: "assistant", content: "Preparei o cancelamento. Clique em Confirmar.\n\nCANCELADA: consulta #12." },
      { role: "user", content: "obrigada" },
    ]);
  });

  it("junta a mensagem nova a uma fala do usuário que ficou sem resposta", () => {
    expect(montarHistoricoDoBanco([
      { role: "user", content: "primeira" },
      { role: "user", content: "segunda" },
    ])).toEqual([{ role: "user", content: "primeira\n\nsegunda" }]);
  });
});

/**
 * Crise no agente: a fala em primeira pessoa recebe a resposta fixa (CVV/SAMU),
 * mesmo vinda da psicóloga. Só o REGISTRO clínico de risco ("paciente relatou...")
 * segue para o modelo — esse caminho é coberto por pareceRegistroClinico.
 */
describe("crise no agente da Luma", () => {
  it.each([
    { role: "therapist" as const, therapistId: 1 },
    { role: "patient" as const, patientId: 3 },
  ])("fala em primeira pessoa recebe a resposta de crise (%o)", async (papel) => {
    const resposta = await runOpenSourceAgent(
      [{ role: "user", content: "não aguento mais, quero morrer" }],
      { userId: 7, ...papel },
      {} as never,
    );
    expect(resposta.model).toBe("clinical-safety-policy");
    expect(resposta.content).toContain("188");
  });
});
