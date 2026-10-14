import { eq } from "drizzle-orm";
import { therapistRequests, type User } from "../drizzle/schema";
import { getDb } from "./db";
import { CRP_REGEX } from "../shared/crp";
import { notifyAdminOfTherapistRequest } from "./notifications";

/**
 * Pedido de acesso profissional feito NO CADASTRO (com o CRP).
 *
 * Com a confirmação de e-mail, a psicóloga só fica logada depois de clicar no
 * link — não dá mais para registrar o pedido na hora do cadastro. O CRP vai nos
 * dados da conta (user_metadata.crp_solicitado) e o pedido é criado aqui, no 1º
 * login confirmado.
 *
 * UMA VEZ SÓ: se já existe pedido desta conta (pendente, aprovado ou RECUSADO),
 * não faz nada. Sem isso, um pedido recusado voltaria a "pendente" a cada login,
 * porque o metadado continua lá.
 */
export async function registrarPedidoDoCadastro(user: User, crp: string | undefined): Promise<void> {
  if (!crp || !CRP_REGEX.test(crp)) return;
  if (user.role === "therapist" || user.role === "admin") return;
  const db = await getDb();
  if (!db) return;
  const existe = await db
    .select({ id: therapistRequests.id })
    .from(therapistRequests)
    .where(eq(therapistRequests.userId, user.id))
    .limit(1);
  if (existe.length) return;
  const [criado] = await db
    .insert(therapistRequests)
    .values({ userId: user.id, fullName: user.name ?? "", crp, email: user.email ?? "" })
    .onConflictDoNothing()
    .returning({ id: therapistRequests.id });
  if (criado) {
    void notifyAdminOfTherapistRequest(criado.id).catch((error) => {
      console.warn("[TherapistRequest] falha ao notificar admin:", error);
    });
  }
}
