import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { cabecalhosDeSeguranca, ehChamadaDaLuma, identificarCliente, limitarRequisicoes } from "./_core/seguranca";

function pedido(cabecalhos: Record<string, string>, ip = "10.0.0.1"): Request {
  return {
    get: (nome: string) => cabecalhos[nome.toLowerCase()],
    socket: { remoteAddress: ip },
  } as unknown as Request;
}

function resposta() {
  const cabecalhos: Record<string, string> = {};
  const r = {
    statusCode: 0,
    corpo: undefined as unknown,
    setHeader: (nome: string, valor: string) => { cabecalhos[nome] = valor; },
    status(codigo: number) { r.statusCode = codigo; return r; },
    json(corpo: unknown) { r.corpo = corpo; return r; },
  };
  return { res: r as unknown as Response, cabecalhos, estado: r };
}

describe("identificação do cliente atrás da Cloudflare", () => {
  /**
   * O app fica atrás da Cloudflare e do proxy do Render. Sem olhar o
   * CF-Connecting-IP, TODO mundo cairia no mesmo balde e o primeiro usuário ativo
   * bloquearia os outros — o limite viraria uma negação de serviço contra os
   * próprios pacientes.
   */
  it("prefere o CF-Connecting-IP, que a Cloudflare sobrescreve e ninguém forja", () => {
    const req = pedido({
      "cf-connecting-ip": "203.0.113.7",
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
    });
    expect(identificarCliente(req)).toBe("203.0.113.7");
  });

  it("sem Cloudflare, usa o primeiro do x-forwarded-for", () => {
    expect(identificarCliente(pedido({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("sem cabeçalho nenhum, cai no socket", () => {
    expect(identificarCliente(pedido({}, "10.0.0.9"))).toBe("10.0.0.9");
  });
});

describe("quais chamadas contam como da Luma", () => {
  it.each(["/ai.chat", "/ai.siteHelp", "/ai.chat,me.contato", "ai.history"])("é da Luma: %s", (caminho) => {
    expect(ehChamadaDaLuma(caminho)).toBe(true);
  });

  /** O limite apertado é caro: não pode pegar rota que não é da Luma. */
  it.each(["/patients.list", "/appointments.list", "/me.contato", "/therapists.me", "/chat.send"])(
    "NÃO é da Luma: %s",
    (caminho) => {
      expect(ehChamadaDaLuma(caminho)).toBe(false);
    },
  );
});

describe("limite de requisições", () => {
  const req = (ip: string) => pedido({ "cf-connecting-ip": ip });

  it("deixa passar até o teto e barra a partir dali", () => {
    const limitador = limitarRequisicoes({ janelaMs: 60_000, maximo: 3, mensagem: "devagar" });
    const next = vi.fn() as unknown as NextFunction;
    for (let i = 0; i < 3; i++) limitador(req("1.1.1.1"), resposta().res, next);
    expect(next).toHaveBeenCalledTimes(3);

    const { res, cabecalhos, estado } = resposta();
    limitador(req("1.1.1.1"), res, next);
    expect(next).toHaveBeenCalledTimes(3); // nao passou
    expect(estado.statusCode).toBe(429);
    expect(cabecalhos["Retry-After"]).toBeDefined();
    expect(estado.corpo).toMatchObject({ error: "devagar" });
  });

  /** Um cliente abusando não pode derrubar o acesso de outro. */
  it("conta cada cliente no seu próprio balde", () => {
    const limitador = limitarRequisicoes({ janelaMs: 60_000, maximo: 1, mensagem: "x" });
    const next = vi.fn() as unknown as NextFunction;
    limitador(req("1.1.1.1"), resposta().res, next);
    limitador(req("1.1.1.1"), resposta().res, next); // barrado
    limitador(req("2.2.2.2"), resposta().res, next); // outro cliente, passa
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("libera de novo quando a janela expira", () => {
    vi.useFakeTimers();
    try {
      const limitador = limitarRequisicoes({ janelaMs: 1_000, maximo: 1, mensagem: "x" });
      const next = vi.fn() as unknown as NextFunction;
      limitador(req("3.3.3.3"), resposta().res, next);
      limitador(req("3.3.3.3"), resposta().res, next);
      expect(next).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1_500);
      limitador(req("3.3.3.3"), resposta().res, next);
      expect(next).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("cabeçalhos de segurança", () => {
  it("manda os quatro seguros", () => {
    const { res, cabecalhos } = resposta();
    const next = vi.fn() as unknown as NextFunction;
    cabecalhosDeSeguranca(pedido({}), res, next);
    expect(cabecalhos["Strict-Transport-Security"]).toContain("max-age=");
    expect(cabecalhos["X-Content-Type-Options"]).toBe("nosniff");
    expect(cabecalhos["X-Frame-Options"]).toBe("DENY");
    expect(cabecalhos["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(next).toHaveBeenCalled();
  });

  /**
   * A videochamada e o nucleo do produto: sem camera, microfone e captura de tela
   * liberados para a propria origem, ela simplesmente para de funcionar. Este
   * teste existe para que ninguem "aperte" a politica sem perceber o que derruba.
   */
  it("a Permissions-Policy libera camera, microfone e captura de tela para a propria origem", () => {
    const { res, cabecalhos } = resposta();
    cabecalhosDeSeguranca(pedido({}), res, vi.fn() as unknown as NextFunction);
    const politica = cabecalhos["Permissions-Policy"];
    expect(politica).toContain("camera=(self)");
    expect(politica).toContain("microphone=(self)");
    expect(politica).toContain("display-capture=(self)");
  });

  /**
   * A CSP entra em modo RELATORIO primeiro: o navegador nao bloqueia nada, so
   * anota o que teria bloqueado. Promover para o cabecalho que bloqueia de verdade
   * e um passo deliberado, depois de ler os relatos em producao.
   */
  it("a CSP esta em modo relatorio, nao bloqueando", () => {
    const { res, cabecalhos } = resposta();
    cabecalhosDeSeguranca(pedido({}), res, vi.fn() as unknown as NextFunction);
    expect(cabecalhos["Content-Security-Policy"]).toBeUndefined();
    expect(cabecalhos["Content-Security-Policy-Report-Only"]).toContain("default-src 'self'");
  });

  /**
   * O arquivo compartilhado DENTRO da chamada aparece num <iframe src="blob:">.
   * Sem frame-src, ele herdaria default-src 'self' e o visualizador morreria no
   * meio do atendimento — e, em modo relatorio, sem ninguem perceber.
   */
  it("a CSP permite o iframe blob: do arquivo compartilhado na chamada", () => {
    const { res, cabecalhos } = resposta();
    cabecalhosDeSeguranca(pedido({}), res, vi.fn() as unknown as NextFunction);
    expect(cabecalhos["Content-Security-Policy-Report-Only"]).toContain("frame-src 'self' blob:");
  });

  /** Modo relatorio sem coleta nao produz evidencia nenhuma. */
  it("a CSP aponta para onde enviar as violacoes", () => {
    const { res, cabecalhos } = resposta();
    cabecalhosDeSeguranca(pedido({}), res, vi.fn() as unknown as NextFunction);
    expect(cabecalhos["Content-Security-Policy-Report-Only"]).toContain("report-uri /api/csp-report");
  });

  /** Sem estes, some o Supabase e a sinalizacao da sala. */
  it("a CSP permite o Supabase e os WebSockets da chamada", () => {
    const { res, cabecalhos } = resposta();
    cabecalhosDeSeguranca(pedido({}), res, vi.fn() as unknown as NextFunction);
    const csp = cabecalhos["Content-Security-Policy-Report-Only"];
    expect(csp).toContain("https://*.supabase.co");
    expect(csp).toContain("wss:");
  });
});
