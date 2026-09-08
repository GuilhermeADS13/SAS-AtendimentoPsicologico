-- Responsável legal do paciente menor de idade (LGPD art. 14).
--
-- Pacientes menores de 18 só podem ter dados tratados com o consentimento de um
-- dos pais/responsável. Estas colunas registram quem é o responsável e quando a
-- psicóloga confirmou ter obtido esse consentimento. Preenchidas pela tela de
-- edição do paciente quando a data de nascimento indica menor.
--
-- Colunas NULAS e aditivas: no Postgres é instantâneo e não toca em linha
-- existente. Pacientes já cadastrados ficam com NULL (a UI cobra o preenchimento
-- quando o paciente é menor).

ALTER TABLE "patients"
  ADD COLUMN IF NOT EXISTS "guardianName" varchar(128),
  ADD COLUMN IF NOT EXISTS "guardianConsentAt" timestamp with time zone;
