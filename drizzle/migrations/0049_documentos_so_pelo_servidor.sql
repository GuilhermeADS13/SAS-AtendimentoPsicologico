-- Rodar SÓ DEPOIS do deploy que baixa e apaga documentos pelo servidor.
-- Sem estas políticas, a conta não lê nem apaga arquivos direto no Supabase: tudo
-- passa pelo servidor, que exige o aparelho verificado. Sem isso, quem tivesse só
-- a senha baixaria os documentos sem passar pelo código. O envio segue direto
-- (política de INSERT mantida), e as fotos de perfil não mudam.
DROP POLICY IF EXISTS "documents owner select" ON storage.objects;
DROP POLICY IF EXISTS "documents owner delete" ON storage.objects;
