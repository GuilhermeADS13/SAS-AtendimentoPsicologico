-- Limite do bucket `documents` (anexos do chat, documentos do prontuario,
-- modelo de prontuario): 20 MB e so os tipos de shared/arquivosPermitidos.ts.
-- Antes: sem limite de tamanho nem de tipo -- quem chamasse o Storage direto,
-- pulando a tela, subia arquivo de qualquer tamanho (cota) ou tipo (HTML/SVG
-- com codigo, executavel). A tela confere a mesma lista antes de enviar.
update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet', 'application/rtf', 'text/rtf', 'text/plain', 'text/csv', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/wav', 'audio/webm']
where id = 'documents';
