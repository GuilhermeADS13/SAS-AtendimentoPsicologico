# Integração do LLM open source

## Decisão

A primeira integração usa **LangChain.js** com `@langchain/openai`. O pacote de integração fala a API OpenAI-compatible e, portanto, permite trocar entre Ollama, vLLM, LM Studio e LiteLLM sem alterar a procedure tRPC. A documentação oficial do LangChain.js descreve `create_agent`, ferramentas, middleware, interfaces padronizadas de modelos e integração com Ollama [1].

**LlamaIndex.TS** continua sendo uma alternativa forte quando a prioridade principal for ingestão, índices, retrievers e pipelines RAG. Sua documentação apresenta conectores, índices, retrievers, agentes, workflows e uso em Node.js/TypeScript [2]. Para este repositório, ele pode ser introduzido posteriormente na camada de ingestão/RAG, mas adicionar LangChain.js agora reduz o escopo do primeiro passo porque o chat já precisa de um adaptador de modelo e ferramentas protegidas.

O **AI SDK** também é uma alternativa válida para uma interface TypeScript unificada e declara suporte a provedores self-hosted que seguem a especificação OpenAI [3]. Ele é especialmente interessante para streaming e integração de interface, mas não é necessário para o primeiro adaptador server-side do SAS.

| Opção | Melhor uso no SAS | Decisão |
|---|---|---|
| LangChain.js + `@langchain/openai` | Agentes, ferramentas, middleware e troca de modelos OpenAI-compatible | Escolhida para o primeiro adaptador |
| LlamaIndex.TS | Indexação, retrievers e RAG orientado a documentos | Candidata para a próxima camada de ingestão |
| AI SDK | Streaming e experiência de chat no frontend | Alternativa para uma etapa posterior |

## Variáveis de ambiente

O servidor lê as seguintes variáveis. Os valores abaixo usam Ollama local com um modelo aberto, mas podem ser substituídos por um endpoint compatível:

```env
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=qwen3:8b
LLM_TEMPERATURE=0.2
LLM_MAX_TOKENS=800
```

Para vLLM, LM Studio ou LiteLLM, configure `LLM_BASE_URL` para a URL do serviço e `LLM_MODEL` para o identificador publicado pelo servidor. A chave deve existir apenas no ambiente do backend. Nunca envie `LLM_API_KEY` ao React, não coloque a chave em `VITE_*` e não aceite o nome do modelo vindo do cliente.

## Procedure protegida

A procedure `ai.chat` recebe no máximo 20 mensagens, cada uma com até 8.000 caracteres, e aceita apenas os papéis `user` e `assistant`. A mensagem `system` é criada exclusivamente no servidor, incluindo o papel do usuário autenticado e as restrições de segurança clínica. O modelo não recebe acesso direto ao banco, ao armazenamento ou a qualquer ferramenta destrutiva.

A resposta atual é um MVP de geração. A integração com as tabelas `aiConversations` e `aiMessages` deve ser adicionada na próxima etapa, depois que a autorização de conversa estiver conectada à procedure. O RAG também deve ser introduzido com filtros obrigatórios por usuário, terapeuta e paciente; não basta enviar documentos encontrados por similaridade sem validar o escopo.

## Execução local

Com Ollama instalado, publique um modelo compatível e mantenha o serviço escutando na porta padrão. Depois, preencha o `.env` com as variáveis acima, inicie o servidor e chame `ai.chat` pelo frontend. Se o backend estiver em Docker, `localhost` dentro do container não aponta para a máquina host; nesse caso, use o hostname da rede Docker ou um serviço separado.

## Referências

[1]: https://docs.langchain.com/oss/javascript/langchain/overview "LangChain.js — visão geral oficial"

[2]: https://developers.llamaindex.ai/typescript/framework/ "LlamaIndex.TS — framework oficial"

[3]: https://ai-sdk.dev/docs/foundations/providers-and-models "AI SDK — providers, modelos e self-hosted"
