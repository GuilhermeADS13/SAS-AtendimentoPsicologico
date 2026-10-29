/**
 * Preços: PREÇO FIXO POR PLANO, estilo Netflix (decisão de 2026-10-27, no lugar
 * do preço por paciente). Cada plano tem um valor mensal e um limite de
 * pacientes; dentro do limite, o valor não muda.
 *
 * - Sussurro: R$ 39/mês, até 10 pacientes.
 * - Voz: R$ 89/mês, até 30 pacientes — e a Luma ajuda na estrutura do prontuário.
 * - Coro: combinado com o Guilherme (sob medida, ver valorDoPlano) — e ainda o
 *   relatório da clínica.
 *
 * Valores para a região do Guilherme desde 2026-10-28 (eram R$ 69 e R$ 129); a
 * Psicóloga Fundadora continua com 20% a menos em cima deles.
 *
 * Referência de mercado: iClinic e PsicoManager cobram R$ 89 a 129.
 *
 * As cotas da Luma (por dia) e o tamanho dos anexos saem do plano grátis da
 * infraestrutura: a Groq dá ~80 perguntas/dia somando TODOS os clientes, e o
 * Supabase grátis tem 1 GB de arquivos no total. Ver o histórico de 2026-10-26.
 */

/** Acima disso o plano é o Coro, negociado direto ("Fale comigo"). */
export const MAX_PACIENTES_NA_TABELA = 30;

export type PlanoId = "pro" | "max" | "unlimited";

export type Plano = {
  id: PlanoId;
  nome: string;
  /** Faixa de pacientes do plano; `ate` null = sem teto. */
  de: number;
  ate: number | null;
  /** Mensalidade fixa, em centavos; null = combinada (Coro). */
  precoCentavos: number | null;
  perguntasLumaPorDia: number | null;
  anexoMaxMb: number | null;
  /**
   * A Luma ajuda na ESTRUTURA do prontuário (modelos em branco, o que o CFP pede)
   * — sem dados de paciente. É o diferencial do Voz (decisão de 2026-10-28).
   */
  lumaNoProntuario: boolean;
  /**
   * Diferencial do Coro (2026-10-28): o sistema calcula o relatório da clínica
   * (faltas, comparecimento, inadimplência) — sem IA. A Luma NÃO ajuda com
   * documentos psicológicos (laudo, atestado...) em nenhum plano (decisão de 2026-10-28).
   */
  relatorioDeGestao: boolean;
};

export const PLANOS: readonly Plano[] = [
  // Nomes no tema VozInterior (2026-10-26): a voz cresce com o consultório.
  // Os ids continuam pro/max/unlimited — só o nome aparece na tela.
  { id: "pro", nome: "Sussurro", de: 1, ate: 10, precoCentavos: 3900, perguntasLumaPorDia: 5, anexoMaxMb: 5, lumaNoProntuario: false, relatorioDeGestao: false },
  { id: "max", nome: "Voz", de: 11, ate: MAX_PACIENTES_NA_TABELA, precoCentavos: 8900, perguntasLumaPorDia: 15, anexoMaxMb: 10, lumaNoProntuario: true, relatorioDeGestao: false },
  {
    id: "unlimited",
    nome: "Coro",
    de: MAX_PACIENTES_NA_TABELA + 1,
    ate: null,
    precoCentavos: null,
    perguntasLumaPorDia: null,
    anexoMaxMb: null,
    lumaNoProntuario: true,
    relatorioDeGestao: true,
  },
];

/** Como o diferencial do Voz aparece nas listas de plano (preços, assinatura, troca). */
export const TEXTO_LUMA_NO_PRONTUARIO = "Luma ajuda no prontuário: modelos e regras do CFP, sem dados dos pacientes";
export const TEXTO_RELATORIO_DE_GESTAO = "Relatório da clínica: comparecimento, faltas e quem está devendo";

/** O menor plano em que cabem `pacientes`. */
export function planoPara(pacientes: number): Plano {
  return PLANOS.find((p) => p.ate === null || pacientes <= p.ate) ?? PLANOS[PLANOS.length - 1];
}

