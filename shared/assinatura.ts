import { DIAS_DE_TESTE_GRATIS, DIAS_PARA_O_PRIMEIRO_PACIENTE, VAGAS_DE_FUNDADOR, type Ciclo } from "./precos";

/**
 * Situação da assinatura da psicóloga. Liberado enquanto o teste grátis OU o
 * último Pix ainda cobrem hoje. Vencido bloqueia só o USO NOVO (agendar, iniciar
 * chamada, Luma): prontuários seguem abertos para leitura e download, porque o
 * CFP exige guarda de 5 anos (decisão de 2026-10-26).
 */
export type Situacao = {
  liberado: boolean;
  motivo: "pago" | "teste" | "vencido" | "sem_assinatura";
  /** Até quando está liberado (ou quando venceu). */
  ate: Date | null;
  /** Dias inteiros que faltam (0 = vence hoje); null se vencido/sem assinatura. */
  diasRestantes: number | null;
  /** Só com o teste aguardando: até quando cadastrar o primeiro paciente. */
  primeiroPacienteAte?: Date;
};

const DIA_MS = 24 * 60 * 60 * 1000;

/** Último dia para cadastrar o primeiro paciente, contado da aprovação. */
export function limiteDoPrimeiroPaciente(aprovadaEm: Date): Date {
  return new Date(aprovadaEm.getTime() + DIAS_PARA_O_PRIMEIRO_PACIENTE * DIA_MS);
}

export function situacaoDaAssinatura(
  a: { testeAte: Date | null; pagoAte: Date | null; testeAguardando?: boolean; createdAt?: Date | null } | null | undefined,
  agora: Date = new Date(),
): Situacao {
  if (!a) return { liberado: false, motivo: "sem_assinatura", ate: null, diasRestantes: null };
  const restante = (d: Date) => Math.floor((d.getTime() - agora.getTime()) / DIA_MS);
  if (a.pagoAte && a.pagoAte > agora) {
    return { liberado: true, motivo: "pago", ate: a.pagoAte, diasRestantes: restante(a.pagoAte) };
  }
  // O teste só começa a contar no primeiro paciente: até lá, liberada e sem data.
  // Sem paciente no prazo, o acesso pausa; nada é apagado (decisão de 2026-10-30).
  const limite = a.testeAguardando && a.createdAt ? limiteDoPrimeiroPaciente(a.createdAt) : null;
  if (a.testeAguardando && (!limite || limite > agora)) {
    return { liberado: true, motivo: "teste", ate: null, diasRestantes: null, primeiroPacienteAte: limite ?? undefined };
  }
  if (a.testeAte && a.testeAte > agora) {
    return { liberado: true, motivo: "teste", ate: a.testeAte, diasRestantes: restante(a.testeAte) };
  }
  const ate = [a.pagoAte, a.testeAte, limite].filter((d): d is Date => !!d).sort((x, y) => y.getTime() - x.getTime())[0] ?? null;
  return { liberado: false, motivo: "vencido", ate, diasRestantes: null };
}

/**
 * Conta que não paga e não é a admin (ex.: quem ajuda a tocar o sistema): fica
 * registrada com "pago até" em 2100. Daí em diante não há cobrança a mostrar.
 */
export function ehCortesia(pagoAte: Date | null | undefined): boolean {
  return !!pagoAte && pagoAte.getUTCFullYear() >= 2090;
}

/** Mensagem única do bloqueio (servidor e tela falam a mesma coisa). */
export const MENSAGEM_ASSINATURA_VENCIDA =
  "Seu acesso venceu. Renove pelo Pix na aba Assinatura. Seus prontuários continuam disponíveis para leitura.";

/** CRP e celular em dígitos: "06/123456" e "06123456" são o mesmo CRP. */
export const normalizarDocumento = (valor: string | null | undefined) => (valor ?? "").replace(/\D/g, "");

/**
 * Teste grátis e vaga de fundadora para uma psicóloga recém-aprovada.
 *
 * Um teste por pessoa: se o CRP ou o celular já aparecem noutra assinatura
 * (conta nova da mesma pessoa), não ganha teste nem nova vaga — mas herda a
 * vaga de fundadora se a conta anterior tinha. O celular sozinho não basta
 * (não é verificado por SMS); o CRP, conferido pelo admin, é o que segura.
 *
 * O teste nasce aguardando: os dias só contam a partir do primeiro paciente
 * (decisão de 2026-10-30), para ninguém perder o teste antes de começar a usar.
 */
export function decidirTesteEFundador({
  anteriores,
  fundadoresAtuais,
}: {
  /** Assinaturas que já usam este CRP ou este celular. */
  anteriores: Array<{ fundador: boolean }>;
  fundadoresAtuais: number;
}): { testeAguardando: boolean; fundador: boolean } {
  if (anteriores.length) {
    return { testeAguardando: false, fundador: anteriores.some((a) => a.fundador) };
  }
  return { testeAguardando: true, fundador: fundadoresAtuais < VAGAS_DE_FUNDADOR };
}

