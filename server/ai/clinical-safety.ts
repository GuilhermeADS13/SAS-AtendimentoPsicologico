export type ClinicalSafetyIntent =
  | "crisis"
  | "diagnosis_request"
  | "prescription_request"
  | "scope_bypass"
  | "none";

const CRISIS_PATTERNS = [
  // O "me" é OBRIGATÓRIO antes de "matar": com ele opcional, três expressões
  // corriqueiras caíam na resposta de crise — "quero matar a saudade", "vou matar
  // o tempo", "quero matar a charada". Receber CVV e SAMU depois de escrever que
  // quer matar a saudade da filha é intrusivo e assusta à toa. Em português, a
  // forma de risco é "me matar"; "suicid" e "tirar a minha vida" seguem sem exigir.
  /(?:quero|vou|pretendo|penso em|pensei em|planejo|planejei)\s+(?:me\s+matar|suicid|tirar a minha vida)/i,
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

/**
 * Normaliza para os padrões ampliados: minúsculas, sem acento e com as
 * abreviações de quem escreve no celular ("to", "tô", "n", "q", "vc") viradas na
 * forma por extenso. Quem desabafa não escreve com cuidado — e, na Luma do
 * PACIENTE (sem LLM), este classificador é a única barreira.
 */
function normalizarFala(text: string): string {
  return ` ${text} `
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+(?:to|tou)\s+/g, " estou ")
    .replace(/\s+tava\s+/g, " estava ")
    .replace(/\s+n\s+/g, " nao ")
    .replace(/\s+q\s+/g, " que ")
    .replace(/\s+(?:pra|pro)\s+/g, " para ")
    .replace(/\s+/g, " ");
}

// Verbos/expressões de INTENÇÃO em primeira pessoa. É o que separa "quero morrer"
// (crise) de "o chefe vai me matar" (força de expressão) e de "morrendo de rir".
// Sem "ia" de propósito: "minha mãe ia me matar se soubesse" é força de expressão.
const INTENCAO =
  "quero|queria|vou|preciso|precisava|so penso em|penso em|pensei em|pensando em|pensar em|vontade de|desejo de|planejo|planejei|planejando|decidi|resolvi|tentar|tentei|tentando|devia|deveria|melhor";

/**
 * Padrões AMPLIADOS de crise, aplicados ao texto normalizado. Os de cima pegavam
 * só 2 de 12 formas comuns de desabafo ("quero morrer", "to pensando em me matar",
 * "vou acabar com tudo" passavam direto e o paciente recebia o menu do site).
 */
