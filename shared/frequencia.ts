/**
 * Frequência do atendimento definida PELA PSICÓLOGA para o paciente (aba
 * "Evolução"). Sem definição, a tela mostra a frequência calculada pelas sessões.
 *
 * Guardada como texto curto em patients."frequencia" (migração 0038, com CHECK):
 * "semanal" | "quinzenal" | "mensal" | "dias:2,4" (dias da semana, 0 = domingo).
 */

export const FREQUENCIAS_PADRAO = [
  { valor: "semanal", rotulo: "Semanal" },
  { valor: "quinzenal", rotulo: "Quinzenal" },
  { valor: "mensal", rotulo: "Mensal" },
] as const;

/** Segunda primeiro: é como a agenda da psicóloga é lida. */
export const DIAS_DA_SEMANA = [
  { dia: 1, curto: "Seg", plural: "segundas", toda: "Toda segunda" },
  { dia: 2, curto: "Ter", plural: "terças", toda: "Toda terça" },
  { dia: 3, curto: "Qua", plural: "quartas", toda: "Toda quarta" },
  { dia: 4, curto: "Qui", plural: "quintas", toda: "Toda quinta" },
  { dia: 5, curto: "Sex", plural: "sextas", toda: "Toda sexta" },
  { dia: 6, curto: "Sáb", plural: "sábados", toda: "Todo sábado" },
  { dia: 0, curto: "Dom", plural: "domingos", toda: "Todo domingo" },
] as const;

export type Frequencia = { tipo: "semanal" | "quinzenal" | "mensal" } | { tipo: "dias"; dias: number[] };

/** O mesmo formato que o CHECK do banco aceita. */
export const FREQUENCIA_REGEX = /^(semanal|quinzenal|mensal|dias:[0-6](,[0-6]){0,6})$/;

const ordemDaSemana = (d: number) => (d === 0 ? 7 : d);

export function lerFrequencia(texto: string | null | undefined): Frequencia | null {
  if (!texto || !FREQUENCIA_REGEX.test(texto)) return null;
  if (!texto.startsWith("dias:")) return { tipo: texto as "semanal" | "quinzenal" | "mensal" };
  const dias = Array.from(new Set(texto.slice(5).split(",").map(Number))).sort((a, b) => ordemDaSemana(a) - ordemDaSemana(b));
  return { tipo: "dias", dias };
}

/** Para gravar. Dias vazios = sem frequência definida (null). */
export function gravarFrequencia(f: Frequencia | null): string | null {
  if (!f) return null;
  if (f.tipo !== "dias") return f.tipo;
  const dias = Array.from(new Set(f.dias.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort(
    (a, b) => ordemDaSemana(a) - ordemDaSemana(b),
  );
  return dias.length ? `dias:${dias.join(",")}` : null;
}

/** "Semanal", "Toda terça", "Terças e quintas", "Segundas, quartas e sextas". */
export function descreverFrequencia(f: Frequencia): string {
  if (f.tipo !== "dias") return FREQUENCIAS_PADRAO.find((p) => p.valor === f.tipo)!.rotulo;
  const nomes = DIAS_DA_SEMANA.filter((d) => f.dias.includes(d.dia));
  if (nomes.length === 1) return nomes[0].toda;
  if (nomes.length === 7) return "Todos os dias";
  const plurais = nomes.map((d) => d.plural);
  const texto = `${plurais.slice(0, -1).join(", ")} e ${plurais[plurais.length - 1]}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
