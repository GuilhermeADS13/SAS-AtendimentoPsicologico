# Pesquisa para RAG com LlamaIndex.TS

## Fontes oficiais

- LlamaIndex.TS overview: https://developers.llamaindex.ai/typescript/framework/
  - O framework é voltado a context engineering em JavaScript/TypeScript, suporta Node.js, conectores, índices, retrievers, agentes, workflows e observabilidade.
- LlamaIndex.TS RAG tutorial: https://developers.llamaindex.ai/typescript/framework/tutorials/rag/
  - O padrão oficial indexa Documents, cria embeddings, usa índice vetorial e consulta os trechos recuperados como contexto do LLM.
- LangChain.js overview: https://docs.langchain.com/oss/javascript/langchain/overview
  - `create_agent` combina modelo, ferramentas, prompt e middleware; há integração com Ollama e múltiplos provedores.
- AI SDK providers: https://ai-sdk.dev/docs/foundations/providers-and-models
  - Providers self-hosted que seguem a especificação OpenAI podem ser usados pelo provider OpenAI-compatible.

## Decisão de implementação

- Usar LlamaIndex.TS como camada de indexação/retrieval.
- Não confiar em filtro de similaridade para autorização: buscar primeiro no banco com `userId`, `therapistId`, `patientId` e somente então construir Documents do LlamaIndex.
- Os documentos clínicos do projeto estão em storage privado e a tabela `documents` guarda metadados, portanto a primeira etapa indexa os campos clínicos já disponíveis e descrições autorizadas; o conteúdo de arquivos exige um pipeline de extração separado.
- Ferramentas do agente serão somente leitura: agenda do usuário, perfil do paciente próprio, sessões autorizadas, documentos autorizados e busca RAG escopada. Nenhuma ferramenta de escrita ou alteração de prontuário será exposta.
