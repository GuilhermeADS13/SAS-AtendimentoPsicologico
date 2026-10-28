import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { mensagemDeValidacao, publicProcedure, router } from "./_core/trpc";

const erroDe = (schema: z.ZodType, valor: unknown) => {
  const r = schema.safeParse(valor);
  if (r.success) throw new Error("devia falhar");
  return r.error;
};

describe("erro de validação em português (não o JSON cru do zod)", () => {
  it("campo curto demais", () => {
    expect(mensagemDeValidacao(erroDe(z.object({ c: z.string().min(20) }), { c: "abc" }))).toMatch(/curto demais/);
  });

  it("campo grande demais", () => {
    expect(mensagemDeValidacao(erroDe(z.object({ c: z.string().max(2) }), { c: "abc" }))).toMatch(/tamanho máximo/);
  });

  it("tipo errado", () => {
    expect(mensagemDeValidacao(erroDe(z.object({ c: z.number() }), { c: "x" }))).toMatch(/formato/);
  });

  it("mensagem própria do schema passa como está", () => {
    const schema = z.object({ c: z.string().refine(() => false, "Informe um celular com DDD.") });
    expect(mensagemDeValidacao(erroDe(schema, { c: "1" }))).toBe("Informe um celular com DDD.");
  });

  it("erro que não é do zod fica de fora", () => {
    expect(mensagemDeValidacao(new Error("Consulta não encontrada"))).toBeNull();
    expect(mensagemDeValidacao(undefined)).toBeNull();
  });

  it("de ponta a ponta pelo HTTP: a tela recebe a frase, não o JSON", async () => {
    const r = router({ eco: publicProcedure.input(z.object({ codigo: z.string().min(20) })).mutation(() => "ok") });
    const resposta = await fetchRequestHandler({
      endpoint: "/api/trpc",
      router: r,
      createContext: () => ({ user: null }) as never,
      req: new Request("http://x/api/trpc/eco", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { codigo: "(81) 99999-0000" } }),
      }),
    });
    const corpo = await resposta.json();
    expect(corpo.error.json.message).toMatch(/curto demais/);
    expect(corpo.error.json.message).not.toContain("too_small");
  });
});
