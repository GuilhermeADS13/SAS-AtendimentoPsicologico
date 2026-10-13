import { describe, expect, it } from "vitest";
import { CATEGORIAS_DE_EMOJI, contarSoEmojis } from "../shared/emoji";

/** Emoji grande na conversa: só quando a mensagem é SÓ de emojis. */
describe("emojis das Mensagens", () => {
  it("conta os emojis de uma mensagem só de emojis", () => {
    expect(contarSoEmojis("😂")).toBe(1);
    expect(contarSoEmojis("😂😂😂")).toBe(3);
    expect(contarSoEmojis(" ❤️ 🙏 ")).toBe(2);
  });

  it("emoji composto vale UM (tom de pele, bandeira, família, tecla)", () => {
    expect(contarSoEmojis("👍🏽")).toBe(1);
    expect(contarSoEmojis("🇧🇷")).toBe(1);
    expect(contarSoEmojis("👨‍👩‍👧")).toBe(1);
    expect(contarSoEmojis("1️⃣")).toBe(1);
  });

  it("com qualquer texto junto, não é 'só emoji'", () => {
    expect(contarSoEmojis("oi 😂")).toBe(0);
    expect(contarSoEmojis("ok!")).toBe(0);
  });

  it("número e símbolo comuns não viram emoji", () => {
    expect(contarSoEmojis("123")).toBe(0);
    expect(contarSoEmojis("#")).toBe(0);
    expect(contarSoEmojis("")).toBe(0);
  });

  it("toda a paleta do seletor é de emojis de verdade, sem repetidos", () => {
    const todos = CATEGORIAS_DE_EMOJI.flatMap((c) => c.emojis);
    for (const e of todos) expect(contarSoEmojis(e), e).toBe(1);
    expect(new Set(todos).size).toBe(todos.length);
  });
});
