-- Modelo de contrato terapêutico da psicóloga: texto com campos {{assim}}, enviado
-- em PDF/DOCX ou digitado. Só o texto é guardado. Nulo = usa o modelo padrão.
ALTER TABLE "therapists" ADD COLUMN IF NOT EXISTS "contratoModelo" text;
ALTER TABLE "therapists" ADD COLUMN IF NOT EXISTS "contratoModeloNome" varchar(256);
