import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { patients, appointments, sessions, documents, therapists, sessionNotes, videoCalls, notifications } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  sendAppointmentReminders,
  sendTherapistAlerts,
  sendCancellationAlerts,
  processPendingNotifications,
} from "./notifications";

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

  // Perfil profissional da psicóloga (dados de therapists).
  therapists: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const rows = await db
        .select()
        .from(therapists)
        .where(eq(therapists.userId, ctx.user.id))
        .limit(1);

      return rows[0] ?? null;
    }),

    upsert: protectedProcedure
      .input(z.object({
        crp: z.string().min(1),
        specialties: z.string().optional(),
        bio: z.string().optional(),
        photoUrl: z.string().optional(),
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
              photoUrl: input.photoUrl,
            })
            .where(eq(therapists.id, existing[0].id));
          return { success: true, action: "updated" as const };
        }

        await db.insert(therapists).values({
          userId: ctx.user.id,
          crp: input.crp,
          specialties: input.specialties,
          bio: input.bio,
          photoUrl: input.photoUrl,
        });
        return { success: true, action: "created" as const };
      }),
  }),

  patients: router({
    list: protectedProcedure.query(async ({ ctx }) => {
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
    
    create: protectedProcedure
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
        
        const result = await db.insert(patients).values({
          therapistId: therapist[0].id,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          medicalHistory: input.medicalHistory,
        });

        return result;
      }),

    // Busca um paciente pelo id (somente se pertence ao terapeuta logado).
    get: protectedProcedure
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
    update: protectedProcedure
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
        if (input.email !== undefined) set.email = input.email;
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
  }),

  appointments: router({
    list: protectedProcedure.query(async ({ ctx }) => {
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
    
    create: protectedProcedure
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
        });
      }),

    // Atualiza o status de um agendamento do terapeuta logado.
    updateStatus: protectedProcedure
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
    confirm: publicProcedure
      .input(z.object({ id: z.number(), roomId: z.string() }))
      .mutation(async ({ input }) => {
        if (input.roomId !== `sala-apt${input.id}`) {
          throw new Error("Sala inválida para confirmação.");
        }

        const db = await getDb();
        if (!db) throw new Error("Database not available");

        await db
          .update(appointments)
          .set({ confirmedAt: new Date() })
          .where(eq(appointments.id, input.id));

        return { success: true } as const;
      }),
  }),

  sessions: router({
    list: protectedProcedure.query(async ({ ctx }) => {
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
    getByPatient: protectedProcedure
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

    create: protectedProcedure
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
    save: protectedProcedure
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

    getByAppointment: protectedProcedure
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

    getByPatient: protectedProcedure
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
    getByPatient: protectedProcedure
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
    create: protectedProcedure
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
    delete: protectedProcedure
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
    list: protectedProcedure.query(async ({ ctx }) => {
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
    run: protectedProcedure.mutation(async () => {
      await sendAppointmentReminders();
      await sendTherapistAlerts();
      await sendCancellationAlerts();
      return processPendingNotifications();
    }),
  }),

  videoCalls: router({
    // Histórico de videochamadas de um paciente, com URLs de gravação.
    getByPatient: protectedProcedure
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
    start: protectedProcedure
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
    finish: protectedProcedure
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
