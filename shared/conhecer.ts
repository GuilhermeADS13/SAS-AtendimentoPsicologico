/**
 * "Encontrar uma psicóloga" (2026-11-13): regras puras, usadas no servidor e na tela.
 *
 * Decisões do Guilherme:
 * - A psicóloga abre horários para uma PRIMEIRA CONVERSA curta e gratuita; o paciente
 *   escolhe um e ela confirma. Ela continua no controle da agenda.
 * - A busca e os perfis são abertos a qualquer pessoa; pedir exige conta.
 * - O valor da sessão não aparece no perfil público (Código de Ética, art. 20, d:
 *   não usar o preço como propaganda). Também não há avaliações nem depoimentos.
 */

export const MODALIDADES = ["online", "presencial", "ambos"] as const;
export type Modalidade = (typeof MODALIDADES)[number];

export const ROTULO_DA_MODALIDADE: Record<Modalidade, string> = {
  online: "Online",
  presencial: "Presencial",
  ambos: "Online e presencial",
};

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
export type Uf = (typeof UFS)[number];

export function ehUf(valor: string | null | undefined): valor is Uf {
  return (UFS as readonly string[]).includes(valor ?? "");
}

export const STATUS_DO_PEDIDO = ["pendente", "aceito", "recusado", "cancelado", "expirado"] as const;
export type StatusDoPedido = (typeof STATUS_DO_PEDIDO)[number];

/** Duração padrão da primeira conversa, em minutos. */
export const DURACAO_PRIMEIRA_CONVERSA = 20;
export const DURACOES_PERMITIDAS = [15, 20, 30] as const;
/** O paciente só pede um horário que comece daqui a pelo menos 2 horas (dá tempo de ela ver). */
export const ANTECEDENCIA_MINIMA_MIN = 120;
/** Ela abre horários para os próximos 60 dias, no máximo. */
export const HORIZONTE_DE_HORARIOS_DIAS = 60;
/** Teto de horários futuros abertos ao mesmo tempo, por psicóloga. */
export const MAX_HORARIOS_ABERTOS = 40;
export const IDADE_MINIMA = 18;
export const MAX_OQUE_PROCURA = 500;
export const MAX_MENSAGEM = 500;

const MINUTO = 60 * 1000;
const DIA = 24 * 60 * MINUTO;

/** Idade completa em anos numa data "AAAA-MM-DD" (null se a data for inválida). */
export function idadeEmAnos(nascimento: string | null | undefined, agora: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nascimento ?? "");
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  // "Hoje" no horário de Brasília (UTC−3), para o aniversário virar à meia-noite daqui.
  const hoje = new Date(agora.getTime() - 3 * 60 * MINUTO);
  let idade = hoje.getUTCFullYear() - ano;
  const fezAniversario =
    hoje.getUTCMonth() + 1 > mes || (hoje.getUTCMonth() + 1 === mes && hoje.getUTCDate() >= dia);
  if (!fezAniversario) idade -= 1;
  return idade >= 0 && idade < 130 ? idade : null;
}

export function ehMaiorDeIdade(nascimento: string | null | undefined, agora: Date = new Date()): boolean {
  const idade = idadeEmAnos(nascimento, agora);
  return idade !== null && idade >= IDADE_MINIMA;
}

/** O paciente ainda pode pedir este horário? (começa daqui a pelo menos 2 horas) */
export function horarioPodeSerPedido(inicio: Date, agora: Date = new Date()): boolean {
  return inicio.getTime() - agora.getTime() >= ANTECEDENCIA_MINIMA_MIN * MINUTO;
}

/** A psicóloga pode abrir este horário? (no futuro e dentro dos próximos 60 dias) */
export function horarioPodeSerAberto(inicio: Date, agora: Date = new Date()): boolean {
  const t = inicio.getTime();
  if (Number.isNaN(t)) return false;
  return t > agora.getTime() + 30 * MINUTO && t <= agora.getTime() + HORIZONTE_DE_HORARIOS_DIAS * DIA;
}

/** Status que a tela mostra: um pedido pendente cujo horário já passou "expirou". */
export function statusVisivel(pedido: { status: StatusDoPedido; inicio: Date }, agora: Date = new Date()): StatusDoPedido {
  if (pedido.status === "pendente" && pedido.inicio.getTime() <= agora.getTime()) return "expirado";
  return pedido.status;
}

