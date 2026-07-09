import { integer, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Schema Postgres (Supabase). Colunas em camelCase para casar com os tipos gerados.
 * Timestamps usam `timestamptz` (with time zone), padrão recomendado no Supabase.
 */

// ── Enums (tipos nativos do Postgres) ─────────────────────────────────────────
export const roleEnum = pgEnum("role", ["user", "admin", "therapist", "patient"]);
export const patientStatusEnum = pgEnum("patient_status", ["active", "inactive", "archived"]);
export const appointmentStatusEnum = pgEnum("appointment_status", [
  "scheduled",
  "completed",
  "cancelled",
  "no_show",
]);
export const documentTypeEnum = pgEnum("document_type", [
  "prescription",
  "report",
  "exam",
  "attachment",
  "other",
]);
export const recipientTypeEnum = pgEnum("recipient_type", ["therapist", "patient"]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "appointment_reminder",
  "appointment_confirmation",
  "appointment_cancelled",
  "new_appointment",
]);
export const notificationStatusEnum = pgEnum("notification_status", ["pending", "sent", "failed"]);
export const videoCallStatusEnum = pgEnum("video_call_status", [
  "waiting",
  "active",
  "completed",
  "failed",
]);

/**
 * Tabela base de usuários (auth).
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  /** Identificador do OAuth Manus (openId). Único por usuário. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Psicólogas (therapists) — estende usuários com dados profissionais.
 */
