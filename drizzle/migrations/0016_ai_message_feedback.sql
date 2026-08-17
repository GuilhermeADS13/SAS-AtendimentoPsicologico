DO $$ BEGIN
  CREATE TYPE "public"."ai_feedback_rating" AS ENUM('helpful', 'not_helpful');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "aiMessageFeedback" (
  "id" serial PRIMARY KEY NOT NULL,
  "messageId" integer NOT NULL,
  "userId" integer NOT NULL,
  "rating" "public"."ai_feedback_rating" NOT NULL,
  "reason" varchar(80),
  "comment" varchar(500),
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_message_feedback_message_user_unique"
  ON "aiMessageFeedback" ("messageId", "userId");

CREATE INDEX IF NOT EXISTS "ai_message_feedback_user_created_idx"
  ON "aiMessageFeedback" ("userId", "createdAt");
