# 🧠 VozInterior — Plataforma de Atendimento Psicológico Online

Plataforma web para psicólogas atenderem online: videochamada própria, prontuários,
agenda, financeiro e uma assistente de IA (a **Luma**). Feita para uso clínico real —
com os cuidados de privacidade que isso exige.

![CI](https://github.com/GuilhermeADS13/SAS-AtendimentoPsicologico/actions/workflows/ci.yml/badge.svg)
![Status](https://img.shields.io/badge/status-em%20produção-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-1.0.0-blue)

---

## 🎯 Funcionalidades

### 🎥 Videochamada própria (WebRTC P2P)

Sem provedor externo, sem conta e sem cartão. O vídeo vai **direto entre os dois
navegadores**; o servidor só intermedeia o aperto de mão.

- **1:1 peer-to-peer** — mídia não passa pelo servidor (menos custo, menos exposição)
- **Sinalização própria** — WebSocket em `/api/ws/rtc`, só repassa `offer`/`answer`/ICE
- **STUN + TURN** — TURN da Metered cobre redes onde o P2P não fecha (NAT simétrico,
  4G, firewall corporativo); inclui `turns:` em TLS/443, indistinguível de HTTPS
- **Desfoque de fundo** — nativo do navegador, sem biblioteca extra (onde há suporte)
- **Compartilhamento de tela**, seleção de câmera/microfone e aviso de presença
  (`/api/ws/presence`) quando o paciente entra na sala

### 🤖 Luma — assistente de IA

- **Escopo trancado** — responde sobre o **uso do sistema** e sobre os dados do
  próprio usuário; nunca dá conselho clínico ou diagnóstico
- **Protocolo de crise** — sinais de sofrimento acionam resposta fixa com **CVV 188**
  e **SAMU 192**, sem passar pelo modelo
- **RAG** — busca em documentos indexados (pgvector), com filtro de escopo no `WHERE`
- **Ações com confirmação** — agendar/alterar só depois de o usuário confirmar
- **Tour de boas-vindas** — na primeira entrada, a Luma apresenta cada aba do sistema

### 📋 Prontuários e sessões
Cadastro de pacientes, histórico clínico, anotações por sessão e evolução ao longo
do tempo. Upload de documentos com indexação assíncrona (fila + OCR).

### 📅 Agenda e financeiro
Calendário, status (agendado / realizado / cancelado / a confirmar), filtros por
data e por pagamento, duração flexível, exportação para **Google Calendar e `.ics`**,
e **lembretes automáticos por e-mail**.

### 👤 Autenticação e papéis
Login por **Supabase Auth** (e-mail e senha, com recuperação). Dois papéis:
psicóloga e paciente — ver [Papéis e cadastro](#-papéis-e-cadastro-de-psicólogas).

### 🎨 Identidade visual
Paleta bege (`#EAD2A8`) e marrom (`#8B6946`), responsiva em desktop, tablet e mobile,
com navegação por teclado.

---

## 🚀 Começando

### Pré-requisitos
- **Node.js 22+** (a imagem de produção usa `node:22-slim`)
- **pnpm 10+**
- Conta no [Supabase](https://supabase.com) — Postgres + Auth + pgvector

### Instalação

```bash
gh repo clone GuilhermeADS13/SAS-AtendimentoPsicologico
cd SAS-AtendimentoPsicologico
pnpm install
```

### Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha. O mínimo para subir:

```bash
# Banco — pooler de transações do Supabase (porta 6543). Senha com "@" vira "%40".
DATABASE_URL=postgresql://postgres.<projeto>:<senha>@aws-0-<regiao>.pooler.supabase.com:6543/postgres
JWT_SECRET=uma-chave-forte

# Autenticação (Supabase)
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<chave publicável>
SUPABASE_URL=https://<projeto>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role — só no servidor>
```

> ⚠️ **Cuidado com o `.env.local`.** Se o `DATABASE_URL` apontar para o Supabase de
> produção, `pnpm dev` escreve no banco real. Use um projeto separado para desenvolver.

<details>
<summary><b>Variáveis opcionais</b> (vídeo, IA, e-mail)</summary>

```bash
# TURN (videochamada em redes restritivas) — sem isso, só STUN
METERED_DOMAIN=<seu-subdominio>.metered.live
METERED_API_KEY=<API Key da credencial — NUNCA a Secret Key>
# METERED_REGION: deixe VAZIA. O painel em "Global (automático)" já roteia para o
# servidor mais próximo, e essa variável sobrescreveria isso por uma região fixa.

# Luma (IA)
AI_AGENT_ENABLED=true
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=<chave>
LLM_MODEL=openai/gpt-oss-120b
# Embeddings do RAG: precisa de um endpoint com /embeddings próprio.
LLM_EMBEDDING_BASE_URL=<url>
LLM_EMBEDDING_MODEL=<modelo>
AI_RAG_ENABLED=true

# E-mail (lembretes e avisos) — ver a seção do Gmail abaixo
NOTIFICATIONS_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=...
ADMIN_EMAIL=...
```

</details>

### Banco e execução

```bash
pnpm db:push     # drizzle-kit generate && migrate
pnpm dev         # http://localhost:3000
pnpm ai:worker   # opcional: fila de indexação de documentos
```

---

## 📁 Estrutura do Projeto

```
├── client/src/
│   ├── pages/              # Dashboard, Appointments, Records, Financeiro,
│   │                       # Luma, VideoCallDynamic, Login, Ajuda, Privacidade…
│   └── components/         # WebRTCCall, AIChatBox, LumaOnboarding, AddToCalendar…
├── server/
│   ├── routers.ts          # Procedures tRPC
│   ├── signaling.ts        # WebSocket WebRTC (/api/ws/rtc)
│   ├── turn.ts             # Credenciais ICE (STUN + TURN)
│   ├── notifications.ts    # Lembretes por e-mail
│   ├── ai/                 # Luma: llm, rag, clinical-tools, clinical-safety, worker
│   └── _core/              # Express, tRPC, auth, roteador de upgrade WS
├── drizzle/                # schema.ts (17 tabelas) + migrations
├── shared/                 # Código compartilhado (ex.: calendario.ts)
├── e2e/                    # Playwright
└── docs/                   # Notas de arquitetura e operação
```

---

## 🔧 Tecnologias

| Camada | Stack |
|---|---|
| **Frontend** | React 19, TypeScript, Tailwind CSS 4, tRPC, Wouter, shadcn/ui, TanStack Query |
| **Backend** | Express 4, tRPC 11, Drizzle ORM, `ws` (presença + sinalização), Jose |
| **Banco** | Supabase — Postgres (driver `postgres-js`) + **pgvector** |
| **IA** | LangChain, LlamaIndex, LLM via API compatível com OpenAI (Groq) |
| **Vídeo** | WebRTC nativo + TURN (Metered) |
| **DevOps** | Vite, Vitest, Playwright, Docker, GitHub Actions, Render |

---

## 📊 Banco de Dados

17 tabelas, em três grupos:

**Clínico** — `users`, `therapists`, `therapistRequests`, `patients`,
`appointments`, `sessions`, `sessionNotes`, `documents`, `videoCalls`,
`notifications`

**IA (Luma)** — `aiConversations`, `aiMessages`, `aiMessageFeedback`,
`aiMemories`, `aiAuditEvents`

**Indexação/RAG** — `aiDocumentJobs`, `aiDocumentChunks` (com coluna `vector`)

> O RLS está **ligado em todas as tabelas e sem políticas** — de propósito. O acesso
> é feito pelo backend via Drizzle (não pelo PostgREST), então nenhuma política é
> necessária. Isso vale **enquanto** o frontend usar `supabase-js` apenas para auth.
> Definição completa em [`drizzle/schema.ts`](./drizzle/schema.ts).

---

## 🎥 Como funciona a videochamada

```
Terapeuta ──┐                             ┌── Paciente
            ├─ /api/ws/rtc (sinalização) ─┤     offer/answer/ICE
            └─────── mídia direta P2P ────┘     (não passa pelo servidor)
```

1. Os dois entram pela mesma consulta (sala `apt<id>-<token>`, validada no servidor)
2. A **terapeuta inicia a oferta** (evita colisão de negociação)
3. O cliente busca os servidores ICE em `videoCalls.iceServers` — a chave da Metered
   **fica no servidor** e nunca vai para o bundle
4. Se o caminho direto falhar, a mídia passa pelo **TURN**; caso contrário, vai direto

**Sem `METERED_*` configurado, funciona só com STUN** — a chamada não quebra, mas
redes restritivas podem não conectar. Se a chave for rotacionada e a variável não for
atualizada junto, o sistema volta **silenciosamente** para STUN (proposital: o TURN
nunca pode derrubar uma consulta) — então a falha não aparece sozinha.

---

## 🧪 Testes

```bash
pnpm check                     # typecheck
pnpm test                      # unitários (Vitest)
pnpm test:e2e                  # Playwright
E2E_BASE_URL=https://... pnpm test:e2e   # contra um ambiente já publicado
```

São ~30 arquivos de teste no `server/` — incluindo segurança clínica
(`clinicalSafety`), prevenção de vazamento (`dataLossPrevention`, `vectorSecurity`),
pagamentos, política de senha, TURN e o fluxo de ponta a ponta.

> **`E2E_BASE_URL` importa:** sem ela, o Playwright sobe um servidor local que usa o
> `.env.local` — e, se ele apontar para produção, o teste **escreve no banco real**.

---

## 📦 Build e Deploy

```bash
pnpm build && pnpm start
```

### Render (produção atual)

Roda o container completo (Express + WebSocket + agendador) no **plano free**.
Ressalva: dorme após ~15 min sem uso (a próxima visita leva ~50s para acordar).

1. **New → Blueprint** → conecte o repositório (o `render.yaml` faz o resto)
2. Preencha as variáveis marcadas como `sync: false`
3. Cada push na **`main` redeploya sozinho** (`autoDeploy`) — ou seja, **push na
   `main` é deploy em produção**

### Fly.io (CD opcional)

`.github/workflows/cd.yml` faz deploy no Fly a cada push na `main`, **depois** do CI.
Sem o segredo `FLY_API_TOKEN`, o passo é pulado sem falhar o build.

---

## 👥 Papéis e cadastro de psicólogas

| Papel | Acesso |
|-------|--------|
| **Psicóloga** (`admin` / `therapist`) | Prontuários, sessões, agenda, financeiro, documentos, Luma com ferramentas clínicas |
| **Paciente** | O próprio cadastro, suas consultas, videochamada e a Luma no escopo dele |

Todo cadastro novo entra como **paciente**. Quem marca *"Sou psicólogo(a)"* informa o
**CRP** e gera uma **solicitação pendente** — que **não dá acesso**: o CRP é informação
pública, então o número não prova identidade. A liberação é **manual**, após conferir o
CRP no [Cadastro Nacional de Psicólogos](https://cadastro.cfp.org.br).

**Para aprovar:** entre como `admin` e use a página **Solicitações** (`/solicitacoes`,
visível só para admin) — ela lista os pedidos pendentes, com aviso de quantos aguardam,
e aprova ou recusa com um clique.

> O usuário precisa **sair e entrar** de novo para o novo papel valer.

### E-mails com Gmail (grátis)

O Gmail **não aceita a senha da conta** no SMTP — é preciso uma **Senha de App**:

1. Ligue a **verificação em 2 etapas** em [myaccount.google.com/security](https://myaccount.google.com/security)
2. Gere em [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   → "Outro (nome personalizado)" → `SAS` → copie os **16 caracteres**

| Variável | Valor |
|----------|-------|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | seu e-mail do Gmail |
| `SMTP_PASS` | a **senha de app** (16 caracteres, sem espaços) |
| `SMTP_FROM` | o mesmo e-mail (o Gmail exige remetente = conta) |
| `ADMIN_EMAIL` | quem recebe os avisos de solicitação |
| `NOTIFICATIONS_ENABLED` | `true` (liga também os lembretes) |

> Limite do Gmail: ~500 e-mails/dia — de sobra para esse uso.

---

## 🔐 Segurança e privacidade

Por ser um sistema **clínico**, alguns pontos são inegociáveis:

- **Autenticação** — Supabase Auth; senhas nunca trafegam nem são guardadas pela aplicação
- **Autorização por escopo** — o filtro do paciente entra no `WHERE`, **antes** de montar
  o contexto do RAG; dados não cruzam entre pacientes
- **A Luma não dá conselho clínico** — escopo trancado, protocolo de crise (CVV 188 /
  SAMU 192) e recusa de assuntos fora do sistema
- **Sem dados clínicos em log ou em mensagem de commit**
- **SQL injection** — prevenido pelo Drizzle; **XSS** — sanitização do React
- **Segredos** — só no host (Render/Fly). Se um vazar, **rotacione**: chave nova no
  painel *e* variável atualizada no mesmo momento

Política de privacidade e LGPD estão publicadas em `/privacidade`.

---

## 🚀 Próximos passos

- [ ] Videochamada em grupo (hoje é 1:1)
- [ ] Gravação de sessões
- [ ] Relatórios clínicos em PDF
- [ ] Pagamento online integrado
- [ ] App mobile

---

## 🆘 Problemas comuns

**A videochamada não conecta em uma rede específica**
Provavelmente NAT simétrico ou firewall. Confira se `METERED_DOMAIN` e
`METERED_API_KEY` estão preenchidas — sem elas, só há STUN.

**O banco não conecta**
Confira o `DATABASE_URL` (Postgres, porta **6543**, senha com `@` escrita como `%40`)
e rode `pnpm db:push`.

**A Luma responde, mas não acha nada nos documentos**
O RAG precisa de `LLM_EMBEDDING_BASE_URL` apontando para um endpoint com `/embeddings`
próprio. Sem isso a indexação falha e a busca volta vazia.

---

## 📄 Licença

MIT — veja [LICENSE](LICENSE).

---

**Beatriz Chagas — Psicologia**
Website: <https://beatrizchagas.vercel.app>

**Versão:** 1.0.0 · **Última atualização:** Setembro de 2026 · **Status:** ✅ em produção
