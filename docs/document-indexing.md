# Indexação segura de PDFs e DOCX

## Visão geral

O sistema agora extrai texto de arquivos privados do bucket `documents`, divide o conteúdo em trechos e gera embeddings usando o endpoint configurado em `LLM_EMBEDDING_BASE_URL`. Os vetores são persistidos na tabela `aiDocumentChunks` com dimensão fixa de 768, compatível com `nomic-embed-text` por padrão.

A extração acontece exclusivamente no backend. O navegador envia o arquivo ao Storage e registra os metadados; a procedure protegida `documents.indexContent` resolve o escopo do terapeuta autenticado antes de baixar o arquivo. A chave `SUPABASE_SERVICE_ROLE_KEY` nunca deve ser exposta em variáveis `VITE_*`.

## Pipeline

| Etapa | Regra implementada |
|---|---|
| Download | Bucket privado `documents`, por `fileKey`, usando service role somente no servidor |
| Formatos | PDF e DOCX; outros formatos são recusados |
| Limite | 25 MB por arquivo |
| Normalização | Remove caracteres nulos, espaços inconsistentes e linhas vazias excessivas |
| Chunking | 1.800 caracteres por trecho com 250 caracteres de sobreposição |
| Embeddings | Endpoint OpenAI-compatible configurado no servidor |
| Persistência | Texto, hash SHA-256, página, escopo clínico e vetor em `aiDocumentChunks` |
| Busca | Similaridade de cosseno com índice HNSW e filtros SQL por terapeuta/paciente |

O conteúdo é apagado e reindexado em caso de nova indexação do mesmo documento. O hash permite, em uma evolução futura, evitar reprocessamento quando o conteúdo não mudou.

## Configuração

```env
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
LLM_EMBEDDING_BASE_URL=http://localhost:11434/v1
LLM_EMBEDDING_MODEL=nomic-embed-text
LLM_API_KEY=ollama
AI_EMBEDDING_DIMENSIONS=768
```

A extensão deve ser habilitada pelo migration `drizzle/0014_rare_kate_bishop.sql`. Em um ambiente Supabase, execute as migrations pelo fluxo oficial do projeto ou aplique o SQL com uma role que tenha permissão para `CREATE EXTENSION vector`.

## Fluxo de uso

Depois de `documents.create`, o frontend chama `documents.indexContent` com o `documentId` retornado. Se o servidor de embeddings estiver indisponível, o upload permanece válido e a interface informa que a indexação está pendente. A procedure pode ser chamada novamente por uma tela administrativa/terapêutica de reprocessamento, sempre mantendo a autorização no servidor.

A busca das ferramentas `search_patient_records` e `search_my_records` usa os chunks do pgvector. A aplicação filtra primeiro pelo escopo clínico e só depois ordena por distância vetorial. O agente não recebe URLs privadas, chaves de Storage ou chunks de outro paciente.

## Limitações e próximos passos

PDFs escaneados que não possuem camada de texto retornarão texto vazio; OCR deve ser implementado como uma etapa separada, com revisão de precisão e controles adicionais para documentos sensíveis. A indexação atual é síncrona após o upload. Para produção em maior escala, recomenda-se uma fila idempotente com status `pending`, `processing`, `indexed` e `failed`, além de criptografia/gestão de segredos e política de retenção alinhada à governança de dados de saúde.

Este índice serve para recuperação assistida e não para diagnóstico. Qualquer interpretação clínica consequencial deve permanecer sob revisão do profissional responsável.
