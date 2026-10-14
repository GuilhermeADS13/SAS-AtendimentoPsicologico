import { formatarMesAno } from "@shared/datas";

export type Periodo = "semana" | "mes" | "ano";

/**
 * Início/fim do período, em datas LOCAIS (o mesmo fuso em que as consultas são
 * exibidas). fim é exclusivo: compara-se com `d >= inicio && d < fim`.
 *
 * `deslocamento` anda pelas setas: -1 = semana/mês/ano anterior, +1 = o próximo.
 * Sem isso os painéis só mostravam o período ATUAL — uma consulta marcada para o
 * mês que vem não aparecia em "Mês", e parecia que o previsto estava errado.
 * Usado pelo Financeiro e por Agendamentos.
 */
export function intervalo(periodo: Periodo, deslocamento = 0): { inicio: Date; fim: Date; label: string } {
  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = hoje.getMonth();

  if (periodo === "semana") {
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - hoje.getDay() + deslocamento * 7); // domingo da semana
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(inicio);
    fim.setDate(inicio.getDate() + 7);
    const sabado = new Date(fim);
    sabado.setDate(fim.getDate() - 1);
    const dm = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const label = deslocamento === 0 ? "esta semana" : `${dm(inicio)} a ${dm(sabado)}`;
    return { inicio, fim, label };
  }
  if (periodo === "ano") {
    return { inicio: new Date(y + deslocamento, 0, 1), fim: new Date(y + deslocamento + 1, 0, 1), label: String(y + deslocamento) };
  }
  const inicio = new Date(y, m + deslocamento, 1);
  return { inicio, fim: new Date(y, m + deslocamento + 1, 1), label: formatarMesAno(inicio) };
}

/** A data cai no intervalo? */
export const dentroDoIntervalo = (quando: string | Date, i: { inicio: Date; fim: Date }) => {
  const d = new Date(quando);
  return d >= i.inicio && d < i.fim;
};
