-- Estrutura do banco de PRODUÇÃO copiada em 2026-11-04 (supabase db dump --schema public),
-- SEM DADOS. Serve só ao Supabase local do `pnpm dev:local` (Docker): o `supabase start`
-- e o `supabase db reset` aplicam este arquivo. Produção NÃO usa esta pasta; as migrações
-- de produção continuam em drizzle/ e drizzle/migrations/.
--
-- Mudou a estrutura em produção? Gere de novo com o mesmo comando e substitua este arquivo.

-- Em produção a extensão vector fica no schema public (tabela aiDocumentChunks).
create extension if not exists vector with schema public;




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."aiDocumentProcessingStatus" AS ENUM (
    'pending',
    'processing',
    'indexed',
    'failed'
);


ALTER TYPE "public"."aiDocumentProcessingStatus" OWNER TO "postgres";


CREATE TYPE "public"."ai_conversation_status" AS ENUM (
    'active',
    'archived'
);


ALTER TYPE "public"."ai_conversation_status" OWNER TO "postgres";


CREATE TYPE "public"."ai_feedback_rating" AS ENUM (
    'helpful',
    'not_helpful'
);


ALTER TYPE "public"."ai_feedback_rating" OWNER TO "postgres";


CREATE TYPE "public"."ai_memory_scope" AS ENUM (
    'user',
    'therapist',
    'patient'
);


ALTER TYPE "public"."ai_memory_scope" OWNER TO "postgres";


CREATE TYPE "public"."ai_memory_status" AS ENUM (
    'active',
    'superseded',
    'deleted'
);


ALTER TYPE "public"."ai_memory_status" OWNER TO "postgres";


CREATE TYPE "public"."ai_memory_type" AS ENUM (
    'preference',
    'conversation_summary',
    'workflow_context'
);


ALTER TYPE "public"."ai_memory_type" OWNER TO "postgres";


CREATE TYPE "public"."ai_message_role" AS ENUM (
    'system',
    'user',
    'assistant',
    'tool'
);


ALTER TYPE "public"."ai_message_role" OWNER TO "postgres";


CREATE TYPE "public"."appointment_status" AS ENUM (
    'scheduled',
    'completed',
    'cancelled',
    'no_show'
);


ALTER TYPE "public"."appointment_status" OWNER TO "postgres";


CREATE TYPE "public"."document_type" AS ENUM (
    'prescription',
    'report',
    'exam',
    'attachment',
    'other'
);


ALTER TYPE "public"."document_type" OWNER TO "postgres";


CREATE TYPE "public"."notification_status" AS ENUM (
    'pending',
    'sent',
    'failed'
);


ALTER TYPE "public"."notification_status" OWNER TO "postgres";


CREATE TYPE "public"."notification_type" AS ENUM (
    'appointment_reminder',
    'appointment_confirmation',
    'appointment_cancelled',
    'new_appointment'
);


ALTER TYPE "public"."notification_type" OWNER TO "postgres";


CREATE TYPE "public"."patient_status" AS ENUM (
    'pending',
    'active',
    'inactive',
    'archived'
);


ALTER TYPE "public"."patient_status" OWNER TO "postgres";


CREATE TYPE "public"."recipient_type" AS ENUM (
    'therapist',
    'patient'
);


ALTER TYPE "public"."recipient_type" OWNER TO "postgres";


CREATE TYPE "public"."role" AS ENUM (
    'user',
    'admin',
    'therapist',
    'patient'
);


ALTER TYPE "public"."role" OWNER TO "postgres";


CREATE TYPE "public"."therapist_request_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."therapist_request_status" OWNER TO "postgres";


CREATE TYPE "public"."video_call_status" AS ENUM (
    'waiting',
    'active',
    'completed',
    'failed'
);


ALTER TYPE "public"."video_call_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_therapist_uid"("uid" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.users u
    join public.therapists t on t."userId" = u.id
    where u."openId" = 'sb:' || uid
  );
$$;


