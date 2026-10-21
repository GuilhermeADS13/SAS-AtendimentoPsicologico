import { partesEmBrasilia } from "./datas";

/**
 * Linha do tempo da EVOLUÇÃO do paciente (aba "Evolução" do prontuário).
 *
 * A Resolução CFP 001/2009 pede que o registro mostre "a evolução do processo";
 * a aba "Sessões" listava as sessões soltas. Aqui cada sessão vira um momento
 * numerado, com marcos calculados (início, retorno após pausa, a cada 10
 * sessões) e um resumo do acompanhamento. Tudo derivado das sessões que já
 * existem — nenhum dado novo é gravado.
 */

export type SessaoBase = { id: number; startedAt: Date | string };

export type Marco = { tipo: "inicio" | "retorno" | "contagem"; texto: string };

export type MomentoDaEvolucao<S extends SessaoBase> = {
  sessao: S;
  /** 1 = primeira sessão do paciente. */
  numero: number;
  /** Dias desde a sessão anterior (null na primeira). */
  diasDesdeAnterior: number | null;
  marcos: Marco[];
  /** "2026-10", no horário de Brasília — para separar por mês. */
  mes: string;
};

/** A partir de quantos dias sem sessão o retorno vira marco. */
export const DIAS_PARA_RETORNO = 30;

const DIA = 86_400_000;
const instante = (d: Date | string) => new Date(d).getTime();
/** Dias de calendário em Brasília entre duas datas (não horas/24, que erra perto da meia-noite). */
const diasEntre = (a: Date | string, b: Date | string) =>
  Math.round((Date.parse(partesEmBrasilia(b).data) - Date.parse(partesEmBrasilia(a).data)) / DIA);

/** Momentos do MAIS RECENTE para o mais antigo (é o que a psicóloga quer ver primeiro). */
export function momentosDaEvolucao<S extends SessaoBase>(sessoes: readonly S[]): MomentoDaEvolucao<S>[] {
  const ordenadas = [...sessoes].sort((a, b) => instante(a.startedAt) - instante(b.startedAt));
  const momentos = ordenadas.map((sessao, i) => {
    const numero = i + 1;
    const diasDesdeAnterior = i === 0 ? null : diasEntre(ordenadas[i - 1].startedAt, sessao.startedAt);
    const marcos: Marco[] = [];
    if (numero === 1) marcos.push({ tipo: "inicio", texto: "Início do acompanhamento" });
    if (diasDesdeAnterior !== null && diasDesdeAnterior >= DIAS_PARA_RETORNO) {
      marcos.push({ tipo: "retorno", texto: `Retorno após ${diasDesdeAnterior} dias sem sessão` });
    }
    if (numero % 10 === 0) marcos.push({ tipo: "contagem", texto: `${numero}ª sessão` });
    return { sessao, numero, diasDesdeAnterior, marcos, mes: partesEmBrasilia(sessao.startedAt).data.slice(0, 7) };
  });
  return momentos.reverse();
}

export type ResumoDaEvolucao = {
  total: number;
  inicio: Date | null;
  ultima: Date | null;
  /** Dias entre a primeira sessão e hoje. */
  diasDeAcompanhamento: number | null;
  /** Frequência em palavras ("semanal", "quinzenal"...), a partir do intervalo típico. */
  frequencia: string | null;
};

/**
 * Frequência pelo intervalo MEDIANO entre sessões: a média seria puxada por uma
 * pausa longa (férias), e a terapia semanal pareceria "a cada 12 dias".
 */
export function frequenciaDasSessoes(intervalos: number[]): string | null {
  if (intervalos.length === 0) return null;
  const ordenados = [...intervalos].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  const mediana = ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
  if (mediana <= 9) return "semanal";
  if (mediana <= 18) return "quinzenal";
  if (mediana <= 38) return "mensal";
  return `a cada ${Math.round(mediana)} dias`;
}

export function resumoDaEvolucao(sessoes: readonly SessaoBase[], agora: Date = new Date()): ResumoDaEvolucao {
  if (sessoes.length === 0) {
    return { total: 0, inicio: null, ultima: null, diasDeAcompanhamento: null, frequencia: null };
  }
  const ordenadas = [...sessoes].sort((a, b) => instante(a.startedAt) - instante(b.startedAt));
  const inicio = new Date(ordenadas[0].startedAt);
  const ultima = new Date(ordenadas[ordenadas.length - 1].startedAt);
  const intervalos = ordenadas.slice(1).map((s, i) => diasEntre(ordenadas[i].startedAt, s.startedAt));
  return {
    total: ordenadas.length,
    inicio,
    ultima,
    diasDeAcompanhamento: Math.max(0, diasEntre(inicio, agora)),
    frequencia: frequenciaDasSessoes(intervalos),
  };
}

/** "3 meses", "1 ano e 2 meses", "12 dias" — tempo de acompanhamento em palavras. */
export function duracaoEmPalavras(dias: number): string {
  if (dias < 31) return dias === 1 ? "1 dia" : `${dias} dias`;
  // 30,4 (e não 30,44): com o mês "médio" exato, 365 dias davam 11,99 → "11 meses".
  const meses = Math.floor(dias / 30.4);
  if (meses < 12) return meses === 1 ? "1 mês" : `${meses} meses`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const a = anos === 1 ? "1 ano" : `${anos} anos`;
  if (resto === 0) return a;
  return `${a} e ${resto === 1 ? "1 mês" : `${resto} meses`}`;
}
