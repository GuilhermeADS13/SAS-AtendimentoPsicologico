import { createHash, randomBytes } from "node:crypto";

/**
 * Confirmação das ações de ESCRITA da Luma (agendar, remarcar, cancelar, pagamento).
 *
 * Antes, a trava era um booleano no schema da ferramenta (`confirmadoPeloUsuario`):
 * o servidor executava porque o MODELO afirmava que a terapeuta havia confirmado.
 * Um modelo aberto que alucinasse `true` na primeira chamada escrevia na agenda
 * real sem nenhum "sim" humano — prompt não é controle de acesso.
 *
 * Agora a autoridade é do servidor. A primeira chamada não executa nada: registra
 * a ação completa (ferramenta + parâmetros + resumo legível) e devolve um código
 * aleatório. Há dois caminhos para resgatá-lo, com regras diferentes:
 *
 *  - `confirmPendingActionByHuman` — a terapeuta clica no botão de confirmação na
 *    interface. É o caminho forte: a execução parte de uma requisição autenticada
 *    dela, e o modelo não participa da decisão.
 *  - `consumePendingAction` — o próprio agente devolve o código numa chamada
 *    seguinte. Serve de retaguarda quando ela responde "sim" por texto. Exige que
 *    os parâmetros sejam idênticos aos propostos e que a rodada de conversa tenha
 *    MUDADO: dentro de um mesmo `agent.invoke` o turnKey é constante, então o
 *    modelo não consegue propor e confirmar sozinho.
 *
 * O estado vive em memória: o TTL é curto e, no pior caso (restart, segunda
 * instância), o código é recusado e a terapeuta confirma de novo — falha fechada,
 * nunca aberta.
 */

const MAX_PENDING_ACTIONS = 500;

export type PendingActionParams = Record<string, string | number | boolean | null | undefined>;

export type PendingActionRequest = {
  therapistId: number;
  /** Identifica a rodada de conversa; muda quando a terapeuta manda outra mensagem. */
  turnKey: string;
  toolName: string;
  params: PendingActionParams;
};

export type PendingAction = PendingActionRequest & {
  /** Texto que a terapeuta lê antes de confirmar. */
  resumo: string;
};

type PendingActionRecord = PendingAction & { expiresAt: number; fingerprint: string };

export type ConfirmationRejection = "missing" | "unknown" | "expired" | "foreign" | "mismatch" | "same_turn";

export type ConfirmationResult =
  | { ok: true }
  | { ok: false; reason: ConfirmationRejection; message: string };

export type HumanConfirmationResult =
  | { ok: true; action: PendingAction }
  | { ok: false; reason: ConfirmationRejection; message: string };

const pendingActions = new Map<string, PendingActionRecord>();

export function getConfirmationTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  return Math.max(60, Number(env.AI_ACTION_CONFIRMATION_TTL_SECONDS ?? 900)) * 1_000;
}

/**
 * Impressão digital estável da ação. Ordena as chaves para que a mesma ação
 * descrita em ordem diferente produza o mesmo valor, e normaliza ausente/nulo
 * para "" — assim `duration: undefined` (que vira 60 por padrão) não gera uma
 * digital diferente de `duration: 60`.
 */
