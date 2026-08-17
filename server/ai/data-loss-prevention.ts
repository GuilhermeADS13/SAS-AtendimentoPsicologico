type SensitiveMatch = "cpf" | "email" | "phone" | "secret";

const PATTERNS: Array<[SensitiveMatch, RegExp]> = [
  ["cpf", /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g],
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ["phone", /(?<!\d)(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}(?!\d)/g],
  ["secret", /\b(?:sk|sb_secret|ghp|glpat)_[A-Za-z0-9_-]{8,}\b/g],
];

export function detectSensitiveIdentifiers(value: string): SensitiveMatch[] {
  return PATTERNS.filter(([, pattern]) => {
    // As regexes têm flag /g (necessária para o replace-all de redactForTelemetry),
    // e um regex global GUARDA o lastIndex entre chamadas. Usar .test() no objeto
    // compartilhado faria a próxima chamada começar de uma posição adiantada e dar
    // FALSO NEGATIVO intermitente — num módulo de prevenção de vazamento, isso
    // deixaria CPF/e-mail/segredo passarem sem detecção. Testa num clone sem /g.
    const probe = new RegExp(pattern.source, pattern.flags.replace("g", ""));
    return probe.test(value);
  }).map(([kind]) => kind);
}

export function redactForTelemetry(value: string): string {
  return PATTERNS.reduce((current, [, pattern]) => current.replace(pattern, "[REDACTED]"), value);
}

export function minimizeTelemetryMetadata(metadata: Record<string, string | number | boolean | null>) {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      typeof value === "string" ? redactForTelemetry(value).slice(0, 160) : value,
    ]),
  );
}
