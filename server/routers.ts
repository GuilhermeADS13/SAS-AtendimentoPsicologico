import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { patients, appointments, sessions, documents, therapists, sessionNotes } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

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
    
    create: protectedProcedure
      .input(z.object({
        appointmentId: z.number(),
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
});

export type AppRouter = typeof appRouter;