export function actionFingerprint(toolName: string, params: PendingActionParams): string {
  const canonical = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key] ?? ""}`)
    .join("&");
  return createHash("sha256").update(`${toolName}?${canonical}`).digest("hex").slice(0, 32);
}

function pruneExpired(now: number): void {
  // Array.from em vez de iterar o Map direto: o tsconfig do projeto não define
  // `target`, então for..of sobre iteradores cai no TS2802 (downlevelIteration).
  for (const code of Array.from(pendingActions.keys())) {
    const record = pendingActions.get(code);
    if (record && record.expiresAt <= now) pendingActions.delete(code);
  }
}

export function issuePendingAction(
  action: PendingAction,
  now = Date.now(),
  ttlMs = getConfirmationTtlMs(),
): string {
  pruneExpired(now);
  // Teto de memória: descarta o mais antigo (Map preserva ordem de inserção).
  while (pendingActions.size >= MAX_PENDING_ACTIONS) {
    const oldest = pendingActions.keys().next().value as string | undefined;
    if (!oldest) break;
    pendingActions.delete(oldest);
  }
  // 9 bytes -> 12 caracteres base64url, ~72 bits. O modelo não adivinha e não vê
  // o código antes de a ferramenta devolvê-lo.
  const code = randomBytes(9).toString("base64url");
  pendingActions.set(code, {
    ...action,
    fingerprint: actionFingerprint(action.toolName, action.params),
    expiresAt: now + ttlMs,
  });
  return code;
}

const REFAZER = "Chame a ferramenta de novo SEM codigoConfirmacao, mostre o resumo à terapeuta e peça a confirmação outra vez.";

/**
 * Busca comum aos dois caminhos. Código inexistente, já usado ou de outra
 * terapeuta devolvem a MESMA mensagem de propósito: não vale entregar um oráculo
 * que diferencie "não existe" de "é de outra pessoa".
 */
function lookup(code: string | undefined, therapistId: number, now: number):
  | { ok: true; code: string; record: PendingActionRecord }
  | { ok: false; reason: ConfirmationRejection; message: string } {
  if (!code?.trim()) {
    return { ok: false, reason: "missing", message: `Falta o código de confirmação. ${REFAZER}` };
  }
  const chave = code.trim();
  // O lookup vem ANTES de qualquer limpeza: se pruneExpired rodasse aqui, um
  // código vencido viraria "inexistente" e a mensagem sairia errada. A limpeza
  // por TTL acontece na emissão (issuePendingAction).
  const record = pendingActions.get(chave);
  if (!record || record.therapistId !== therapistId) {
    return { ok: false, reason: record ? "foreign" : "unknown", message: `Código de confirmação inválido ou já utilizado. ${REFAZER}` };
  }
  if (record.expiresAt <= now) {
    pendingActions.delete(chave);
    return { ok: false, reason: "expired", message: `O código de confirmação expirou. ${REFAZER}` };
  }
  return { ok: true, code: chave, record };
}

/** Caminho do agente: exige parâmetros idênticos e rodada de conversa diferente. */
export function consumePendingAction(
  code: string | undefined,
  request: PendingActionRequest,
  now = Date.now(),
): ConfirmationResult {
  const found = lookup(code, request.therapistId, now);
  if (!found.ok) return found;

  if (found.record.fingerprint !== actionFingerprint(request.toolName, request.params)) {
    return {
      ok: false,
      reason: "mismatch",
      message: "Os dados da ação mudaram depois da proposta (paciente, horário, duração ou valor diferente). Por segurança não executei nada. Apresente o novo resumo e peça uma nova confirmação.",
    };
  }
  if (found.record.turnKey === request.turnKey) {
    return {
      ok: false,
      reason: "same_turn",
      message: "A confirmação precisa partir da terapeuta. Apresente o resumo, aguarde a resposta dela e só então chame a ferramenta com o código.",
    };
  }

  pendingActions.delete(found.code); // uso único
  return { ok: true };
}

/**
 * Caminho da interface: a terapeuta clicou em "Confirmar". Não há turnKey nem
 * parâmetros vindos do modelo — a ação executada é exatamente a que foi
 * registrada na proposta, e o clique autenticado já é a prova de consentimento.
 */
export function confirmPendingActionByHuman(
  code: string | undefined,
  therapistId: number,
  now = Date.now(),
): HumanConfirmationResult {
  const found = lookup(code, therapistId, now);
  if (!found.ok) return found;
  const { expiresAt: _expiresAt, fingerprint: _fingerprint, ...action } = found.record;
  pendingActions.delete(found.code); // uso único
  return { ok: true, action };
}

/** Só para os testes: zera o estado entre casos. */
export function clearPendingActions(): void {
  pendingActions.clear();
}
