import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dentroDoLimite } from "./routers";
import { ehErroDeBanco } from "./_core/trpc";
import { identificarCliente, limitarConexoes } from "./_core/seguranca";

/**
 * Proteções contra derrubar o servidor (ou os e-mails) com POUCAS requisições.
 * Ataque de volume puro fica na Cloudflare, na frente do Render.
 */
describe("proteção contra DoS e vazamento por erro", () => {
  it("contador por chave segura o laço e libera depois da janela", () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(dentroDoLimite("teste:a", 3, 60_000, t + i)).toBe(true);
    expect(dentroDoLimite("teste:a", 3, 60_000, t + 10)).toBe(false);
    expect(dentroDoLimite("teste:b", 3, 60_000, t + 10)).toBe(true); // outra chave, outro balde
    expect(dentroDoLimite("teste:a", 3, 60_000, t + 60_001)).toBe(true);
  });

  /**
   * Cada mensagem do chat mandava um e-mail: um laço esgotava a cota diária da
   * Brevo e derrubava TODOS os e-mails do sistema. Agora é 1 a cada 15 min.
   */
  it("aviso por e-mail do chat: no máximo 1 a cada 15 min por conversa", () => {
    const t = 5_000_000;
    expect(dentroDoLimite("aviso-chat:1:2:patient", 1, 15 * 60_000, t)).toBe(true);
    expect(dentroDoLimite("aviso-chat:1:2:patient", 1, 15 * 60_000, t + 60_000)).toBe(false);
    expect(dentroDoLimite("aviso-chat:1:2:patient", 1, 15 * 60_000, t + 15 * 60_000 + 1)).toBe(true);
  });

  it("WebSocket: limita conexões novas por IP (o upgrade não passa pelo Express)", () => {
    const podeConectar = limitarConexoes({ janelaMs: 60_000, maximo: 2 });
    const req = { headers: { "cf-connecting-ip": "203.0.113.9" }, socket: {} };
    expect(podeConectar(req)).toBe(true);
    expect(podeConectar(req)).toBe(true);
    expect(podeConectar(req)).toBe(false);
    expect(podeConectar({ headers: { "cf-connecting-ip": "203.0.113.10" }, socket: {} })).toBe(true);
  });

  it("identifica o IP também no upgrade de WebSocket (headers, sem req.get)", () => {
    expect(identificarCliente({ headers: { "x-forwarded-for": "198.51.100.1, 10.0.0.1" }, socket: {} })).toBe("198.51.100.1");
    expect(identificarCliente({ headers: {}, socket: { remoteAddress: "10.1.1.1" } })).toBe("10.1.1.1");
  });

  /**
   * Erro de banco ia para o navegador como "Failed query: <SQL> params: <valores>"
   * — estrutura das tabelas e dados da consulta. Os erros que lançamos de
   * propósito ("Consulta não encontrada") seguem visíveis.
   */
  it("reconhece erro de banco (para esconder) e deixa passar os nossos", () => {
    expect(ehErroDeBanco(new Error('Failed query: select "email" from "patients" where "id" = $1\nparams: 7'))).toBe(true);
    expect(ehErroDeBanco({ message: "x", cause: { code: "23505" } })).toBe(true);
    expect(ehErroDeBanco({ name: "DrizzleQueryError", message: "x" })).toBe(true);
    expect(ehErroDeBanco(new Error("Consulta não encontrada."))).toBe(false);
    expect(ehErroDeBanco(new Error("Já existe um paciente cadastrado com esse e-mail."))).toBe(false);
  });

  it("o servidor recusa lote grande e o cliente divide no mesmo tamanho", () => {
    const servidor = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
    const cliente = readFileSync(new URL("../client/src/main.tsx", import.meta.url), "utf8");
    expect(servidor).toMatch(/maxBatchSize:\s*10\b/);
    expect(cliente).toMatch(/maxItems:\s*10\b/);
    expect(servidor).toContain('app.disable("x-powered-by")');
  });
});
