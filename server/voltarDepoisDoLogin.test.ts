/**
 * Volta para onde a pessoa ia depois do login (client/src/lib/voltarDepoisDoLogin.ts):
 * só aceita caminhos internos conhecidos, para o endereço guardado nunca levar a
 * outro lugar.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { guardarVoltaDepoisDoLogin, tirarVoltaDepoisDoLogin } from "../client/src/lib/voltarDepoisDoLogin";

const memoria = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => memoria.get(k) ?? null,
  setItem: (k: string, v: string) => void memoria.set(k, v),
  removeItem: (k: string) => void memoria.delete(k),
});

describe("voltar depois do login", () => {
  beforeEach(() => memoria.clear());

  it("volta para o perfil da busca uma vez só", () => {
    guardarVoltaDepoisDoLogin("/psicologas/12");
    expect(tirarVoltaDepoisDoLogin()).toBe("/psicologas/12");
    expect(tirarVoltaDepoisDoLogin()).toBeNull();
  });

  it("volta para a sala da consulta, com os ids da query, e para as páginas da área", () => {
    for (const bom of [
      "/videocall/apt42-V1StGXR8_Z5jdHi6?apt=42&pat=7",
      "/videocall/sala-apt42",
      "/records/15",
      "/dashboard",
      "/consultas",
    ]) {
      guardarVoltaDepoisDoLogin(bom);
      expect(tirarVoltaDepoisDoLogin(), bom).toBe(bom);
    }
  });

  it("recusa endereço de fora ou desconhecido", () => {
    for (const ruim of [
      "//exemplo.com",
      "https://exemplo.com",
      "/admin",
      "/psicologas/12/../../admin",
      "/psicologas/abc",
      "/videocall/apt42-V1StGXR8_Z5jdHi6?apt=42&pat=7&x=//exemplo.com",
      "/videocall/../../exemplo",
      "/records/abc",
    ]) {
      guardarVoltaDepoisDoLogin(ruim);
      expect(tirarVoltaDepoisDoLogin(), ruim).toBeNull();
    }
  });

  it("ignora o que foi guardado à mão ou há mais de um dia", () => {
    memoria.set("vozinterior-voltar-depois-do-login", JSON.stringify({ caminho: "//exemplo.com", em: Date.now() }));
    expect(tirarVoltaDepoisDoLogin()).toBeNull();
    memoria.set("vozinterior-voltar-depois-do-login", JSON.stringify({ caminho: "/encontrar-psicologa", em: Date.now() - 25 * 3600_000 }));
    expect(tirarVoltaDepoisDoLogin()).toBeNull();
    memoria.set("vozinterior-voltar-depois-do-login", "{quebrado");
    expect(tirarVoltaDepoisDoLogin()).toBeNull();
  });
});
