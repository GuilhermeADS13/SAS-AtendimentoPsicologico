import { and, eq, isNull, or } from "drizzle-orm";
import { patients, therapists, type User } from "../drizzle/schema";
import { getDb } from "./db";
import { celularValido, mascaraTelefone } from "../shared/telefone";

/**
 * Celular informado no CADASTRO.
 *
 * No cadastro ainda não existe ficha de paciente nem perfil profissional (a
 * ficha vem do convite da psicóloga; o perfil, da aprovação do CRP), então o
 * número vai nos dados da conta (user_metadata.telefone), como o CRP. Aqui ele é
 * copiado para onde o app lê o telefone de cada papel — só se lá estiver vazio:
 * o que a pessoa (ou a psicóloga) gravou depois vale mais.
 *
 * Roda junto da sincronização do login; enquanto a ficha/perfil não existe, não
 * acha linha e não faz nada — pega na próxima sincronização.
 */
export async function guardarTelefoneDoCadastro(user: User, telefone: string | undefined): Promise<void> {
  if (!telefone || !celularValido(telefone)) return;
  const db = await getDb();
  if (!db) return;
  const phone = mascaraTelefone(telefone);
  if (user.role === "therapist" || user.role === "admin") {
    await db
      .update(therapists)
      .set({ phone })
      .where(and(eq(therapists.userId, user.id), or(isNull(therapists.phone), eq(therapists.phone, ""))));
    return;
  }
  await db
    .update(patients)
    .set({ phone })
    .where(and(eq(patients.userId, user.id), or(isNull(patients.phone), eq(patients.phone, ""))));
}
