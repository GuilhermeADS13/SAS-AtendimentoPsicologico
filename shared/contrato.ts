import { z } from "zod";

/**
 * Contrato terapêutico. O modelo é TEXTO com campos `{{assim}}`, preenchidos por
 * paciente na geração do PDF. Cada psicóloga usa o SEU, enviado em PDF/DOCX ou
 * digitado (therapists.contratoModelo). Não há texto padrão de propósito: contrato
 * é escolha de cada profissional, e o sistema não escreve um por ela.
 *
 * Formato: `# ` é o título do documento, `## ` o de uma seção, e linha em branco
 * separa parágrafos. É texto simples de propósito: dá para conferir e corrigir o
 * que veio do arquivo, e um PDF extraído quase nunca vem na ordem certa.
 */

export const CAMPOS_DO_CONTRATO = [
  { chave: "paciente", rotulo: "Nome do paciente" },
  { chave: "nascimento", rotulo: "Nascimento" },
  { chave: "cpf_paciente", rotulo: "CPF do paciente" },
  { chave: "endereco", rotulo: "Endereço" },
  { chave: "responsavel", rotulo: "Responsável" },
  { chave: "cpf_responsavel", rotulo: "CPF do responsável" },
  { chave: "psicologa", rotulo: "Psicóloga" },
  { chave: "crp", rotulo: "CRP" },
  { chave: "chave_pix", rotulo: "Chave Pix" },
  { chave: "duracao", rotulo: "Duração da sessão" },
  { chave: "frequencia", rotulo: "Frequência" },
  { chave: "dia_horario", rotulo: "Dia e horário" },
  { chave: "local", rotulo: "Local" },
  { chave: "valor", rotulo: "Valor da sessão" },
  { chave: "forma_pagamento", rotulo: "Forma de pagamento" },
  { chave: "prazo_pagamento", rotulo: "Prazo de pagamento" },
  { chave: "antecedencia", rotulo: "Antecedência para cancelar" },
  { chave: "observacoes", rotulo: "Observações" },
  { chave: "data", rotulo: "Data" },
] as const;

export type CampoDoContrato = (typeof CAMPOS_DO_CONTRATO)[number]["chave"];

/** Teto do texto: um contrato longo tem umas 8 mil letras; 20 mil sobram. */
export const TAMANHO_MAXIMO_DO_CONTRATO = 20000;

export const contratoTextoSchema = z.string().trim().min(1).max(TAMANHO_MAXIMO_DO_CONTRATO);

const CAMPO = /\{\{\s*([a-z_]+)\s*\}\}/g;
const CHAVES = new Set<string>(CAMPOS_DO_CONTRATO.map((c) => c.chave));

/**
 * Troca os campos pelos valores. Campo sem valor vira uma linha para preencher à
 * mão, menos as observações, que somem. Campo que não existe (erro de digitação)
 * fica como está, para aparecer no PDF em vez de sumir sem ninguém notar.
 */
export function preencherContrato(modelo: string, valores: Partial<Record<CampoDoContrato, string | null | undefined>>): string {
  return modelo.replace(CAMPO, (original, chave: string) => {
    if (!CHAVES.has(chave)) return original;
    const valor = (valores[chave as CampoDoContrato] ?? "").trim();
    return valor || (chave === "observacoes" ? "" : "_".repeat(20));
  });
}

export type BlocoDoContrato = { titulo?: string; texto: string };

/** Quebra o texto preenchido no título do documento e nas seções. */
export function blocosDoContrato(texto: string): { titulo: string; blocos: BlocoDoContrato[] } {
  let titulo = "CONTRATO TERAPÊUTICO";
  const blocos: BlocoDoContrato[] = [];
  for (const paragrafo of texto.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const linhas = paragrafo.split("\n");
    const primeira = linhas[0].trim();
    if (primeira.startsWith("# ")) {
      titulo = primeira.slice(2).trim();
      linhas.shift();
    }
    const secao = linhas[0]?.trim().startsWith("## ") ? linhas.shift()!.trim().slice(3).trim() : undefined;
    const corpo = linhas.join("\n").trim();
    if (secao || corpo) blocos.push({ titulo: secao, texto: corpo });
  }
  return { titulo, blocos };
}
