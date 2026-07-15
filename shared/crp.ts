/**
 * Formato do CRP: região (2 dígitos) + "/" + inscrição (3 a 6 dígitos).
 * Ex.: 02/31234. É a mesma regra que o backend valida em `me.requestTherapist`.
 */

export const CRP_REGEX = /^\d{2}\/\d{3,6}$/;

/** Dígitos da região + da inscrição, sem a barra. 2 + 6 = 8 no máximo. */
const MAX_DIGITOS = 8;

/**
 * Aplica a máscara enquanto a pessoa digita: descarta o que não for número e
 * põe a barra sozinha depois do segundo dígito.
 *
 * A barra é derivada, nunca digitada — por isso apagar é previsível: o texto é
 * sempre remontado a partir dos dígitos que sobraram. Se o usuário colar
 * "CRP 02/31234", sai "02/31234".
 */
export function maskCrp(value: string): string {
  const digitos = (value || "").replace(/\D/g, "").slice(0, MAX_DIGITOS);
  if (digitos.length <= 2) return digitos;
  return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
}

export function isValidCrp(value: string): boolean {
  return CRP_REGEX.test((value || "").trim());
}
