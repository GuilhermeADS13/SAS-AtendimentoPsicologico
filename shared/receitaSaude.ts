/**
 * Recibos do Receita Saúde em lote (2026-11-19).
 *
 * Desde 2025 a psicóloga que atende como pessoa física emite cada recibo no Receita
 * Saúde (IN RFB 2.240/2024). Desde out/2025 o Carnê-Leão importa um arquivo com até
 * 1.000 recibos de uma vez (manual do Receita Saúde v2.1, pergunta 24): e-CAC >
 * Carnê-Leão > Escrituração > Importar Escrituração. Aqui se monta esse arquivo.
 *
 * Formato, como no exemplo do manual: uma linha por recibo, 16 campos separados por
 * ";", sem cabeçalho e sem ";" no fim. As linhas vão separadas só por "\n" e sem linha
 * em branco no fim, e o texto vai SEM acento: o manual não diz a codificação nem a quebra
 * de linha, e assim o arquivo sai igual em qualquer uma.
 */
import { FUSO_BR, partesEmBrasilia } from "./datas";
import { cpfValido, soDigitosDoCpf } from "./recibo";

/** Rendimento do trabalho não assalariado. */
export const CODIGO_DO_RENDIMENTO = "R01.001.001";
export const OCUPACAO_PSICOLOGO = "255";
export const MAX_RECIBOS_POR_ARQUIVO = 1000;

export type ReciboDoLote = {
  /** Quando o dinheiro entrou: é a data do recibo. */
  pagoEm: Date;
  /** Dia da sessão: vai na descrição. */
  consultaEm: Date;
  valorCentavos: number;
  /** Quem pagou e quem foi atendido. São o mesmo CPF quando o próprio paciente paga. */
  cpfPagador: string;
  cpfBeneficiario: string;
};

type DatasDoPagamento = {
  scheduledAt: Date | string;
  paidAt?: Date | string | null;
  pagamentoInformadoEm?: Date | string | null;
};

/**
 * Quando o pagamento aconteceu: o "Já paguei" do paciente, que vem antes da conferência
 * dela; senão, quando ela marcou como pago; sem nenhum dos dois (consulta antiga), o dia
 * da sessão.
 */
export function dataDoPagamento(c: DatasDoPagamento): Date {
  return new Date(c.pagamentoInformadoEm ?? c.paidAt ?? c.scheduledAt);
}

/** "05/11/2026", no fuso do Brasil. */
export function dataDoCarneLeao(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: FUSO_BR, day: "2-digit", month: "2-digit", year: "numeric" });
}

/** 15050 -> "150,50": vírgula decimal, sem separador de milhar. */
export function valorDoCarneLeao(centavos: number): string {
  const inteiro = Math.round(centavos);
  return `${Math.floor(inteiro / 100)},${String(inteiro % 100).padStart(2, "0")}`;
}

/** Ano e mês (1 a 12) de uma data no fuso do Brasil. */
export function mesEmBrasilia(d: Date): { ano: number; mes: number } {
  const [ano, mes] = partesEmBrasilia(d).data.split("-");
  return { ano: Number(ano), mes: Number(mes) };
}

export function linhaDoCarneLeao(r: ReciboDoLote, cpfDaPsicologa: string): string {
  return [
    dataDoCarneLeao(r.pagoEm),
    CODIGO_DO_RENDIMENTO,
    OCUPACAO_PSICOLOGO,
    valorDoCarneLeao(r.valorCentavos),
    "", // valor da dedução: não se aplica a recibo
    `Psicoterapia realizada em ${dataDoCarneLeao(r.consultaEm)}`,
    "PF", // recebido de pessoa física
    soDigitosDoCpf(r.cpfPagador),
    soDigitosDoCpf(r.cpfBeneficiario),
    "", // indicador de CPF não informado
    "", // CNPJ
    "", // indicador de IRRF
    "", // valor do IRRF
    "S", // gera o recibo do Receita Saúde
    soDigitosDoCpf(cpfDaPsicologa),
    "", // registro profissional: pode ficar vazio quando há um só registro ativo
  ].join(";");
}

export function arquivoDoCarneLeao(recibos: ReciboDoLote[], cpfDaPsicologa: string): string {
  return recibos.map((r) => linhaDoCarneLeao(r, cpfDaPsicologa)).join("\n");
}

/** "receita-saude-2026-11.csv" */
export function nomeDoArquivo(ano: number, mes: number): string {
  return `receita-saude-${ano}-${String(mes).padStart(2, "0")}.csv`;
}

/** O que impede o Carnê-Leão de aceitar o arquivo (vazio = pode baixar). */
export function problemasDoLote(recibos: ReciboDoLote[], cpfDaPsicologa: string | null | undefined): string[] {
  const problemas: string[] = [];
  if (!cpfDaPsicologa || !cpfValido(cpfDaPsicologa)) problemas.push("Falta o seu CPF, o mesmo que você usa no Carnê-Leão.");
  if (!recibos.length) problemas.push("Marque pelo menos uma consulta.");
  if (recibos.length > MAX_RECIBOS_POR_ARQUIVO) {
    problemas.push(`O Carnê-Leão aceita até ${MAX_RECIBOS_POR_ARQUIVO} recibos por arquivo. Desmarque algumas consultas.`);
  }
  const semCpf = recibos.filter((r) => !cpfValido(r.cpfPagador) || !cpfValido(r.cpfBeneficiario)).length;
  if (semCpf) problemas.push(semCpf === 1 ? "Falta o CPF em 1 recibo." : `Falta o CPF em ${semCpf} recibos.`);
  if (recibos.some((r) => !(r.valorCentavos > 0))) problemas.push("Há consulta sem valor.");
  if (new Set(recibos.map((r) => mesEmBrasilia(r.pagoEm).ano)).size > 1) {
    problemas.push("Todos os recibos de um arquivo precisam ser do mesmo ano.");
  }
  return problemas;
}
