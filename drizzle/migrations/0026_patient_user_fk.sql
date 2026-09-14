-- Foreign key de patients.userId -> users.id.
--
-- ON DELETE SET NULL (nunca CASCADE): se a conta de acesso (users) for removida,
-- o paciente é DESVINCULADO (userId vira null), mas a linha do paciente e o
-- prontuario FICAM — a guarda clinica e obrigatoria por 5 anos. Voltar a userId
-- null e um estado ja valido (paciente cadastrado pela psicologa, sem conta).
--
-- Guardada por idempotencia: pode rodar de novo sem erro.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patients_userId_users_id_fk'
  ) THEN
    ALTER TABLE "patients"
      ADD CONSTRAINT "patients_userId_users_id_fk"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
