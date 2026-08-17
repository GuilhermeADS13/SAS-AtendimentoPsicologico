# Modelo de dados seguro para memória e histórico do agente

As tabelas de IA foram separadas das tabelas clínicas para que o histórico possa ter política de retenção, auditoria e limpeza próprias. O identificador do usuário autenticado é obrigatório em todas as entidades. `therapistId` e `patientId` representam o escopo clínico e devem ser preenchidos somente quando a conversa ou memória tiver relação com atendimento.

| Tabela | Finalidade | Dados principais | Regra de segurança |
|---|---|---|---|
| `aiConversations` | Cabeçalho da conversa | Usuário, escopo clínico, status, modelo, retenção | Nunca buscar apenas por `id`; sempre combinar com `userId` e escopo autorizado |
| `aiMessages` | Histórico ordenado | Papel, conteúdo, tokens, timestamp | Carregar somente após autorizar a conversa; não guardar segredos em metadata |
| `aiMemories` | Memórias minimizadas | Escopo, tipo, conteúdo, expiração, status | Preferir preferências e resumos; evitar persistir detalhes clínicos desnecessários |
| `aiAuditEvents` | Rastreabilidade | Usuário, ação, recurso e metadata técnica | Não guardar prompt/resposta integral por padrão |

## Regras de acesso

Uma procedure deve receber o usuário do contexto autenticado e montar a consulta com esse usuário no servidor. Para pacientes, `patientId` deve ser o paciente vinculado ao próprio usuário. Para terapeutas, `therapistId` deve ser obtido do perfil profissional e a consulta deve limitar-se aos pacientes vinculados à terapeuta. O frontend não pode escolher livremente esses identificadores.

Toda leitura de mensagens deve seguir a sequência: validar a conversa pelo escopo; carregar as mensagens ordenadas por `createdAt`; registrar uma auditoria mínima; e somente então montar o contexto enviado ao modelo. Toda gravação deve atualizar `lastMessageAt` e respeitar `retentionExpiresAt`.

Memórias duráveis devem ser criadas apenas por uma etapa explícita do agente ou por confirmação da profissional. O modelo não deve transformar automaticamente uma afirmação do paciente em memória clínica permanente. Memórias expiradas ou marcadas como `deleted` não podem ser recuperadas pelo retriever.

## Retenção e minimização

O campo `retentionExpiresAt` permite apagar ou anonimizar conversas conforme a política definida pela organização. O campo `expiresAt` cumpre papel semelhante para memórias. A auditoria deve registrar ações como `conversation.created`, `message.created`, `memory.created`, `memory.deleted` e `retrieval.executed`, sem armazenar o conteúdo clínico completo.

A migration cria índices para as consultas por usuário, status e escopo clínico. Ela não cria foreign keys porque o schema atual do projeto também não usa FKs físicas nessas tabelas; as relações e a autorização devem permanecer centralizadas nas procedures Drizzle. Se o projeto passar a adotar FKs em uma etapa posterior, estas tabelas devem receber constraints com política de deleção revisada.

## Próximos passos de implementação

A próxima camada deve criar `server/ai/access.ts` para centralizar `canReadConversation`, `canReadMemory` e `canWriteMemory`, além de procedures tRPC que nunca aceitem um `therapistId` ou `patientId` sem validá-lo contra o usuário autenticado. Antes da ativação clínica, devem existir testes de isolamento entre dois pacientes, duas terapeutas e um administrador.
