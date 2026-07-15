import { useAuth } from "@/_core/hooks/useAuth";

/**
 * Papel do usuário logado.
 * - admin: a dona da clínica. Tudo da psicóloga + aprovar quem pede acesso.
 * - psicóloga (therapist): acesso clínico completo, mas não aprova ninguém —
 *   senão o primeiro aprovado viraria porta de entrada para qualquer um.
 * - paciente (qualquer outro papel): só o próprio cadastro e a videochamada.
 */
export function useRole() {
  const { user, loading } = useAuth();
  const isAdmin = user?.role === "admin";
  const isTherapist = isAdmin || user?.role === "therapist";
  return {
    user,
    loading,
    isAdmin,
    isTherapist,
    isPatient: Boolean(user) && !isTherapist,
  };
}