export const ROTULO_DO_STATUS: Record<StatusDoPedido, string> = {
  pendente: "Esperando resposta",
  aceito: "Confirmado",
  recusado: "Não foi possível",
  cancelado: "Cancelado",
  expirado: "Expirou sem resposta",
};

/** Marcas de acento separadas pelo NFD (U+0300 a U+036F), montadas sem escrever o caractere. */
const ACENTOS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

/** Minúsculas e sem acento, para a busca achar "psicanalise" em "Psicanálise". */
export function normalizarBusca(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(ACENTOS, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type PerfilBuscavel = {
  nome: string | null;
  specialties: string | null;
  abordagem: string | null;
  publicoAtendido: string | null;
  bio: string | null;
  cidade: string | null;
};

/** Todas as palavras digitadas precisam aparecer em algum campo do perfil. */
export function perfilCasaComTexto(perfil: PerfilBuscavel, texto: string): boolean {
  const palavras = normalizarBusca(texto).split(" ").filter(Boolean);
  if (!palavras.length) return true;
  const alvo = normalizarBusca(
    [perfil.nome, perfil.specialties, perfil.abordagem, perfil.publicoAtendido, perfil.bio, perfil.cidade].join(" "),
  );
  return palavras.every((p) => alvo.includes(p));
}

/** A modalidade da psicóloga atende a preferência do paciente? ("ambos" atende as duas) */
export function modalidadeAtende(daPsicologa: Modalidade | null, procurada: Modalidade | null | undefined): boolean {
  if (!procurada || procurada === "ambos") return true;
  if (!daPsicologa) return procurada === "online";
  return daPsicologa === "ambos" || daPsicologa === procurada;
}

/** "Maria da Silva Souza" → { firstName: "Maria", lastName: "da Silva Souza" } (ficha do paciente). */
export function separarNome(nome: string | null | undefined): { firstName: string; lastName: string } {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return { firstName: "Paciente", lastName: "" };
  return { firstName: partes[0].slice(0, 128), lastName: partes.slice(1).join(" ").slice(0, 128) };
}

/**
 * O que falta para a psicóloga aparecer na busca. Perfil vazio não ajuda o paciente a
 * escolher: pede especialidades e uma apresentação de pelo menos algumas linhas.
 */
export function faltaParaAparecer(perfil: { specialties: string | null; bio: string | null }): string[] {
  const falta: string[] = [];
  if (!(perfil.specialties ?? "").split(",").some((s) => s.trim())) falta.push("as especialidades");
  if ((perfil.bio ?? "").trim().length < 40) falta.push("uma apresentação (Sobre mim) com pelo menos 40 letras");
  return falta;
}

/** Por que este paciente não pode pedir agora (null = pode). */
export type MotivoParaNaoPedir = "psicologa" | "vinculado" | "perfil" | "menor" | "pendente";

export function motivoParaNaoPedir(p: {
  role: string;
  vinculoAtivo: boolean;
  perfilCompleto: boolean;
  nascimento: string | null | undefined;
  temPedidoPendente: boolean;
  agora?: Date;
}): MotivoParaNaoPedir | null {
  if (p.role === "therapist" || p.role === "admin") return "psicologa";
  if (p.vinculoAtivo) return "vinculado";
  if (!p.perfilCompleto) return "perfil";
  if (!ehMaiorDeIdade(p.nascimento, p.agora)) return "menor";
  if (p.temPedidoPendente) return "pendente";
  return null;
}

export const EXPLICACAO_DO_MOTIVO: Record<MotivoParaNaoPedir, string> = {
  psicologa: "Contas de psicóloga não pedem primeira conversa. Use uma conta de paciente.",
  vinculado: "Você já é paciente de uma psicóloga aqui. Fale com ela pela área Mensagens.",
  perfil: "Complete seu perfil (cidade, estado e data de nascimento) para pedir um horário.",
  menor: "A primeira conversa pela busca é para maiores de 18 anos. Para menores, quem pede é o responsável, direto com a psicóloga.",
  pendente: "Você já tem um pedido esperando resposta. Cancele aquele ou espere a resposta para pedir outro.",
};
