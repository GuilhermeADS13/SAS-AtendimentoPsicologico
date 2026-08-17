# Operação de produção, observabilidade e E2E do agente

## Worker OCR em produção

O worker é um processo Node persistente e deve executar fora do processo HTTP principal. O template `ops/systemd/sas-ai-worker.service` usa um usuário sem privilégios, reinicia automaticamente, limita memória e bloqueia acesso desnecessário ao sistema de arquivos.

Instalação em um servidor Ubuntu:

```bash
sudo useradd --system --home /opt/SAS-AtendimentoPsicologico --shell /usr/sbin/nologin sas-app
sudo mkdir -p /etc/sas-atendimento
sudo cp ops/systemd/sas-ai-worker.service /etc/systemd/system/sas-ai-worker.service
sudo cp .env.example /etc/sas-atendimento/ai-worker.env
sudo chown root:root /etc/sas-atendimento/ai-worker.env
sudo chmod 600 /etc/sas-atendimento/ai-worker.env
# Edite o arquivo e preencha Supabase, Storage e embeddings.
sudo systemctl daemon-reload
sudo systemctl enable --now sas-ai-worker
sudo systemctl status sas-ai-worker
journalctl -u sas-ai-worker -f
```

O diretório do projeto deve pertencer ao usuário `sas-app`, o banco deve estar com a migration `0015_small_sleepwalker.sql` aplicada e o servidor de embeddings deve estar acessível pelo worker. O processo não deve receber chaves no frontend.

Para ambientes sem systemd, execute `AI_WORKER_ONCE=1 pnpm ai:worker` em um Cron externo a cada minuto ou em um scheduler de container. O modo contínuo é preferível quando o volume de OCR é alto.

## Supabase Edge Functions e Cron

O worker completo não deve ser convertido automaticamente para Edge Function, porque OCR com Tesseract.js e processamento de PDFs pode exceder memória, tempo de execução ou compatibilidade do runtime Edge. A alternativa segura é manter o worker Node em um serviço persistente e usar o Supabase Cron apenas para acionar um endpoint interno de “drain” que processa um número pequeno de jobs.

Se a equipe optar por Edge Functions, a função deve somente reservar jobs idempotentemente e delegar o processamento pesado a um worker Node. Ela não deve aceitar `documentId` livre do cliente. O job deve ser reservado no PostgreSQL com lock e o processo deve verificar novamente o documento e seu escopo antes de baixar o arquivo.

## Métricas e alertas

O módulo `server/ai/queue-metrics.ts` coleta contagens por status, backlog, idade do job pendente mais antigo e idade do processamento mais antigo. O resultado também pode ser convertido para formato Prometheus. Administradores podem consultar `admin.queueMetrics`; pacientes e terapeutas não recebem esse endpoint.

| Métrica | Alerta sugerido | Ação |
|---|---:|---|
| `ai_document_jobs{status="pending"}` | Crescimento contínuo por 10 minutos | Aumentar workers ou verificar embeddings |
| `ai_document_queue_oldest_pending_age_seconds` | Acima de 900 segundos | Investigar gargalo e disponibilidade do worker |
| `ai_document_jobs{status="failed"}` | Acima de 3 | Inspecionar `lastError`, formato e OCR |
| Jobs `processing` antigos | Acima de 15 minutos | Confirmar restart/lock expirado |
| Latência de ingestão | P95 acima do SLA definido | Separar OCR, embeddings e Storage |
| Erro de embeddings | Taxa acima de 5% | Verificar endpoint/modelo/dimensão |
| OCR sem texto útil | Acima do baseline | Revisar qualidade dos PDFs e idioma |

Os logs são estruturados e não devem conter texto clínico, prompts, respostas, vetores ou URLs assinadas. O worker emite eventos `ai_queue_metrics`, `ai_queue_backlog_alert` e `ai_queue_failed_alert`. Esses eventos podem ser coletados por journald, Loki, CloudWatch, Grafana ou outro agregador.

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
