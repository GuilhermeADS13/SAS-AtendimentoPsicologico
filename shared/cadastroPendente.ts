/**
 * Conta criada pelo Google (ou outro provedor) ainda sem os dados que o cadastro
 * por e-mail pede: aceite dos Termos e da Privacidade (LGPD), celular e, para
 * psicóloga, o CRP. Até completar, a API não libera nada além disso.
 *
 * Quem tem login por e-mail já passou pelo formulário, mesmo que depois tenha
 * ligado o Google à mesma conta: só barra quem NÃO tem o provedor "email".
 */
export function cadastroPendente(conta: { provedores: string[]; aceitouPoliticaEm?: string | null }): boolean {
  if (!conta.provedores.length || conta.provedores.includes("email")) return false;
  return !conta.aceitouPoliticaEm;
}
