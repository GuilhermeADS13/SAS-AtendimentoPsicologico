ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "paymentUpdatedBy" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_payment_updated_by_users_id_fk'
  ) THEN
    ALTER TABLE "appointments"
      ADD CONSTRAINT "appointments_payment_updated_by_users_id_fk"
      FOREIGN KEY ("paymentUpdatedBy") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "appointments_payment_updated_by_idx"
  ON "appointments" ("paymentUpdatedBy");
