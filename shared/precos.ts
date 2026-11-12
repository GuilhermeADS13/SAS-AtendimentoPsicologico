/**
 * Preços: PREÇO FIXO POR PLANO, estilo Netflix (decisão de 2026-10-27, no lugar
 * do preço por paciente). Cada plano tem um valor mensal e um limite de
 * pacientes; dentro do limite, o valor não muda.
 *
 * Tabela de 2026-11-12 (decisão do Guilherme, "mais justo" por faixa de 11):
 * - Sussurro: R$ 31/mês, até 11 pacientes.
 * - Voz: R$ 81/mês, 12 a 22 — e a Luma ajuda na estrutura do prontuário.
 * - Canto: R$ 151/mês, 23 a 33 — e ainda o relatório da clínica.
 * - Coro: R$ 241/mês, 34 a 44 — tudo do Canto.
 * - Sob medida: mais de 44, combinado com o Guilherme (ver valorDoPlano).
 *
 * Antes: Sussurro R$ 39 (até 10), Voz R$ 89 (até 30), Coro sob medida; e antes
 * de 2026-10-28, R$ 69 e R$ 129. A Psicóloga Fundadora continua com 20% a menos
 * em cima da tabela.
 *
 * Referência de mercado: iClinic e PsicoManager cobram R$ 89 a 129.
 *
 * As cotas da Luma (por dia) e o tamanho dos anexos saem do plano grátis da
 * infraestrutura: a Groq dá ~80 perguntas/dia somando TODOS os clientes, e o
 * Supabase grátis tem 1 GB de arquivos no total. Ver o histórico de 2026-10-26.
 */

/** Acima disso o plano é o Sob medida, negociado direto ("Fale comigo"). */
export const MAX_PACIENTES_NA_TABELA = 44;

/** Os planos de preço fixo, que ela escolhe sozinha (o Sob medida é combinado). */
export const IDS_DA_TABELA = ["pro", "max", "canto", "coro"] as const;
export type PlanoDaTabelaId = (typeof IDS_DA_TABELA)[number];
export type PlanoId = PlanoDaTabelaId | "unlimited";

export function ehPlanoDaTabela(id: string | null | undefined): id is PlanoDaTabelaId {
  return (IDS_DA_TABELA as readonly string[]).includes(id ?? "");
}

export type Plano = {
  id: PlanoId;
  nome: string;
  /** Faixa de pacientes do plano; `ate` null = sem teto. */
  de: number;
  ate: number | null;
  /** Mensalidade fixa, em centavos; null = combinada (Sob medida). */
  precoCentavos: number | null;
  perguntasLumaPorDia: number | null;
  anexoMaxMb: number | null;
  /**
   * A Luma ajuda na ESTRUTURA do prontuário (modelos em branco, o que o CFP pede)
   * — sem dados de paciente. É o diferencial do Voz (decisão de 2026-10-28).
   */
  lumaNoProntuario: boolean;
  /**
   * Do Canto para cima (2026-11-12; antes só no Coro): o sistema calcula o relatório da clínica
   * (faltas, comparecimento, inadimplência) — sem IA. A Luma NÃO ajuda com
   * documentos psicológicos (laudo, atestado...) em nenhum plano (decisão de 2026-10-28).
   */
  relatorioDeGestao: boolean;
};

