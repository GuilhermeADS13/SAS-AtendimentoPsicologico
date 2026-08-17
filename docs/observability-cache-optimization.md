# Observabilidade e otimização do agente de IA

## Prometheus

A aplicação expõe `GET /metrics` em formato Prometheus. Em produção, configure `PROMETHEUS_METRICS_TOKEN` e monte o mesmo valor como arquivo secreto no Prometheus. O arquivo `ops/monitoring/prometheus.yml` fornece um exemplo de scrape a cada 15 segundos:

```yaml
scrape_configs:
  - job_name: sas-atendimento-ai
    metrics_path: /metrics
    static_configs:
      - targets: [sas-atendimento:3000]
    bearer_token_file: /etc/prometheus/secrets/sas-metrics-token
```

Nunca publique o token no repositório. Restrinja a porta de métricas à rede interna ou use um reverse proxy com TLS. O endpoint não expõe prontuários, prompts, respostas, embeddings, identificadores de pacientes ou URLs privadas.

As métricas de fila são `ai_document_jobs{status=...}`, `ai_document_queue_backlog`, `ai_document_queue_oldest_pending_age_seconds` e `ai_document_queue_oldest_processing_age_seconds`. O processo do agente também expõe contagens de requisições, erros, cache hit/miss e latência média.

## Grafana

Importe `ops/monitoring/grafana-dashboard.json` em um Grafana configurado com o datasource Prometheus. O dashboard contém backlog, jobs por status, idade do job mais antigo, taxa de requisições, erros, latência média e cache hit ratio. Configure alertas para backlog crescente, jobs pendentes acima do SLA, processing age acima do timeout do worker e aumento de erros.

## Cache

O cache implementado é um LRU em memória, com TTL e limite de entradas. Ele é deliberadamente desabilitado por padrão:

```env
AI_RESPONSE_CACHE_ENABLED=false
AI_RESPONSE_CACHE_TTL_SECONDS=60
AI_RESPONSE_CACHE_MAX_ENTRIES=500
AI_CACHE_VERSION=1
```

Para habilitá-lo, valide previamente a política de retenção. A chave inclui usuário, papel, terapeuta, paciente, modelo, temperatura e mensagens normalizadas. Isso impede que uma resposta de um paciente seja reutilizada em outro escopo. Como o cache é local ao processo, não há compartilhamento entre réplicas; para uma futura implementação Redis, mantenha a mesma chave, TTL curto, criptografia em trânsito e não persista conteúdo clínico por tempo maior que o necessário.

O cache não deve ser usado para respostas que dependem de dados que mudam rapidamente, ações de escrita ou avaliações clínicas. Nesta versão, o agente é somente leitura e a chave inclui a conversa, mas o TTL deve permanecer curto.

## Otimização de tokens e latência

O histórico é recortado para as mensagens mais recentes, preservando a primeira pergunta, com limites configuráveis:

```env
AI_AGENT_MAX_HISTORY_MESSAGES=8
AI_AGENT_MAX_MESSAGE_CHARS=4000
AI_AGENT_MAX_CONTEXT_CHARS=12000
AI_RAG_TOP_K=6
AI_RAG_MAX_TOP_K=8
AI_RAG_CONTEXT_MAX_CHARS=8000
```

A busca RAG limita `topK`, deduplica chunks iguais e limita o contexto antes de entregá-lo ao agente. O limite de saída continua controlado por `LLM_MAX_TOKENS`. Essas restrições reduzem custo e latência, mas devem ser avaliadas com um conjunto de perguntas clínicas sintéticas para evitar perda de contexto relevante.

Não é recomendado truncar silenciosamente uma decisão clínica importante. Quando os limites forem atingidos, o prompt deve orientar o agente a informar que a resposta pode exigir revisão da profissional, em vez de inventar ou completar dados ausentes.

## Alertas recomendados

Configure alertas de produção para: backlog acima do limite por mais de cinco minutos; idade do pending mais antigo acima do SLA; idade do processing mais antigo acima do tempo esperado de OCR; aumento de `ai_document_jobs{status="failed"}`; `rate(ai_agent_errors_total[5m])` acima do baseline; latência p95 do gateway acima do SLA; cache hit ratio anormalmente baixo; e ausência de scrape do worker ou da aplicação.
