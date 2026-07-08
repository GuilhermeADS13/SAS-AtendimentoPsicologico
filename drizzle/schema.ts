import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, datetime, longtext } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "therapist", "patient"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Tabela de psicólogas (therapists)
 * Estende a tabela de usuários com informações profissionais
 */
export const therapists = mysqlTable("therapists", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  crp: varchar("crp", { length: 64 }).notNull(),
  specialties: text("specialties"), // JSON array de especialidades
  bio: longtext("bio"),
  photoUrl: text("photoUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Therapist = typeof therapists.$inferSelect;
export type InsertTherapist = typeof therapists.$inferInsert;

/**
 * Tabela de pacientes
 */
export const patients = mysqlTable("patients", {
  id: int("id").autoincrement().primaryKey(),
  therapistId: int("therapistId").notNull(),
  firstName: varchar("firstName", { length: 128 }).notNull(),
  lastName: varchar("lastName", { length: 128 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  dateOfBirth: datetime("dateOfBirth"),
  address: text("address"),
  medicalHistory: longtext("medicalHistory"),
  emergencyContact: varchar("emergencyContact", { length: 128 }),
  emergencyPhone: varchar("emergencyPhone", { length: 20 }),
  status: mysqlEnum("status", ["active", "inactive", "archived"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;

/**
 * Tabela de agendamentos
 */
export const appointments = mysqlTable("appointments", {
  id: int("id").autoincrement().primaryKey(),
  therapistId: int("therapistId").notNull(),
  patientId: int("patientId").notNull(),
  scheduledAt: datetime("scheduledAt").notNull(),
  duration: int("duration").default(60).notNull(), // em minutos
  status: mysqlEnum("status", ["scheduled", "completed", "cancelled", "no_show"]).default("scheduled").notNull(),
  notes: longtext("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = typeof appointments.$inferInsert;

/**
 * Tabela de sessões (registros de consultas realizadas)
 */
export const sessions = mysqlTable("sessions", {
  id: int("id").autoincrement().primaryKey(),
  appointmentId: int("appointmentId").notNull(),
  patientId: int("patientId").notNull(),
  therapistId: int("therapistId").notNull(),
  startedAt: datetime("startedAt").notNull(),
  endedAt: datetime("endedAt"),
  clinicalNotes: longtext("clinicalNotes"),
  treatment: longtext("treatment"),
  nextSteps: longtext("nextSteps"),
  mood: varchar("mood", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;

/**
 * Tabela de documentos/arquivos dos prontuários
 */
export const documents = mysqlTable("documents", {
  id: int("id").autoincrement().primaryKey(),
  patientId: int("patientId").notNull(),
  therapistId: int("therapistId").notNull(),
  sessionId: int("sessionId"),
  fileName: varchar("fileName", { length: 256 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(), // S3 key
  fileUrl: text("fileUrl").notNull(),
  fileType: varchar("fileType", { length: 50 }).notNull(),
  fileSize: int("fileSize").notNull(),
  documentType: mysqlEnum("documentType", ["prescription", "report", "exam", "attachment", "other"]).default("other").notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

/**
 * Tabela de notificações/lembretes
 */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  appointmentId: int("appointmentId").notNull(),
  recipientType: mysqlEnum("recipientType", ["therapist", "patient"]).notNull(),
  recipientEmail: varchar("recipientEmail", { length: 320 }).notNull(),
  notificationType: mysqlEnum("notificationType", ["appointment_reminder", "appointment_confirmation", "appointment_cancelled", "new_appointment"]).notNull(),
  status: mysqlEnum("status", ["pending", "sent", "failed"]).default("pending").notNull(),
  sentAt: datetime("sentAt"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Tabela de videochamadas
*/
export const sessionNotes = mysqlTable("sessionNotes", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  appointmentId: int("appointmentId").notNull(),
  patientId: int("patientId").notNull(),
  therapistId: int("therapistId").notNull(),
  notes: longtext("notes").notNull(),
  savedAt: timestamp("savedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SessionNote = typeof sessionNotes.$inferSelect;
export type InsertSessionNote = typeof sessionNotes.$inferInsert;

/**
 * Tabela de videochamadas
 */
export const videoCalls = mysqlTable("videoCalls", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId"),
  appointmentId: int("appointmentId").notNull(),
  therapistId: int("therapistId").notNull(),
  patientId: int("patientId").notNull(),
  roomId: varchar("roomId", { length: 256 }).notNull().unique(),
  startedAt: datetime("startedAt").notNull(),
  endedAt: datetime("endedAt"),
  duration: int("duration"), // em segundos
  recordingUrl: text("recordingUrl"),
  status: mysqlEnum("status", ["waiting", "active", "completed", "failed"]).default("waiting").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VideoCall = typeof videoCalls.$inferSelect;
export type InsertVideoCall = typeof videoCalls.$inferInsert;

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
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
