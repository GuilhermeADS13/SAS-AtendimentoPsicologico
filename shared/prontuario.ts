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
 * dele (nome + corpo em markdown) nas Configurações. Aparecem nas anotações da
 * videochamada e no registro de sessão do prontuário: os de `grupo` "Rápidos"
 * (e os do psicólogo) como botões, os demais no menu "Mais modelos".
 *
 * Base (2026-10-27): formatos de evolução usados na prática clínica (SOAP, DAP,
 * BIRP, GIRP), registros por abordagem e por situação. Os textos são próprios;
 * a espinha segue a Resolução CFP nº 001/2009, art. 2º — demanda e objetivos,
 * evolução com os procedimentos adotados, encaminhamento ou encerramento — e,
 * no atendimento em grupo não eventual (casal, família), a documentação
 * individual de cada participante (art. 5º, III).
 */
export type GrupoDeModelo = "Rápidos" | "Formatos de evolução" | "Por abordagem" | "Situações";

export const MODELOS_INTERNOS: readonly { nome: string; grupo: GrupoDeModelo; corpo: string }[] = [
  {
    nome: "SOAP",
    grupo: "Rápidos",
    corpo: "**S — Subjetivo**\n\n\n**O — Objetivo**\n\n\n**A — Avaliação**\n\n\n**P — Plano**\n",
  },
  { nome: "Evolução breve", grupo: "Rápidos", corpo: "**Evolução**\n\n\n**Conduta / próximos passos**\n" },

  // Formatos de evolução
  {
    nome: "DAP",
    grupo: "Formatos de evolução",
    corpo:
      "**D — Dados** _(o que o paciente trouxe e o que você observou)_\n\n\n" +
      "**A — Avaliação** _(leitura clínica: progresso, padrões, hipóteses)_\n\n\n" +
      "**P — Plano** _(próximos passos, tarefas, data do próximo encontro)_\n",
  },
  {
    nome: "BIRP",
    grupo: "Formatos de evolução",
    corpo:
      "**B — Comportamento / apresentação** _(humor, afeto, discurso, como chegou)_\n\n\n" +
      "**I — Intervenção** _(técnicas e abordagens usadas na sessão)_\n\n\n" +
      "**R — Resposta** _(como o paciente reagiu às intervenções)_\n\n\n" +
      "**P — Plano** _(próximos passos)_\n",
  },
  {
    nome: "GIRP",
    grupo: "Formatos de evolução",
    corpo:
      "**G — Objetivo trabalhado** _(qual objetivo terapêutico foi o foco)_\n\n\n" +
      "**I — Intervenção**\n\n\n" +
      "**R — Resposta / progresso em relação ao objetivo**\n\n\n" +
      "**P — Plano**\n",
  },

  // Por abordagem
  {
    nome: "TCC",
    grupo: "Por abordagem",
    corpo:
      "**Humor / check-in** _(como chegou; escalas, se usar)_\n\n\n" +
      "**Ponte com a sessão anterior**\n\n\n" +
      "**Revisão da tarefa de casa**\n\n\n" +
      "**Agenda da sessão**\n- \n\n" +
      "**Trabalho da sessão** _(situações, pensamentos automáticos, emoções, comportamentos, técnicas usadas)_\n\n\n" +
      "**Resumo e feedback do paciente**\n\n\n" +
      "**Tarefa de casa**\n- [ ] \n",
  },
  {
    nome: "Psicanalítica",
    grupo: "Por abordagem",
    corpo:
      "**Conteúdos trazidos** _(temas, associações, repetições)_\n\n\n" +
      "**Sonhos, atos falhos, lapsos**\n\n\n" +
      "**Transferência e contratransferência**\n\n\n" +
      "**Intervenções / interpretações**\n\n\n" +
      "**Hipóteses e pontos a acompanhar**\n",
  },

  // Situações
  {
    nome: "Primeira sessão",
    grupo: "Situações",
    corpo:
      "**Motivo da procura / queixa principal**\n\n\n" +
      "**Avaliação da demanda** _(o que está por trás do pedido)_\n\n\n" +
      "**Objetivos combinados para o trabalho**\n- \n\n" +
      "**Combinados** _(frequência, duração, valor, sigilo e seus limites, faltas)_\n\n\n" +
      "**Risco** _(ideação, autolesão, violência — presente / ausente)_\n\n\n" +
      "**Encaminhamentos necessários**\n",
  },
  {
    nome: "Atendimento infantil",
    grupo: "Situações",
    corpo:
      "**Quem trouxe / quem participou**\n\n\n" +
      "**Brincadeiras e atividades** _(o que escolheu, como brincou)_\n\n\n" +
      "**Temas e afetos que apareceram**\n\n\n" +
      "**Interação com a terapeuta**\n\n\n" +
      "**Orientação aos responsáveis / próximos passos**\n",
  },
  {
    nome: "Casal / família",
    grupo: "Situações",
    corpo:
      "**Presentes na sessão**\n- \n\n" +
      "**Demanda trabalhada**\n\n\n" +
      "**Dinâmica observada** _(padrões de comunicação, alianças, conflitos)_\n\n\n" +
      "**Intervenções**\n\n\n" +
      "**Combinados até o próximo encontro**\n\n\n" +
      "_Em atendimento de casal ou família, registre também no prontuário individual de cada um o que for de cada um (CFP 001/2009, art. 5º, III)._\n",
  },
  {
    nome: "Avaliação de risco",
    grupo: "Situações",
    corpo:
      "**Sinais de risco** _(ideação, plano, meios, tentativas anteriores, autolesão)_\n\n\n" +
      "**Fatores de proteção** _(rede de apoio, motivos para viver, tratamento)_\n\n\n" +
      "**Nível de risco avaliado** _(baixo / moderado / alto)_\n\n\n" +
      "**Conduta** _(plano de segurança, contato com a rede de apoio, CVV 188, SAMU 192, encaminhamento)_\n\n\n" +
      "**Retorno combinado**\n",
  },
  {
    nome: "Sessão com responsáveis",
    grupo: "Situações",
    corpo:
      "**Presentes**\n\n\n" +
      "**O que os responsáveis trouxeram**\n\n\n" +
      "**Devolutiva / orientações dadas** _(sem expor o que é sigiloso da criança ou do adolescente)_\n\n\n" +
      "**Combinados**\n",
  },
  {
    nome: "Encaminhamento",
    grupo: "Situações",
    corpo:
      "**Encaminhado para** _(profissional ou serviço)_\n\n\n" +
      "**Motivo do encaminhamento**\n\n\n" +
      "**Informações compartilhadas** _(só o necessário, com o consentimento do paciente)_\n\n\n" +
      "**Acompanhamento** _(o atendimento continua? retorno?)_\n",
  },
  {
    nome: "Encerramento / alta",
    grupo: "Situações",
    corpo:
      "**Motivo do encerramento** _(alta, interrupção, mudança, encaminhamento)_\n\n\n" +
      "**Evolução em relação aos objetivos combinados**\n\n\n" +
      "**Condição na saída**\n\n\n" +
      "**Orientações e encaminhamentos**\n\n\n" +
      "_O prontuário deve ser guardado por no mínimo 5 anos (CFP 001/2009, art. 4º)._\n",
  },
];

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

/**
 * O que falta no prontuário frente à Resolução CFP nº 001/2009: avaliação da
 * demanda, objetivos do trabalho, TCLE e anamnese. É a MESMA regra que a Luma usa
 * para "o que falta preencher" (server/ai/clinical-tools.ts) e que a lista de
 * pacientes mostra — um lugar só, para as duas nunca discordarem.
 */
export function pendenciasDoProntuario(p: {
  initialDemand?: string | null;
  therapeuticGoals?: string | null;
  tcleSignedAt?: Date | string | null;
  anamnesis?: unknown;
}): string[] {
  const vazio = (texto: string | null | undefined) => !texto || !texto.trim();
  const faltando: string[] = [];
  if (vazio(p.initialDemand)) faltando.push("avaliação da demanda inicial");
  if (vazio(p.therapeuticGoals)) faltando.push("objetivos terapêuticos");
  if (!p.tcleSignedAt) faltando.push("TCLE assinado");
  if (!p.anamnesis) faltando.push("ficha de anamnese");
  return faltando;
}
