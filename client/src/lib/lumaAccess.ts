export const LUMA_TEST_EMAIL = "guilhermeads13@outlook.com";

export function isLumaTestAccount(email?: string | null): boolean {
  return email?.trim().toLowerCase() === LUMA_TEST_EMAIL;
}

export function canOpenLuma(role?: string | null, email?: string | null): boolean {
  return role === "therapist" || role === "patient" || isLumaTestAccount(email);
}

export function isClinicalLumaUser(role?: string | null): boolean {
  return role === "therapist";
}