/** Quando acaba o teste que começa agora. */
export function fimDoTeste(agora: Date = new Date()): Date {
  return new Date(agora.getTime() + DIAS_DE_TESTE_GRATIS * DIA_MS);
}

/**
 * Dia de vencimento: qualquer dia de 1 a 31, escolhido num calendário
 * (2026-10-27; antes eram só 5/10/15/20/25). Mês sem esse dia — fevereiro com
 * 28 ou 29, abril com 30 — vence no ÚLTIMO dia do mês; o dia escolhido fica
 * guardado, então em março volta a ser 31.
 */
const TRES_HORAS = 3 * 60 * 60 * 1000;

export const diaDeVencimentoValido =(dia: number) => Number.isInteger(dia) && dia >= 1 && dia <= 31;

/** Quantos dias tem o mês (mês 0–11; aceita mês 12 = janeiro do ano seguinte). */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
}

/** O dia escolhido dentro do mês dado: 31 em fevereiro vira 28 (ou 29). */
export function diaDoVencimentoNoMes(ano: number, mes: number, dia: number): number {
  return Math.min(dia, diasNoMes(ano, mes));
}

/**
 * Fim do dia `dia` em Brasília (23:59:59, UTC−3) no mês/ano dados (mês 0–11).
 * Sem o limite, Date.UTC(2027, 1, 31) "transbordaria" para 3 de março.
 */
function fimDoDiaEmBrasilia(ano: number, mes: number, dia: number): Date {
  const real = new Date(Date.UTC(ano, mes, 1));
  const d = diaDoVencimentoNoMes(real.getUTCFullYear(), real.getUTCMonth(), dia);
  return new Date(Date.UTC(real.getUTCFullYear(), real.getUTCMonth(), d + 1, 2, 59, 59));
}

/**
 * Soma meses no calendário de Brasília, sem transbordar: 31/01 + 1 mês = 28/02.
 * O `setMonth` do JavaScript fazia 31/01 → 03/03 e ainda dependia do fuso da
 * máquina (o servidor é UTC, o navegador é Brasília) — com vencimento no dia 31,
 * fevereiro era pulado.
 */
function somarMesesEmBrasilia(data: Date, meses: number): Date {
  const local = new Date(data.getTime() - TRES_HORAS);
  const alvo = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + meses, 1));
  const dia = diaDoVencimentoNoMes(alvo.getUTCFullYear(), alvo.getUTCMonth(), local.getUTCDate());
  return new Date(
    Date.UTC(
      alvo.getUTCFullYear(),
      alvo.getUTCMonth(),
      dia,
      local.getUTCHours(),
      local.getUTCMinutes(),
      local.getUTCSeconds(),
      local.getUTCMilliseconds(),
    ) + TRES_HORAS,
  );
}

/**
 * Novo "pago até" ao registrar um Pix: soma o ciclo a partir do que for mais
 * tarde entre hoje, o fim do teste e o Pix anterior — pagar adiantado não perde dia.
 *
 * Com dia de vencimento escolhido, vai até esse dia: o primeiro dia escolhido
 * DEPOIS de completar o ciclo (decisão de 2026-10-26: nunca menos de 1 mês; no
 * Pix que ajusta a data ela ganha alguns dias, uma vez só — os seguintes caem
 * certinho no mesmo dia).
 */
export function novoPagoAte(
  a: { testeAte: Date | null; pagoAte: Date | null; diaVencimento?: number | null },
  ciclo: Ciclo,
  agora: Date = new Date(),
): Date {
  const base = new Date(Math.max(agora.getTime(), a.testeAte?.getTime() ?? 0, a.pagoAte?.getTime() ?? 0));
  const fim = somarMesesEmBrasilia(base, ciclo === "anual" ? 12 : 1);
  const dia = a.diaVencimento;
  if (!dia) return fim;
  // Mês/ano do `fim` em Brasília (o UTC vira o dia 3h antes).
  const local = new Date(fim.getTime() - TRES_HORAS);
  let alvo = fimDoDiaEmBrasilia(local.getUTCFullYear(), local.getUTCMonth(), dia);
  // Margem de 1 dia: "venceu dia 10 e paga de novo" não deve pular um mês inteiro.
  if (alvo.getTime() < fim.getTime() - DIA_MS) {
    alvo = fimDoDiaEmBrasilia(local.getUTCFullYear(), local.getUTCMonth() + 1, dia);
  }
  return alvo;
}

/**
 * Manda o e-mail "seu plano vence em breve"? Sim quando está liberada, faltam
 * até 3 dias e ESTE vencimento ainda não foi avisado (o ciclo roda a cada 15 min).
 */
export function precisaAvisarVencimento(s: Situacao, avisoEnviadoPara: Date | null, agora: Date = new Date()): boolean {
  if (!s.liberado || !s.ate) return false;
  if (s.ate.getTime() - agora.getTime() > 3 * DIA_MS) return false;
  return !avisoEnviadoPara || avisoEnviadoPara.getTime() !== s.ate.getTime();
}
