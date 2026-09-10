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

/**
 * Fuso oficial do sistema. Todo horário/data COM hora (consulta, sessão, criado
 * em…) é exibido no horário de Brasília, independentemente do fuso do dispositivo
 * de quem abre — senão a mesma consulta apareceria em horas diferentes para
 * pessoas em fusos distintos (e no navegador de teste, que roda em UTC, dava
 * "17:00" para uma consulta das 14h). Datas de nascimento são a exceção
 * (formatarNascimento, em UTC), por serem dia puro.
 */
export const FUSO_BR = "America/Sao_Paulo";

function paraData(valor: Date | string | number | null | undefined): Date | null {
  if (valor === null || valor === undefined) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** dd/mm/aaaa no fuso de Brasília. */
export function formatarData(valor: Date | string | number | null | undefined, fallback = "—"): string {
  const d = paraData(valor);
  return d ? d.toLocaleDateString("pt-BR", { timeZone: FUSO_BR }) : fallback;
}

/** HH:mm no fuso de Brasília. */
export function formatarHora(valor: Date | string | number | null | undefined, fallback = "—"): string {
  const d = paraData(valor);
  return d
    ? d.toLocaleTimeString("pt-BR", { timeZone: FUSO_BR, hour: "2-digit", minute: "2-digit" })
    : fallback;
}

/** dd/mm/aaaa HH:mm no fuso de Brasília. */
export function formatarDataHora(valor: Date | string | number | null | undefined, fallback = "—"): string {
  const d = paraData(valor);
  return d
    ? d.toLocaleString("pt-BR", {
        timeZone: FUSO_BR,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : fallback;
}

/** "setembro de 2026" no fuso de Brasília. */
export function formatarMesAno(valor: Date | string | number | null | undefined, fallback = ""): string {
  const d = paraData(valor);
  return d ? d.toLocaleDateString("pt-BR", { timeZone: FUSO_BR, month: "long", year: "numeric" }) : fallback;
}
