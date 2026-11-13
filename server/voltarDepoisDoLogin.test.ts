/**
 * Volta para a busca depois do login (client/src/lib/voltarDepoisDoLogin.ts): só
 * aceita as páginas da busca, para o endereço guardado nunca levar a outro lugar.
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

  it("recusa endereço fora da busca", () => {
    for (const ruim of ["//exemplo.com", "https://exemplo.com", "/dashboard", "/psicologas/12/../../admin", "/psicologas/abc"]) {
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
