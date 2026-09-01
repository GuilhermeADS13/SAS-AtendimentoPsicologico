export type ClinicalSafetyIntent =
  | "crisis"
  | "diagnosis_request"
  | "prescription_request"
  | "scope_bypass"
  | "none";

const CRISIS_PATTERNS = [
  /(?:quero|vou|pretendo|penso em|pensei em|planejo|planejei)\s+(?:me\s+)?(?:matar|suicid|tirar a minha vida)/i,
  /(?:não|nao)\s+(?:quero|aguento|pretendo)\s+(?:mais\s+)?viver/i,
  /(?:me\s+)?(?:cortar|enforcar|afogar|atirar|matar)\s+(?:hoje|agora|esta noite|essa noite)/i,
  /(?:como\s+.*\s+|qual a melhor forma de\s+)(?:me\s+)?(?:matar|suicidar|me cortar|me enforcar)/i,
  /(?:meu|minha)\s+(?:amigo|amiga|companheiro|companheira|familiar|irmão|irmã|filho|filha).*(?:quer|vai|pensa em|planeja).*(?:matar|suicid|tirar a vida|não quer viver|nao quer viver)/i,
  /(?:vou|quero)\s+desaparecer/i,
  /não vou acordar amanhã/i,
  /nao vou acordar amanha/i,
  /(?:ele|ela|essa pessoa).*(?:não vai|nao vai)\s+acordar amanhã/i,
  /ideação suicida|ideacao suicida|autoagressão|autoagressao/i,
];

const DIAGNOSIS_PATTERNS = [
  /(?:você|voce|luma).*(?:me|ele|ela).*(?:diagnostica|tem transtorno|é bipolar|e bipolar)/i,
  /qual é o meu diagnóstico|qual e o meu diagnostico/i,
];

const PRESCRIPTION_PATTERNS = [
  /(?:qual|que)\s+(?:remédio|remedio|medicação|medicacao)\s+(?:devo|deve|posso)\s+(?:tomar|usar)/i,
  /(?:prescreva|receite|aumente|diminua)\s+(?:o\s+)?(?:remédio|remedio|medicação|medicacao)/i,
];

const SCOPE_BYPASS_PATTERNS = [
  // Nada de gatilhos genéricos como "mostre"/"dê" sozinhos (pegariam "mostre a
  // agenda"): exige o contexto de OUTRO paciente / TODOS os prontuários, ou uma
  // tentativa explícita de burlar as regras.
  /outro paciente|outra paciente|paciente diferente|todos os prontu[áa]rios|todos os prontuarios|todas as sess[õo]es de/i,
  /ignore\s+(?:as\s+)?(?:regras|instru[çc][õo]es|restri[çc][õo]es|permiss[õo]es)|bypass|contorne.*(?:filtro|escopo|permiss)/i,
];

export function classifyClinicalSafetyIntent(text: string): ClinicalSafetyIntent {
  const normalized = String(text || "").trim();
  if (!normalized) return "none";
  if (CRISIS_PATTERNS.some(pattern => pattern.test(normalized))) return "crisis";
  if (SCOPE_BYPASS_PATTERNS.some(pattern => pattern.test(normalized))) return "scope_bypass";
  if (DIAGNOSIS_PATTERNS.some(pattern => pattern.test(normalized))) return "diagnosis_request";
  if (PRESCRIPTION_PATTERNS.some(pattern => pattern.test(normalized))) return "prescription_request";
  return "none";
}

/** Resposta fixa para crise: nenhum método, instrução ou análise de risco é gerado pelo LLM. */
export function buildCrisisSafeResponse(): string {
  return [
    "Sinto muito que você esteja passando por isso. Você não precisa enfrentar este momento sozinho(a).",
    "Não posso fornecer métodos ou instruções de autoagressão.",
    "Se houver risco imediato, procure agora o serviço de emergência local ou vá a um pronto atendimento.",
    "No Brasil, você pode ligar para o SAMU (192) ou para o CVV (188). Se conseguir, avise uma pessoa de confiança e peça que fique com você.",
    "A Luma não substitui atendimento de emergência nem a psicóloga responsável.",
  ].join(" ");
}

/**
 * Respostas fixas (sem LLM) para pedidos que a Luma não deve atender: pedir
 * diagnóstico, prescrição de medicação, ou tentar sair do escopo autorizado.
 * `null` quando o intent não é um desses (crise tem tratamento próprio).
 */
export function buildSafetyRedirect(intent: ClinicalSafetyIntent): string | null {
  switch (intent) {
    case "diagnosis_request":
      return "Eu não faço diagnóstico — isso é uma avaliação do(a) profissional responsável. Posso ajudar com a agenda, os registros autorizados e o uso do sistema.";
    case "prescription_request":
      return "Eu não indico nem ajusto medicação — isso é com um(a) profissional prescritor(a). Procure o(a) profissional responsável. Posso ajudar com a agenda, os registros e o uso do sistema.";
    case "scope_bypass":
      return "Só posso trabalhar dentro do escopo autorizado: não acesso prontuários de outros pacientes nem contorno as regras de segurança do sistema.";
    default:
      return null;
  }
}

export function buildClinicalSafetyMetadata(intent: ClinicalSafetyIntent) {
  return {
    safetyIntercepted: intent === "crisis",
    intent,
    model: intent === "crisis" ? "clinical-safety-policy" : undefined,
  } as const;
}
