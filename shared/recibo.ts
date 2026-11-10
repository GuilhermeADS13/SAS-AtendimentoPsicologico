/**
 * Recibo de pagamento de sessões (2026-11-09).
 *
 * Para valer no Imposto de Renda do paciente, o recibo de serviço de saúde traz:
 * nome, CPF, endereço e registro profissional de quem atendeu; nome e CPF de quem
 * pagou; o valor (em número e por extenso); o serviço e as datas; local e data de
 * emissão e a assinatura. Sem CPF ou endereço o recibo sai mesmo assim, e a tela
 * avisa o que falta (`oQueFaltaNoRecibo`).
 */
import { formatarBRL } from "./dinheiro";
import { FUSO_BR } from "./datas";

export function soDigitosDoCpf(cpf: string): string {
  return cpf.replace(/\D/g, "").slice(0, 11);
}

/** CPF com os dois dígitos verificadores certos (rejeita 000.000.000-00 e afins). */
export function cpfValido(cpf: string): boolean {
  const d = soDigitosDoCpf(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

/** 12345678909 -> 123.456.789-09 (vai mascarando conforme a pessoa digita). */
export function mascaraCpf(cpf: string): string {
  const d = soDigitosDoCpf(cpf);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

/** 0 a 999 por extenso ("cento e vinte e três"). */
function ate999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto < 20) {
    if (resto) partes.push(UNIDADES[resto]);
  } else {
    const dz = Math.floor(resto / 10);
    const u = resto % 10;
    partes.push(u ? `${DEZENAS[dz]} e ${UNIDADES[u]}` : DEZENAS[dz]);
  }
  return partes.join(" e ");
}

/** Inteiro de 0 a 999.999.999 por extenso. */
function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (milhoes) partes.push(milhoes === 1 ? "um milhão" : `${ate999(milhoes)} milhões`);
  if (milhares) partes.push(milhares === 1 ? "mil" : `${ate999(milhares)} mil`);
  if (resto) partes.push(ate999(resto));
  // "mil e duzentos", "mil cento e dez": o "e" final só entra quando o último grupo
  // é uma centena redonda ou menor que cem.
  if (partes.length > 1 && resto && (resto < 100 || resto % 100 === 0)) {
    const ultimo = partes.pop()!;
    return `${partes.join(" ")} e ${ultimo}`;
  }
  return partes.join(" ");
}

/** 30050 -> "trezentos reais e cinquenta centavos". */
export function valorPorExtenso(centavos: number): string {
  const reais = Math.floor(centavos / 100);
  const cents = Math.round(centavos % 100);
  const partes: string[] = [];
  if (reais) {
    const texto = inteiroPorExtenso(reais);
    // "um milhão de reais", "dois milhões de reais".
    const de = reais % 1_000_000 === 0 ? " de" : "";
    partes.push(`${texto}${de} ${reais === 1 ? "real" : "reais"}`);
  }
  if (cents) partes.push(`${inteiroPorExtenso(cents)} ${cents === 1 ? "centavo" : "centavos"}`);
  return partes.length ? partes.join(" e ") : "zero real";
}

export type DadosDoRecibo = {
  psicologa: { nome: string; crp: string; cpf?: string | null; endereco?: string | null };
  paciente: { nome: string; cpf?: string | null };
  /** Quem pagou, quando não é o próprio paciente (menor de idade, por exemplo). */
  pagador?: { nome: string; cpf?: string | null } | null;
  /** Consultas pagas que o recibo cobre. */
  consultas: { data: Date; valorCentavos: number }[];
  /** Cidade da emissão ("Recife/PE"); vazio = sem cidade na linha da data. */
  cidade?: string;
  emitidoEm: Date;
};

const data = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: FUSO_BR });
const dataPorExtenso = (d: Date) =>
  d.toLocaleDateString("pt-BR", { timeZone: FUSO_BR, day: "numeric", month: "long", year: "numeric" });

export function totalDoRecibo(dados: Pick<DadosDoRecibo, "consultas">): number {
  return dados.consultas.reduce((soma, c) => soma + c.valorCentavos, 0);
}

/** O texto do recibo, em parágrafos, igual para o PDF e para a prévia na tela. */
export function textoDoRecibo(dados: DadosDoRecibo): { titulo: string; corpo: string[]; local: string; assinatura: string[] } {
  const total = totalDoRecibo(dados);
  const quemPagou = dados.pagador?.nome?.trim() ? dados.pagador : dados.paciente;
  const cpfDeQuemPagou = quemPagou.cpf && cpfValido(quemPagou.cpf) ? `, CPF ${mascaraCpf(quemPagou.cpf)},` : "";
  const datas = [...dados.consultas].sort((a, b) => +a.data - +b.data).map((c) => data(c.data));
  const sessoes = datas.length === 1 ? `à sessão de psicoterapia realizada em ${datas[0]}` : `a ${datas.length} sessões de psicoterapia realizadas em ${datas.slice(0, -1).join(", ")} e ${datas[datas.length - 1]}`;
  const beneficiario =
    quemPagou === dados.paciente
      ? ""
      : `, ${datas.length === 1 ? "prestada" : "prestadas"} a ${dados.paciente.nome}${dados.paciente.cpf && cpfValido(dados.paciente.cpf) ? ` (CPF ${mascaraCpf(dados.paciente.cpf)})` : ""}`;
  const corpo = [
    // O espaço do "R$ 300,00" do toLocaleString é o inseparável (U+00A0): no PDF vira lixo.
    `Recebi de ${quemPagou.nome}${cpfDeQuemPagou} a quantia de ${formatarBRL(total).replace(/\u00a0/g, " ")} (${valorPorExtenso(total)}), referente ${sessoes}${beneficiario}.`,
    "Para clareza, firmo o presente recibo.",
  ];
  const local = `${dados.cidade?.trim() ? `${dados.cidade.trim()}, ` : ""}${dataPorExtenso(dados.emitidoEm)}.`;
  const p = dados.psicologa;
  const assinatura = [
    p.nome,
    `CRP ${p.crp}`,
    ...(p.cpf && cpfValido(p.cpf) ? [`CPF ${mascaraCpf(p.cpf)}`] : []),
    ...(p.endereco?.trim() ? [p.endereco.trim()] : []),
  ];
  return { titulo: "RECIBO", corpo, local, assinatura };
}

/** O que falta para o recibo valer no Imposto de Renda (vazio = completo). */
export function oQueFaltaNoRecibo(dados: DadosDoRecibo): string[] {
  const falta: string[] = [];
  if (!dados.psicologa.cpf || !cpfValido(dados.psicologa.cpf)) falta.push("o seu CPF");
  if (!dados.psicologa.endereco?.trim()) falta.push("o seu endereço de atendimento");
  const quemPagou = dados.pagador?.nome?.trim() ? dados.pagador : dados.paciente;
  if (!quemPagou.cpf || !cpfValido(quemPagou.cpf)) falta.push(dados.pagador?.nome?.trim() ? "o CPF de quem pagou" : "o CPF do paciente");
  return falta;
}
