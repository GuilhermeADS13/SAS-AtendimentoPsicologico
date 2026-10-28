import { montarPixEstatico } from "@shared/pix";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

/**
 * "Pix copia e cola" da psicóloga logada, SEM valor — o mesmo que o paciente
 * recebe do servidor (me.pixDaPsicologa). Null se ela não cadastrou a chave.
 */
export function useMeuPix(): string | null {
  const { user } = useAuth();
  const { data: perfil } = trpc.therapists.me.useQuery();
  if (!perfil?.pixChave) return null;
  return montarPixEstatico({ chave: perfil.pixChave, nome: user?.name ?? "", cidade: perfil.pixCidade ?? "" });
}
