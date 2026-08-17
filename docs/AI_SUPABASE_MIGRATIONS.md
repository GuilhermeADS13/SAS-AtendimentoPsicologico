# Luma: configuração segura e migrações no Supabase

Este procedimento aplica as migrações `0018_ai_conversation_compatibility.sql`, `0019_ai_message_idempotency.sql`, `0016_ai_message_feedback.sql` e `0017_ai_memory_audit.sql` no banco PostgreSQL do Supabase sem colocar credenciais no Git, no frontend ou nos logs de CI. A migração `0018` garante as tabelas e colunas usadas pelo histórico da Luma, inclusive em ambientes que não aplicaram a migração base `0013`. A `0019` adiciona chaves idempotentes para que retries não dupliquem conversas ou mensagens.

> Nunca use `VITE_` para segredos. Variáveis com esse prefixo podem ser incorporadas ao bundle público do frontend.

## 1. Variáveis necessárias

A aplicação usa `DATABASE_URL` para o backend e para as ferramentas Drizzle. As variáveis devem existir somente no ambiente correspondente:

| Variável | Onde pode existir | Observação |
|---|---|---|
| `DATABASE_URL` | Backend, job de migração e CI protegido | URL PostgreSQL privada do Supabase; nunca no código ou em `VITE_*` |
| `LLM_BASE_URL` | Backend | Endpoint OpenAI-compatible do Ollama/vLLM/LM Studio/LiteLLM |
| `LLM_API_KEY` | Backend | Chave do gateway/model server; não enviar ao navegador |
| `LLM_MODEL` | Backend | Nome do modelo open source aprovado |
| `LLM_TEMPERATURE` | Backend | Parâmetro operacional do modelo |
| `LLM_MAX_TOKENS` | Backend | Limite máximo de saída |
| `JWT_SECRET` | Backend | Segredo usado pela autenticação da aplicação |
| `VITE_*` | Frontend | Somente valores públicos, como URL pública da aplicação |

Para desenvolvimento local, crie `.env.local`, que já deve estar no `.gitignore`:

```dotenv
DATABASE_URL=postgresql://postgres.<PROJECT_REF>:<PASSWORD>@<POOLER_HOST>:5432/postgres
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=qwen3:8b
LLM_TEMPERATURE=0.2
LLM_MAX_TOKENS=800
```

Substitua os valores reais localmente. Não cole a senha em issues, pull requests, mensagens ou arquivos versionados. Se a senha contiver caracteres reservados em uma URL, faça URL encoding ou gere uma nova senha no Supabase.

As flags operacionais da Luma também devem ser privadas no backend:

```dotenv
AI_AGENT_ENABLED=true
AI_RAG_ENABLED=true
AI_CLINICAL_TOOLS_ENABLED=true
AI_OCR_MIN_CONFIDENCE=75
```

Defina `AI_AGENT_ENABLED=false` para acionar o kill switch sem novo deploy; `AI_RAG_ENABLED=false` para impedir buscas em prontuários; e `AI_CLINICAL_TOOLS_ENABLED=false` para desabilitar ferramentas de leitura.

## 2. Escolha da conexão

Para o servidor em produção, use a conexão recomendada pelo Supabase para o runtime da aplicação. Para uma operação de DDL/migração, prefira uma conexão de sessão/direta compatível com a ferramenta usada. O pooler de transações pode impor limitações a prepared statements e a operações administrativas.

A separação recomendada é:

| Uso | Conexão sugerida | Motivo |
|---|---|---|
| Runtime da API | Pooler do Supabase conforme a hospedagem | Reduz problemas com limite de conexões |
| Migração SQL/Drizzle | Conexão de sessão ou direta, em job administrativo temporário | DDL mais previsível e auditável |
| Frontend | Nenhuma `DATABASE_URL` | O navegador nunca deve acessar o PostgreSQL diretamente |

Use a porta e o host exibidos no painel **Supabase → Connect** para o método escolhido. Não reutilize uma URL copiada de outro projeto.

## 3. Preparação segura

Antes de aplicar a migração:

