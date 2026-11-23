/**
 * Avisos de consulta por e-mail que cada pessoa escolhe receber (Configurações).
 * Guardado em users.avisosPorEmail; nulo ou campo ausente = ligado, como sempre foi.
 *
 * Só os avisos de AGENDA passam por aqui. Código de acesso, troca de senha e de
 * e-mail, aprovação do CRP e vencimento do plano sempre chegam: desligar um deles
 * deixaria a pessoa sem como entrar ou sem saber que vai perder o acesso.
 */
export const TIPOS_DE_AVISO = [
  { id: "lembrete", rotulo: "Lembrete da consulta", descricao: "Na véspera, com o horário e o link da sala." },
  { id: "consultaNova", rotulo: "Consulta marcada", descricao: "Quando uma consulta nova entra na agenda." },
  { id: "cancelamento", rotulo: "Consulta cancelada", descricao: "Quando uma consulta é desmarcada." },
] as const;

/**
 * O que a PSICÓLOGA recebe (2026-11-24, cota da Brevo): consulta marcada e cancelada
 * não vão mais para ela (é ela quem faz), e o lembrete por consulta virou um resumo
 * por dia. Só esse interruptor aparece para ela; usa a mesma chave "lembrete".
 */
export const AVISOS_DA_PSICOLOGA = [
  { id: "lembrete", rotulo: "Agenda de amanhã", descricao: "Um e-mail por dia, a partir das 18h, com as consultas do dia seguinte." },
] as const;

export type TipoDeAviso = (typeof TIPOS_DE_AVISO)[number]["id"];
export type AvisosPorEmail = Record<TipoDeAviso, boolean>;

/** Lê o que está no banco (pode ser nulo, faltar campo ou vir lixo) e completa com "ligado". */
export function avisosComPadrao(salvo: unknown): AvisosPorEmail {
  const s = salvo && typeof salvo === "object" ? (salvo as Record<string, unknown>) : {};
  return Object.fromEntries(TIPOS_DE_AVISO.map(({ id }) => [id, s[id] !== false])) as AvisosPorEmail;
}

export function avisoLigado(salvo: unknown, tipo: TipoDeAviso): boolean {
  return avisosComPadrao(salvo)[tipo];
}
