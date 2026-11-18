import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { levarAoDominioProprio } from "./paginaHtml";

function pedido(host: string, url: string, opcoes: { method?: string; accept?: string } = {}): Request {
  const cabecalhos: Record<string, string> = {
    host,
    accept: opcoes.accept ?? "text/html,application/xhtml+xml,*/*;q=0.8",
  };
  return {
    method: opcoes.method ?? "GET",
    originalUrl: url,
    get: (nome: string) => cabecalhos[nome.toLowerCase()],
  } as unknown as Request;
}

function rodar(req: Request) {
  const redirect = vi.fn();
  const setHeader = vi.fn();
  const next = vi.fn();
  levarAoDominioProprio(req, { redirect, setHeader } as unknown as Response, next);
  return { redirect, setHeader, next };
}

describe("endereço antigo leva ao domínio próprio", () => {
  const original = process.env.APP_URL;
  beforeEach(() => {
    process.env.APP_URL = "https://vozinterior.app.br";
  });
  afterEach(() => {
    // Atribuir undefined grava a string "undefined" (que é verdadeira) e contamina os outros testes.
    if (original === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = original;
  });

  it("abrir página no .onrender.com vai para o mesmo caminho no domínio novo", () => {
    const { redirect, setHeader, next } = rodar(pedido("sas-atendimento-psicologico.onrender.com", "/login?criar=psicologa&origem=instagram"));
    expect(redirect).toHaveBeenCalledWith(301, "https://vozinterior.app.br/login?criar=psicologa&origem=instagram");
    expect(setHeader).toHaveBeenCalledWith("Vary", "Accept");
    expect(next).not.toHaveBeenCalled();
  });

  it("caminho com // não vira redirecionamento para outro site", () => {
    const { redirect } = rodar(pedido("sas-atendimento-psicologico.onrender.com", "//outro.site/x"));
    expect(redirect).toHaveBeenCalledWith(301, "https://vozinterior.app.br//outro.site/x");
  });

  it("API, script e POST de aba já aberta seguem no endereço antigo", () => {
    const host = "sas-atendimento-psicologico.onrender.com";
    for (const req of [
      pedido(host, "/api/trpc/auth.me", { accept: "application/json" }),
      pedido(host, "/assets/index.js", { accept: "*/*" }),
      pedido(host, "/api/csp-report", { method: "POST" }),
    ]) {
      const { redirect, next } = rodar(req);
      expect(redirect).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    }
  });

  it("no domínio novo, sem APP_URL ou com APP_URL no próprio onrender, não redireciona", () => {
    expect(rodar(pedido("vozinterior.app.br", "/")).redirect).not.toHaveBeenCalled();
    process.env.APP_URL = "";
    expect(rodar(pedido("sas-atendimento-psicologico.onrender.com", "/")).redirect).not.toHaveBeenCalled();
    process.env.APP_URL = "https://sas-atendimento-psicologico.onrender.com";
    expect(rodar(pedido("sas-atendimento-psicologico.onrender.com", "/")).redirect).not.toHaveBeenCalled();
  });
});