1. Confirme o projeto, a região e o ambiente no painel Supabase.
2. Faça backup ou confirme que o mecanismo de backup do projeto está operacional.
3. Verifique que a aplicação não está executando uma migração concorrente.
4. Rode `pnpm check` e `pnpm test` no commit que será implantado.
5. Faça uma conexão de leitura para conferir o alvo, sem imprimir a senha:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c 'select current_database(), current_user, current_schema();'
```

A saída deve ser revisada antes da aplicação. Nunca use `set -x` no shell nem imprima a URL completa.

## 4. Aplicação das migrações

As migrações são idempotentes para enums, tabelas e índices. A forma recomendada de aplicá-las é pelo script protegido do repositório:

```bash
cd /caminho/SAS-AtendimentoPsicologico
export DATABASE_URL='postgresql://...valor-fornecido-pelo-segredo...'
pnpm db:migrate:supabase
```

É preferível não escrever a URL diretamente no histórico do shell. Em um job seguro, injete `DATABASE_URL` pelo gerenciador de segredos e execute:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f drizzle/migrations/0016_ai_message_feedback.sql
```

Se o projeto passar a usar o journal completo do Drizzle para todas as migrações, a operação normal será:

```bash
pnpm drizzle-kit migrate
```

Como a migração `0016` foi criada manualmente enquanto o ambiente sem `DATABASE_URL` não conseguia gerar o journal, confirme no ambiente de implantação como o histórico de migrações é mantido antes de usar `drizzle-kit migrate`. Não aplique a mesma alteração duas vezes por caminhos diferentes sem verificar o estado.

## 5. Verificação pós-migração

Execute consultas de metadados, sem retornar conteúdo clínico:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
select to_regclass('public."aiMessageFeedback"') as feedback_table;
select to_regclass('public."aiMemories"') as memories_table;
select to_regclass('public."aiAuditEvents"') as audit_table;
select typname from pg_type where typname in ('ai_feedback_rating', 'ai_memory_scope');
select indexname
from pg_indexes
where tablename = 'aiMessageFeedback'
order by indexname;
SQL
```

O resultado esperado é a tabela `aiConversations`, a tabela `aiMessages`, a tabela `aiMessageFeedback`, as tabelas `aiMemories` e `aiAuditEvents`, os enums `ai_conversation_status`, `ai_message_role`, `ai_feedback_rating` e `ai_memory_scope`, as colunas `clientRequestId` em `aiConversations` e `aiMessages`, além dos índices:

- `ai_conversations_user_status_idx`
- `ai_conversations_user_request_idx`
- `ai_conversations_clinical_scope_idx`
- `ai_messages_conversation_created_idx`
- `ai_messages_conversation_request_idx`
- `ai_message_feedback_message_user_unique`
- `ai_message_feedback_user_created_idx`
- `ai_memories_user_status_idx`
- `ai_memories_scope_lookup_idx`
- `ai_audit_events_user_created_idx`
- `ai_audit_events_conversation_idx`

Não execute consultas de validação que listem `comment`, prontuário, prompts ou respostas clínicas em logs de CI.

## 6. Rollback e incidentes

A migração cria uma tabela nova e não altera as tabelas de prontuário. Em caso de falha parcial, preserve os logs sem segredos, pare a implantação e verifique o estado no catálogo PostgreSQL. Não remova a tabela automaticamente durante um incidente clínico.

Se for realmente necessário reverter antes de haver dados de produção, a operação administrativa pode ser avaliada por uma pessoa responsável pelo banco. Antes de qualquer `DROP`, faça backup e confirme o impacto sobre auditoria e avaliações profissionais. A remoção automática de feedback não faz parte do deploy normal.

Se uma credencial for exposta, revogue-a imediatamente no Supabase ou no provedor correspondente, gere uma nova e atualize somente os ambientes protegidos. Depois, revise logs, CI, histórico Git e variáveis do provedor.

## 7. Configuração no provedor de deploy

No provedor que executa o backend, cadastre `DATABASE_URL`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_TEMPERATURE`, `LLM_MAX_TOKENS`, `JWT_SECRET`, `AI_AGENT_ENABLED`, `AI_RAG_ENABLED`, `AI_CLINICAL_TOOLS_ENABLED` e `AI_OCR_MIN_CONFIDENCE` como variáveis privadas. Não configure `DATABASE_URL` no projeto frontend nem em variáveis públicas.

Faça a migração em um job administrativo separado do processo que serve o frontend. Depois, reinicie o backend para garantir que o novo código e o schema estejam sincronizados.

## Referências

- [Supabase — Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase — Database backups](https://supabase.com/docs/guides/platform/backups)
- [Drizzle Kit — Migrate](https://orm.drizzle.team/docs/drizzle-kit-migrate)
