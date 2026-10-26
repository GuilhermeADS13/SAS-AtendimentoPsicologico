import { TRPCError } from "@trpc/server";
import { and, count, eq, gte, inArray, or, sql } from "drizzle-orm";
import {
  aiConversations,
  aiMessages,
  appointmentParticipants,
  appointments,
  assinaturas,
  patients,
  therapists,
  users,
} from "../drizzle/schema";
import {
  MENSAGEM_ASSINATURA_VENCIDA,
  decidirTesteEFundador,
  normalizarDocumento,
  situacaoDaAssinatura,
} from "../shared/assinatura";
import { planoPara, valorDaCobranca } from "../shared/precos";
import type { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * Pacientes que entram na conta (decisão de 2026-10-26): os cadastrados, menos
 * os inativos/arquivados e menos quem SÓ participa de chamada em grupo (o cônjuge,
 * o outro responsável) — está em appointmentParticipants e não tem consulta própria.
 */
export async function contarPacientesCobrados(db: Db, therapistId: number): Promise<number> {
  const [linha] = await db
    .select({ n: count() })
    .from(patients)
    .where(
      and(
        eq(patients.therapistId, therapistId),
        inArray(patients.status, ["active", "pending"]),
        sql`NOT (
          EXISTS (SELECT 1 FROM ${appointmentParticipants} WHERE ${appointmentParticipants.patientId} = ${patients.id})
          AND NOT EXISTS (SELECT 1 FROM ${appointments} WHERE ${appointments.patientId} = ${patients.id})
        )`,
      ),
    );
  return Number(linha?.n ?? 0);
}

/** Meia-noite de hoje em Brasília (UTC−3; o Brasil não tem mais horário de verão). */
export function inicioDoDiaEmBrasilia(agora: Date = new Date()): Date {
  const TRES_HORAS = 3 * 60 * 60 * 1000;
  const DIA = 24 * 60 * 60 * 1000;
  return new Date(Math.floor((agora.getTime() - TRES_HORAS) / DIA) * DIA + TRES_HORAS);
}

/** Perguntas feitas hoje à Luma clínica por esta conta. */
export async function perguntasDaLumaHoje(db: Db, userId: number): Promise<number> {
  const [linha] = await db
    .select({ n: count() })
    .from(aiMessages)
    .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
    .where(
      and(
        eq(aiConversations.userId, userId),
        eq(aiMessages.role, "user"),
        gte(aiMessages.createdAt, inicioDoDiaEmBrasilia()),
      ),
    );
  return Number(linha?.n ?? 0);
}

async function perfilDaPsicologa(db: Db, userId: number) {
  const [perfil] = await db.select({ id: therapists.id }).from(therapists).where(eq(therapists.userId, userId)).limit(1);
  return perfil ?? null;
}

/**
 * Tudo o que a tela "Seu plano" mostra e o que os bloqueios decidem. Admin não
 * tem assinatura: é a dona do sistema (liberado e sem cota).
 */
export async function resumoDaAssinatura(db: Db, user: { id: number; role: string }) {
  const perfil = await perfilDaPsicologa(db, user.id);
  const isento = user.role === "admin";
  const [assinatura] = perfil
    ? await db.select().from(assinaturas).where(eq(assinaturas.therapistId, perfil.id)).limit(1)
    : [];
  const pacientes = perfil ? await contarPacientesCobrados(db, perfil.id) : 0;
  const plano = planoPara(Math.max(1, pacientes));
  const situacao = isento
    ? { liberado: true, motivo: "pago" as const, ate: null, diasRestantes: null }
    : situacaoDaAssinatura(assinatura ?? null);
  const ciclo = assinatura?.ciclo ?? "mensal";
  const fundador = assinatura?.fundador ?? false;
  return {
    isento,
    pacientes,
    plano,
    situacao,
    ciclo,
    fundador,
    diaVencimento: assinatura?.diaVencimento ?? null,
    valorCentavos: valorDaCobranca(pacientes, { fundador, ciclo }),
    lumaHoje: await perguntasDaLumaHoje(db, user.id),
    /** Null = sem limite (admin). O Coro usa a cota do Voz até combinar outra. */
    lumaLimite: isento ? null : (plano.perguntasLumaPorDia ?? 15),
    anexoMaxMb: isento ? null : (plano.anexoMaxMb ?? 10),
  };
}

/** Barra o USO NOVO (agendar, chamada, Luma) quando o teste/Pix venceu. */
export async function exigirAssinaturaAtiva(db: Db, user: { id: number; role: string }): Promise<void> {
  if (user.role === "admin") return;
  const perfil = await perfilDaPsicologa(db, user.id);
  if (!perfil) return; // sem perfil, as próprias rotas já recusam
  const [a] = await db.select().from(assinaturas).where(eq(assinaturas.therapistId, perfil.id)).limit(1);
  if (!situacaoDaAssinatura(a ?? null).liberado) {
    throw new TRPCError({ code: "FORBIDDEN", message: MENSAGEM_ASSINATURA_VENCIDA });
  }
}

/** Para a sala de vídeo, que só conhece o therapistId da consulta. */
export async function psicologaLiberada(db: Db, therapistId: number): Promise<boolean> {
  const [linha] = await db
    .select({ role: users.role, testeAte: assinaturas.testeAte, pagoAte: assinaturas.pagoAte, temAssinatura: assinaturas.id })
    .from(therapists)
    .innerJoin(users, eq(users.id, therapists.userId))
    .leftJoin(assinaturas, eq(assinaturas.therapistId, therapists.id))
    .where(eq(therapists.id, therapistId))
    .limit(1);
  if (!linha) return false;
  if (linha.role === "admin") return true;
  return situacaoDaAssinatura(linha.temAssinatura ? { testeAte: linha.testeAte, pagoAte: linha.pagoAte } : null).liberado;
}

/** Limite de anexo (MB) das conversas desta psicóloga; null = sem limite do plano. */
export async function anexoMaxMbDaPsicologa(db: Db, therapistId: number): Promise<number | null> {
  const [dona] = await db
    .select({ role: users.role })
    .from(therapists)
    .innerJoin(users, eq(users.id, therapists.userId))
    .where(eq(therapists.id, therapistId))
    .limit(1);
  if (dona?.role === "admin") return null;
  return planoPara(Math.max(1, await contarPacientesCobrados(db, therapistId))).anexoMaxMb ?? 10;
}

/**
 * Cria a assinatura na aprovação: 14 dias grátis, a não ser que o CRP ou o
 * celular já tenham usado um (conta nova da mesma pessoa). Idempotente.
 */
export async function criarAssinaturaNaAprovacao(
  db: Db,
  { therapistId, crp, celular }: { therapistId: number; crp: string; celular: string | null },
): Promise<{ ganhouTeste: boolean; fundador: boolean }> {
  const [existente] = await db.select().from(assinaturas).where(eq(assinaturas.therapistId, therapistId)).limit(1);
  if (existente) return { ganhouTeste: !!existente.testeAte, fundador: existente.fundador };

  const crpLimpo = normalizarDocumento(crp);
  const celularLimpo = normalizarDocumento(celular) || null;
  const anteriores = await db
    .select({ fundador: assinaturas.fundador })
    .from(assinaturas)
    .where(celularLimpo ? or(eq(assinaturas.crp, crpLimpo), eq(assinaturas.celular, celularLimpo)) : eq(assinaturas.crp, crpLimpo));
  const [{ n: fundadoresAtuais }] = await db.select({ n: count() }).from(assinaturas).where(eq(assinaturas.fundador, true));

  const decisao = decidirTesteEFundador({ anteriores, fundadoresAtuais: Number(fundadoresAtuais) });
  await db
    .insert(assinaturas)
    .values({ therapistId, crp: crpLimpo, celular: celularLimpo, testeAte: decisao.testeAte, fundador: decisao.fundador })
    .onConflictDoNothing({ target: assinaturas.therapistId });
  return { ganhouTeste: !!decisao.testeAte, fundador: decisao.fundador };
}