export const PLANOS: readonly Plano[] = [
  // Nomes no tema VozInterior (2026-10-26): a voz cresce com o consultório.
  // Os ids pro/max/unlimited são antigos (gravados no banco) — só o nome aparece
  // na tela. "unlimited" era o Coro sob medida; desde 2026-11-12 é o Sob medida.
  { id: "pro", nome: "Sussurro", de: 1, ate: 11, precoCentavos: 3100, perguntasLumaPorDia: 5, anexoMaxMb: 5, lumaNoProntuario: false, relatorioDeGestao: false },
  { id: "max", nome: "Voz", de: 12, ate: 22, precoCentavos: 8100, perguntasLumaPorDia: 15, anexoMaxMb: 10, lumaNoProntuario: true, relatorioDeGestao: false },
  { id: "canto", nome: "Canto", de: 23, ate: 33, precoCentavos: 15100, perguntasLumaPorDia: 20, anexoMaxMb: 15, lumaNoProntuario: true, relatorioDeGestao: true },
  { id: "coro", nome: "Coro", de: 34, ate: MAX_PACIENTES_NA_TABELA, precoCentavos: 24100, perguntasLumaPorDia: 25, anexoMaxMb: 20, lumaNoProntuario: true, relatorioDeGestao: true },
  {
    id: "unlimited",
    nome: "Sob medida",
    de: MAX_PACIENTES_NA_TABELA + 1,
    ate: null,
    precoCentavos: null,
    perguntasLumaPorDia: null,
    anexoMaxMb: null,
    lumaNoProntuario: true,
    relatorioDeGestao: true,
  },
];

/** Como o diferencial do Voz e acima aparece nas listas de plano (preços, assinatura, troca). */
export const TEXTO_LUMA_NO_PRONTUARIO = "Luma ajuda no prontuário: modelos e regras do CFP, sem dados dos pacientes";
export const TEXTO_RELATORIO_DE_GESTAO = "Relatório da clínica: comparecimento, faltas e quem está devendo";

/** O menor plano em que cabem `pacientes`. */
export function planoPara(pacientes: number): Plano {
  return PLANOS.find((p) => p.ate === null || pacientes <= p.ate) ?? PLANOS[PLANOS.length - 1];
}

/** Teste grátis, um por CRP e por celular (ver shared/assinatura.ts). */
export const DIAS_DE_TESTE_GRATIS = 14;
/** Prazo depois da aprovação para cadastrar o primeiro paciente e começar o teste. */
export const DIAS_PARA_O_PRIMEIRO_PACIENTE = 30;
/** Plano anual: paga 10 meses e leva 12 ("2 meses grátis"). */
export const MESES_PAGOS_NO_ANUAL = 10;
/** Psicóloga Fundadora: as 20 primeiras pagam 20% a menos, para sempre. */
export const DESCONTO_FUNDADOR = 0.2;
export const VAGAS_DE_FUNDADOR = 20;

export type Ciclo = "mensal" | "anual";

/**
 * Preço de tabela de um plano no ciclo, com o desconto de Fundadora se for o
 * caso (desconto antes do anual: no anual ela paga 10 meses do valor JÁ com
 * desconto). Null no Sob medida (combinado). É o que a página /precos mostra.
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
 * PLANO ESCOLHIDO ("como a Netflix", 2026-10-26): ela escolhe entre os da tabela
 * (Sussurro, Voz, Canto, Coro) e ganha os bônus na hora. O Sob medida é combinado
 * com o Guilherme, não se escolhe sozinha.
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
 * 2026-10-26, mantida): a cobrança começa no 1º paciente. Quem escolheu um plano
 * maior paga por ele mesmo com poucos pacientes — escolheu pelos bônus.
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
    /** Mensalidade combinada pelo admin para o SOB MEDIDA; nos outros planos é ignorada. */
    combinado?: number | null;
  } = {},
): number | null {
  const plano = planoEfetivo(escolhido, pacientes);
  if (plano.ate === null) {
    // Sob medida: só tem valor quando o admin combinou (já é o final — sem
    // desconto por cima). Os planos da tabela seguem a tabela (decisão de 2026-10-27).
    if (combinado === null || combinado === undefined) return null;
    return ciclo === "anual" ? combinado * MESES_PAGOS_NO_ANUAL : combinado;
  }
  if (plano === PLANOS[0] && pacientes < 1) return 0;
  return precoDoPlano(plano.id, { fundador, ciclo });
}

/**
 * Pode cadastrar (ou reativar) mais um paciente no plano ESCOLHIDO? Se não, ela
 * sobe de plano antes. O Sob medida não tem teto.
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
