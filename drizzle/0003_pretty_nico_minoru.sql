CREATE TYPE "public"."therapist_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "therapistRequests" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"fullName" varchar(256) NOT NULL,
	"crp" varchar(32) NOT NULL,
	"email" varchar(320),
	"message" text,
	"status" "therapist_request_status" DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewedAt" timestamp with time zone,
	CONSTRAINT "therapistRequests_userId_unique" UNIQUE("userId")
);
