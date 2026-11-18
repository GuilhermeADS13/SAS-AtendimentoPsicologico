-- Code review de 2026-11-18. Segura de reaplicar.
--
-- 1) Índices das chaves estrangeiras que faltavam (o Supabase avisava): sem eles, apagar
--    um paciente ou uma consulta varre a lista de espera e os pedidos da busca inteiros.
CREATE INDEX IF NOT EXISTS "listaDeEspera_patientId_idx" ON "listaDeEspera" ("patientId");
CREATE INDEX IF NOT EXISTS "pedidosParaConhecer_patientId_idx" ON "pedidosParaConhecer" ("patientId");
CREATE INDEX IF NOT EXISTS "pedidosParaConhecer_appointmentId_idx" ON "pedidosParaConhecer" ("appointmentId");

-- 2) Fim do RAG. A Luma não lê documentos desde 2026-10-28 e as duas tabelas estavam
--    VAZIAS em 18/11 (conferido antes de apagar). A extensão vector só existia para a
--    coluna "embedding": saem as tabelas primeiro e depois a extensão, SEM cascade, para
--    o comando falhar se algum outro objeto ainda depender dela.
--    Aplicar DEPOIS do deploy do código que deixou de usar as tabelas (ver
--    documents.delete em server/routers.ts).
DROP TABLE IF EXISTS "aiDocumentChunks";
DROP TABLE IF EXISTS "aiDocumentJobs";
DROP TYPE IF EXISTS "aiDocumentProcessingStatus";
DROP EXTENSION IF EXISTS vector;
