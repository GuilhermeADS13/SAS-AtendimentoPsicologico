import { and, eq, isNull } from "drizzle-orm";
import { appointments, patients, therapists } from "../drizzle/schema";
import type { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Usuario = { id: number; email?: string | null };

export function normalizarEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * A linha de `patients` do usuário logado, vinculando o convite se preciso.
 *
 * Quando a psicóloga cadastra alguém, a linha nasce com `userId` nulo — ela não
 * tem como saber o id de uma conta que talvez nem exista. O vínculo se fecha
 * aqui, na primeira vez que o paciente abre a área dele.
 *
 * Por que não deixar isso só no `saveProfile`: a psicóloga cadastra e agenda a
 * consulta; se o vínculo dependesse de o paciente clicar em "Salvar cadastro",
 * ele entraria e veria "Minhas Consultas" VAZIA — com a consulta marcada e ele
 * sem saber. O efeito colateral numa leitura é feio, mas é idempotente: roda uma
 * vez só, porque na próxima o `userId` já está lá.
 */
export async function pacienteDoUsuario(db: Db, user: Usuario) {
  const porUserId = await db
    .select()
    .from(patients)
    .where(eq(patients.userId, user.id))
    .limit(1);

  if (porUserId.length) return porUserId[0];

  const email = normalizarEmail(user.email);
  if (!email) return null;

  // ORDER BY id: se por acaso houver mais de um convite com este e-mail (ex.:
  // duas psicólogas cadastrando a mesma pessoa, no futuro multi-clínica), o
  // vínculo precisa ser estável — sem ordenar, o "escolhido" pelo LIMIT 1 seria
  // arbitrário e poderia mudar de uma chamada para outra.
  const convite = await db
    .select()
    .from(patients)
    .where(and(eq(patients.email, email), isNull(patients.userId)))
    .orderBy(patients.id)
    .limit(1);

  if (!convite.length) return null;

  await db
    .update(patients)
    .set({ userId: user.id })
    .where(eq(patients.id, convite[0].id));

  return { ...convite[0], userId: user.id };
}

export type AcessoSala = {
  role: "therapist" | "patient";
  appointmentId: number;
  patientId: number;
  scheduledAt: Date;
  duration: number;
};

/**
 * Quem pode entrar numa sala de vídeo, e com qual papel — a regra ÚNICA, usada
 * tanto pelo `roomAccess` (antes de abrir a tela) quanto pela sinalização e pela
 * presença (na hora do WebSocket). Ter isso em um lugar só evita que a barreira
 * da tela e a barreira do WebSocket divirjam com o tempo.
 *
 * O `roomId` é `apt<appointmentId>-<roomToken>`. O `roomToken` (nanoid de 16,
 * ~96 bits) é o segredo que prova que a pessoa recebeu o link daquela consulta;
 * confere-se em tempo constante-o-suficiente por igualdade exata. Só o token não
 * basta: o usuário PRECISA ser a psicóloga dona da consulta ou o paciente dela.
 *
 * O papel é DERIVADO daqui, nunca aceito do cliente: um paciente não consegue se
 * declarar "therapist" e receber o fluxo de iniciador da oferta.
 */
export async function resolverAcessoSala(
  db: Db,
  user: Usuario,
  roomId: string,
): Promise<AcessoSala | null> {
  const m = /^apt(\d+)-(.+)$/.exec(roomId);
  if (!m) return null;
  const appointmentId = Number(m[1]);
  const token = m[2];

  const appt = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  if (!appt.length) return null;
  const a = appt[0];
  if (!a.roomToken || a.roomToken !== token) return null;

  // A psicóloga dona da consulta.
  const therapist = await db
    .select({ id: therapists.id })
    .from(therapists)
    .where(eq(therapists.userId, user.id))
    .limit(1);
  if (therapist.length && therapist[0].id === a.therapistId) {
    return {
      role: "therapist",
      appointmentId,
      patientId: a.patientId,
      scheduledAt: a.scheduledAt,
      duration: a.duration,
    };
  }

  // O paciente daquela consulta (vincula o convite se ainda faltar).
  const paciente = await pacienteDoUsuario(db, user);
  if (paciente && paciente.id === a.patientId) {
    return {
      role: "patient",
      appointmentId,
      patientId: a.patientId,
      scheduledAt: a.scheduledAt,
      duration: a.duration,
    };
  }

  return null;
}
