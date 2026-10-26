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

/**
 * Novo "pago até" ao registrar um Pix: soma o ciclo a partir do que for mais
 * tarde entre hoje, o fim do teste e o Pix anterior — pagar adiantado não perde dia.
 */
export function novoPagoAte(
  a: { testeAte: Date | null; pagoAte: Date | null },
  ciclo: Ciclo,
  agora: Date = new Date(),
): Date {
  const base = new Date(Math.max(agora.getTime(), a.testeAte?.getTime() ?? 0, a.pagoAte?.getTime() ?? 0));
  const fim = new Date(base);
  fim.setMonth(fim.getMonth() + (ciclo === "anual" ? 12 : 1));
  return fim;
}
