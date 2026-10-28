# Operação de produção, observabilidade e E2E do agente

## Testes E2E

O Playwright usa uma rota `__e2e__/agent-chat` disponível somente quando `VITE_E2E=true`. A página monta o mesmo `AIChatBox` utilizado pelo produto e chama o mesmo contrato HTTP do `ai.chat`. Os testes interceptam a resposta tRPC para tornar o teste determinístico, sem enviar prontuários reais ou depender de um modelo externo.

Execute:

```bash
pnpm test:e2e
```

O conjunto valida envio por Enter, estado de carregamento, renderização da resposta Markdown, preservação da pergunta quando o serviço falha, exibição de fonte autorizada e ausência de credenciais no payload. Em CI, o teste deve rodar com dados sintéticos e nunca com documentos clínicos reais.

O próximo nível de cobertura é um ambiente de staging com usuário de teste, banco isolado, documento sintético e servidor de embeddings fake. Nesse cenário, o teste pode validar de ponta a ponta a criação da conversa, chamada do retriever, aplicação de `therapistId`/`patientId` e resposta final sem usar dados de produção.

## Referências

[1]: https://playwright.dev/docs/test-intro "Playwright Test — documentação oficial"

[2]: https://supabase.com/docs/guides/functions "Supabase Edge Functions — documentação oficial"

[3]: https://supabase.com/docs/guides/database/extensions/pgvector "Supabase pgvector — documentação oficial"
