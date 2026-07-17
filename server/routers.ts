import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, therapistProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { patients, appointments, sessions, documents, therapists, sessionNotes, videoCalls, notifications, therapistRequests, users } from "../drizzle/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  sendAppointmentReminders,
  sendTherapistAlerts,
  sendCancellationAlerts,
  processPendingNotifications,
  notifyAdminOfTherapistRequest,
  notifyTherapistRequestReviewed,
} from "./notifications";

/**
 * E-mail normalizado para comparação: sem espaços e em minúsculas.
 *
 * O vínculo paciente↔psicóloga é feito por e-mail, e o Supabase Auth guarda o
 * dele em minúsculas. Se a psicóloga digitar "Fulano@Gmail.com" no cadastro, uma
 * comparação literal nunca casaria — o paciente entraria e veria "peça à sua
 * psicóloga para cadastrar", com o cadastro já feito bem na frente dela.
 */
function normalizarEmail(email: string | null | undefined): string {
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
async function pacienteDoUsuario(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  user: { id: number; email?: string | null },
) {
  const porUserId = await db
    .select()
    .from(patients)
    .where(eq(patients.userId, user.id))
    .limit(1);

  if (porUserId.length) return porUserId[0];

  const email = normalizarEmail(user.email);
  if (!email) return null;

  const convite = await db
    .select()
    .from(patients)
    .where(and(eq(patients.email, email), isNull(patients.userId)))
    .limit(1);

  if (!convite.length) return null;

  await db
    .update(patients)
    .set({ userId: user.id })
    .where(eq(patients.id, convite[0].id));

  return { ...convite[0], userId: user.id };
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Área do PACIENTE: só o próprio cadastro e as próprias consultas.
  // Qualquer usuário autenticado pode usar (não expõe dados de outros).
  me: router({
    profile: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;

      return pacienteDoUsuario(db, ctx.user);
    }),

    saveProfile: protectedProcedure
      .input(z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        phone: z.string().optional(),
        dateOfBirth: z.string().optional(),
        address: z.string().optional(),
        /** Path no bucket `avatars`. "" remove a foto. Opcional. */
        photoKey: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const dob = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
        const photoKey = input.photoKey === undefined ? undefined : input.photoKey || null;

        // Acha a linha do paciente — vinculando o convite da psicóloga, se for a
        // primeira vez. Não existe auto-cadastro: quem não foi cadastrado por
        // ninguém não vira paciente sozinho, senão qualquer um entraria na grade
        // clínica de uma psicóloga que nunca o aceitou.
        const paciente = await pacienteDoUsuario(db, ctx.user);

        if (!paciente) {
          throw new Error(
            "Seu cadastro precisa ser feito pela sua psicóloga. Peça a ela para cadastrar este e-mail e tente de novo.",
          );
        }

        await db
          .update(patients)
          .set({
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            address: input.address,
            dateOfBirth: dob,
            ...(photoKey !== undefined && { photoKey }),
          })
          .where(eq(patients.id, paciente.id));

        return { success: true, action: "updated" as const };
      }),

    // Situação da solicitação de acesso profissional do usuário logado.
    therapistRequest: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const rows = await db
        .select()
        .from(therapistRequests)
        .where(eq(therapistRequests.userId, ctx.user.id))
        .limit(1);

      return rows[0] ?? null;
    }),

    /**
     * Solicita acesso como psicóloga. NÃO promove ninguém: apenas registra o
     * pedido e avisa o admin por e-mail. A aprovação é manual (o CRP é público,
     * então o número não prova identidade).
     */
    requestTherapist: protectedProcedure
      .input(z.object({
        fullName: z.string().min(3, "Informe o nome completo"),
        crp: z
          .string()
          .regex(/^\d{2}\/\d{3,6}$/, "CRP inválido. Use o formato 06/123456"),
        message: z.string().max(500).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const existing = await db
          .select()
          .from(therapistRequests)
          .where(eq(therapistRequests.userId, ctx.user.id))
          .limit(1);

        if (existing.length && existing[0].status === "pending") {
          return { success: true, status: "pending" as const, alreadyRequested: true };
        }

        let requestId: number;

        if (existing.length) {
          await db
            .update(therapistRequests)
            .set({
              fullName: input.fullName,
              crp: input.crp,
              message: input.message,
              status: "pending",
              reviewedAt: null,
              notifiedAt: null, // reenviado: é um pedido novo para o admin
            })
            .where(eq(therapistRequests.id, existing[0].id));
          requestId = existing[0].id;
        } else {
          const inserido = await db
            .insert(therapistRequests)
            .values({
              userId: ctx.user.id,
              fullName: input.fullName,
              crp: input.crp,
              email: ctx.user.email ?? "",
              message: input.message,
            })
            .returning({ id: therapistRequests.id });
          requestId = inserido[0].id;
        }

        // Avisa o admin em segundo plano: o SMTP pode levar dezenas de segundos
        // e não deve segurar a resposta (o pedido já está salvo de qualquer forma).
        // Se falhar — inclusive se o container morrer aqui, num deploy —, o
        // `notifiedAt` fica nulo e o agendador reenvia no próximo ciclo.
        void notifyAdminOfTherapistRequest(requestId).catch((error) => {
          console.warn("[TherapistRequest] falha ao notificar admin:", error);
        });

        return { success: true, status: "pending" as const, alreadyRequested: false };
      }),

    /**
     * O paciente já foi cadastrado por uma psicóloga e ainda não vinculou a conta?
     *
     * É a linha em `patients` com o e-mail dele e `userId` nulo — a psicóloga já
     * disse que ele é paciente dela. Nesse caso ele NÃO escolhe psicóloga: o
     * vínculo já existe, e `saveProfile` casa por e-mail antes de pedir escolha.
     * Sem esta consulta a tela mostraria um menu cuja resposta o servidor
     * descarta.
     */
    invitation: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      const email = normalizarEmail(ctx.user.email);
      if (!db || !email) return null;

      const rows = await db
        .select({
          firstName: patients.firstName,
          lastName: patients.lastName,
          phone: patients.phone,
          therapistName: users.name,
          therapistCrp: therapists.crp,
        })
        .from(patients)
        .innerJoin(therapists, eq(therapists.id, patients.therapistId))
        .innerJoin(users, eq(users.id, therapists.userId))
        .where(and(eq(patients.email, email), isNull(patients.userId)))
        .limit(1);

      return rows[0] ?? null;
    }),

    /**
     * Perfil da psicóloga que atende o paciente logado.
     *
     * Só o que é profissional e público por natureza (nome, CRP, especialidades,
     * bio, foto) — nada de e-mail ou dados de outros pacientes dela.
     */
    therapist: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const paciente = await pacienteDoUsuario(db, ctx.user);
      if (!paciente) return null;

      const rows = await db
        .select({
          id: therapists.id,
          nome: users.name,
          crp: therapists.crp,
          specialties: therapists.specialties,
          bio: therapists.bio,
          photoKey: therapists.photoKey,
        })
        .from(therapists)
        .innerJoin(users, eq(users.id, therapists.userId))
        .where(eq(therapists.id, paciente.therapistId))
        .limit(1);

      return rows[0] ?? null;
    }),

    // Consultas do paciente logado (para ele ver/entrar na sala).
    appointments: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];

      // Vincula o convite se ainda não tiver sido: a psicóloga pode ter
      // cadastrado E agendado antes de o paciente abrir o cadastro dele.
      const paciente = await pacienteDoUsuario(db, ctx.user);
      if (!paciente) return [];

      // Traz o nome da psicóloga junto: sem isso a tela mostraria só data e
      // hora, e o paciente não saberia com quem é a consulta.
      return db
        .select({
          id: appointments.id,
          patientId: appointments.patientId,
          therapistId: appointments.therapistId,
          scheduledAt: appointments.scheduledAt,
          duration: appointments.duration,
          status: appointments.status,
          notes: appointments.notes,
          confirmedAt: appointments.confirmedAt,
          roomToken: appointments.roomToken,
          therapistName: users.name,
          therapistCrp: therapists.crp,
        })
        .from(appointments)
        .leftJoin(therapists, eq(therapists.id, appointments.therapistId))
        .leftJoin(users, eq(users.id, therapists.userId))
        .where(eq(appointments.patientId, paciente.id))
        .orderBy(desc(appointments.scheduledAt));
    }),

    /**
     * O paciente confirma que vai comparecer a uma consulta agendada.
     *
     * Protegido (o paciente logado) e só na própria consulta — mais seguro que a
     * confirmação por link da sala, que qualquer um com o link acionaria. Avisa a
     * psicóloga pela sineta (cria a notificação ligada à consulta dela). É
     * idempotente: confirmar de novo não duplica o aviso.
     */
    confirmAppointment: protectedProcedure
      .input(z.object({ appointmentId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const paciente = await pacienteDoUsuario(db, ctx.user);
        if (!paciente) throw new Error("Cadastro não encontrado.");

        const appt = await db
          .select()
          .from(appointments)
          .where(
            and(
              eq(appointments.id, input.appointmentId),
              eq(appointments.patientId, paciente.id),
            ),
          )
          .limit(1);

        if (!appt.length) throw new Error("Consulta não encontrada.");
        if (appt[0].status !== "scheduled") {
          throw new Error("Só dá para confirmar uma consulta agendada.");
        }

        // Já confirmada: não faz nada (nem duplica a notificação).
        if (appt[0].confirmedAt) return { success: true, alreadyConfirmed: true as const };

        await db
          .update(appointments)
          .set({ confirmedAt: new Date() })
          .where(eq(appointments.id, input.appointmentId));

        // Avisa a psicóloga na sineta. A notificação aparece para ela porque o
        // `notifications.list` casa pelo appointmentId → therapistId da consulta.
        const psi = await db
          .select({ email: users.email })
          .from(therapists)
          .innerJoin(users, eq(users.id, therapists.userId))
          .where(eq(therapists.id, appt[0].therapistId))
          .limit(1);

        await db.insert(notifications).values({
          appointmentId: input.appointmentId,
          recipientType: "therapist",
          recipientEmail: psi[0]?.email ?? "",
          notificationType: "appointment_confirmation",
        });

        return { success: true, alreadyConfirmed: false as const };
      }),
  }),

  /**
   * Área do admin (a dona da clínica). Só `admin`: um `therapist` aprovado não
   * pode aprovar os próximos — senão o primeiro aprovado vira porta de entrada
   * para qualquer um.
   */
  admin: router({
    // Fila de solicitações de acesso profissional, pendentes primeiro.
    therapistRequests: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(therapistRequests)
        .orderBy(desc(therapistRequests.createdAt));
    }),

    /**
     * Aprova ou recusa uma solicitação.
     *
     * Aprovar promove o usuário a `therapist` e cria o perfil profissional com
     * o CRP informado. A conferência do CRP no CNP (cadastro.cfp.org.br) é sua,
     * fora do sistema: o número é público, então não prova identidade sozinho.
     */
    reviewTherapistRequest: adminProcedure
      .input(z.object({
        id: z.number(),
        action: z.enum(["approve", "reject"]),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const found = await db
          .select()
          .from(therapistRequests)
          .where(eq(therapistRequests.id, input.id))
          .limit(1);

        if (!found.length) throw new Error("Solicitação não encontrada.");
        const req = found[0];

        if (input.action === "reject") {
          await db
            .update(therapistRequests)
            .set({ status: "rejected", reviewedAt: new Date() })
            .where(eq(therapistRequests.id, req.id));

          void notifyTherapistRequestReviewed({
            email: req.email ?? "",
            fullName: req.fullName,
            approved: false,
          }).catch((e) => console.warn("[TherapistRequest] e-mail de recusa falhou:", e));

          return { action: "rejected" as const };
        }

        await db
          .update(users)
          .set({ role: "therapist" })
          .where(eq(users.id, req.userId));

        // Sem perfil profissional a psicóloga não tem therapistId, e sem ele
        // nenhum paciente/agendamento dela existe. Cria junto com a aprovação.
        const perfil = await db
          .select({ id: therapists.id })
          .from(therapists)
          .where(eq(therapists.userId, req.userId))
          .limit(1);

        if (!perfil.length) {
          await db.insert(therapists).values({ userId: req.userId, crp: req.crp });
        }

        await db
          .update(therapistRequests)
          .set({ status: "approved", reviewedAt: new Date() })
          .where(eq(therapistRequests.id, req.id));

        void notifyTherapistRequestReviewed({
          email: req.email ?? "",
          fullName: req.fullName,
          approved: true,
        }).catch((e) => console.warn("[TherapistRequest] e-mail de aprovação falhou:", e));

        return { action: "approved" as const };
      }),
  }),

  // Perfil profissional da psicóloga (dados de therapists).
  therapists: router({
    me: therapistProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const rows = await db
        .select()
        .from(therapists)
        .where(eq(therapists.userId, ctx.user.id))
        .limit(1);

      return rows[0] ?? null;
    }),

    upsert: therapistProcedure
      .input(z.object({
        crp: z.string().min(1),
        specialties: z.string().optional(),
        bio: z.string().optional(),
        photoKey: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const existing = await db
          .select()
          .from(therapists)
          .where(eq(therapists.userId, ctx.user.id))
          .limit(1);

        if (existing.length) {
          await db
            .update(therapists)
            .set({
              crp: input.crp,
              specialties: input.specialties,
              bio: input.bio,
              photoKey: input.photoKey,
            })
            .where(eq(therapists.id, existing[0].id));
          return { success: true, action: "updated" as const };
        }

        await db.insert(therapists).values({
          userId: ctx.user.id,
          crp: input.crp,
          specialties: input.specialties,
          bio: input.bio,
          photoKey: input.photoKey,
        });
        return { success: true, action: "created" as const };
      }),
  }),

  patients: router({
    /** Pacientes da psicóloga logada. */
    list: therapistProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];

      // Get therapist ID from user
      const therapist = await db
        .select()
        .from(therapists)
        .where(eq(therapists.userId, ctx.user.id))
        .limit(1);

      if (!therapist.length) return [];

      return db
        .select()
        .from(patients)
        .where(eq(patients.therapistId, therapist[0].id));
    }),

    create: therapistProcedure
      .input(z.object({
        firstName: z.string(),
        lastName: z.string(),
        email: z.string().email(),
        phone: z.string().optional(),
        medicalHistory: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const therapist = await db
          .select()
          .from(therapists)
          .where(eq(therapists.userId, ctx.user.id))
          .limit(1);
        
        if (!therapist.length) throw new Error("Therapist not found");

        // Normaliza antes de gravar: é este e-mail que vai casar com o da conta
        // do paciente. Guardado como digitado ("Fulano@Gmail.com"), o vínculo
        // nunca aconteceria — o Supabase guarda o da conta em minúsculas.
        const email = normalizarEmail(input.email);

        // Impede duplicata: o mesmo e-mail já cadastrado nesta clínica. (Era o
        // que gerava dois registros da mesma pessoa quando ela também criava
        // conta pelo site.)
        const jaExiste = await db
          .select({ id: patients.id })
          .from(patients)
          .where(and(eq(patients.therapistId, therapist[0].id), eq(patients.email, email)))
          .limit(1);

        if (jaExiste.length) {
          throw new Error("Já existe um paciente cadastrado com esse e-mail.");
        }

        const result = await db.insert(patients).values({
          therapistId: therapist[0].id,
          firstName: input.firstName,
          lastName: input.lastName,
          email,
          phone: input.phone,
          medicalHistory: input.medicalHistory,
        });

        return result;
      }),

    // Busca um paciente pelo id (somente se pertence ao terapeuta logado).
    get: therapistProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return null;

        const therapist = await db
          .select()
          .from(therapists)
          .where(eq(therapists.userId, ctx.user.id))
          .limit(1);

        if (!therapist.length) return null;

        const rows = await db
          .select()
          .from(patients)
          .where(and(eq(patients.id, input.id), eq(patients.therapistId, therapist[0].id)))
          .limit(1);

        return rows[0] ?? null;
      }),

    // Edita os dados de um paciente do terapeuta logado.
    update: therapistProcedure
      .input(z.object({
        id: z.number(),
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        dateOfBirth: z.string().optional(),
        address: z.string().optional(),
        medicalHistory: z.string().optional(),
        emergencyContact: z.string().optional(),
        emergencyPhone: z.string().optional(),
        status: z.enum(["active", "inactive", "archived"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const therapist = await db
          .select()
          .from(therapists)
          .where(eq(therapists.userId, ctx.user.id))
          .limit(1);

        if (!therapist.length) throw new Error("Therapist not found");

        // Confirma que o paciente pertence a este terapeuta antes de editar.
        const owned = await db
          .select()
          .from(patients)
          .where(and(eq(patients.id, input.id), eq(patients.therapistId, therapist[0].id)))
          .limit(1);

        if (!owned.length) throw new Error("Patient not found for this therapist");

        const set: Partial<typeof patients.$inferInsert> = {};
        if (input.firstName !== undefined) set.firstName = input.firstName;
        if (input.lastName !== undefined) set.lastName = input.lastName;
        // Normalizado igual ao create: é a chave do vínculo com a conta.
        if (input.email !== undefined) set.email = normalizarEmail(input.email);
        if (input.phone !== undefined) set.phone = input.phone;
        if (input.address !== undefined) set.address = input.address;
        if (input.medicalHistory !== undefined) set.medicalHistory = input.medicalHistory;
        if (input.emergencyContact !== undefined) set.emergencyContact = input.emergencyContact;
        if (input.emergencyPhone !== undefined) set.emergencyPhone = input.emergencyPhone;
        if (input.status !== undefined) set.status = input.status;
        if (input.dateOfBirth !== undefined) {
          set.dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
        }

        if (Object.keys(set).length > 0) {
          await db.update(patients).set(set).where(eq(patients.id, input.id));
        }

        return { success: true } as const;
      }),

    // Tira o paciente da grade da psicóloga.
    //
    // Só apaga de verdade quem não tem nada clínico registrado (cadastro errado,
    // duplicata, teste). Havendo sessão/anotação/documento/consulta, o registro
    // é ARQUIVADO em vez de apagado: o prontuário tem guarda obrigatória de 5
    // anos (CFP 001/2009), então sumir com ele seria perder prova de
    // atendimento. Arquivado sai da lista, mas continua acessível pelo id.
    delete: therapistProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const therapist = await db
          .select()
          .from(therapists)
          .where(eq(therapists.userId, ctx.user.id))
          .limit(1);

        if (!therapist.length) throw new Error("Therapist not found");

        const owned = await db
          .select()
          .from(patients)
          .where(and(eq(patients.id, input.id), eq(patients.therapistId, therapist[0].id)))
          .limit(1);

        if (!owned.length) throw new Error("Patient not found for this therapist");

        const [apts, sess, notes, docs] = await Promise.all([
          db.select({ id: appointments.id }).from(appointments).where(eq(appointments.patientId, input.id)),
          db.select({ id: sessions.id }).from(sessions).where(eq(sessions.patientId, input.id)),
          db.select({ id: sessionNotes.id }).from(sessionNotes).where(eq(sessionNotes.patientId, input.id)),
          db.select({ id: documents.id }).from(documents).where(eq(documents.patientId, input.id)),
        ]);

        const clinico = sess.length + notes.length + docs.length;

        if (clinico > 0 || apts.length > 0) {
          await db
            .update(patients)
            .set({ status: "archived" })
            .where(eq(patients.id, input.id));

          return {
            action: "archived" as const,
            consultas: apts.length,
            sessoes: sess.length,
            anotacoes: notes.length,
            documentos: docs.length,
          };
        }

        // Sem histórico: não há FK no banco, então não existe cascade para
        // deixar órfão. Some com a linha.
        await db.delete(videoCalls).where(eq(videoCalls.patientId, input.id));
        await db.delete(patients).where(eq(patients.id, input.id));

        return { action: "deleted" as const };
      }),
  }),

  appointments: router({
    list: therapistProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      
      const therapist = await db
        .select()
        .from(therapists)
        .where(eq(therapists.userId, ctx.user.id))
        .limit(1);
      
      if (!therapist.length) return [];
      
      return db
        .select()
        .from(appointments)
        .where(eq(appointments.therapistId, therapist[0].id));
    }),
    
    create: therapistProcedure
      .input(z.object({
        patientId: z.number(),
        scheduledAt: z.string(),
        duration: z.number().default(60),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const therapist = await db
          .select()
          .from(therapists)
          .where(eq(therapists.userId, ctx.user.id))
          .limit(1);
        
        if (!therapist.length) throw new Error("Therapist not found");

        // Ensure the patient belongs to this therapist before scheduling.
        const patient = await db
          .select()
          .from(patients)
          .where(and(eq(patients.id, input.patientId), eq(patients.therapistId, therapist[0].id)))
          .limit(1);

        if (!patient.length) throw new Error("Patient not found for this therapist");

        return db.insert(appointments).values({
          therapistId: therapist[0].id,
          patientId: input.patientId,
          scheduledAt: new Date(input.scheduledAt),
          duration: input.duration,
          notes: input.notes,
          // Token aleatório: o nome da sala vira apt<id>-<token>, impossível de
          // adivinhar (antes era sala-apt<id>, sequencial e enumerável).
          roomToken: nanoid(16),
        });
      }),

    // Atualiza o status de um agendamento do terapeuta logado.
    updateStatus: therapistProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["scheduled", "completed", "cancelled", "no_show"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const therapist = await db
          .select()
          .from(therapists)
          .where(eq(therapists.userId, ctx.user.id))
          .limit(1);

        if (!therapist.length) throw new Error("Therapist not found");

        await db
          .update(appointments)
          .set({ status: input.status })
          .where(and(eq(appointments.id, input.id), eq(appointments.therapistId, therapist[0].id)));

        return { success: true } as const;
      }),

    // Confirmação de presença pelo paciente (via link da sala, sem login).
    // O roomId (sala-apt<id>) funciona como token leve contra IDs sequenciais.
  }),

  sessions: router({
    list: therapistProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      
      const therapist = await db
        .select()
        .from(therapists)
        .where(eq(therapists.userId, ctx.user.id))
        .limit(1);
      
      if (!therapist.length) return [];
      
      return db
        .select()
        .from(sessions)
        .where(eq(sessions.therapistId, therapist[0].id));
    }),

    // Lista as sessões de um paciente do terapeuta logado (mais recentes primeiro).
    getByPatient: therapistProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];

        const therapist = await db
          .select()
          .from(therapists)
          .where(eq(therapists.userId, ctx.user.id))
          .limit(1);

        if (!therapist.length) return [];

        return db
          .select()
          .from(sessions)
          .where(
            and(
              eq(sessions.patientId, input.patientId),
              eq(sessions.therapistId, therapist[0].id),
            ),
          )
          .orderBy(desc(sessions.startedAt));
      }),

    create: therapistProcedure
      .input(z.object({
        appointmentId: z.number().optional().default(0),
        patientId: z.number(),
        clinicalNotes: z.string(),
        treatment: z.string().optional(),
        nextSteps: z.string().optional(),
        mood: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        
        const therapist = await db
          .select()
          .from(therapists)
          .where(eq(therapists.userId, ctx.user.id))
          .limit(1);
        
        if (!therapist.length) throw new Error("Therapist not found");

        // Ensure the patient belongs to this therapist before recording a session.
        const patient = await db
          .select()
          .from(patients)
          .where(and(eq(patients.id, input.patientId), eq(patients.therapistId, therapist[0].id)))
          .limit(1);

        if (!patient.length) throw new Error("Patient not found for this therapist");

        return db.insert(sessions).values({
          appointmentId: input.appointmentId,
          patientId: input.patientId,
          therapistId: therapist[0].id,
          startedAt: new Date(),
          clinicalNotes: input.clinicalNotes,
          treatment: input.treatment,
          nextSteps: input.nextSteps,
          mood: input.mood,
        });
      }),
  }),

  sessionNotes: router({
    save: therapistProcedure
      .input(z.object({
        sessionId: z.number().optional(),
        appointmentId: z.number(),
        patientId: z.number(),
        notes: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // Derive the therapist from the authenticated user, never from input.
        const therapist = await db
          .select()
          .from(therapists)
          .where(eq(therapists.userId, ctx.user.id))
          .limit(1);

        if (!therapist.length) throw new Error("Therapist not found");
        const therapistId = therapist[0].id;

        // Ensure the patient belongs to this therapist before writing notes.
        const patient = await db
          .select()
          .from(patients)
          .where(and(eq(patients.id, input.patientId), eq(patients.therapistId, therapistId)))
          .limit(1);

        if (!patient.length) throw new Error("Patient not found for this therapist");

        try {
          // Check if note exists
          const existing = await db
            .select()
            .from(sessionNotes)
            .where(
              and(
                eq(sessionNotes.appointmentId, input.appointmentId),
                eq(sessionNotes.patientId, input.patientId),
                eq(sessionNotes.therapistId, therapistId)
              )
            )
            .limit(1);

          if (existing.length > 0) {
            // Update existing
            await db
              .update(sessionNotes)
              .set({ notes: input.notes })
              .where(eq(sessionNotes.id, existing[0].id));
            return { success: true, id: existing[0].id, action: "updated" };
          } else {
            // Insert new
            await db.insert(sessionNotes).values({
              sessionId: input.sessionId || 0,
              appointmentId: input.appointmentId,
              patientId: input.patientId,
              therapistId,
              notes: input.notes,
            });
            return { success: true, id: 0, action: "created" };
          }
        } catch (error) {
          console.error("Error saving session notes:", error);
          throw error;
        }
      }),

    getByAppointment: therapistProcedure
      .input(z.object({
        appointmentId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const therapist = await db
          .select()
          .from(therapists)
          .where(eq(therapists.userId, ctx.user.id))
          .limit(1);

        if (!therapist.length) return [];

        try {
          const notes = await db
            .select()
            .from(sessionNotes)
            .where(
              and(
                eq(sessionNotes.appointmentId, input.appointmentId),
                eq(sessionNotes.therapistId, therapist[0].id)
              )
            );
          return notes;
        } catch (error) {
          console.error("Error fetching session notes:", error);
          throw error;
        }
      }),

    getByPatient: therapistProcedure
      .input(z.object({
        patientId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const therapist = await db
          .select()
          .from(therapists)
          .where(eq(therapists.userId, ctx.user.id))
          .limit(1);

        if (!therapist.length) return [];

        try {
          const notes = await db
            .select()
            .from(sessionNotes)
            .where(
              and(
                eq(sessionNotes.patientId, input.patientId),
                eq(sessionNotes.therapistId, therapist[0].id)
              )
            );
          return notes;
        } catch (error) {
          console.error("Error fetching patient notes:", error);
          throw error;
        }
      }),
  }),

  // Documentos dos prontuários (metadados; o arquivo fica no Supabase Storage).
  documents: router({
    getByPatient: therapistProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];

        const therapist = await db
          .select()
          .from(therapists)
          .where(eq(therapists.userId, ctx.user.id))
          .limit(1);

        if (!therapist.length) return [];

        return db
          .select()
          .from(documents)
          .where(
            and(
              eq(documents.patientId, input.patientId),
              eq(documents.therapistId, therapist[0].id),
            ),
          )
          .orderBy(desc(documents.createdAt));
      }),

    // Registra os metadados após o upload do arquivo no Storage.
    create: therapistProcedure
      .input(z.object({
        patientId: z.number(),
        fileName: z.string(),
        fileKey: z.string(),
        fileUrl: z.string(),
        fileType: z.string(),
        fileSize: z.number(),
        documentType: z.enum(["prescription", "report", "exam", "attachment", "other"]).default("other"),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const therapist = await db
          .select()
          .from(therapists)
          .where(eq(therapists.userId, ctx.user.id))
          .limit(1);

        if (!therapist.length) throw new Error("Therapist not found");

        const patient = await db
          .select()
          .from(patients)
          .where(and(eq(patients.id, input.patientId), eq(patients.therapistId, therapist[0].id)))
          .limit(1);

        if (!patient.length) throw new Error("Patient not found for this therapist");

        await db.insert(documents).values({
          patientId: input.patientId,
          therapistId: therapist[0].id,
          fileName: input.fileName,
          fileKey: input.fileKey,
          fileUrl: input.fileUrl,
          fileType: input.fileType,
          fileSize: input.fileSize,
          documentType: input.documentType,
          description: input.description,
        });

        return { success: true } as const;
      }),

    // Remove o metadado (o caller apaga o arquivo do Storage usando o fileKey).
    delete: therapistProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const therapist = await db
          .select()
          .from(therapists)
          .where(eq(therapists.userId, ctx.user.id))
          .limit(1);

        if (!therapist.length) throw new Error("Therapist not found");

        const rows = await db
          .select()
          .from(documents)
          .where(and(eq(documents.id, input.id), eq(documents.therapistId, therapist[0].id)))
          .limit(1);

        if (!rows.length) throw new Error("Document not found");

        await db.delete(documents).where(eq(documents.id, input.id));
        return { success: true, fileKey: rows[0].fileKey } as const;
      }),
  }),

  // Lembretes/notificações: histórico in-app e disparo do ciclo de envio.
  notifications: router({
    list: therapistProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const therapist = await db
        .select()
        .from(therapists)
        .where(eq(therapists.userId, ctx.user.id))
        .limit(1);

      if (!therapist.length) return [];

      return db
        .select({
          id: notifications.id,
          appointmentId: notifications.appointmentId,
          recipientType: notifications.recipientType,
          recipientEmail: notifications.recipientEmail,
          notificationType: notifications.notificationType,
          status: notifications.status,
          sentAt: notifications.sentAt,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .innerJoin(appointments, eq(notifications.appointmentId, appointments.id))
        .where(eq(appointments.therapistId, therapist[0].id))
        .orderBy(desc(notifications.createdAt))
        .limit(50);
    }),

    // Enfileira lembretes/alertas e processa a fila (envia os pendentes).
    run: therapistProcedure.mutation(async () => {
      await sendAppointmentReminders();
      await sendTherapistAlerts();
      await sendCancellationAlerts();
      return processPendingNotifications();
    }),
  }),

  videoCalls: router({
    // Histórico de videochamadas de um paciente, com URLs de gravação.
    getByPatient: therapistProcedure
      .input(z.object({ patientId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];

        const therapist = await db
          .select()
          .from(therapists)
          .where(eq(therapists.userId, ctx.user.id))
          .limit(1);

        if (!therapist.length) return [];

        return db
          .select()
          .from(videoCalls)
          .where(
            and(
              eq(videoCalls.patientId, input.patientId),
              eq(videoCalls.therapistId, therapist[0].id),
            ),
          );
      }),

    // Registra o início de uma videochamada (idempotente por roomId único).
    start: therapistProcedure
      .input(z.object({
        appointmentId: z.number(),
        patientId: z.number(),
        roomId: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const therapist = await db
          .select()
          .from(therapists)
          .where(eq(therapists.userId, ctx.user.id))
          .limit(1);

        if (!therapist.length) throw new Error("Therapist not found");
        const therapistId = therapist[0].id;

        const patient = await db
          .select()
          .from(patients)
          .where(and(eq(patients.id, input.patientId), eq(patients.therapistId, therapistId)))
          .limit(1);

        if (!patient.length) throw new Error("Patient not found for this therapist");

        // Idempotente: se a sala já foi registrada, não duplica.
        const existing = await db
          .select()
          .from(videoCalls)
          .where(eq(videoCalls.roomId, input.roomId))
          .limit(1);

        if (existing.length > 0) {
          return { roomId: input.roomId, status: "existing" as const };
        }

        await db.insert(videoCalls).values({
          appointmentId: input.appointmentId,
          patientId: input.patientId,
          therapistId,
          roomId: input.roomId,
          startedAt: new Date(),
          status: "active",
        });

        return { roomId: input.roomId, status: "created" as const };
      }),

    // Finaliza a chamada e persiste a gravação (URL + duração em segundos).
    finish: therapistProcedure
      .input(z.object({
        roomId: z.string(),
        durationSeconds: z.number().optional(),
        recordingUrl: z.string().url().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        const therapist = await db
          .select()
          .from(therapists)
          .where(eq(therapists.userId, ctx.user.id))
          .limit(1);

        if (!therapist.length) throw new Error("Therapist not found");

        await db
          .update(videoCalls)
          .set({
            endedAt: new Date(),
            duration: input.durationSeconds,
            recordingUrl: input.recordingUrl,
            status: "completed",
          })
          .where(and(eq(videoCalls.roomId, input.roomId), eq(videoCalls.therapistId, therapist[0].id)));

        return { success: true } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
