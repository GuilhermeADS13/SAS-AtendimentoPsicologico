/**
 * Férias e folgas da psicóloga (2026-11-19). Nos dias de um período, os horários de
 * primeira conversa dela somem da busca (server/conhecer.ts), e a Agenda mostra as
 * consultas marcadas no período para ela desmarcar e avisar. As datas são dias do
 * calendário de Brasília ("AAAA-MM-DD"), com o último dia incluído.
 */
import { partesEmBrasilia } from "./datas";

export const MAX_DIAS_DE_FERIAS = 92;
export const MAX_PERIODOS_DE_FERIAS = 12;

export type PeriodoDeFerias = { inicio: string; fim: string };

function emMs(dia: string): number {
  const [ano, mes, d] = dia.split("-").map(Number);
  return Date.UTC(ano, mes - 1, d);
}

/** "AAAA-MM-DD" de um dia que existe (rejeita 2026-02-30). */
export function diaValido(dia: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) && new Date(emMs(dia)).toISOString().slice(0, 10) === dia;
}

/** Quantos dias o período tem, contando o primeiro e o último. */
export function diasNoPeriodo(p: PeriodoDeFerias): number {
  return Math.round((emMs(p.fim) - emMs(p.inicio)) / 86_400_000) + 1;
}

/** O que impede de marcar o período (null = pode). `hoje` é o dia de Brasília. */
export function problemaNoPeriodo(p: PeriodoDeFerias, hoje: string): string | null {
  if (!diaValido(p.inicio) || !diaValido(p.fim)) return "Escolha o primeiro e o último dia.";
  if (p.fim < p.inicio) return "O último dia vem antes do primeiro.";
  if (p.fim < hoje) return "Esse período já passou.";
  if (diasNoPeriodo(p) > MAX_DIAS_DE_FERIAS) return `Marque até ${MAX_DIAS_DE_FERIAS} dias por vez.`;
  return null;
}

export function diaNasFerias(dia: string, periodos: PeriodoDeFerias[]): boolean {
  return periodos.some((p) => p.inicio <= dia && dia <= p.fim);
}

/** As consultas ainda marcadas dentro do período, pela hora. */
export function consultasNasFerias<T extends { scheduledAt: Date | string; status: string }>(consultas: T[], p: PeriodoDeFerias): T[] {
  return consultas
    .filter((c) => c.status === "scheduled" && diaNasFerias(partesEmBrasilia(c.scheduledAt).data, [p]))
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
}

/** "20/12/2026 a 05/01/2027", ou o dia só. */
export function textoDoPeriodo(p: PeriodoDeFerias): string {
  const br = (dia: string) => dia.split("-").reverse().join("/");
  return p.inicio === p.fim ? br(p.inicio) : `${br(p.inicio)} a ${br(p.fim)}`;
}
