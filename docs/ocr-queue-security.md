# OCR, fila assíncrona e segurança da indexação

## OCR de PDFs escaneados

A extração tenta primeiro obter a camada textual com `pdf-parse`. Quando nenhuma página produz texto, o pipeline renderiza as páginas com `PDFParse.getScreenshot` e executa OCR com `tesseract.js` usando o idioma português (`por`). Os chunks resultantes preservam o número da página e registram `pdf-parse+tesseract-ocr` como extrator.

O OCR é executado exclusivamente no worker do backend. O arquivo é baixado do bucket privado, processado em memória e não é enviado a serviço externo. PDFs com texto continuam seguindo o caminho mais barato e rápido, sem OCR.

PDFs escaneados com baixa qualidade, rotação, manuscritos ou tabelas complexas podem exigir revisão humana. O pipeline não transforma OCR em verdade clínica; o agente deve tratar o conteúdo como fonte documental e indicar a página quando possível.

## Fila assíncrona e idempotente

A tabela `aiDocumentJobs` possui uma linha única por `documentId`. O estado é um dos seguintes:

| Estado | Significado |
|---|---|
| `pending` | Aguardando processamento ou nova tentativa |
| `processing` | Reservado por um worker; possui `lockedAt` e `lockedBy` |
| `indexed` | OCR/extração, chunking e embeddings concluídos |
| `failed` | Excedeu `maxAttempts` e exige inspeção/reprocessamento |

A função `enqueueDocumentIndexing` usa conflito na chave única do documento. Reenviar o mesmo documento não cria jobs duplicados. O worker reserva o próximo job usando `FOR UPDATE SKIP LOCKED`; locks com mais de 15 minutos podem ser recuperados por outro worker. Falhas voltam a `pending` com backoff limitado e passam para `failed` após cinco tentativas.

Execute o worker em um processo persistente:

```bash
pnpm ai:worker
```

Para uma execução única, útil em cron ou em uma fila externa:

```bash
AI_WORKER_ONCE=1 pnpm ai:worker
```

A aplicação web apenas enfileira o documento por `documents.indexContent`. O processo do worker deve possuir acesso ao banco, ao bucket privado e ao endpoint de embeddings. No Supabase, aplique a migration antes de iniciar o worker. Para produção, recomenda-se executar o worker em um serviço persistente ou em uma tarefa agendada que invoque o modo `AI_WORKER_ONCE=1`; o worker não deve depender de uma requisição HTTP aberta.

## Segurança dos filtros vetoriais

A função `buildVectorSearchScope` é executada antes da busca no pgvector. Para terapeutas, a consulta exige simultaneamente `therapistId` resolvido pelo servidor e `patientId` validado. Para pacientes, o `patientId` precisa ser exatamente o vínculo do usuário autenticado. Administradores não recebem acesso clínico implícito pelo agente.

Os testes `server/vectorSecurity.test.ts` verificam que a SQL gerada contém ambos os predicados para terapeutas, rejeita terapeuta sem paciente, impede paciente de consultar outro paciente e bloqueia administradores. Esses testes são complementares à autorização real no banco; nunca devem ser substituídos por filtragem apenas no frontend.

## Variáveis relevantes

```env
AI_WORKER_POLL_INTERVAL_MS=3000
LLM_EMBEDDING_BASE_URL=http://localhost:11434/v1
LLM_EMBEDDING_MODEL=nomic-embed-text
LLM_API_KEY=ollama
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

A chave de service role e as credenciais de embeddings são server-side. Nenhuma delas pode ser incluída em variáveis com prefixo `VITE_` ou retornada ao navegador.

## Operação e retenção

Jobs com erro devem ser observados por `status`, `attempts`, `lastError` e `updatedAt`. Como o conteúdo de saúde é sensível, logs não devem incluir texto extraído, prompts, respostas ou vetores. A política de retenção de chunks, jobs e documentos deve ser alinhada à finalidade clínica e às regras internas de governança e privacidade.
