/**
 * Tabela de preços: a psicóloga paga POR PACIENTE cadastrado, e cada paciente a
 * mais custa menos que o anterior (como faixa de imposto: o total nunca dá salto).
 *
 * Os valores das primeiras faixas vêm do exemplo do Guilherme (2 pacientes =
 * R$ 40, 4 = R$ 75). Depois o desconto acelera de propósito: no ritmo de R$ 20
 * por paciente, 30 pacientes custariam ~R$ 277, o dobro do mercado (iClinic,
 * PsicoManager cobram R$ 89 a 129 com pacientes ilimitados). Com estas faixas,
 * 30 pacientes ficam em R$ 145 — menos que uma sessão por mês.
 *
 * As cotas da Luma (por dia) e o tamanho dos anexos saem do plano grátis da
 * infraestrutura: a Groq dá ~80 perguntas/dia somando TODOS os clientes, e o
 * Supabase grátis tem 1 GB de arquivos no total. Ver o histórico de 2026-10-26.
 */

/** Acima disso o plano é o Coro, negociado direto ("Fale comigo"). */
export const MAX_PACIENTES_NA_TABELA = 30;

/** Preço de cada paciente dentro da faixa, em centavos. `ate` é inclusivo. */
export const FAIXAS_DE_PRECO = [
  { ate: 2, centavos: 2000 },
  { ate: 4, centavos: 1750 },
  { ate: 10, centavos: 500 },
  { ate: 20, centavos: 250 },
  { ate: 30, centavos: 150 },
] as const;

export type PlanoId = "pro" | "max" | "unlimited";

export type Plano = {
  id: PlanoId;
  nome: string;
  /** Faixa de pacientes do plano; `ate` null = sem teto. */
  de: number;
  ate: number | null;
  perguntasLumaPorDia: number | null;
  anexoMaxMb: number | null;
};

export const PLANOS: readonly Plano[] = [
  // Nomes no tema VozInterior (2026-10-26): a voz cresce com o consultório.
  // Os ids continuam pro/max/unlimited — só o nome aparece na tela.
  { id: "pro", nome: "Sussurro", de: 1, ate: 10, perguntasLumaPorDia: 5, anexoMaxMb: 5 },
  { id: "max", nome: "Voz", de: 11, ate: MAX_PACIENTES_NA_TABELA, perguntasLumaPorDia: 15, anexoMaxMb: 10 },
  { id: "unlimited", nome: "Coro", de: MAX_PACIENTES_NA_TABELA + 1, ate: null, perguntasLumaPorDia: null, anexoMaxMb: null },
];

/**
 * Mensalidade em centavos para `pacientes` cadastrados. Null acima da tabela
 * (Coro, preço combinado). Centavos para não somar float de dinheiro.
 */
export function mensalidadeEmCentavos(pacientes: number): number | null {
  if (!Number.isInteger(pacientes) || pacientes < 1) return 0;
  if (pacientes > MAX_PACIENTES_NA_TABELA) return null;
  let total = 0;
  let anterior = 0;
  for (const faixa of FAIXAS_DE_PRECO) {
    const nestaFaixa = Math.min(pacientes, faixa.ate) - anterior;
    if (nestaFaixa <= 0) break;
    total += nestaFaixa * faixa.centavos;
    anterior = faixa.ate;
  }
  return total;
}

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
 * O que a psicóloga paga por ciclo, já com fundador e anual. Null acima da tabela
 * (Coro, combinado). Fundador antes do anual: no anual ela paga 10 meses do
 * valor JÁ com desconto. Sem paciente, não há o que cobrar: 0 pacientes = R$ 0
 * (decisão de 2026-10-26) — a cobrança começa no 1º paciente.
 */
export function valorDaCobranca(
  pacientes: number,
  { fundador = false, ciclo = "mensal" }: { fundador?: boolean; ciclo?: Ciclo } = {},
): number | null {
  const base = mensalidadeEmCentavos(pacientes);
  if (base === null) return null;
  const mensal = fundador ? Math.round(base * (1 - DESCONTO_FUNDADOR)) : base;
  return ciclo === "anual" ? mensal * MESES_PAGOS_NO_ANUAL : mensal;
}

/**
 * PLANO ESCOLHIDO (decisão de 2026-10-26, "como a Netflix"): a psicóloga escolhe
 * Sussurro ou Voz e ganha os bônus do plano na hora; continua pagando por
 * paciente, mas cada plano tem um valor MÍNIMO (o Voz custa no mínimo o preço de
 * 11 pacientes). Coro é combinado com o Guilherme, não se escolhe sozinha.
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

/** Valor do ciclo no plano escolhido: tabela por paciente, com o mínimo do plano. */
export function valorDoPlano(
  pacientes: number,
  escolhido: string | null | undefined,
  { fundador = false, ciclo = "mensal" }: { fundador?: boolean; ciclo?: Ciclo } = {},
): number | null {
  const plano = planoEfetivo(escolhido, pacientes);
  if (plano.ate === null) return null;
  const porPaciente = mensalidadeEmCentavos(pacientes) ?? 0;
  // Sussurro não tem mínimo: 0 pacientes = R$ 0. Os outros, o preço do 1º do plano.
  const minimo = plano === PLANOS[0] ? 0 : (mensalidadeEmCentavos(plano.de) ?? 0);
  const base = Math.max(porPaciente, minimo);
  const mensal = fundador ? Math.round(base * (1 - DESCONTO_FUNDADOR)) : base;
  return ciclo === "anual" ? mensal * MESES_PAGOS_NO_ANUAL : mensal;
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