export const therapists = pgTable("therapists", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique(),
  crp: varchar("crp", { length: 64 }).notNull(),
  specialties: text("specialties"), // JSON array de especialidades
  bio: text("bio"),
  photoUrl: text("photoUrl"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export type Therapist = typeof therapists.$inferSelect;
export type InsertTherapist = typeof therapists.$inferInsert;

/**
 * Pacientes.
 */
export const patients = pgTable("patients", {
  id: serial("id").primaryKey(),
  therapistId: integer("therapistId").notNull(),
  firstName: varchar("firstName", { length: 128 }).notNull(),
  lastName: varchar("lastName", { length: 128 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  dateOfBirth: timestamp("dateOfBirth", { withTimezone: true, mode: "date" }),
  address: text("address"),
  medicalHistory: text("medicalHistory"),
  emergencyContact: varchar("emergencyContact", { length: 128 }),
  emergencyPhone: varchar("emergencyPhone", { length: 20 }),
  status: patientStatusEnum("status").default("active").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;

/**
 * Agendamentos.
 */
export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  therapistId: integer("therapistId").notNull(),
  patientId: integer("patientId").notNull(),
  scheduledAt: timestamp("scheduledAt", { withTimezone: true, mode: "date" }).notNull(),
  duration: integer("duration").default(60).notNull(), // em minutos
  status: appointmentStatusEnum("status").default("scheduled").notNull(),
  confirmedAt: timestamp("confirmedAt", { withTimezone: true, mode: "date" }), // presença confirmada pelo paciente
  notes: text("notes"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = typeof appointments.$inferInsert;

/**
 * Sessões (registros de consultas realizadas).
 */
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  appointmentId: integer("appointmentId").notNull(),
  patientId: integer("patientId").notNull(),
  therapistId: integer("therapistId").notNull(),
  startedAt: timestamp("startedAt", { withTimezone: true, mode: "date" }).notNull(),
  endedAt: timestamp("endedAt", { withTimezone: true, mode: "date" }),
  clinicalNotes: text("clinicalNotes"),
  treatment: text("treatment"),
  nextSteps: text("nextSteps"),
  mood: varchar("mood", { length: 50 }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;

/**
 * Documentos/arquivos dos prontuários.
 */
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  patientId: integer("patientId").notNull(),
  therapistId: integer("therapistId").notNull(),
  sessionId: integer("sessionId"),
  fileName: varchar("fileName", { length: 256 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(), // S3 key
  fileUrl: text("fileUrl").notNull(),
  fileType: varchar("fileType", { length: 50 }).notNull(),
  fileSize: integer("fileSize").notNull(),
  documentType: documentTypeEnum("documentType").default("other").notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

/**
 * Notificações/lembretes.
 */
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  appointmentId: integer("appointmentId").notNull(),
  recipientType: recipientTypeEnum("recipientType").notNull(),
  recipientEmail: varchar("recipientEmail", { length: 320 }).notNull(),
  notificationType: notificationTypeEnum("notificationType").notNull(),
  status: notificationStatusEnum("status").default("pending").notNull(),
  sentAt: timestamp("sentAt", { withTimezone: true, mode: "date" }),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Anotações da sessão salvas durante a videochamada.
 */
export const sessionNotes = pgTable("sessionNotes", {
  id: serial("id").primaryKey(),
  sessionId: integer("sessionId").notNull(),
  appointmentId: integer("appointmentId").notNull(),
  patientId: integer("patientId").notNull(),
  therapistId: integer("therapistId").notNull(),
  notes: text("notes").notNull(),
  savedAt: timestamp("savedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export type SessionNote = typeof sessionNotes.$inferSelect;
export type InsertSessionNote = typeof sessionNotes.$inferInsert;

/**
 * Videochamadas (com histórico de gravações).
 */
export const videoCalls = pgTable("videoCalls", {
  id: serial("id").primaryKey(),
  sessionId: integer("sessionId"),
  appointmentId: integer("appointmentId").notNull(),
  therapistId: integer("therapistId").notNull(),
  patientId: integer("patientId").notNull(),
  roomId: varchar("roomId", { length: 256 }).notNull().unique(),
  startedAt: timestamp("startedAt", { withTimezone: true, mode: "date" }).notNull(),
  endedAt: timestamp("endedAt", { withTimezone: true, mode: "date" }),
  duration: integer("duration"), // em segundos
  recordingUrl: text("recordingUrl"),
  status: videoCallStatusEnum("status").default("waiting").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export type VideoCall = typeof videoCalls.$inferSelect;
export type InsertVideoCall = typeof videoCalls.$inferInsert;

// ── Relations ─────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ one }) => ({
  therapist: one(therapists, {
    fields: [users.id],
    references: [therapists.userId],
  }),
}));

export const therapistsRelations = relations(therapists, ({ one, many }) => ({
  user: one(users, {
    fields: [therapists.userId],
    references: [users.id],
  }),
  patients: many(patients),
  appointments: many(appointments),
  sessions: many(sessions),
  documents: many(documents),
  videoCalls: many(videoCalls),
}));

export const patientsRelations = relations(patients, ({ one, many }) => ({
  therapist: one(therapists, {
    fields: [patients.therapistId],
    references: [therapists.id],
  }),
  appointments: many(appointments),
  sessions: many(sessions),
  documents: many(documents),
  videoCalls: many(videoCalls),
}));

export const appointmentsRelations = relations(appointments, ({ one, many }) => ({
  therapist: one(therapists, {
    fields: [appointments.therapistId],
    references: [therapists.id],
  }),
  patient: one(patients, {
    fields: [appointments.patientId],
    references: [patients.id],
  }),
  session: one(sessions),
  videoCall: one(videoCalls),
  notifications: many(notifications),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  appointment: one(appointments, {
    fields: [sessions.appointmentId],
    references: [appointments.id],
  }),
  patient: one(patients, {
    fields: [sessions.patientId],
    references: [patients.id],
  }),
  therapist: one(therapists, {
    fields: [sessions.therapistId],
    references: [therapists.id],
  }),
  documents: many(documents),
  videoCall: one(videoCalls),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  patient: one(patients, {
    fields: [documents.patientId],
    references: [patients.id],
  }),
  therapist: one(therapists, {
    fields: [documents.therapistId],
    references: [therapists.id],
  }),
  session: one(sessions, {
    fields: [documents.sessionId],
    references: [sessions.id],
  }),
}));

export const videoCallsRelations = relations(videoCalls, ({ one }) => ({
  appointment: one(appointments, {
    fields: [videoCalls.appointmentId],
    references: [appointments.id],
  }),
  session: one(sessions, {
    fields: [videoCalls.sessionId],
    references: [sessions.id],
  }),
  therapist: one(therapists, {
    fields: [videoCalls.therapistId],
    references: [therapists.id],
  }),
  patient: one(patients, {
    fields: [videoCalls.patientId],
    references: [patients.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  appointment: one(appointments, {
    fields: [notifications.appointmentId],
    references: [appointments.id],
  }),
}));
