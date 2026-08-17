import { boolean, customType, index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Schema Postgres (Supabase). Colunas em camelCase para casar com os tipos gerados.
 * Timestamps usam `timestamptz` (with time zone), padrão recomendado no Supabase.
 */

// ── Enums (tipos nativos do Postgres) ─────────────────────────────────────────
export const roleEnum = pgEnum("role", ["user", "admin", "therapist", "patient"]);
/**
 * `pending` é LEGADO e nada mais o cria: existiu no fluxo em que o paciente se
 * cadastrava sozinho escolhendo a psicóloga (removido em 2026-07-15 — quem
 * cadastra é ela). Continua no enum de propósito: o Postgres não remove valor de
 * enum sem recriar o tipo e recadastrar a coluna, risco real em produção para um
 * ganho só cosmético. Nenhuma linha usa este valor.
 */
export const patientStatusEnum = pgEnum("patient_status", [
  "pending",
  "active",
  "inactive",
  "archived",
]);
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
export const therapistRequestStatusEnum = pgEnum("therapist_request_status", [
  "pending",
  "approved",
  "rejected",
]);
export const aiConversationStatusEnum = pgEnum("ai_conversation_status", ["active", "archived"]);
export const aiMessageRoleEnum = pgEnum("ai_message_role", ["system", "user", "assistant", "tool"]);
export const aiMemoryScopeEnum = pgEnum("ai_memory_scope", ["user", "therapist", "patient"]);
export const aiMemoryTypeEnum = pgEnum("ai_memory_type", [
  "preference",
  "conversation_summary",
  "workflow_context",
]);
export const aiMemoryStatusEnum = pgEnum("ai_memory_status", ["active", "superseded", "deleted"]);

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
 * Solicitações de acesso profissional (quem se cadastra dizendo ser psicólogo).
 *
 * NÃO dá acesso sozinha: o CRP é informação pública, então consultar o número
 * não prova identidade. A promoção para `therapist` é feita pelo admin após
 * conferir o CRP no CNP (cadastro.cfp.org.br) — este registro é a fila.
 */
export const therapistRequests = pgTable("therapistRequests", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique(),
  fullName: varchar("fullName", { length: 256 }).notNull(),
  crp: varchar("crp", { length: 32 }).notNull(),
  email: varchar("email", { length: 320 }),
  message: text("message"),
  status: therapistRequestStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  reviewedAt: timestamp("reviewedAt", { withTimezone: true, mode: "date" }),
  /**
   * Quando o admin foi avisado por e-mail. Nulo = ainda não avisado, e o
   * agendador tenta de novo no próximo ciclo. É o que impede o aviso de sumir
   * quando o envio falha (deploy no meio, SMTP fora do ar, cold start).
   */
  notifiedAt: timestamp("notifiedAt", { withTimezone: true, mode: "date" }),
  /**
   * Por que o último envio falhou. Sem isto, um aviso que não sai é
   * indistinguível de um que nunca foi tentado — e o motivo só existiria no log
   * do Render, que ninguém lê. A fila de `notifications` já guarda o erro; esta
   * coluna dá a mesma visibilidade aqui.
   */
  notifyError: text("notifyError"),
});

export type TherapistRequest = typeof therapistRequests.$inferSelect;
export type InsertTherapistRequest = typeof therapistRequests.$inferInsert;

/**
 * Psicólogas (therapists) — estende usuários com dados profissionais.
 */
