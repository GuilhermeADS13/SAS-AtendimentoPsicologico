import { beforeEach, describe, expect, it } from "vitest";
import {
  actionFingerprint,
  clearPendingActions,
  confirmPendingActionByHuman,
  consumePendingAction,
  issuePendingAction,
  type PendingAction,
} from "./ai/action-confirmation";

const acao = (overrides: Partial<PendingAction> = {}): PendingAction => ({
  therapistId: 3,
  turnKey: "turno-1",
  toolName: "cancelar_consulta",
  params: { appointmentId: 7 },
  resumo: "Cancelar a consulta #7 de 25/08/2026 14:00.",
  ...overrides,
});

const pedido = (overrides: Partial<PendingAction> = {}) => {
  const { resumo: _resumo, ...request } = acao(overrides);
  return request;
};

describe("confirmação pelo agente", () => {
  beforeEach(() => clearPendingActions());

  it("recusa execução sem código", () => {
    expect(consumePendingAction(undefined, pedido())).toMatchObject({ ok: false, reason: "missing" });
  });

  // A propriedade central: mesmo de posse do código, o modelo não executa dentro
  // da mesma rodada em que a ação foi proposta. Um humano precisa ter falado.
  it("recusa o código na mesma rodada em que foi emitido", () => {
    const code = issuePendingAction(acao());
    expect(consumePendingAction(code, pedido())).toMatchObject({ ok: false, reason: "same_turn" });
  });

  it("aceita o código na rodada seguinte", () => {
    const code = issuePendingAction(acao());
    expect(consumePendingAction(code, pedido({ turnKey: "turno-2" }))).toEqual({ ok: true });
  });

  it("consome o código uma única vez", () => {
    const code = issuePendingAction(acao());
    expect(consumePendingAction(code, pedido({ turnKey: "turno-2" })).ok).toBe(true);
    expect(consumePendingAction(code, pedido({ turnKey: "turno-3" }))).toMatchObject({ ok: false, reason: "unknown" });
  });

  it("recusa código expirado", () => {
    const code = issuePendingAction(acao(), 0, 60_000);
    expect(consumePendingAction(code, pedido({ turnKey: "turno-2" }), 60_001)).toMatchObject({ ok: false, reason: "expired" });
  });

  it("recusa quando os parâmetros mudam entre a proposta e a execução", () => {
    const code = issuePendingAction(acao());
    const adulterado = pedido({ turnKey: "turno-2", params: { appointmentId: 8 } });
    expect(consumePendingAction(code, adulterado)).toMatchObject({ ok: false, reason: "mismatch" });
  });

  it("recusa quando o modelo troca a ferramenta mantendo os parâmetros", () => {
    const code = issuePendingAction(acao());
    const trocado = pedido({ turnKey: "turno-2", toolName: "registrar_pagamento" });
    expect(consumePendingAction(code, trocado)).toMatchObject({ ok: false, reason: "mismatch" });
  });

  it("recusa código emitido para outra terapeuta", () => {
    const code = issuePendingAction(acao({ therapistId: 3 }));
    expect(consumePendingAction(code, pedido({ turnKey: "turno-2", therapistId: 99 }))).toMatchObject({ ok: false, reason: "foreign" });
  });

  it("recusa código inventado", () => {
    issuePendingAction(acao());
    expect(consumePendingAction("codigo-falso-123", pedido({ turnKey: "turno-2" }))).toMatchObject({ ok: false, reason: "unknown" });
  });

  it("não vaza se o código existe: alheio e inexistente dão a mesma mensagem", () => {
    const code = issuePendingAction(acao({ therapistId: 3 }));
    const alheio = consumePendingAction(code, pedido({ turnKey: "turno-2", therapistId: 99 }));
    const inexistente = consumePendingAction("nao-existe-abc", pedido({ turnKey: "turno-2", therapistId: 99 }));
    expect(alheio.ok).toBe(false);
    expect(inexistente.ok).toBe(false);
    expect((alheio as { message: string }).message).toBe((inexistente as { message: string }).message);
  });
});

describe("confirmação pela terapeuta na interface", () => {
  beforeEach(() => clearPendingActions());

  // O clique autenticado é a prova de consentimento: não há rodada de conversa
  // para comparar, e a regra de turno não se aplica.
  it("aceita na mesma rodada em que a ação foi proposta", () => {
    const code = issuePendingAction(acao());
    const result = confirmPendingActionByHuman(code, 3);
    expect(result.ok).toBe(true);
    expect(result.ok && result.action.toolName).toBe("cancelar_consulta");
  });

  it("devolve os parâmetros registrados na proposta, não os do modelo", () => {
    const code = issuePendingAction(acao({ params: { appointmentId: 7 } }));
    const result = confirmPendingActionByHuman(code, 3);
    expect(result.ok && result.action.params).toEqual({ appointmentId: 7 });
  });

  it("é de uso único", () => {
    const code = issuePendingAction(acao());
    expect(confirmPendingActionByHuman(code, 3).ok).toBe(true);
    expect(confirmPendingActionByHuman(code, 3)).toMatchObject({ ok: false, reason: "unknown" });
  });

  it("recusa código de outra terapeuta", () => {
    const code = issuePendingAction(acao({ therapistId: 3 }));
    expect(confirmPendingActionByHuman(code, 99)).toMatchObject({ ok: false, reason: "foreign" });
  });

  it("recusa código expirado", () => {
    const code = issuePendingAction(acao(), 0, 60_000);
    expect(confirmPendingActionByHuman(code, 3, 60_001)).toMatchObject({ ok: false, reason: "expired" });
  });

  it("um código gasto pelo agente não serve mais para o botão", () => {
    const code = issuePendingAction(acao());
    expect(consumePendingAction(code, pedido({ turnKey: "turno-2" })).ok).toBe(true);
    expect(confirmPendingActionByHuman(code, 3)).toMatchObject({ ok: false, reason: "unknown" });
  });
});

describe("impressão digital da ação", () => {
  it("independe da ordem das chaves", () => {
    expect(actionFingerprint("agendar_consulta", { patientId: 1, duration: 60 }))
      .toBe(actionFingerprint("agendar_consulta", { duration: 60, patientId: 1 }));
  });

  it("trata ausente e nulo como vazio, mas separa ferramentas diferentes", () => {
    expect(actionFingerprint("agendar_consulta", { notes: undefined }))
      .toBe(actionFingerprint("agendar_consulta", { notes: "" }));
    expect(actionFingerprint("agendar_consulta", { appointmentId: 7 }))
      .not.toBe(actionFingerprint("cancelar_consulta", { appointmentId: 7 }));
  });
});