const CRISIS_PATTERNS_NORMALIZADOS = [
  // "quero morrer", "to pensando em me matar", "tenho vontade de sumir para sempre"
  // (morrer DE rir/fome/sono/vergonha não conta)
  new RegExp(`\\b(?:${INTENCAO})\\s+(?:\\w+\\s+){0,2}?(?:morrer(?!\\s+de\\b)|me\\s+matar|me\\s+suicidar|suicid\\w*|tirar\\s+(?:a\\s+)?(?:minha\\s+)?(?:propria\\s+)?vida|acabar\\s+com\\s+(?:a\\s+)?minha\\s+vida|acabar\\s+com\\s+tudo|sumir\\s+para\\s+sempre|desaparecer\\s+para\\s+sempre|deixar\\s+de\\s+existir|nao\\s+(?:acordar|existir)\\s+mais)\\b`),
  // "nao quero mais viver", "nao aguento mais viver", "nao vejo sentido em viver"
  /\bnao\s+(?:quero|aguento|consigo|pretendo|tenho\s+(?:mais\s+)?(?:motivo|razao|vontade)\s+(?:para|de))\s+(?:mais\s+)?(?:viver|continuar\s+vivo|continuar\s+viva|estar\s+vivo|estar\s+viva)\b/,
  /\b(?:sem|nao\s+(?:vejo|tem|ha|existe|encontro)(?:\s+mais)?)\s+(?:nenhum\s+)?(?:sentido|motivo|razao)\s+(?:em|para|de)\s+(?:continuar\s+)?viv(?:er|endo)\b/,
  /\b(?:a\s+)?vida\s+nao\s+(?:vale\s+(?:mais\s+)?a\s+pena|faz\s+(?:mais\s+)?sentido)\b|\bnao\s+vale\s+a\s+pena\s+(?:viver|continuar)\b/,
  // "seria melhor se eu morresse", "todo mundo ficaria melhor sem mim"
  /\bmelhor\s+se\s+eu\s+(?:morresse|sumisse|nao\s+existisse|nao\s+estivesse\s+aqui)\b/,
  /\b(?:todos|todo\s+mundo|minha\s+familia|eles)\s+(?:ficaria|ficariam|estaria|estariam|vivem|viveriam)\s+melhor\s+sem\s+mim\b/,
  // "me suicidar" e "suicidio" em primeira pessoa costumam vir sem verbo antes
  /\bme\s+suicidar\b|\b(?:penso|pensando|pensei|ideia|ideias|pensamentos?)\s+(?:em|de)\s+suicidio\b/,
  // autolesão: "vou me cortar", "voltei a me machucar", "automutilação"
  new RegExp(`\\b(?:${INTENCAO}|voltei\\s+a|de\\s+novo|ainda)\\s+(?:\\w+\\s+){0,2}?me\\s+(?:cortar|machucar|ferir|mutilar|queimar)\\b`),
  /\bautomutila\w*|\bautolesa\w*|\bautoagress\w*/,
  // excesso de remédio
  /\b(?:tomar|tomei|engolir|engoli|tomando)\s+(?:todos?\s+(?:os|as)|uma?\s+caixa|a\s+cartela|um\s+monte\s+de|varios|varias|muitos|muitas)\s+(?:\w+\s+){0,2}?(?:remedios?|comprimidos?|pilulas?|calmantes?)\b/,
  // despedida
  /\b(?:essa|esta)\s+(?:e|eh)\s+(?:a\s+)?minha\s+despedida\b|\bcarta\s+de\s+despedida\b|\badeus\s+a\s+todos\b/,
  // terceiro em risco: "minha irma vai se matar", "ele quer se suicidar"
  // ("se matar DE trabalhar/rir" não conta)
  /\b(?:vai|quer|vao|querem|pensa\s+em|pensando\s+em|tentou|ameacou)\s+se\s+(?:matar|suicidar)\b(?!\s+de\b)/,
];

/**
 * A fala é de quem está ESCREVENDO UM REGISTRO clínico (a psicóloga descrevendo o
 * paciente), e não de quem está em sofrimento? Marcadores de terceira pessoa e de
 * documentação. Usado só no papel de terapeuta: ali "paciente relatou ideação
 * suicida" é trabalho clínico, e responder com o CVV para a própria psicóloga
 * bloqueava justamente o registro de risco — o que mais precisa ser documentado.
 */
export function pareceRegistroClinico(text: string): boolean {
  return /\b(?:paciente|pcte|pct|relat\w*|refer\w*|verbaliz\w*|sess[aã]o|atendimento|anota[cç]\w*|prontu[aá]rio|evolu[cç][aã]o|registr\w*|rascunho|soap|hist[oó]rico|anamnese|ele|ela|dele|dela|disse que|contou que)\b/i.test(
    text,
  );
}

