import { z } from "zod";

/**
 * Contrato terapêutico. O modelo é TEXTO com campos `{{assim}}`, preenchidos por
 * paciente na geração do PDF. Cada psicóloga pode ter o seu (enviado em PDF/DOCX
 * ou digitado, em therapists.contratoModelo); sem modelo, vale o CONTRATO_PADRAO.
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

export const CONTRATO_PADRAO = `# CONTRATO TERAPÊUTICO E TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO

## Paciente
Nome: {{paciente}}
Data de nascimento: {{nascimento}}
CPF: {{cpf_paciente}}
Endereço: {{endereco}}

## Responsável (paciente menor de idade)
Nome: {{responsavel}}
CPF: {{cpf_responsavel}}

## Psicólogo(a)
Nome: {{psicologa}}
CRP: {{crp}}

## Atendimento
A psicoterapia é um processo colaborativo que visa o autoconhecimento e o manejo de demandas emocionais e comportamentais. As sessões têm frequência {{frequencia}} e duração de {{duracao}}, em {{dia_horario}}. Local: {{local}}.

## Duração do processo
Não há tempo pré-determinado para a conclusão: a duração varia com a necessidade do paciente.

## Sigilo
Os atendimentos são confidenciais, conforme o Código de Ética Profissional do Psicólogo. O sigilo só poderá ser quebrado em situações de risco de vida para o paciente ou para terceiros, ou por determinação judicial legalmente embasada.

## Registros
As informações das sessões são registradas em prontuário seguro, de propriedade do paciente e sob a guarda do(a) psicólogo(a) pelo período legal de 5 anos, conforme as normas do CFP e a LGPD.

## Pagamento
Valor por sessão: {{valor}}
Forma de pagamento: {{forma_pagamento}}
Prazo: {{prazo_pagamento}}
Chave Pix: {{chave_pix}}

## Faltas e cancelamentos
O horário é reservado exclusivamente ao paciente. Faltas e cancelamentos devem ser avisados com antecedência mínima de {{antecedencia}}; fora desse prazo, procura-se remarcar na mesma semana, conforme a agenda, e, não sendo possível, a sessão é cobrada integralmente. Se a falta for do(a) psicólogo(a), a sessão não é cobrada.

## Atrasos
Em caso de atraso do paciente, a sessão termina no horário habitual, pois os atendimentos são por hora marcada. Se o atraso for do(a) psicólogo(a), o tempo combinado da sessão é mantido.

## Ausência por longo período
Em férias, licenças, viagens ou outro afastamento de duas semanas consecutivas ou mais, o paciente que quiser manter o horário reservado paga o valor normal da sessão, e o horário não é destinado a outra pessoa nesse período.

## Documentos psicológicos
Laudos, relatórios e outros documentos que precisem de mais tempo para serem elaborados devem ser solicitados com 15 dias de antecedência e podem ter taxa adicional, a combinar.

## Considerações finais
Este contrato mantém a confidencialidade dos dados do paciente e do(a) psicólogo(a). Qualquer alteração só é permitida com o acordo das duas partes.

{{observacoes}}

Data: {{data}}

__________________________________________
Assinatura do(a) paciente (ou responsável legal)

__________________________________________
Assinatura e CRP do(a) psicólogo(a)
`;

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
