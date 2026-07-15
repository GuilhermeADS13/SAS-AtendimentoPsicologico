ALTER TABLE "patients" ADD COLUMN "userId" integer;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_userId_unique" UNIQUE("userId");