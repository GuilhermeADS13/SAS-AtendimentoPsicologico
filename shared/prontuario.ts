import { z } from "zod";

/**
 * Prontuário psicológico — campos alinhados à Resolução CFP nº 001/2009
 * (estrutura mínima obrigatória), ao método de evolução SOAP e à ficha de
 * anamnese. Este módulo é a FONTE ÚNICA da estrutura: o formulário do
 * prontuário, a validação no servidor e a exportação (PDF/DOCX) leem daqui,
 * para não haver campos divergentes entre as camadas.
 *
 * As respostas (anamnese e TCLE) são guardadas como JSON no banco; os campos
 * "de topo" do CFP (demanda inicial, objetivos/plano, encerramento) e o SOAP
 * das sessões são colunas próprias — ver drizzle/schema.ts.
 */

/** Um campo de texto de um formulário estruturado do prontuário. */
export type CampoProntuario = {
  chave: string;
  rotulo: string;
  grupo: string;
  /** Textarea (várias linhas) em vez de input de uma linha. */
  multilinha?: boolean;
  ajuda?: string;
};

/**
 * Ficha de Anamnese (1ª sessão). A identificação básica (nome, nascimento,
 * telefone, e-mail, endereço) já vive no cadastro do paciente e não se repete
 * aqui; abaixo ficam os complementos de identificação e o levantamento clínico.
 * Inclui campos úteis à psicanálise (história de vida, demanda manifesta/latente).
 */
export const ANAMNESE_CAMPOS = [
  // Identificação complementar (o que não está no cadastro)
  { chave: "profissao", rotulo: "Profissão / Ocupação", grupo: "Identificação complementar" },
  { chave: "estadoCivil", rotulo: "Estado civil", grupo: "Identificação complementar" },
  { chave: "genero", rotulo: "Gênero", grupo: "Identificação complementar" },
  { chave: "escolaridade", rotulo: "Escolaridade", grupo: "Identificação complementar" },

  // Queixa e demanda
  { chave: "queixaPrincipal", rotulo: "Queixa principal", grupo: "Queixa e demanda", multilinha: true, ajuda: "Motivo principal que trouxe à terapia neste momento." },
  { chave: "historiaQueixa", rotulo: "História do problema", grupo: "Queixa e demanda", multilinha: true, ajuda: "Quando começou, gatilhos, frequência e intensidade." },
  { chave: "tentativasAnteriores", rotulo: "Tentativas anteriores de solução", grupo: "Queixa e demanda", multilinha: true, ajuda: "O que já fez para resolver; terapia anterior." },

  // Histórico de saúde geral e mental
  { chave: "tratamentoMedico", rotulo: "Tratamento médico atual", grupo: "Histórico de saúde", ajuda: "Qual, se houver." },
  { chave: "medicacaoContinua", rotulo: "Medicação de uso contínuo", grupo: "Histórico de saúde", ajuda: "Qual, se houver." },
  { chave: "acompanhamentoPsiquiatrico", rotulo: "Acompanhamento psiquiátrico", grupo: "Histórico de saúde", ajuda: "Anterior ou atual." },
  { chave: "historicoFamiliarSaudeMental", rotulo: "Histórico de saúde mental na família", grupo: "Histórico de saúde", multilinha: true },
  { chave: "qualidadeSono", rotulo: "Qualidade do sono", grupo: "Histórico de saúde", ajuda: "Boa/Regular/Ruim; horas por noite." },
  { chave: "usoSubstancias", rotulo: "Alimentação / uso de substâncias", grupo: "Histórico de saúde", multilinha: true, ajuda: "Álcool, tabaco, outras substâncias." },

  // Dinâmica familiar e rede de apoio
  { chave: "comQuemReside", rotulo: "Com quem reside atualmente", grupo: "Dinâmica familiar e rede de apoio", multilinha: true },
  { chave: "relacoesFamiliares", rotulo: "Relações familiares principais", grupo: "Dinâmica familiar e rede de apoio", multilinha: true },
  { chave: "redeApoio", rotulo: "Rede de apoio", grupo: "Dinâmica familiar e rede de apoio", multilinha: true, ajuda: "Amigos, parceiros ou pessoas de confiança." },

  // Rotina, trabalho e lazer
  { chave: "rotinaDiaria", rotulo: "Rotina diária", grupo: "Rotina, trabalho e lazer", multilinha: true },
  { chave: "satisfacaoTrabalho", rotulo: "Satisfação com trabalho / estudos", grupo: "Rotina, trabalho e lazer" },
  { chave: "lazer", rotulo: "Lazer e descanso", grupo: "Rotina, trabalho e lazer", multilinha: true },

  // História de vida (útil à psicanálise)
  { chave: "historiaDeVida", rotulo: "História de vida", grupo: "História de vida", multilinha: true, ajuda: "Marcos do desenvolvimento, infância, relações significativas, perdas." },
  { chave: "demandaManifesta", rotulo: "Demanda manifesta", grupo: "História de vida", multilinha: true, ajuda: "O que o paciente diz que quer." },
  { chave: "demandaLatente", rotulo: "Demanda latente (hipótese)", grupo: "História de vida", multilinha: true, ajuda: "Leitura do profissional sobre o que está por trás." },

  // Impressões iniciais do profissional
  { chave: "aparenciaComportamento", rotulo: "Aparência e comportamento geral", grupo: "Impressões do profissional", multilinha: true },
  { chave: "funcoesPsiquicas", rotulo: "Funções psíquicas", grupo: "Impressões do profissional", multilinha: true, ajuda: "Humor, afeto, atenção, discurso — preservadas/alteradas." },
  { chave: "hipoteseInicial", rotulo: "Hipótese diagnóstica / foco inicial", grupo: "Impressões do profissional", multilinha: true },
  { chave: "encaminhamentos", rotulo: "Encaminhamentos necessários", grupo: "Impressões do profissional", multilinha: true, ajuda: "Psiquiatra, clínico geral, outros." },
] as const satisfies readonly CampoProntuario[];

