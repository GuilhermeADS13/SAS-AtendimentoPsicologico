/**
 * Política de senha do SAS.
 *
 * Portada do AutoJuri (Backend/App/models/usuario.py → senha_forte, e
 * Front end/src/utils/validators.js → getPasswordChecks): 8+ caracteres, com
 * maiúscula, minúscula, número e símbolo, sem espaços.
 *
 * O que NÃO foi portado, de propósito: o hash PBKDF2 do auth_service.py. No
 * AutoJuri o backend guarda a senha, então ele precisa fazer o hash. Aqui quem
 * guarda é o Supabase Auth — a senha vai do navegador direto para ele e nunca
 * passa pelo nosso servidor. Reimplementar hash aqui significaria assumir a
 * guarda da senha e perder o que vem pronto (reset por e-mail, verificação
 * contra vazamentos, bloqueio por tentativas).
 *
 * Consequência importante: este arquivo é validação de FORMULÁRIO. Quem impõe
 * a regra de verdade é a configuração do Supabase Auth (Password Requirements),
 * porque o cadastro não passa pelo nosso backend para ser barrado.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordChecks = {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
  noSpaces: boolean;
  maxLength: boolean;
};

/** Verifica cada requisito da senha, para mostrar a lista ao usuário. */
export function getPasswordChecks(value: string): PasswordChecks {
  const password = value || "";
  return {
    minLength: password.length >= PASSWORD_MIN_LENGTH,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSymbol: /[^A-Za-z0-9]/.test(password),
    noSpaces: password.length > 0 && !/\s/.test(password),
    maxLength: password.length <= PASSWORD_MAX_LENGTH,
  };
}

export function isStrongPassword(value: string): boolean {
  return Object.values(getPasswordChecks(value)).every(Boolean);
}

/** Mensagem de erro da senha, ou "" quando está válida. */
export function validatePassword(value: string): string {
  const password = value || "";
  if (!password) return "Informe a senha.";

  const checks = getPasswordChecks(password);
  if (!checks.maxLength) {
    return `A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  }
  if (!checks.noSpaces) return "A senha não pode conter espaços.";
  if (!isStrongPassword(password)) {
    return `A senha deve ter ${PASSWORD_MIN_LENGTH}+ caracteres, com maiúscula, minúscula, número e símbolo.`;
  }
  return "";
}

/** Rótulos dos requisitos, na ordem em que aparecem na tela. */
export const PASSWORD_RULE_LABELS: { key: keyof PasswordChecks; label: string }[] = [
  { key: "minLength", label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres` },
  { key: "hasUppercase", label: "Uma letra maiúscula" },
  { key: "hasLowercase", label: "Uma letra minúscula" },
  { key: "hasNumber", label: "Um número" },
  { key: "hasSymbol", label: "Um símbolo (!, @, #...)" },
  { key: "noSpaces", label: "Sem espaços" },
];
