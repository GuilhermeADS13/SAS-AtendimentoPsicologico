/**
 * As perguntas prontas do cartão da Luma no Dashboard.
 *
 * Só entram perguntas que a Luma responde SEM paciente selecionado — ou seja, as
 * quatro ferramentas de leitura da prática: agenda, pacientes sem retorno,
 * prontuários incompletos e pendências financeiras. Pergunta de prontuário, sessão
 * ou documento exige escolher o paciente antes; de um clique só, a Luma responderia
 * pedindo para selecionar alguém — o atalho viraria um passo a mais, não a menos.
 */
const TEMAS_LUMA: readonly (readonly string[])[] = [
  ["Quem eu atendo hoje?", "Como está minha agenda desta semana?", "Qual é o meu próximo paciente?"],
  ["Quem está sumido?", "Quais pacientes estão sem retorno?"],
  ["Quais prontuários estão incompletos?", "O que falta preencher nos prontuários?"],
  ["O que tenho a receber?", "Tem pagamento pendente?"],
];

/** Quantas sugestões o cartão mostra de cada vez. */
export const QUANTAS_SUGESTOES = 3;

/**
 * Três sugestões para esta visita, girando a cada entrada no Dashboard.
 *
 * Gira o TEMA, não a frase solta: assim as três nunca são variações da mesma
 * pergunta (três jeitos de perguntar a agenda não ajudam ninguém). A frase dentro
 * de cada tema também alterna, então quem entra todo dia não lê sempre o mesmo.
 *
 * `visita` é um contador que só cresce; qualquer inteiro >= 0 serve.
 */
export function sugestoesDaVez(visita: number): string[] {
  const n = Math.max(0, Math.floor(visita)) % (TEMAS_LUMA.length * 12);
  return Array.from({ length: QUANTAS_SUGESTOES }, (_, i) => {
    const tema = TEMAS_LUMA[(n + i) % TEMAS_LUMA.length];
    return tema[Math.floor((n + i) / TEMAS_LUMA.length) % tema.length];
  });
}
