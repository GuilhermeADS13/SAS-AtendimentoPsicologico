import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useRole } from "@/hooks/useRole";
import DashboardLayout from "./DashboardLayout";

/**
 * Guarda de rota: só a psicóloga (admin/therapist) entra. Paciente é mandado
 * para o próprio cadastro. O backend também barra (therapistProcedure) — isto
 * é a camada de UX, não a de segurança.
 */
export function TherapistOnly({
  children,
  adminOnly = false,
}: {
  children: ReactNode;
  /** Restringe ainda mais: só o admin (ex.: aprovar solicitações de acesso). */
  adminOnly?: boolean;
}) {
  const { isTherapist, isAdmin, loading } = useRole();
  const [, setLocation] = useLocation();
  const permitido = adminOnly ? isAdmin : isTherapist;

  useEffect(() => {
    if (loading || permitido) return;
    setLocation(isTherapist ? "/dashboard" : "/consultas");
  }, [loading, permitido, isTherapist, setLocation]);

  if (loading) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Carregando...</p>
      </DashboardLayout>
    );
  }

  if (!permitido) return null;

  return <>{children}</>;
}
