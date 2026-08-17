type SensitiveMatch = "cpf" | "email" | "phone" | "secret";

const PATTERNS: Array<[SensitiveMatch, RegExp]> = [
  ["cpf", /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g],
  ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ["phone", /(?<!\d)(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}(?!\d)/g],
  ["secret", /\b(?:sk|sb_secret|ghp|glpat)_[A-Za-z0-9_-]{8,}\b/g],
];

export function detectSensitiveIdentifiers(value: string): SensitiveMatch[] {
  return PATTERNS.filter(([, pattern]) => pattern.test(value)).map(([kind]) => kind);
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
