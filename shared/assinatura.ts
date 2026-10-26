import { DIAS_DE_TESTE_GRATIS, VAGAS_DE_FUNDADOR, type Ciclo } from "./precos";

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
};

const DIA_MS = 24 * 60 * 60 * 1000;

export function situacaoDaAssinatura(
  a: { testeAte: Date | null; pagoAte: Date | null } | null | undefined,
  agora: Date = new Date(),
): Situacao {
  if (!a) return { liberado: false, motivo: "sem_assinatura", ate: null, diasRestantes: null };
  const restante = (d: Date) => Math.floor((d.getTime() - agora.getTime()) / DIA_MS);
  if (a.pagoAte && a.pagoAte > agora) {
    return { liberado: true, motivo: "pago", ate: a.pagoAte, diasRestantes: restante(a.pagoAte) };
  }
  if (a.testeAte && a.testeAte > agora) {
    return { liberado: true, motivo: "teste", ate: a.testeAte, diasRestantes: restante(a.testeAte) };
  }
  const ate = [a.pagoAte, a.testeAte].filter((d): d is Date => !!d).sort((x, y) => y.getTime() - x.getTime())[0] ?? null;
  return { liberado: false, motivo: "vencido", ate, diasRestantes: null };
}

/** Mensagem única do bloqueio (servidor e tela falam a mesma coisa). */
export const MENSAGEM_ASSINATURA_VENCIDA =
  "Seu acesso venceu. Renove pelo Pix em Configurações → Seu plano. Seus prontuários continuam disponíveis para leitura.";

/** CRP e celular em dígitos: "06/123456" e "06123456" são o mesmo CRP. */
export const normalizarDocumento = (valor: string | null | undefined) => (valor ?? "").replace(/\D/g, "");

/**
 * Teste grátis e vaga de fundadora para uma psicóloga recém-aprovada.
 *
 * Um teste por pessoa: se o CRP ou o celular já aparecem noutra assinatura
 * (conta nova da mesma pessoa), não ganha teste nem nova vaga — mas herda a
 * vaga de fundadora se a conta anterior tinha. O celular sozinho não basta
 * (não é verificado por SMS); o CRP, conferido pelo admin, é o que segura.
 */
export function decidirTesteEFundador(
  {
    anteriores,
    fundadoresAtuais,
  }: {
    /** Assinaturas que já usam este CRP ou este celular. */
    anteriores: Array<{ fundador: boolean }>;
    fundadoresAtuais: number;
  },
  agora: Date = new Date(),
): { testeAte: Date | null; fundador: boolean } {
  if (anteriores.length) {
    return { testeAte: null, fundador: anteriores.some((a) => a.fundador) };
  }
  return {
    testeAte: new Date(agora.getTime() + DIAS_DE_TESTE_GRATIS * DIA_MS),
    fundador: fundadoresAtuais < VAGAS_DE_FUNDADOR,
  };
}

/** Dias de vencimento que a psicóloga pode escolher (sem 29–31, que nem todo mês tem). */
export const DIAS_DE_VENCIMENTO = [5, 10, 15, 20, 25] as const;

/** Fim do dia `dia` em Brasília (23:59:59, UTC−3) no mês/ano dados (mês 0–11). */
function fimDoDiaEmBrasilia(ano: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes, dia + 1, 2, 59, 59));
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
  const fim = new Date(base);
  fim.setMonth(fim.getMonth() + (ciclo === "anual" ? 12 : 1));
  const dia = a.diaVencimento;
  if (!dia) return fim;
  // Mês/ano do `fim` em Brasília (o UTC vira o dia 3h antes).
  const local = new Date(fim.getTime() - 3 * 60 * 60 * 1000);
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
