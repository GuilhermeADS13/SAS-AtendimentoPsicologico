import { useAuth } from "@/_core/hooks/useAuth";

/**
 * Papel do usuário logado.
 * - psicóloga (admin/therapist): acesso clínico completo.
 * - paciente (qualquer outro papel): só o próprio cadastro e a videochamada.
 */
export function useRole() {
  const { user, loading } = useAuth();
  const isTherapist = user?.role === "admin" || user?.role === "therapist";
  return {
    user,
    loading,
    isTherapist,
    isPatient: Boolean(user) && !isTherapist,
  };
}
