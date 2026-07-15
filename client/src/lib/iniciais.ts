/**
 * Iniciais do nome, para o fallback do avatar quando não há foto.
 * "Lucemy Chagas" -> "LC". Nome só de uma palavra devolve uma letra.
 */
export function iniciais(nome?: string | null): string {
  const partes = (nome || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}