export const therapists = pgTable("therapists", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique(),
  crp: varchar("crp", { length: 64 }).notNull(),
  specialties: text("specialties"), // texto separado por vírgula
  bio: text("bio"),
  /** Graduação/pós, texto livre. Ex.: "Psicologia — USP; Especialização em TCC". */
  formacao: text("formacao"),
  /** Público atendido, separado por vírgula (ex.: "Adultos, Casais"). */
  publicoAtendido: text("publicoAtendido"),
  /** Preço padrão da consulta, em CENTAVOS (ver shared/dinheiro.ts). Prefill do
   *  valor de cada consulta nova; a psicóloga pode sobrescrever por consulta. */
  sessionPrice: integer("sessionPrice"),
  /** Path da foto no bucket `avatars` — NÃO é URL: o bucket é privado e a
   *  exibição passa por URL assinada. */
  photoKey: text("photoKey"),
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
  /** Conta do paciente (users.id) quando ele mesmo se cadastra. Null = criado pela psicóloga. */
  userId: integer("userId").unique(),
  firstName: varchar("firstName", { length: 128 }).notNull(),
  lastName: varchar("lastName", { length: 128 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  dateOfBirth: timestamp("dateOfBirth", { withTimezone: true, mode: "date" }),
  address: text("address"),
  /** Path da foto no bucket `avatars`. Opcional — o paciente põe se quiser. */
  photoKey: text("photoKey"),
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
  /**
   * Código aleatório que entra no nome da sala de vídeo (apt<id>-<roomToken>),
   * para o link ser IMPOSSÍVEL de adivinhar. Antes a sala era `sala-apt<id>`
   * (sequencial): dava para enumerar sala-apt1, sala-apt2... e cair numa consulta
   * clínica, inclusive direto no servidor público do MiroTalk. Com o token, só
   * entra quem tem o link exato — o modelo do Zoom/Meet.
   */
  roomToken: varchar("roomToken", { length: 32 }),
  notes: text("notes"),
  /** Valor da consulta em CENTAVOS (ver shared/dinheiro.ts). Nasce do preço
   *  padrão da psicóloga; nulo = sem valor definido. */
  price: integer("price"),
  /** Se já foi paga. paidAt guarda quando foi marcada como paga (registro). */
  paid: boolean("paid").default(false).notNull(),
  paidAt: timestamp("paidAt", { withTimezone: true, mode: "date" }),
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
const vector768 = customType<{ data: number[]; driverData: string; columnType: "vector" }>({
  dataType() {
    return "vector(768)";
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    return String(value).slice(1, -1).split(",").filter(Boolean).map(Number);
  },
});

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

/** Chunks de texto extraído de arquivos, com embedding compatível com pgvector. */
export const aiDocumentProcessingStatusEnum = pgEnum("aiDocumentProcessingStatus", ["pending", "processing", "indexed", "failed"]);

export const aiDocumentJobs = pgTable(
  "aiDocumentJobs",
  {
    id: serial("id").primaryKey(),
    documentId: integer("documentId").notNull(),
    status: aiDocumentProcessingStatusEnum("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("maxAttempts").default(5).notNull(),
    availableAt: timestamp("availableAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    lockedAt: timestamp("lockedAt", { withTimezone: true, mode: "date" }),
    lockedBy: varchar("lockedBy", { length: 120 }),
    lastError: text("lastError"),
    processedAt: timestamp("processedAt", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    documentUniqueIdx: uniqueIndex("ai_document_jobs_document_unique_idx").on(table.documentId),
    statusAvailableIdx: index("ai_document_jobs_status_available_idx").on(table.status, table.availableAt),
  }),
);
export type AiDocumentJob = typeof aiDocumentJobs.$inferSelect;
export type InsertAiDocumentJob = typeof aiDocumentJobs.$inferInsert;

export const aiDocumentChunks = pgTable(
  "aiDocumentChunks",
  {
    id: serial("id").primaryKey(),
    documentId: integer("documentId").notNull(),
    patientId: integer("patientId").notNull(),
    therapistId: integer("therapistId").notNull(),
    chunkIndex: integer("chunkIndex").notNull(),
    content: text("content").notNull(),
    contentHash: varchar("contentHash", { length: 64 }).notNull(),
    embedding: vector768("embedding").notNull(),
    pageNumber: integer("pageNumber"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    documentChunkIdx: index("ai_document_chunks_document_chunk_idx").on(table.documentId, table.chunkIndex),
    clinicalScopeIdx: index("ai_document_chunks_clinical_scope_idx").on(table.therapistId, table.patientId),
    contentHashIdx: index("ai_document_chunks_content_hash_idx").on(table.contentHash),
  }),
);
export type AiDocumentChunk = typeof aiDocumentChunks.$inferSelect;
export type InsertAiDocumentChunk = typeof aiDocumentChunks.$inferInsert;

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
  /**
   * Quando o destinatário ocultou a notificação da sua lista. Não apaga: o
   * agendador ainda precisa "vê-la" para o dedupe, senão recriaria a
   * notificação e reenviaria o e-mail no ciclo seguinte. `list` filtra as que
   * têm este campo preenchido; os alerts (dedupe) ignoram este campo de propósito.
   */
  dismissedAt: timestamp("dismissedAt", { withTimezone: true, mode: "date" }),
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

/**
 * Conversas do agente. O escopo clínico é explícito: uma conversa de paciente
 * ou terapeuta nunca deve ser recuperada apenas pelo id sem validar o usuário.
 */
export const aiConversations = pgTable(
  "aiConversations",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    therapistId: integer("therapistId"),
    patientId: integer("patientId"),
    status: aiConversationStatusEnum("status").default("active").notNull(),
    title: varchar("title", { length: 160 }),
    model: varchar("model", { length: 128 }),
    lastMessageAt: timestamp("lastMessageAt", { withTimezone: true, mode: "date" }),
    retentionExpiresAt: timestamp("retentionExpiresAt", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    userStatusIdx: index("ai_conversations_user_status_idx").on(table.userId, table.status),
    clinicalScopeIdx: index("ai_conversations_clinical_scope_idx").on(
      table.therapistId,
      table.patientId,
      table.updatedAt,
    ),
  }),
);
export type AiConversation = typeof aiConversations.$inferSelect;
export type InsertAiConversation = typeof aiConversations.$inferInsert;

/** Mensagens do histórico. Conteúdo nunca deve conter segredos em metadata. */
export const aiMessages = pgTable(
  "aiMessages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversationId").notNull(),
    role: aiMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    contentRedacted: boolean("contentRedacted").default(false).notNull(),
    providerMessageId: varchar("providerMessageId", { length: 256 }),
    tokenCount: integer("tokenCount"),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    conversationCreatedIdx: index("ai_messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  }),
);
export type AiMessage = typeof aiMessages.$inferSelect;
export type InsertAiMessage = typeof aiMessages.$inferInsert;

/** Memórias duráveis e minimizadas, sempre vinculadas a um escopo explícito. */
export const aiMemories = pgTable(
  "aiMemories",
  {
    id: serial("id").primaryKey(),
    scope: aiMemoryScopeEnum("scope").notNull(),
    memoryType: aiMemoryTypeEnum("memoryType").notNull(),
    userId: integer("userId").notNull(),
    therapistId: integer("therapistId"),
    patientId: integer("patientId"),
    content: text("content").notNull(),
    sourceConversationId: integer("sourceConversationId"),
    status: aiMemoryStatusEnum("status").default("active").notNull(),
    importance: integer("importance").default(50).notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    userStatusIdx: index("ai_memories_user_status_idx").on(table.userId, table.status),
    scopeLookupIdx: index("ai_memories_scope_lookup_idx").on(
      table.scope,
      table.therapistId,
      table.patientId,
      table.status,
    ),
  }),
);
export type AiMemory = typeof aiMemories.$inferSelect;
export type InsertAiMemory = typeof aiMemories.$inferInsert;

/** Auditoria sem guardar o prompt/resposta integral por padrão. */
export const aiAuditEvents = pgTable(
  "aiAuditEvents",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    conversationId: integer("conversationId"),
    action: varchar("action", { length: 64 }).notNull(),
    resourceType: varchar("resourceType", { length: 64 }),
    resourceId: integer("resourceId"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    userCreatedIdx: index("ai_audit_events_user_created_idx").on(table.userId, table.createdAt),
    conversationIdx: index("ai_audit_events_conversation_idx").on(table.conversationId),
  }),
);
export type AiAuditEvent = typeof aiAuditEvents.$inferSelect;
export type InsertAiAuditEvent = typeof aiAuditEvents.$inferInsert;

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
