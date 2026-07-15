import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useRole } from "@/hooks/useRole";
import DashboardLayout from "./DashboardLayout";

/**
 * Guarda de rota: só a psicóloga (admin/therapist) entra. Paciente é mandado
 * para o próprio cadastro. O backend também barra (therapistProcedure) — isto
 * é a camada de UX, não a de segurança.
 */
export function TherapistOnly({ children }: { children: ReactNode }) {
  const { isTherapist, loading } = useRole();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !isTherapist) setLocation("/profile");
  }, [loading, isTherapist, setLocation]);

  if (loading) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Carregando...</p>
      </DashboardLayout>
    );
  }

  if (!isTherapist) return null;

  return <>{children}</>;
}
