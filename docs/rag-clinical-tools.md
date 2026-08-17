# RAG clínico e ferramentas de leitura

## Arquitetura de segurança

O fluxo usa duas barreiras. Primeiro, a aplicação consulta o PostgreSQL com o usuário autenticado e limita as linhas por `therapistId`, `patientId` ou `userId`. Somente depois dessa consulta os registros autorizados viram `Document` do LlamaIndex.TS e entram no índice vetorial temporário. Portanto, a similaridade semântica nunca decide se alguém pode acessar um prontuário; ela apenas ordena registros que já passaram pela autorização.

O retriever atual cobre o histórico informado do paciente, sessões e metadados/descrições dos documentos. A tabela `documents` mantém os arquivos no Storage privado e não guarda o texto extraído. Por isso, esta implementação não envia `fileUrl`, `fileKey` ou qualquer URL privada ao modelo. Para incluir o conteúdo de PDF/DOCX no RAG, será necessário criar um pipeline separado de download autorizado, extração, divisão em chunks e persistência dos embeddings.

## Configuração de embeddings

O adapter `OpenAICompatibleEmbedding` chama o endpoint `/embeddings` de um servidor compatível. Use um modelo de embeddings open source, como `nomic-embed-text` no Ollama ou outro modelo publicado pelo vLLM/LM Studio/LiteLLM.

```env
LLM_EMBEDDING_BASE_URL=http://localhost:11434/v1
LLM_EMBEDDING_MODEL=nomic-embed-text
```

Quando `LLM_EMBEDDING_BASE_URL` não é definido, o retriever reutiliza `LLM_BASE_URL`. A indexação temporária por requisição é adequada ao primeiro MVP e evita compartilhar vetores entre prontuários. Em produção, a próxima evolução deve usar pgvector com metadados e filtros SQL equivalentes, mantendo a autorização antes da consulta vetorial.

## Ferramentas clínicas disponíveis

| Ferramenta | Público | Ação | Dados retornados |
|---|---|---|---|
| `get_my_appointments` / `get_patient_appointments` | Paciente ou terapeuta | Leitura | Agenda, duração, status e confirmação |
| `get_my_sessions` / `get_patient_sessions` | Paciente ou terapeuta | Leitura | Sessões, humor, notas clínicas, tratamento e próximos passos já registrados |
| `get_my_documents` / `get_patient_documents` | Paciente ou terapeuta | Leitura | Nome, tipo, descrição e data; nunca URL privada ou chave do Storage |
| `search_my_records` / `search_patient_records` | Paciente ou terapeuta | Leitura semântica | Trechos autorizados de paciente, sessões e descrições de documentos |

O agente não possui ferramentas para criar, editar, excluir ou marcar prontuários, alterar agenda, enviar mensagens, baixar arquivos, prescrever ou fazer diagnóstico. Toda solicitação que envolver decisão clínica deve ser encaminhada à psicóloga responsável.

## Integração

A procedure protegida `ai.chat` resolve o contexto clínico do usuário no banco, aceita opcionalmente `patientId` para a terapeuta selecionada e inicia um agente LangChain com as ferramentas acima. O modelo escolhe a ferramenta somente quando necessário; cada ferramenta repete a validação de escopo antes da leitura. O prompt de sistema é criado no backend e proíbe diagnóstico, prescrição, exposição de segredos e alterações de prontuário.

A busca RAG deve ser usada como apoio para localizar registros existentes, não como fonte autônoma de verdade clínica. A resposta deve citar que veio de um registro e a profissional deve revisar qualquer resumo antes de usá-lo em atendimento.

## Referências

[1]: https://developers.llamaindex.ai/typescript/framework/ "LlamaIndex.TS — framework oficial"

[2]: https://developers.llamaindex.ai/typescript/framework/tutorials/rag/ "LlamaIndex.TS — tutorial oficial de RAG"

[3]: https://docs.langchain.com/oss/javascript/langchain/overview "LangChain.js — agentes e ferramentas"
