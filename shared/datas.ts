/**
 * Formata uma DATA DE NASCIMENTO (dia, sem hora) para dd/mm/aaaa.
 *
 * O nascimento é guardado como meia-noite UTC: o `<input type="date">` manda
 * "AAAA-MM-DD", e o servidor grava com `new Date("AAAA-MM-DD")`, que o
 * JavaScript interpreta como 00:00 **UTC**. Formatar isso no fuso de Brasília
 * (UTC-3) jogaria para as 21h do dia ANTERIOR — e a tela mostraria 14/05 para
 * quem nasceu em 15/05. Por isso formatamos em UTC, casando com o que foi
 * digitado. (Datas COM hora — criado em, agendado para — continuam no fuso
 * local, que é o certo para elas; este helper é só para o dia puro.)
 */
export function formatarNascimento(
  valor: Date | string | number | null | undefined,
  fallback = "—",
): string {
  if (!valor) return fallback;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
