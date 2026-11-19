/**
 * Lembretes de amanhã pelo WhatsApp (2026-11-19): a Agenda junta as consultas de um dia
 * numa lista, e ela manda o lembrete de cada paciente com um toque (o mesmo do botão
 * "Avisar no WhatsApp" da consulta). Os dias são do calendário de Brasília.
 */
import { partesEmBrasilia } from "./datas";

/** Hoje em Brasília, "AAAA-MM-DD". */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  return partesEmBrasilia(agora).data;
}

/** "AAAA-MM-DD" mais n dias, no calendário (vira mês e ano). */
export function somarDias(dia: string, n: number): string {
  const [ano, mes, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, d + n)).toISOString().slice(0, 10);
}

/** As consultas ainda marcadas de um dia (sem as canceladas, realizadas e faltas), pela hora. */
export function consultasDoDia<T extends { scheduledAt: Date | string; status: string }>(consultas: T[], dia: string): T[] {
  return consultas
    .filter((c) => c.status === "scheduled" && partesEmBrasilia(c.scheduledAt).data === dia)
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
}
