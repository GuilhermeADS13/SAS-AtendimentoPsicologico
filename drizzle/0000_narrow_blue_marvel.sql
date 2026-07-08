CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('prescription', 'report', 'exam', 'attachment', 'other');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('appointment_reminder', 'appointment_confirmation', 'appointment_cancelled', 'new_appointment');--> statement-breakpoint
CREATE TYPE "public"."patient_status" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."recipient_type" AS ENUM('therapist', 'patient');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin', 'therapist', 'patient');--> statement-breakpoint
CREATE TYPE "public"."video_call_status" AS ENUM('waiting', 'active', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"therapistId" integer NOT NULL,
	"patientId" integer NOT NULL,
	"scheduledAt" timestamp with time zone NOT NULL,
	"duration" integer DEFAULT 60 NOT NULL,
	"status" "appointment_status" DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"patientId" integer NOT NULL,
	"therapistId" integer NOT NULL,
	"sessionId" integer,
	"fileName" varchar(256) NOT NULL,
	"fileKey" varchar(512) NOT NULL,
	"fileUrl" text NOT NULL,
	"fileType" varchar(50) NOT NULL,
	"fileSize" integer NOT NULL,
	"documentType" "document_type" DEFAULT 'other' NOT NULL,
	"description" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"appointmentId" integer NOT NULL,
	"recipientType" "recipient_type" NOT NULL,
	"recipientEmail" varchar(320) NOT NULL,
	"notificationType" "notification_type" NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"sentAt" timestamp with time zone,
	"errorMessage" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" serial PRIMARY KEY NOT NULL,
	"therapistId" integer NOT NULL,
	"firstName" varchar(128) NOT NULL,
	"lastName" varchar(128) NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(20),
	"dateOfBirth" timestamp with time zone,
	"address" text,
	"medicalHistory" text,
	"emergencyContact" varchar(128),
	"emergencyPhone" varchar(20),
	"status" "patient_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessionNotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"sessionId" integer NOT NULL,
	"appointmentId" integer NOT NULL,
	"patientId" integer NOT NULL,
	"therapistId" integer NOT NULL,
	"notes" text NOT NULL,
	"savedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"appointmentId" integer NOT NULL,
	"patientId" integer NOT NULL,
	"therapistId" integer NOT NULL,
	"startedAt" timestamp with time zone NOT NULL,
	"endedAt" timestamp with time zone,
	"clinicalNotes" text,
	"treatment" text,
	"nextSteps" text,
	"mood" varchar(50),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "therapists" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"crp" varchar(64) NOT NULL,
	"specialties" text,
	"bio" text,
	"photoUrl" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "therapists_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "videoCalls" (
	"id" serial PRIMARY KEY NOT NULL,
	"sessionId" integer,
	"appointmentId" integer NOT NULL,
	"therapistId" integer NOT NULL,
	"patientId" integer NOT NULL,
	"roomId" varchar(256) NOT NULL,
	"startedAt" timestamp with time zone NOT NULL,
	"endedAt" timestamp with time zone,
	"duration" integer,
	"recordingUrl" text,
	"status" "video_call_status" DEFAULT 'waiting' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "videoCalls_roomId_unique" UNIQUE("roomId")
);
