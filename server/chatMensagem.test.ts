import { describe, expect, it } from "vitest";
import { podeApagar, podeEditar } from "../shared/chatMensagem";

/** Editar e apagar para todos, com os prazos do WhatsApp. */
describe("editar e apagar mensagem", () => {
  const agora = new Date("2026-10-13T15:00:00Z");
  const minutosAtras = (min: number) => new Date(agora.getTime() - min * 60_000);
  const msg = (extra: Partial<Parameters<typeof podeEditar>[0]> = {}) => ({
    senderUserId: 7,
    content: "Oi, tudo bem?",
    fileKey: null,
    createdAt: minutosAtras(5),
    deletedAt: null,
    ...extra,
  });

  it("edita a própria mensagem nos primeiros 15 minutos", () => {
    expect(podeEditar(msg(), 7, agora)).toBe(true);
    expect(podeEditar(msg({ createdAt: minutosAtras(15) }), 7, agora)).toBe(true);
    expect(podeEditar(msg({ createdAt: minutosAtras(16) }), 7, agora)).toBe(false);
  });

  it("não edita mensagem do outro lado", () => {
    expect(podeEditar(msg(), 8, agora)).toBe(false);
    expect(podeApagar(msg(), 8, agora)).toBe(false);
  });

  it("anexo e GIF não são editáveis (mas podem ser apagados)", () => {
    expect(podeEditar(msg({ content: null, fileKey: "u/chat/a.pdf" }), 7, agora)).toBe(false);
    expect(podeEditar(msg({ content: "[gif:MF9wHplBBbqwYiTTEk]" }), 7, agora)).toBe(false);
    expect(podeApagar(msg({ content: "[gif:MF9wHplBBbqwYiTTEk]" }), 7, agora)).toBe(true);
  });

  it("apaga para todos até 2 dias depois", () => {
    expect(podeApagar(msg({ createdAt: minutosAtras(60 * 47) }), 7, agora)).toBe(true);
    expect(podeApagar(msg({ createdAt: minutosAtras(60 * 49) }), 7, agora)).toBe(false);
  });

  it("mensagem já apagada não se edita nem se apaga de novo", () => {
    const apagada = msg({ deletedAt: minutosAtras(1), content: null });
    expect(podeEditar(apagada, 7, agora)).toBe(false);
    expect(podeApagar(apagada, 7, agora)).toBe(false);
  });
});