const DIAGNOSIS_PATTERNS = [
  /(?:você|voce|luma).*(?:me|ele|ela).*(?:diagnostica|tem transtorno|é bipolar|e bipolar)/i,
  /qual é o meu diagnóstico|qual e o meu diagnostico/i,
  // Pedir que a Luma PRODUZA um diagnóstico. Os padrões exigem um verbo de PRODUZIR
  // (dar/dizer/fazer/diagnosticar) junto da palavra, e isso é de propósito: a
  // psicóloga pode legitimamente pedir "resuma o diagnóstico registrado no
  // prontuário", que é LEITURA de registro autorizado. Detectar o radical "diagn"
  // solto barraria esse uso profissional.
  /\bme\s+diagnostic/i,
  /\bme\s+(?:d[áaê]|da|dar|diga|diz|fala|fale|informa|informe|passa|passe)\w*\s[^?]{0,40}diagn[óo]stic/i,
  /(?:voc[êe]|vc|luma)\b[^?]{0,40}\b(?:d[áa]|dar|faz|fazer|fa[çc]a|diz|dizer|diagnostica|diagnosticar)\b[^?]{0,40}diagn[óo]stic/i,
  // "eu tenho depressão?" / "será que eu tenho TDAH?" — pedido de diagnóstico sem a
  // palavra "diagnóstico". Exigimos o enquadramento de PERGUNTA (interrogativa
  // explícita ou "?") porque relato não pode ser barrado: "eu tenho ansiedade antes
  // das sessões." é desabafo, e responder "não faço diagnóstico" seria fechar a
  // porta na cara de quem se abriu.
  /(?:ser[áa] que|acha que)\s+eu\s+tenho\s+(?:algum[a]?\s+)?(?:transtorno|depress|ansiedade|p[âa]nico|tdah|bipolar|borderline|autismo|esquizofren|toc\b|burnout)/i,
  /\beu\s+tenho\s+(?:algum[a]?\s+)?(?:transtorno|depress|ansiedade|p[âa]nico|tdah|bipolar|borderline|autismo|esquizofren|toc\b|burnout)[^?]{0,30}\?/i,
  /\b(?:o que|oque)\s+(?:eu\s+)?tenho\s*\?/i,
  /\bisso\s+(?:é|e)\s+(?:algum[a]?\s+)?(?:transtorno|depress|ansiedade|p[âa]nico|tdah|bipolar|borderline|autismo|esquizofren|toc\b|burnout)/i,
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
  const fala = normalizarFala(normalized);
  if (CRISIS_PATTERNS_NORMALIZADOS.some(pattern => pattern.test(fala))) return "crisis";
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
    "No Brasil, você pode ligar para o SAMU (192) ou para o CVV (188), que atende 24h e de graça. Você também pode procurar o CAPS (Centro de Atenção Psicossocial) mais próximo, que é o serviço público de saúde mental e atende sem agendamento.",
    "Se conseguir, avise uma pessoa de confiança e peça que fique com você.",
    "A Luma não substitui atendimento de emergência nem a psicóloga responsável.",
  ].join(" ");
}

/**
 * Sofrimento SEM sinal explícito de risco ("estou muito mal", "não aguento mais",
 * "quero sumir"). Não é crise, mas também não pode receber o menu do site como
 * resposta — que era o que acontecia na Luma do paciente. Fica fora do
 * classifyClinicalSafetyIntent de propósito: lá, "estou triste" tem de seguir
 * "none" para a conversa clínica da psicóloga continuar fluindo.
 */
export function detectaSofrimento(text: string): boolean {
  const fala = normalizarFala(String(text || ""));
  // "não aguento mais ESPERAR o link" é impaciência, não sofrimento.
  return /\bnao\s+aguento\s+mais\b(?!\s+(?:esperar|aguardar|tentar|ficar\s+esperando)\b)|\b(?:quero|queria|vontade\s+de)\s+sumir\b|\bestou\s+(?:muito\s+|tao\s+|super\s+)?(?:mal|pessim[oa]|destruid[oa]|no\s+limite|desesperad[oa]|sem\s+saida)\b|\bme\s+sinto\s+(?:muito\s+|tao\s+)?(?:mal|sozinh[oa]|vazi[oa]|um\s+peso|sem\s+saida|perdid[oa])\b|\bdesesper\w*|\bangusti\w*|\bcrise\s+de\s+(?:ansiedade|panico|choro)\b|\bataque\s+de\s+(?:panico|ansiedade)\b|\bnao\s+consigo\s+(?:parar\s+de\s+chorar|respirar|sair\s+da\s+cama)\b|\bpreciso\s+(?:muito\s+)?(?:falar|conversar)\s+com\s+alguem\b|\bnao\s+tenho\s+(?:com\s+)?quem\s+(?:falar|conversar|contar)\b|\bninguem\s+(?:me\s+entende|se\s+importa)\b|\btriste\b|\bdeprimid[oa]\b/.test(
    fala,
  );
}

/** Resposta de acolhimento para sofrimento sem sinal de risco: aponta a psicóloga e deixa o CVV à mão. */
export function buildApoioResponse(): string {
  return [
    "Sinto muito que esteja difícil agora. Eu sou a assistente do site e não substituo a sua psicóloga, mas você não precisa guardar isso sozinho(a):",
    "dá para escrever para ela em “Mensagens”, no menu.",
    "Se a angústia apertar ou você pensar em se machucar, ligue agora para o CVV (188, 24h e gratuito) ou para o SAMU (192).",
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
