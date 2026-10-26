/**
 * O que o PACIENTE vê sobre o pagamento de uma consulta (Minhas Consultas).
 *
 * Só consultas que já aconteceram (decisão de 2026-10-26): começou, não foi
 * cancelada e tem valor. Quem só participa de chamada em grupo não vê — a
 * consulta é de outro paciente, que é quem paga.
 *
 * "Já paguei" não marca como pago: fica "aguardando" até a psicóloga confirmar
 * que o Pix caiu (ou recusar, e volta a "em aberto").
 */
export type SituacaoDoPagamento = "pago" | "aguardando" | "em_aberto";

export function pagamentoDaConsulta(
  a: {
    scheduledAt: Date | string;
    status: string;
    price: number | null;
    paid: boolean;
    pagamentoInformadoEm: Date | string | null;
    participante: boolean;
  },
  agora: Date = new Date(),
): { valorCentavos: number; situacao: SituacaoDoPagamento } | null {
  if (a.participante || a.status === "cancelled") return null;
  if (!a.price || a.price <= 0) return null;
  if (new Date(a.scheduledAt).getTime() > agora.getTime()) return null;
  const situacao: SituacaoDoPagamento = a.paid ? "pago" : a.pagamentoInformadoEm ? "aguardando" : "em_aberto";
  return { valorCentavos: a.price, situacao };
}