/** Teste grátis, um por CRP e por celular (ver shared/assinatura.ts). */
export const DIAS_DE_TESTE_GRATIS = 14;
/** Plano anual: paga 10 meses e leva 12 ("2 meses grátis"). */
export const MESES_PAGOS_NO_ANUAL = 10;
/** Psicóloga Fundadora: as 20 primeiras pagam 20% a menos, para sempre. */
export const DESCONTO_FUNDADOR = 0.2;
export const VAGAS_DE_FUNDADOR = 20;

export type Ciclo = "mensal" | "anual";

/**
 * Preço de tabela de um plano no ciclo, com o desconto de Fundadora se for o
 * caso (desconto antes do anual: no anual ela paga 10 meses do valor JÁ com
 * desconto). Null no Coro (combinado). É o que a página /precos mostra.
 */
export function precoDoPlano(
  id: string | null | undefined,
  { fundador = false, ciclo = "mensal" }: { fundador?: boolean; ciclo?: Ciclo } = {},
): number | null {
  const base = planoPorId(id).precoCentavos;
  if (base === null) return null;
  const mensal = fundador ? Math.round(base * (1 - DESCONTO_FUNDADOR)) : base;
  return ciclo === "anual" ? mensal * MESES_PAGOS_NO_ANUAL : mensal;
}

/**
 * PLANO ESCOLHIDO ("como a Netflix", 2026-10-26): ela escolhe Sussurro ou Voz e
 * ganha os bônus na hora. Coro é combinado com o Guilherme, não se escolhe sozinha.
 */
export function planoPorId(id: string | null | undefined): Plano {
  return PLANOS.find((p) => p.id === id) ?? PLANOS[0];
}

/**
 * O plano que vale de fato: o escolhido, ou um maior se os pacientes já passaram
 * do teto dele (conta antiga, ou paciente reativado). Nunca cobra abaixo do que
 * ela usa.
 */
export function planoEfetivo(escolhido: string | null | undefined, pacientes: number): Plano {
  const a = planoPorId(escolhido);
  const b = planoPara(Math.max(1, pacientes));
  return PLANOS.indexOf(b) > PLANOS.indexOf(a) ? b : a;
}

/**
 * O que ELA paga no ciclo: o preço fixo do plano efetivo (com Fundadora e anual).
 * No Sussurro sem nenhum paciente não há o que cobrar (R$ 0 — decisão de
 * 2026-10-26, mantida): a cobrança começa no 1º paciente. Quem escolheu o Voz
 * paga o Voz mesmo com poucos pacientes — escolheu pelos bônus.
 */
export function valorDoPlano(
  pacientes: number,
  escolhido: string | null | undefined,
  {
    fundador = false,
    ciclo = "mensal",
    combinado = null,
  }: {
    fundador?: boolean;
    ciclo?: Ciclo;
    /** Mensalidade combinada pelo admin para o CORO; nos outros planos é ignorada. */
    combinado?: number | null;
  } = {},
): number | null {
  const plano = planoEfetivo(escolhido, pacientes);
  if (plano.ate === null) {
    // Coro: só tem valor quando o admin combinou (sob medida, já é o final —
    // sem desconto por cima). Sussurro e Voz seguem a tabela (decisão de 2026-10-27).
    if (combinado === null || combinado === undefined) return null;
    return ciclo === "anual" ? combinado * MESES_PAGOS_NO_ANUAL : combinado;
  }
  if (plano === PLANOS[0] && pacientes < 1) return 0;
  return precoDoPlano(plano.id, { fundador, ciclo });
}

/**
 * Pode cadastrar (ou reativar) mais um paciente no plano ESCOLHIDO? Se não, ela
 * sobe de plano antes. O Coro não tem teto.
 */
export function cabeMaisUmPaciente(escolhido: string | null | undefined, pacientesAtuais: number): boolean {
  const teto = planoPorId(escolhido).ate;
  return teto === null || pacientesAtuais + 1 <= teto;
}

/** "R$ 57,50" / "R$ 40" (sem ",00" quando é inteiro, para o preço ler limpo). */
export function formatarReais(centavos: number): string {
  const inteiro = centavos % 100 === 0;
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: inteiro ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
