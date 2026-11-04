/**
 * "Chrome no Windows", "Safari no iPhone": o nome que a lista de aparelhos mostra,
 * tirado do User-Agent na hora em que o aparelho é confirmado. Só para a pessoa
 * reconhecer o aparelho; não é usado para decidir nada de segurança.
 */
export function nomeDoNavegador(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  // A ordem importa: Edge, Opera e Samsung Internet também dizem "Chrome", e
  // quase todos dizem "Safari".
  const navegador = /Edg(e|A|iOS)?\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera|OPT\//.test(ua)
      ? "Opera"
      : /SamsungBrowser\//.test(ua)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS\//.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Navegador";
  const sistema = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /CrOS/.test(ua)
              ? "Chromebook"
              : /Linux/.test(ua)
                ? "Linux"
                : "";
  return sistema ? `${navegador} no ${sistema}` : navegador;
}
