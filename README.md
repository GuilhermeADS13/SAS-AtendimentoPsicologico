# 🧠 VozInterior — Plataforma de Atendimento Psicológico Online

Plataforma web para psicólogas atenderem online: agenda, prontuário, videochamada própria,
mensagens, financeiro com Pix e uma assistente de IA (a **Luma**). Feita para uso clínico
real, com os cuidados de privacidade que isso exige.

Site: <https://sas-atendimento-psicologico.onrender.com>

![CI](https://github.com/GuilhermeADS13/SAS-AtendimentoPsicologico/actions/workflows/ci.yml/badge.svg)
![Status](https://img.shields.io/badge/status-em%20produção-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-1.0.1-blue)

---

## 🎯 Funcionalidades

### 🎥 Videochamada própria (WebRTC)

Sem provedor externo, sem conta e sem cartão. O vídeo vai **direto entre os navegadores**;
o servidor só intermedeia o aperto de mão.

- **Até 4 pessoas** (casal e família): a psicóloga convida participantes ao agendar ou
  durante a chamada
- **Sinalização própria**: WebSocket em `/api/ws/rtc`, só repassa `offer`/`answer`/ICE
- **STUN + TURN**: o TURN da Metered cobre redes onde a conexão direta não fecha (NAT
  simétrico, 4G, firewall corporativo), inclusive `turns:` em TLS/443
- **Fundo virtual** (MediaPipe), compartilhamento de tela, troca de câmera, microfone e
  alto-falante durante a chamada, relógio da sessão e envio de arquivo
- Recurso que o navegador não tem fica **escondido**, em vez de virar botão que não faz nada

### 📋 Prontuário, documentos e contrato

- Pacientes, sessões e anotações, nos itens do registro documental da Resolução CFP 001/2009
- **Evolução**: linha do tempo das sessões, com marcos automáticos (início, retorno após
  pausa, a cada 10 sessões), fases do tratamento, humor de 0 a 10 e registro SOAP
- **Documentos**: a psicóloga envia, vê, baixa (PDF/Word) e **compartilha um a um** com o
  paciente, que os encontra em "Meus documentos"
- **Contrato (TCLE)**: cada psicóloga usa o próprio modelo; os campos do paciente são
  preenchidos sozinhos e o contrato sai em PDF. Não há texto padrão

O paciente cadastrado pela psicóloga fica **Aguardando cadastro** até criar a conta com o
mesmo e-mail; aí vira **Ativo**.

### 📅 Agenda, mensagens e financeiro

- Agenda com consultas **semanais repetidas**, status (agendada, realizada, cancelada,
  a confirmar), confirmação de presença pelo paciente e exportação para **Google Agenda e
  `.ics`**
- **Lembretes por e-mail** e avisos por **WhatsApp** com a mensagem pronta (lembrete,
  cancelamento, cobrança)
- **Mensagens** entre psicóloga e paciente, com busca, emojis, edição e exclusão
- **Financeiro**: recebido e a receber; o paciente paga a consulta **por Pix direto para a
  psicóloga** (copia e cola ou QR) e a psicóloga confirma

### 💳 Planos e assinatura

Planos por número de pacientes (**Sussurro**, **Voz**, **Canto** e **Coro**, e **Sob medida** acima de 44), pagos por Pix,
mensal ou anual. **14 dias grátis**, contados a partir do primeiro paciente. Detalhes em
[`shared/precos.ts`](./shared/precos.ts) e na página `/precos`.

### 🤖 Luma, assistente de IA

- **Ajuda no uso do sistema**, para psicóloga e paciente, com um tour na primeira entrada
- **Agenda pela conversa**: marca, remarca e cancela consultas e registra pagamentos, sempre
  **depois de a psicóloga confirmar**
- **No prontuário, só a estrutura** (o que falta preencher): a Luma **não lê** sessões,
  anotações nem documentos de pacientes
- **Nunca dá conselho clínico ou diagnóstico**; sinais de crise acionam resposta fixa com
  **CVV 188** e **SAMU 192**, sem passar pelo modelo
- **CPF, e-mail, telefone e chaves saem do texto** antes de ir ao provedor de IA
- **Failover**: se o provedor principal fica sem cota (429), a conversa segue num backup

### 👤 Cadastro e papéis

Login por **Supabase Auth** (e-mail e senha). Psicóloga e paciente têm áreas diferentes;
ver [Papéis e cadastro](#-papéis-e-cadastro-de-psicólogas).

### 🎨 Identidade visual

Verde da logo (`#215756`) sobre fundo creme, com tema claro e escuro, responsiva em
celular, tablet e computador, e navegação por teclado.

---

## 🚀 Começando

### Pré-requisitos

- **Node.js 22+** (a imagem de produção usa `node:22-slim`)
- **pnpm 10+**
- **Docker Desktop**, para o banco local de desenvolvimento

### Instalação

```bash
gh repo clone GuilhermeADS13/SAS-AtendimentoPsicologico
cd SAS-AtendimentoPsicologico
pnpm install
```

### Desenvolvimento com o Supabase local (recomendado)

O Supabase roda no Docker, com a mesma estrutura de produção e **sem nenhum dado real**.

```bash
npx supabase@2.121.0 start -x vector,logflare,imgproxy,edge-runtime   # sobe o Supabase local
pnpm dev:local                                                        # http://localhost:3000
npx supabase@2.121.0 stop                                             # desliga
```

Na primeira vez:

1. Gere a chave do JWT local: crie `supabase/signing_keys.json` com `[]` e rode
   `npx supabase@2.121.0 gen signing-key --algorithm ES256` dentro de `supabase/`
   (o arquivo fica fora do git)
2. Crie o `.env.supabase.local` com os valores de `npx supabase@2.121.0 status -o env`:
   `DATABASE_URL` (DB_URL), `VITE_SUPABASE_URL` e `SUPABASE_URL` (API_URL),
   `VITE_SUPABASE_PUBLISHABLE_KEY` (PUBLISHABLE_KEY), `SUPABASE_SERVICE_ROLE_KEY`
   (SECRET_KEY), mais `DEV_AUTH=true` e `VERIFICACAO_DE_APARELHO=desligada`

A estrutura vem de [`supabase/migrations/`](./supabase/migrations), aplicada pelo
`start` e pelo `npx supabase@2.121.0 db reset --local`. O painel do banco local fica em
`http://127.0.0.1:54323` e os e-mails de login em `http://127.0.0.1:54324`.

> ⚠️ **`pnpm dev` usa o `.env.local`.** Se ele apontar para o Supabase de produção, o
> sistema rodando no seu computador **escreve no banco real**. Para testar, use `pnpm dev:local`.

### Variáveis de ambiente

A lista completa, comentada, está em [`.env.example`](./.env.example). O mínimo:

```bash
DATABASE_URL=postgresql://...          # Postgres (em produção, pooler do Supabase, porta 6543)
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<chave publicável>
SUPABASE_URL=https://<projeto>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<só no servidor>
```

Opcionais:

```bash
# TURN (videochamada em redes restritivas). Sem isso, só STUN.
METERED_DOMAIN=<subdominio>.metered.live
METERED_API_KEY=<API Key da credencial, nunca a Secret Key>

# Luma (IA): API compatível com OpenAI (Groq no plano grátis)
AI_AGENT_ENABLED=true
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=<chave>
LLM_MODEL=openai/gpt-oss-120b
# AI_RAG_ENABLED e AI_CLINICAL_TOOLS_ENABLED ligam as ferramentas da agenda
# Backup no 429: LLM_FALLBACK_1_BASE_URL / _API_KEY / _MODEL

# E-mail: Brevo (API HTTP) ou SMTP; sem nenhum, só registra no log
NOTIFICATIONS_ENABLED=true
BREVO_API_KEY=<chave>
ADMIN_EMAIL=<quem recebe os pedidos de acesso de psicólogas>
# Aviso do pedido no celular: TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID

# Código por e-mail em aparelho novo; "desligada" só em emergência
VERIFICACAO_DE_APARELHO=
```

---

## 📁 Estrutura do Projeto

```text
├── client/src/
│   ├── pages/              # Dashboard, Agenda, Prontuários, Financeiro, Mensagens,
│   │                       # Luma, Videochamada, Preços, Ajuda, Termos, Privacidade…
│   ├── components/         # WebRTCCall, AIChatBox, LumaOnboarding, AddToCalendar…
│   └── lib/                # Supabase, tRPC, suporte, origem do cadastro
├── server/
│   ├── routers.ts          # Procedures tRPC
│   ├── signaling.ts        # WebSocket da videochamada (/api/ws/rtc)
│   ├── turn.ts             # Credenciais ICE (STUN + TURN)
│   ├── notifications.ts    # Lembretes e avisos
│   ├── mailer.ts           # E-mail (Brevo, SMTP ou só log)
│   ├── ai/                 # Luma: llm, clinical-tools, clinical-safety, DLP, site-help
│   └── _core/              # Express, tRPC, autenticação, carga do .env
├── shared/                 # Regras compartilhadas (preços, Pix, CRP, datas, contrato…)
├── drizzle/                # schema.ts (22 tabelas) + migrações de produção
├── supabase/               # Supabase local de desenvolvimento (config + migrações)
├── e2e/                    # Playwright
└── docs/                   # Notas de arquitetura e operação
```

---

## 🔧 Tecnologias

| Camada       | Stack                                                                          |
| ------------ | ------------------------------------------------------------------------------ |
| **Frontend** | React 19, TypeScript, Tailwind CSS 4, tRPC, Wouter, shadcn/ui, TanStack Query  |
| **Backend**  | Express 4, tRPC 11, Drizzle ORM, `ws` (presença e sinalização), Jose           |
| **Banco**    | Supabase: Postgres (driver `postgres-js`), Auth e Storage                      |
| **IA**       | LangChain, LLM por API compatível com OpenAI (Groq)                            |
| **Vídeo**    | WebRTC nativo, TURN (Metered), MediaPipe (fundo virtual)                       |
| **DevOps**   | Vite, Vitest, Playwright, Docker, GitHub Actions, Render                       |

---

## 📊 Banco de Dados

22 tabelas, em quatro grupos:

**Clínico**: `users`, `therapists`, `therapistRequests`, `patients`, `appointments`,
`appointmentParticipants`, `sessions`, `sessionNotes`, `documents`, `videoCalls`,
`chatMessages`, `notifications`

**Conta e assinatura**: `assinaturas`, `codigosDeAparelho`, `aparelhosConfiaveis`

**IA (Luma)**: `aiConversations`, `aiMessages`, `aiMessageFeedback`, `aiMemories`,
`aiAuditEvents`

**Legado**: `aiDocumentJobs`, `aiDocumentChunks` (da busca em documentos, desligada em
outubro de 2026)

> O RLS está **ligado em todas as tabelas e sem políticas**, de propósito. O acesso é feito
> pelo backend via Drizzle (não pelo PostgREST), então nenhuma política é necessária. Isso
> vale **enquanto** o frontend usar `supabase-js` só para login e arquivos. Definição
> completa em [`drizzle/schema.ts`](./drizzle/schema.ts).

As migrações de produção ficam em `drizzle/` e `drizzle/migrations/`, e **são aplicadas
antes do push** que depende delas.

---

## 🎥 Como funciona a videochamada

```text
Psicóloga ──┐                             ┌── Paciente
            ├─ /api/ws/rtc (sinalização) ─┤     offer/answer/ICE
            └─────── mídia direta P2P ────┘     (não passa pelo servidor)
```

1. Todos entram pela mesma consulta (sala validada no servidor); consulta cancelada não
   abre, e o paciente perde o acesso 2 horas depois do fim
2. A **psicóloga inicia a oferta** (evita colisão de negociação)
3. O cliente busca os servidores ICE no servidor: a chave da Metered **nunca vai para o
   navegador**
4. Se o caminho direto falhar, a mídia passa pelo **TURN**

**Sem `METERED_*`, funciona só com STUN.** A chamada não quebra, mas redes restritivas
podem não conectar. Se a chave for trocada e a variável não acompanhar, o sistema volta
**em silêncio** para STUN (proposital: o TURN nunca pode derrubar uma consulta).

---

## 🧪 Testes

```bash
pnpm check                               # typecheck
pnpm test                                # unitários (Vitest)
pnpm test:e2e                            # Playwright
E2E_BASE_URL=https://... pnpm test:e2e   # contra um ambiente já publicado
```

São 77 arquivos de teste, com cerca de 920 testes, incluindo segurança clínica
(`clinicalSafety`), retirada de dados pessoais antes da IA (`dataLossPrevention`), Pix,
senhas vazadas, código de aparelho novo e TURN.

> **Sem `E2E_BASE_URL`, o Playwright sobe um servidor local com o `.env.local`.** Se ele
> apontar para produção, o teste **escreve no banco real**.

---

## 📦 Build e Deploy

```bash
pnpm build && pnpm start
```

### Render (produção atual)

Roda o container completo (Express, WebSocket e agendador) no **plano grátis**. Um job do
`pg_cron` no Supabase acessa o site de tempos em tempos para ele não dormir (com pausa de
madrugada).

1. **New → Blueprint** → conecte o repositório (o `render.yaml` faz o resto)
2. Preencha as variáveis marcadas como `sync: false`
3. Cada push na **`main` é publicado sozinho**: **push na `main` é deploy em produção**

O banco de produção tem backup noturno criptografado num repositório privado separado.

---

## 👥 Papéis e cadastro de psicólogas

| Papel                                 | Acesso                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| **Psicóloga** (`admin` / `therapist`) | Prontuários, agenda, financeiro, documentos, mensagens, assinatura e a Luma      |
| **Paciente**                          | O próprio cadastro, consultas, documentos compartilhados, mensagens e a Luma     |

Todo cadastro novo entra como **paciente**. Quem marca *"Sim, sou psicólogo(a)"* (o botão
de teste grátis já abre o cadastro assim) informa o **CRP** e gera uma **solicitação
pendente**, que **não dá acesso**: o CRP é público, então o número não prova identidade. A
liberação é **manual**, depois de conferir o CRP no
[Cadastro Nacional de Psicólogos](https://cadastro.cfp.org.br). Enquanto espera, a pessoa vê
um aviso em "Minhas consultas".

**Para aprovar:** entre como `admin` e use **Solicitações** (`/solicitacoes`). O pedido
chega por e-mail (e Telegram, se configurado), com lembrete se ficar parado. Ao aprovar, a
psicóloga recebe um e-mail; a tela também tem atalhos para avisar por e-mail ou WhatsApp.

> A psicóloga precisa **sair e entrar** de novo para o novo papel valer.

---

## 🔐 Segurança e privacidade

Por ser um sistema **clínico**, alguns pontos são inegociáveis:

- **Login**: Supabase Auth, com confirmação de e-mail, **senha já vazada recusada**
  (HaveIBeenPwned, por k-anonimato) e **código por e-mail em aparelho novo** para
  psicólogas e admin
- **Autorização por dono**: toda rota filtra pela psicóloga ou pelo paciente; dados não
  cruzam entre contas
- **A Luma não lê dados clínicos** e não dá conselho clínico; dados pessoais saem do texto
  antes do provedor de IA
- **Navegador**: CSP obrigatória, Markdown exibido passa por filtro contra XSS, `no-store`
  na API e consultas tRPC por POST (texto clínico não vai para URL nem log)
- **Sem dados clínicos em log ou em mensagem de commit**
- **Segredos só no host** (Render). Se um vazar, troque a chave no painel **e** a variável,
  no mesmo momento

Política de privacidade, Termos de Uso e reembolso: `/privacidade` e `/termos`.

---

## 🚀 Próximos passos

- [ ] E-mails com remetente de domínio próprio (menos risco de cair no spam)
- [ ] Recuperação de acesso por SMS

---

## 🆘 Problemas comuns

**A videochamada não conecta em uma rede específica**
Provavelmente NAT simétrico ou firewall. Confira se `METERED_DOMAIN` e `METERED_API_KEY`
estão preenchidas; sem elas, só há STUN.

**O banco não conecta**
Em produção, confira o `DATABASE_URL` (pooler do Supabase, porta **6543**, senha com `@`
escrita como `%40`). No desenvolvimento, confira se o Docker e o Supabase local estão de pé.

**A Luma não responde**
Confira `AI_AGENT_ENABLED=true` e as variáveis `LLM_*`. No Supabase local elas não vêm
preenchidas.

---

## 📄 Licença

MIT — veja [LICENSE](LICENSE).

---

**Versão:** 1.0.1 · **Última atualização:** Novembro de 2026 · **Status:** ✅ em produção