export type AnamneseChave = (typeof ANAMNESE_CAMPOS)[number]["chave"];
export type AnamneseData = Partial<Record<AnamneseChave, string>>;

/**
 * Termo de Consentimento Livre e Esclarecido (TCLE) — os termos variáveis do
 * contrato terapêutico. O texto fixo (sigilo, guarda de 5 anos, processo) é
 * montado na geração do documento; aqui ficam só os valores que mudam por
 * paciente. A data de assinatura é a coluna patients.tcleSignedAt.
 */
export const TCLE_CAMPOS = [
  { chave: "duracaoSessao", rotulo: "Duração da sessão", grupo: "Termos", ajuda: "Ex.: 50 minutos." },
  { chave: "frequencia", rotulo: "Frequência", grupo: "Termos", ajuda: "Ex.: semanal, quinzenal." },
  { chave: "valorSessao", rotulo: "Valor por sessão", grupo: "Termos", ajuda: "Ex.: R$ 150,00." },
  { chave: "formaPagamento", rotulo: "Forma de pagamento", grupo: "Termos", ajuda: "Ex.: Pix, transferência." },
  { chave: "diaPagamento", rotulo: "Dia / prazo de pagamento", grupo: "Termos", ajuda: "Ex.: até o dia 5, ou ao final de cada sessão." },
  { chave: "antecedenciaCancelamento", rotulo: "Antecedência para cancelar", grupo: "Termos", ajuda: "Ex.: 24 horas." },
  { chave: "local", rotulo: "Local do atendimento", grupo: "Termos", ajuda: "Ex.: on-line, ou endereço do consultório." },
  { chave: "observacoes", rotulo: "Observações adicionais", grupo: "Termos", multilinha: true },
] as const satisfies readonly CampoProntuario[];

export type TcleChave = (typeof TCLE_CAMPOS)[number]["chave"];
export type TcleData = Partial<Record<TcleChave, string>>;

/** Agrupa campos por `grupo`, preservando a ordem de declaração. */
export function agruparCampos(campos: readonly CampoProntuario[]): { grupo: string; campos: CampoProntuario[] }[] {
  const ordem: string[] = [];
  const mapa = new Map<string, CampoProntuario[]>();
  for (const campo of campos) {
    if (!mapa.has(campo.grupo)) {
      mapa.set(campo.grupo, []);
      ordem.push(campo.grupo);
    }
    mapa.get(campo.grupo)!.push(campo);
  }
  return ordem.map(grupo => ({ grupo, campos: mapa.get(grupo)! }));
}

// Validação (servidor): objeto com chaves conhecidas e valores de texto com teto
// de tamanho. Chaves desconhecidas são rejeitadas para não virar depósito de lixo.
const chavesAnamnese = ANAMNESE_CAMPOS.map(c => c.chave) as [AnamneseChave, ...AnamneseChave[]];
const chavesTcle = TCLE_CAMPOS.map(c => c.chave) as [TcleChave, ...TcleChave[]];

// partialRecord (zod v4): chaves conhecidas, mas todas opcionais (o formulário
// pode salvar só parte). z.record com enum exigiria TODAS as chaves presentes.
export const anamneseSchema = z.partialRecord(z.enum(chavesAnamnese), z.string().max(8000));
export const tcleSchema = z.partialRecord(z.enum(chavesTcle), z.string().max(8000));

/**
 * Modelos de anotação. Os INTERNOS vêm com o sistema; o psicólogo também cria os
 * dele (nome + corpo em markdown) nas Configurações. Aparecem como botões de
 * inserir nas anotações da videochamada e no registro de sessão do prontuário.
 */
export const MODELOS_INTERNOS = [
  { nome: "SOAP", corpo: "**S — Subjetivo**\n\n\n**O — Objetivo**\n\n\n**A — Avaliação**\n\n\n**P — Plano**\n" },
  { nome: "Evolução breve", corpo: "**Evolução**\n\n\n**Conduta / próximos passos**\n" },
] as const;

export type NoteTemplate = { id: string; nome: string; corpo: string; padrao?: boolean };

export const noteTemplateSchema = z.object({
  id: z.string().min(1).max(64),
  nome: z.string().trim().min(1).max(80),
  corpo: z.string().max(8000),
  padrao: z.boolean().optional(),
});
/** Lista de modelos do psicólogo (guardada em therapists.noteTemplates). */
export const noteTemplatesSchema = z.array(noteTemplateSchema).max(30);

/** SOAP — evolução estruturada de uma sessão (Resolução CFP + método SOAP). */
export const SOAP_CAMPOS = [
  { chave: "subjective", rotulo: "S — Subjetivo", grupo: "SOAP", multilinha: true, ajuda: "O que o paciente relata (queixas, percepções)." },
  { chave: "objective", rotulo: "O — Objetivo", grupo: "SOAP", multilinha: true, ajuda: "O que você observa (comportamento, humor, postura)." },
  { chave: "assessment", rotulo: "A — Avaliação", grupo: "SOAP", multilinha: true, ajuda: "Análise técnica da sessão e das técnicas aplicadas." },
  { chave: "plan", rotulo: "P — Plano", grupo: "SOAP", multilinha: true, ajuda: "Intervenções futuras, tarefas, ajustes no plano." },
] as const satisfies readonly CampoProntuario[];
