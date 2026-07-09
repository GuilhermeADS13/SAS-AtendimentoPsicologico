import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { users, therapists, type User } from "../drizzle/schema";

/**
 * Login de DESENVOLVIMENTO — NÃO usar em produção.
 *
 * Quando o OAuth (Manus) não está configurado, permite testar os fluxos
 * protegidos localmente. Cria (uma vez) um usuário e um perfil de terapeuta
 * de teste e o retorna como se estivesse autenticado.
 *
 * Ativado apenas com NODE_ENV=development E DEV_AUTH=true (ver createContext).
 */
let cached: User | null = null;

export async function getOrCreateDevUser(): Promise<User | null> {
  if (cached) return cached;

  const db = await getDb();
  if (!db) return null;

  const openId = "dev-user";

  await db
    .insert(users)
    .values({
      openId,
      name: "Psicóloga (dev)",
      email: "dev@local.test",
      loginMethod: "dev",
      role: "therapist",
      lastSignedIn: new Date(),
    })
    .onConflictDoUpdate({ target: users.openId, set: { lastSignedIn: new Date() } });

  const found = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  const user = found[0];
  if (!user) return null;

  // Garante um perfil de terapeuta para o usuário de dev (necessário para as
  // procedures de pacientes/sessões, que buscam o terapeuta pelo userId).
  const therapist = await db
    .select()
    .from(therapists)
    .where(eq(therapists.userId, user.id))
    .limit(1);

  if (!therapist.length) {
    await db.insert(therapists).values({ userId: user.id, crp: "DEV-0000" });
  }

  cached = user;
  return user;
}
