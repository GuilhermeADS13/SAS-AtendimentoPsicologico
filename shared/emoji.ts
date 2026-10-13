/**
 * Emojis das Mensagens.
 *
 * São os emojis do PRÓPRIO aparelho (Unicode): no iPhone aparecem os da Apple, no
 * Android os do Google, no Windows os da Microsoft. Os desenhos do WhatsApp são
 * da Meta e não podem ser copiados — e com Unicode não há imagem para baixar.
 */

export type CategoriaDeEmoji = { chave: string; nome: string; emojis: string[] };

const lista = (s: string) => s.split(" ").filter(Boolean);

export const CATEGORIAS_DE_EMOJI: CategoriaDeEmoji[] = [
  {
    chave: "rostos",
    nome: "Rostos e emoções",
    emojis: lista(
      "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🥳 😎 🤓 🧐 😕 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬",
    ),
  },
  {
    chave: "pessoas",
    nome: "Gestos e pessoas",
    emojis: lista(
      "👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🫶 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 💪 🫂 👀 🧠 🫀 👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 🙋 🙆 🙅 🤷 🤦 💁 🧘 🚶 🏃 💃 🕺 👪",
    ),
  },
  {
    chave: "simbolos",
    nome: "Corações e símbolos",
    emojis: lista(
      "❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✨ ⭐ 🌟 💫 🔥 💯 ✅ ✔️ ❌ ❗ ❓ ⚠️ 🚫 ➕ ➖ 💤 💬 💭 🔔 🎵 🎶 ♾️ 🆗 🆕",
    ),
  },
  {
    chave: "natureza",
    nome: "Animais e natureza",
    emojis: lista(
      "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦉 🦋 🐝 🐞 🐢 🐬 🐳 🐠 🌸 🌼 🌻 🌹 🌷 🌱 🌿 🍀 🍃 🌳 🌵 🌈 ☀️ 🌤️ ⛅ 🌧️ ⛈️ ❄️ 🌙 🌊 💧",
    ),
  },
  {
    chave: "comida",
    nome: "Comidas e bebidas",
    emojis: lista(
      "🍎 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥑 🥦 🥕 🌽 🍅 🥔 🍞 🥐 🧀 🥚 🍳 🥞 🍕 🍔 🍟 🌭 🥪 🌮 🍝 🍜 🍣 🍰 🎂 🧁 🍩 🍪 🍫 🍬 🍿 ☕ 🍵 🧃 🥤 🍷 🍺 🥂",
    ),
  },
  {
    chave: "atividades",
    nome: "Atividades",
    emojis: lista(
      "⚽ 🏀 🏈 ⚾ 🎾 🏐 🏓 🏸 🥊 🏋️ 🚴 🏊 🧗 🤸 🎯 🎮 🎲 🧩 🎨 🎬 🎤 🎧 🎸 🎹 🥁 🎻 📚 ✍️ 🎉 🎊 🎈 🎁 🏆 🥇 🏅",
    ),
  },
  {
    chave: "viagens",
    nome: "Viagens e lugares",
    emojis: lista(
      "🚗 🚕 🚌 🚑 🚓 🚲 🛵 🏍️ ✈️ 🚀 🚆 🚇 ⛵ 🚢 🏠 🏡 🏢 🏥 🏫 🏖️ 🏝️ ⛰️ 🏔️ 🌋 🗺️ 🧭 ⛺ 🌆 🌃 🎡",
    ),
  },
  {
    chave: "objetos",
    nome: "Objetos",
    emojis: lista(
      "⌚ 📱 💻 🖥️ ⌨️ 📷 🎥 📞 ☎️ 📺 🔋 🔌 💡 🕯️ 📖 📝 ✏️ 🖊️ 📌 📎 📅 📆 🗓️ 📋 📁 📄 📊 📈 📉 💼 🔑 🔒 🔓 🧸 🛏️ 🛋️ 🚪 🪴 💊 🩺 🩹 ⏰ ⏳ ✉️ 📦 💰 💳",
    ),
  },
  // Sem categoria de bandeiras: o Windows não desenha bandeira de país (aparece
  // "BR", "PT" em letras), e é no computador que a psicóloga atende.
];

// Pelo construtor: o tsconfig não tem `target`, e o TypeScript recusa a flag `u`
// literal (o navegador aceita normalmente).
const PARECE_EMOJI = new RegExp("\\p{Extended_Pictographic}|\\p{Regional_Indicator}|\\u20e3", "u");

/**
 * Quantos emojis a mensagem tem, SE ela for só de emojis (espaços à parte); 0 se
 * tiver qualquer outra coisa. É o que decide mostrar o emoji grande, como no
 * WhatsApp. Conta por "grafema": 👍🏽, 🇧🇷 e 👨‍👩‍👧 valem 1 cada.
 */
export function contarSoEmojis(texto: string): number {
  const t = texto.replace(/\s+/g, "");
  if (!t) return 0;
  const partes =
    typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
      ? Array.from(new Intl.Segmenter("pt-BR", { granularity: "grapheme" }).segment(t), (s) => s.segment)
      : Array.from(t);
  return partes.every((p) => PARECE_EMOJI.test(p)) ? partes.length : 0;
}
