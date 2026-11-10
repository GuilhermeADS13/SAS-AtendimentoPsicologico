/**
 * Demonstração sem cadastro (client/src/lib/demonstracao.ts): as telas da
 * psicóloga leem estas rotas; sem dado, a tela quebra ou aparece vazia.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { respostaDaDemonstracao } from "../client/src/lib/dadosDaDemonstracao";

describe("dados da demonstração", () => {
  it("responde as rotas que o painel, a agenda, os pacientes e o financeiro leem", () => {
    for (const rota of ["auth.me", "therapists.me", "patients.list", "appointments.list", "assinatura.minha", "me.avisosPorEmail", "me.contato", "listaDeEspera.listar"]) {
      expect(respostaDaDemonstracao(rota, undefined), rota).not.toBeNull();
    }
    expect(respostaDaDemonstracao("patients.get", { id: 101 })).toMatchObject({ id: 101, firstName: "Ana Beatriz" });
    expect(respostaDaDemonstracao("patients.get", { id: 999 })).toBeNull();
  });

  it("a conta da demonstração é psicóloga com aparelho liberado", () => {
    expect(respostaDaDemonstracao("auth.me", undefined)).toMatchObject({ role: "therapist", aparelhoVerificado: true, cadastroPendente: false });
  });

  it("a agenda tem consulta hoje, pagamento pendente e Pix avisado, em ordem", () => {
    const agenda = respostaDaDemonstracao("appointments.list", undefined) as { scheduledAt: Date; paid: boolean; pagamentoInformadoEm: Date | null; status: string }[];
    const hoje = new Date().toDateString();
    expect(agenda.some((a) => new Date(a.scheduledAt).toDateString() === hoje)).toBe(true);
    expect(agenda.some((a) => !a.paid && a.status === "completed")).toBe(true);
    expect(agenda.some((a) => a.pagamentoInformadoEm)).toBe(true);
    expect(agenda.map((a) => +new Date(a.scheduledAt))).toEqual([...agenda.map((a) => +new Date(a.scheduledAt))].sort((x, y) => x - y));
  });

  it("o cliente só troca o link HTTP pelo da demonstração quando a aba está marcada", () => {
    const main = readFileSync(new URL("../client/src/main.tsx", import.meta.url), "utf8");
    expect(main).toMatch(/links: emDemonstracao\(\) \? \[linkDaDemonstracao\] : \[/);
    const link = readFileSync(new URL("../client/src/lib/demonstracao.ts", import.meta.url), "utf8");
    // Toda gravação fora da lista silenciosa é recusada.
    expect(link).toContain('op.type === "mutation" && !SILENCIOSAS.has(op.path)');
  });
});
