ALTER TABLE "appointments" ADD COLUMN "price" integer;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "paidAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "therapists" ADD COLUMN "sessionPrice" integer;