-- Editar e apagar mensagem para todos (como no WhatsApp). Só as PRÓPRIAS
-- mensagens: editar até 15 min depois do envio, apagar até 2 dias depois.
-- "editedAt" mostra o "Editada"; "deletedAt" mostra "Mensagem apagada" (o texto e
-- o anexo são limpos na hora — apagar para todos não guarda o original).
-- Colunas aditivas, nulas, seguras de reaplicar.
ALTER TABLE "chatMessages" ADD COLUMN IF NOT EXISTS "editedAt" timestamptz;
ALTER TABLE "chatMessages" ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz;
