/**
 * Domínios de e-mail mais usados no Brasil. Um "@gmial.com" ou "@gmail.co" passa
 * na validação de formato, mas os lembretes de consulta (que revelam que a pessoa
 * faz terapia) iriam para outro endereço — ou para lugar nenhum.
 */
const DOMINIOS_COMUNS = [
  "gmail.com",
  "hotmail.com",
  "hotmail.com.br",
  "outlook.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.com.br",
  "icloud.com",
  "me.com",
  "bol.com.br",
  "uol.com.br",
  "terra.com.br",
  "ig.com.br",
];

/** Distância de edição (inserir, apagar ou trocar uma letra = 1). */
function distancia(a: string, b: string): number {
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    anterior = atual;
  }
  return anterior[b.length];
}

/**
 * "ana@gmial.com" → "ana@gmail.com". Null se o domínio já é um dos comuns ou não
 * se parece com nenhum (empresa, universidade: não há o que sugerir).
 */
export function sugestaoDeEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  const arroba = e.lastIndexOf("@");
  if (arroba < 1) return null;
  const dominio = e.slice(arroba + 1);
  if (dominio.length < 4 || DOMINIOS_COMUNS.includes(dominio)) return null;
  let melhor: { dominio: string; d: number } | null = null;
  for (const comum of DOMINIOS_COMUNS) {
    const d = distancia(dominio, comum);
    if (d <= 2 && (!melhor || d < melhor.d)) melhor = { dominio: comum, d };
  }
  return melhor ? `${e.slice(0, arroba)}@${melhor.dominio}` : null;
}