ALTER FUNCTION "public"."is_therapist_uid"("uid" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."aiAuditEvents" (
    "id" integer NOT NULL,
    "userId" integer NOT NULL,
    "conversationId" integer,
    "action" character varying(64) NOT NULL,
    "resourceType" character varying(64),
    "resourceId" integer,
    "metadata" "jsonb",
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."aiAuditEvents" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."aiAuditEvents_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."aiAuditEvents_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."aiAuditEvents_id_seq" OWNED BY "public"."aiAuditEvents"."id";



CREATE TABLE IF NOT EXISTS "public"."aiConversations" (
    "id" integer NOT NULL,
    "userId" integer NOT NULL,
    "therapistId" integer,
    "patientId" integer,
    "status" "public"."ai_conversation_status" DEFAULT 'active'::"public"."ai_conversation_status" NOT NULL,
    "title" character varying(160),
    "model" character varying(128),
    "lastMessageAt" timestamp with time zone,
    "retentionExpiresAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clientRequestId" character varying(80)
);


ALTER TABLE "public"."aiConversations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."aiConversations_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."aiConversations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."aiConversations_id_seq" OWNED BY "public"."aiConversations"."id";



CREATE TABLE IF NOT EXISTS "public"."aiDocumentChunks" (
    "id" integer NOT NULL,
    "documentId" integer NOT NULL,
    "patientId" integer NOT NULL,
    "therapistId" integer NOT NULL,
    "chunkIndex" integer NOT NULL,
    "content" "text" NOT NULL,
    "contentHash" character varying(64) NOT NULL,
    "embedding" "public"."vector"(768) NOT NULL,
    "pageNumber" integer,
    "metadata" "jsonb",
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."aiDocumentChunks" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."aiDocumentChunks_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."aiDocumentChunks_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."aiDocumentChunks_id_seq" OWNED BY "public"."aiDocumentChunks"."id";



CREATE TABLE IF NOT EXISTS "public"."aiDocumentJobs" (
    "id" integer NOT NULL,
    "documentId" integer NOT NULL,
    "status" "public"."aiDocumentProcessingStatus" DEFAULT 'pending'::"public"."aiDocumentProcessingStatus" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "maxAttempts" integer DEFAULT 5 NOT NULL,
    "availableAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lockedAt" timestamp with time zone,
    "lockedBy" character varying(120),
    "lastError" "text",
    "processedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."aiDocumentJobs" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."aiDocumentJobs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."aiDocumentJobs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."aiDocumentJobs_id_seq" OWNED BY "public"."aiDocumentJobs"."id";



CREATE TABLE IF NOT EXISTS "public"."aiMemories" (
    "id" integer NOT NULL,
    "scope" "public"."ai_memory_scope" NOT NULL,
    "memoryType" "public"."ai_memory_type" NOT NULL,
    "userId" integer NOT NULL,
    "therapistId" integer,
    "patientId" integer,
    "content" "text" NOT NULL,
    "sourceConversationId" integer,
    "status" "public"."ai_memory_status" DEFAULT 'active'::"public"."ai_memory_status" NOT NULL,
    "importance" integer DEFAULT 50 NOT NULL,
    "expiresAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."aiMemories" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."aiMemories_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."aiMemories_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."aiMemories_id_seq" OWNED BY "public"."aiMemories"."id";



CREATE TABLE IF NOT EXISTS "public"."aiMessageFeedback" (
    "id" integer NOT NULL,
    "messageId" integer NOT NULL,
    "userId" integer NOT NULL,
    "rating" "public"."ai_feedback_rating" NOT NULL,
    "reason" character varying(80),
    "comment" character varying(500),
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."aiMessageFeedback" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."aiMessageFeedback_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."aiMessageFeedback_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."aiMessageFeedback_id_seq" OWNED BY "public"."aiMessageFeedback"."id";



CREATE TABLE IF NOT EXISTS "public"."aiMessages" (
    "id" integer NOT NULL,
    "conversationId" integer NOT NULL,
    "role" "public"."ai_message_role" NOT NULL,
    "content" "text" NOT NULL,
    "contentRedacted" boolean DEFAULT false NOT NULL,
    "providerMessageId" character varying(256),
    "tokenCount" integer,
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clientRequestId" character varying(80)
);


ALTER TABLE "public"."aiMessages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."aiMessages"."clientRequestId" IS 'Identificador idempotente do envio do cliente; evita duplicação em retries.';



CREATE SEQUENCE IF NOT EXISTS "public"."aiMessages_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."aiMessages_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."aiMessages_id_seq" OWNED BY "public"."aiMessages"."id";



CREATE TABLE IF NOT EXISTS "public"."aparelhosConfiaveis" (
    "id" integer NOT NULL,
    "userId" integer NOT NULL,
    "tokenHash" character varying(64) NOT NULL,
    "expiraEm" timestamp with time zone NOT NULL,
    "criadoEm" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."aparelhosConfiaveis" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."aparelhosConfiaveis_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."aparelhosConfiaveis_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."aparelhosConfiaveis_id_seq" OWNED BY "public"."aparelhosConfiaveis"."id";



CREATE TABLE IF NOT EXISTS "public"."appointmentParticipants" (
    "id" integer NOT NULL,
    "appointmentId" integer NOT NULL,
    "patientId" integer NOT NULL,
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."appointmentParticipants" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."appointmentParticipants_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."appointmentParticipants_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."appointmentParticipants_id_seq" OWNED BY "public"."appointmentParticipants"."id";



CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" integer NOT NULL,
    "therapistId" integer NOT NULL,
    "patientId" integer NOT NULL,
    "scheduledAt" timestamp with time zone NOT NULL,
    "duration" integer DEFAULT 60 NOT NULL,
    "status" "public"."appointment_status" DEFAULT 'scheduled'::"public"."appointment_status" NOT NULL,
    "notes" "text",
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmedAt" timestamp with time zone,
    "roomToken" character varying(32),
    "price" integer,
    "paid" boolean DEFAULT false NOT NULL,
    "paidAt" timestamp with time zone,
    "paymentUpdatedBy" integer,
    "pagamentoInformadoEm" timestamp with time zone
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."appointments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."appointments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."appointments_id_seq" OWNED BY "public"."appointments"."id";



CREATE TABLE IF NOT EXISTS "public"."assinaturas" (
    "id" integer NOT NULL,
    "therapistId" integer,
    "crp" character varying(64) NOT NULL,
    "celular" character varying(20),
    "testeAte" timestamp with time zone,
    "pagoAte" timestamp with time zone,
    "ciclo" character varying(10) DEFAULT 'mensal'::character varying NOT NULL,
    "fundador" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "diaVencimento" smallint,
    "avisoEnviadoPara" timestamp with time zone,
    "plano" character varying(10) DEFAULT 'pro'::character varying NOT NULL,
    "valorCombinado" integer,
    "lumaPorDia" smallint,
    "anexoMb" smallint,
    "relatorioEnviadoEm" timestamp with time zone,
    "testeAguardando" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."assinaturas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."assinaturas_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."assinaturas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."assinaturas_id_seq" OWNED BY "public"."assinaturas"."id";



CREATE TABLE IF NOT EXISTS "public"."chatMessages" (
    "id" integer NOT NULL,
    "therapistId" integer NOT NULL,
    "patientId" integer NOT NULL,
    "senderUserId" integer NOT NULL,
    "senderRole" character varying(16) NOT NULL,
    "content" "text",
    "fileKey" character varying(512),
    "fileName" character varying(256),
    "fileType" character varying(100),
    "fileSize" integer,
    "readAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "editedAt" timestamp with time zone,
    "deletedAt" timestamp with time zone
);


ALTER TABLE "public"."chatMessages" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."chatMessages_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."chatMessages_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."chatMessages_id_seq" OWNED BY "public"."chatMessages"."id";



CREATE TABLE IF NOT EXISTS "public"."codigosDeAparelho" (
    "userId" integer NOT NULL,
    "codigoHash" character varying(64) NOT NULL,
    "expiraEm" timestamp with time zone NOT NULL,
    "tentativas" smallint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."codigosDeAparelho" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" integer NOT NULL,
    "patientId" integer NOT NULL,
    "therapistId" integer NOT NULL,
    "sessionId" integer,
    "fileName" character varying(256) NOT NULL,
    "fileKey" character varying(512) NOT NULL,
    "fileUrl" "text" NOT NULL,
    "fileType" character varying(50) NOT NULL,
    "fileSize" integer NOT NULL,
    "documentType" "public"."document_type" DEFAULT 'other'::"public"."document_type" NOT NULL,
    "description" "text",
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tipoParaPaciente" character varying(20),
    "compartilhadoEm" timestamp with time zone,
    CONSTRAINT "documents_tipoParaPaciente_check" CHECK ((("tipoParaPaciente" IS NULL) OR (("tipoParaPaciente")::"text" = ANY ((ARRAY['laudo'::character varying, 'parecer'::character varying, 'atestado'::character varying, 'declaracao'::character varying, 'relatorio'::character varying])::"text"[]))))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."documents_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."documents_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."documents_id_seq" OWNED BY "public"."documents"."id";



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" integer NOT NULL,
    "appointmentId" integer NOT NULL,
    "recipientType" "public"."recipient_type" NOT NULL,
    "recipientEmail" character varying(320) NOT NULL,
    "notificationType" "public"."notification_type" NOT NULL,
    "status" "public"."notification_status" DEFAULT 'pending'::"public"."notification_status" NOT NULL,
    "sentAt" timestamp with time zone,
    "errorMessage" "text",
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dismissedAt" timestamp with time zone
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."notifications_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."notifications_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."notifications_id_seq" OWNED BY "public"."notifications"."id";



CREATE TABLE IF NOT EXISTS "public"."patients" (
    "id" integer NOT NULL,
    "therapistId" integer NOT NULL,
    "firstName" character varying(128) NOT NULL,
    "lastName" character varying(128) NOT NULL,
    "email" character varying(320) NOT NULL,
    "phone" character varying(20),
    "dateOfBirth" timestamp with time zone,
    "address" "text",
    "medicalHistory" "text",
    "emergencyContact" character varying(128),
    "emergencyPhone" character varying(20),
    "status" "public"."patient_status" DEFAULT 'active'::"public"."patient_status" NOT NULL,
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "userId" integer,
    "photoKey" "text",
    "guardianName" character varying(128),
    "guardianConsentAt" timestamp with time zone,
    "initialDemand" "text",
    "therapeuticGoals" "text",
    "dischargeSummary" "text",
    "dischargedAt" timestamp with time zone,
    "anamnesis" "jsonb",
    "tcle" "jsonb",
    "tcleSignedAt" timestamp with time zone,
    "frequencia" character varying(40),
    CONSTRAINT "patients_frequencia_valida" CHECK ((("frequencia")::"text" ~ '^(semanal|quinzenal|mensal|dias:[0-6](,[0-6]){0,6})$'::"text"))
);


ALTER TABLE "public"."patients" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."patients_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."patients_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."patients_id_seq" OWNED BY "public"."patients"."id";



CREATE TABLE IF NOT EXISTS "public"."sessionNotes" (
    "id" integer NOT NULL,
    "sessionId" integer NOT NULL,
    "appointmentId" integer NOT NULL,
    "patientId" integer NOT NULL,
    "therapistId" integer NOT NULL,
    "notes" "text" NOT NULL,
    "savedAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sessionNotes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."sessionNotes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."sessionNotes_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."sessionNotes_id_seq" OWNED BY "public"."sessionNotes"."id";



CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" integer NOT NULL,
    "appointmentId" integer NOT NULL,
    "patientId" integer NOT NULL,
    "therapistId" integer NOT NULL,
    "startedAt" timestamp with time zone NOT NULL,
    "endedAt" timestamp with time zone,
    "clinicalNotes" "text",
    "treatment" "text",
    "nextSteps" "text",
    "mood" character varying(50),
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subjective" "text",
    "objective" "text",
    "assessment" "text",
    "plan" "text",
    "moodScore" smallint,
    "fase" character varying(20),
    CONSTRAINT "sessions_fase_valida" CHECK ((("fase")::"text" = ANY ((ARRAY['avaliacao'::character varying, 'intervencao'::character varying, 'manutencao'::character varying, 'encerramento'::character varying])::"text"[]))),
    CONSTRAINT "sessions_moodScore_0_a_10" CHECK ((("moodScore" >= 0) AND ("moodScore" <= 10)))
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."sessions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."sessions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."sessions_id_seq" OWNED BY "public"."sessions"."id";



CREATE TABLE IF NOT EXISTS "public"."therapistRequests" (
    "id" integer NOT NULL,
    "userId" integer NOT NULL,
    "fullName" character varying(256) NOT NULL,
    "crp" character varying(32) NOT NULL,
    "email" character varying(320),
    "message" "text",
    "status" "public"."therapist_request_status" DEFAULT 'pending'::"public"."therapist_request_status" NOT NULL,
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewedAt" timestamp with time zone,
    "notifiedAt" timestamp with time zone,
    "notifyError" "text"
);


ALTER TABLE "public"."therapistRequests" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."therapistRequests_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."therapistRequests_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."therapistRequests_id_seq" OWNED BY "public"."therapistRequests"."id";



CREATE TABLE IF NOT EXISTS "public"."therapists" (
    "id" integer NOT NULL,
    "userId" integer NOT NULL,
    "crp" character varying(64) NOT NULL,
    "specialties" "text",
    "bio" "text",
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "photoKey" "text",
    "formacao" "text",
    "publicoAtendido" "text",
    "sessionPrice" integer,
    "phone" character varying(20),
    "noteTemplates" "jsonb",
    "prontuarioModel" "text",
    "prontuarioModelName" character varying(256),
    "pixTipo" character varying(12),
    "pixChave" character varying(77),
    "pixCidade" character varying(15),
    "contratoModelo" "text",
    "contratoModeloNome" character varying(256)
);


ALTER TABLE "public"."therapists" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."therapists_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."therapists_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."therapists_id_seq" OWNED BY "public"."therapists"."id";



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" integer NOT NULL,
    "openId" character varying(64) NOT NULL,
    "name" "text",
    "email" character varying(320),
    "loginMethod" character varying(64),
    "role" "public"."role" DEFAULT 'user'::"public"."role" NOT NULL,
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lastSignedIn" timestamp with time zone DEFAULT "now"() NOT NULL,
    "onboardingSeenAt" timestamp with time zone,
    "emailChangeNew" character varying(320),
    "emailChangeCodeHash" "text",
    "emailChangeExpires" timestamp with time zone,
    "emailChangeAttempts" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."users_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."users_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."users_id_seq" OWNED BY "public"."users"."id";



CREATE TABLE IF NOT EXISTS "public"."videoCalls" (
    "id" integer NOT NULL,
    "sessionId" integer,
    "appointmentId" integer NOT NULL,
    "therapistId" integer NOT NULL,
    "patientId" integer NOT NULL,
    "roomId" character varying(256) NOT NULL,
    "startedAt" timestamp with time zone NOT NULL,
    "endedAt" timestamp with time zone,
    "duration" integer,
    "recordingUrl" "text",
    "status" "public"."video_call_status" DEFAULT 'waiting'::"public"."video_call_status" NOT NULL,
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."videoCalls" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."videoCalls_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."videoCalls_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."videoCalls_id_seq" OWNED BY "public"."videoCalls"."id";



ALTER TABLE ONLY "public"."aiAuditEvents" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."aiAuditEvents_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."aiConversations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."aiConversations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."aiDocumentChunks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."aiDocumentChunks_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."aiDocumentJobs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."aiDocumentJobs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."aiMemories" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."aiMemories_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."aiMessageFeedback" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."aiMessageFeedback_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."aiMessages" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."aiMessages_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."aparelhosConfiaveis" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."aparelhosConfiaveis_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."appointmentParticipants" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."appointmentParticipants_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."appointments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."appointments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."assinaturas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."assinaturas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."chatMessages" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."chatMessages_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."documents" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."documents_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."notifications" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."notifications_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."patients" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."patients_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."sessionNotes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."sessionNotes_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."sessions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."sessions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."therapistRequests" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."therapistRequests_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."therapists" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."therapists_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."users" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."users_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."videoCalls" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."videoCalls_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."aiAuditEvents"
    ADD CONSTRAINT "aiAuditEvents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aiConversations"
    ADD CONSTRAINT "aiConversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aiDocumentChunks"
    ADD CONSTRAINT "aiDocumentChunks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aiDocumentJobs"
    ADD CONSTRAINT "aiDocumentJobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aiMemories"
    ADD CONSTRAINT "aiMemories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aiMessageFeedback"
    ADD CONSTRAINT "aiMessageFeedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aiMessages"
    ADD CONSTRAINT "aiMessages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aparelhosConfiaveis"
    ADD CONSTRAINT "aparelhosConfiaveis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."aparelhosConfiaveis"
    ADD CONSTRAINT "aparelhosConfiaveis_tokenHash_key" UNIQUE ("tokenHash");



ALTER TABLE ONLY "public"."appointmentParticipants"
    ADD CONSTRAINT "appointmentParticipants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assinaturas"
    ADD CONSTRAINT "assinaturas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assinaturas"
    ADD CONSTRAINT "assinaturas_therapistId_key" UNIQUE ("therapistId");



ALTER TABLE ONLY "public"."chatMessages"
    ADD CONSTRAINT "chatMessages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."codigosDeAparelho"
    ADD CONSTRAINT "codigosDeAparelho_pkey" PRIMARY KEY ("userId");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_userId_unique" UNIQUE ("userId");



ALTER TABLE ONLY "public"."sessionNotes"
    ADD CONSTRAINT "sessionNotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."therapistRequests"
    ADD CONSTRAINT "therapistRequests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."therapistRequests"
    ADD CONSTRAINT "therapistRequests_userId_unique" UNIQUE ("userId");



ALTER TABLE ONLY "public"."therapists"
    ADD CONSTRAINT "therapists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."therapists"
    ADD CONSTRAINT "therapists_userId_unique" UNIQUE ("userId");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_openId_unique" UNIQUE ("openId");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."videoCalls"
    ADD CONSTRAINT "videoCalls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."videoCalls"
    ADD CONSTRAINT "videoCalls_roomId_unique" UNIQUE ("roomId");



CREATE INDEX "ai_audit_events_conversation_idx" ON "public"."aiAuditEvents" USING "btree" ("conversationId");



CREATE INDEX "ai_audit_events_user_created_idx" ON "public"."aiAuditEvents" USING "btree" ("userId", "createdAt");



CREATE INDEX "ai_conversations_clinical_scope_idx" ON "public"."aiConversations" USING "btree" ("therapistId", "patientId", "updatedAt");



CREATE UNIQUE INDEX "ai_conversations_user_request_idx" ON "public"."aiConversations" USING "btree" ("userId", "clientRequestId");



CREATE INDEX "ai_conversations_user_status_idx" ON "public"."aiConversations" USING "btree" ("userId", "status");



CREATE INDEX "ai_document_chunks_clinical_scope_idx" ON "public"."aiDocumentChunks" USING "btree" ("therapistId", "patientId");



CREATE INDEX "ai_document_chunks_content_hash_idx" ON "public"."aiDocumentChunks" USING "btree" ("contentHash");



CREATE INDEX "ai_document_chunks_document_chunk_idx" ON "public"."aiDocumentChunks" USING "btree" ("documentId", "chunkIndex");



CREATE INDEX "ai_document_chunks_embedding_hnsw_idx" ON "public"."aiDocumentChunks" USING "hnsw" ("embedding" "public"."vector_cosine_ops");



CREATE UNIQUE INDEX "ai_document_jobs_document_unique_idx" ON "public"."aiDocumentJobs" USING "btree" ("documentId");



CREATE INDEX "ai_document_jobs_status_available_idx" ON "public"."aiDocumentJobs" USING "btree" ("status", "availableAt");



CREATE INDEX "ai_memories_scope_lookup_idx" ON "public"."aiMemories" USING "btree" ("scope", "therapistId", "patientId", "status");



CREATE INDEX "ai_memories_user_status_idx" ON "public"."aiMemories" USING "btree" ("userId", "status");



CREATE UNIQUE INDEX "ai_message_feedback_message_user_unique" ON "public"."aiMessageFeedback" USING "btree" ("messageId", "userId");



CREATE INDEX "ai_message_feedback_user_created_idx" ON "public"."aiMessageFeedback" USING "btree" ("userId", "createdAt");



CREATE INDEX "ai_messages_conversation_created_idx" ON "public"."aiMessages" USING "btree" ("conversationId", "createdAt");



CREATE UNIQUE INDEX "ai_messages_conversation_request_idx" ON "public"."aiMessages" USING "btree" ("conversationId", "clientRequestId");



CREATE INDEX "aparelhosConfiaveis_userId_idx" ON "public"."aparelhosConfiaveis" USING "btree" ("userId");



CREATE INDEX "appointmentParticipants_patientId_idx" ON "public"."appointmentParticipants" USING "btree" ("patientId");



CREATE UNIQUE INDEX "appointmentParticipants_unico" ON "public"."appointmentParticipants" USING "btree" ("appointmentId", "patientId");



CREATE INDEX "appointments_payment_updated_by_idx" ON "public"."appointments" USING "btree" ("paymentUpdatedBy");



CREATE INDEX "assinaturas_celular_idx" ON "public"."assinaturas" USING "btree" ("celular");



CREATE INDEX "assinaturas_crp_idx" ON "public"."assinaturas" USING "btree" ("crp");



CREATE INDEX "chatMessages_thread_idx" ON "public"."chatMessages" USING "btree" ("therapistId", "patientId", "createdAt");



ALTER TABLE ONLY "public"."aparelhosConfiaveis"
    ADD CONSTRAINT "aparelhosConfiaveis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointmentParticipants"
    ADD CONSTRAINT "appointmentParticipants_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointmentParticipants"
    ADD CONSTRAINT "appointmentParticipants_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_payment_updated_by_users_id_fk" FOREIGN KEY ("paymentUpdatedBy") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assinaturas"
    ADD CONSTRAINT "assinaturas_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "public"."therapists"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."codigosDeAparelho"
    ADD CONSTRAINT "codigosDeAparelho_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE "public"."aiAuditEvents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."aiConversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."aiDocumentChunks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."aiDocumentJobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."aiMemories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."aiMessageFeedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."aiMessages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."aparelhosConfiaveis" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointmentParticipants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assinaturas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chatMessages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."codigosDeAparelho" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sessionNotes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."therapistRequests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."therapists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."videoCalls" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_therapist_uid"("uid" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_therapist_uid"("uid" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_therapist_uid"("uid" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON TABLE "public"."aiAuditEvents" TO "anon";
GRANT ALL ON TABLE "public"."aiAuditEvents" TO "authenticated";
GRANT ALL ON TABLE "public"."aiAuditEvents" TO "service_role";



GRANT ALL ON SEQUENCE "public"."aiAuditEvents_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."aiAuditEvents_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."aiAuditEvents_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."aiConversations" TO "anon";
GRANT ALL ON TABLE "public"."aiConversations" TO "authenticated";
GRANT ALL ON TABLE "public"."aiConversations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."aiConversations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."aiConversations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."aiConversations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."aiDocumentChunks" TO "anon";
GRANT ALL ON TABLE "public"."aiDocumentChunks" TO "authenticated";
GRANT ALL ON TABLE "public"."aiDocumentChunks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."aiDocumentChunks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."aiDocumentChunks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."aiDocumentChunks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."aiDocumentJobs" TO "anon";
GRANT ALL ON TABLE "public"."aiDocumentJobs" TO "authenticated";
GRANT ALL ON TABLE "public"."aiDocumentJobs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."aiDocumentJobs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."aiDocumentJobs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."aiDocumentJobs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."aiMemories" TO "anon";
GRANT ALL ON TABLE "public"."aiMemories" TO "authenticated";
GRANT ALL ON TABLE "public"."aiMemories" TO "service_role";



GRANT ALL ON SEQUENCE "public"."aiMemories_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."aiMemories_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."aiMemories_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."aiMessageFeedback" TO "anon";
GRANT ALL ON TABLE "public"."aiMessageFeedback" TO "authenticated";
GRANT ALL ON TABLE "public"."aiMessageFeedback" TO "service_role";



GRANT ALL ON SEQUENCE "public"."aiMessageFeedback_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."aiMessageFeedback_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."aiMessageFeedback_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."aiMessages" TO "anon";
GRANT ALL ON TABLE "public"."aiMessages" TO "authenticated";
GRANT ALL ON TABLE "public"."aiMessages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."aiMessages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."aiMessages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."aiMessages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."aparelhosConfiaveis" TO "anon";
GRANT ALL ON TABLE "public"."aparelhosConfiaveis" TO "authenticated";
GRANT ALL ON TABLE "public"."aparelhosConfiaveis" TO "service_role";



GRANT ALL ON SEQUENCE "public"."aparelhosConfiaveis_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."aparelhosConfiaveis_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."aparelhosConfiaveis_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."appointmentParticipants" TO "anon";
GRANT ALL ON TABLE "public"."appointmentParticipants" TO "authenticated";
GRANT ALL ON TABLE "public"."appointmentParticipants" TO "service_role";



GRANT ALL ON SEQUENCE "public"."appointmentParticipants_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."appointmentParticipants_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."appointmentParticipants_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."appointments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."appointments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."appointments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."assinaturas" TO "anon";
GRANT ALL ON TABLE "public"."assinaturas" TO "authenticated";
GRANT ALL ON TABLE "public"."assinaturas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."assinaturas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."assinaturas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."assinaturas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."chatMessages" TO "anon";
GRANT ALL ON TABLE "public"."chatMessages" TO "authenticated";
GRANT ALL ON TABLE "public"."chatMessages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."chatMessages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."chatMessages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."chatMessages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."codigosDeAparelho" TO "anon";
GRANT ALL ON TABLE "public"."codigosDeAparelho" TO "authenticated";
GRANT ALL ON TABLE "public"."codigosDeAparelho" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON SEQUENCE "public"."documents_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."documents_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."documents_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."notifications_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."patients" TO "anon";
GRANT ALL ON TABLE "public"."patients" TO "authenticated";
GRANT ALL ON TABLE "public"."patients" TO "service_role";



GRANT ALL ON SEQUENCE "public"."patients_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."patients_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."patients_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."sessionNotes" TO "anon";
GRANT ALL ON TABLE "public"."sessionNotes" TO "authenticated";
GRANT ALL ON TABLE "public"."sessionNotes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sessionNotes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sessionNotes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sessionNotes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."sessions" TO "anon";
GRANT ALL ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sessions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sessions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sessions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."therapistRequests" TO "anon";
GRANT ALL ON TABLE "public"."therapistRequests" TO "authenticated";
GRANT ALL ON TABLE "public"."therapistRequests" TO "service_role";



GRANT ALL ON SEQUENCE "public"."therapistRequests_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."therapistRequests_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."therapistRequests_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."therapists" TO "anon";
GRANT ALL ON TABLE "public"."therapists" TO "authenticated";
GRANT ALL ON TABLE "public"."therapists" TO "service_role";



GRANT ALL ON SEQUENCE "public"."therapists_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."therapists_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."therapists_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON SEQUENCE "public"."users_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."users_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."users_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."videoCalls" TO "anon";
GRANT ALL ON TABLE "public"."videoCalls" TO "authenticated";
GRANT ALL ON TABLE "public"."videoCalls" TO "service_role";



GRANT ALL ON SEQUENCE "public"."videoCalls_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."videoCalls_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."videoCalls_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







