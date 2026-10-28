/** Só os dígitos ("(81) 99999-0000" → "81999990000"). */
export const soDigitos = (valor: string) => valor.replace(/\D/g, "");

/** "(81) 99999-0000" enquanto digita. Aceita fixo (10 dígitos) e celular (11). */
export function mascaraTelefone(valor: string): string {
  const d = soDigitos(valor).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Celular brasileiro: DDD (11–99) + 9 dígitos começando por 9. É o que o
 * cadastro exige — o número serve para contato e, quando o SMS for ligado, para
 * recuperar o acesso; um fixo não recebe SMS.
 */
export function celularValido(valor: string): boolean {
  return /^[1-9][1-9]9\d{8}$/.test(soDigitos(valor));
}

/**
 * Telefone de contato (do paciente, de emergência): vazio, ou DDD + fixo (8
 * dígitos) ou celular (9), com ou sem o 55. É o número que o botão "Lembrar"
 * abre no WhatsApp — sem DDD o link não chega a ninguém.
 */
export function telefoneValido(valor: string | null | undefined): boolean {
  if (!valor?.trim()) return true;
  let d = soDigitos(valor);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return /^[1-9][1-9]\d{8,9}$/.test(d);
}
