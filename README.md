# 🧠 Plataforma de Atendimento Psicológico Online

Plataforma web completa para psicólogos gerenciarem consultas online, prontuários de pacientes e agendamentos. Desenvolvida com tecnologias modernas e identidade visual profissional.

![Status](https://img.shields.io/badge/status-ativo-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-1.0.0-blue)

---

## 🎯 Funcionalidades Principais

### 🎥 Videochamadas em Tempo Real
- **Jitsi Meet Integrado** — Videochamadas profissionais com qualidade HD
- **Controles Completos** — Câmera, microfone, compartilhamento de tela
- **Chat Integrado** — Comunicação textual durante a chamada
- **Sem Custos** — Usa infraestrutura pública do Jitsi Meet
- **Português (pt-BR)** — Interface totalmente localizada

### 📋 Gestão de Prontuários
- **Cadastro de Pacientes** — Dados pessoais, contato, histórico clínico
- **Listagem Completa** — Busca e filtros por nome, email, telefone
- **Histórico de Sessões** — Registro de todas as consultas realizadas
- **Anotações Clínicas** — Documentação detalhada de cada sessão
- **Evolução do Paciente** — Visualização de progresso ao longo do tempo

### 📅 Agendamento de Consultas
- **Calendário Interativo** — Seleção fácil de datas e horários
- **Status de Consultas** — Agendado, realizado, cancelado
- **Duração Flexível** — 30 min, 1h, 1h30, 2h
- **Gerenciamento** — Criar, editar, cancelar consultas
- **Lembretes Automáticos** — Sistema de notificações (em desenvolvimento)

### 👤 Autenticação e Segurança
- **OAuth Manus** — Login seguro e integrado
- **Controle de Acesso** — Apenas psicólogos autorizados
- **Dados Protegidos** — Criptografia de informações sensíveis
- **Sessões Seguras** — Cookies HTTP-only com CSRF protection

### 🎨 Identidade Visual
- **Paleta de Cores** — Bege (#EAD2A8) e Marrom (#8B6946)
- **Design Acolhedor** — Interface profissional e confortável
- **Responsivo** — Funciona em desktop, tablet e mobile
- **Acessível** — Suporte a navegação por teclado e leitores de tela

---

## 🚀 Começando

### Pré-requisitos
- Node.js 18+
- pnpm 10+
- Banco de dados MySQL/TiDB

### Instalação

1. **Clone o repositório**
```bash
gh repo clone GuilhermeADS13/SAS-AtendimentoPsicologico
cd SAS-AtendimentoPsicologico
```

2. **Instale as dependências**
```bash
pnpm install
```

3. **Configure as variáveis de ambiente**
```bash
# Crie um arquivo .env.local com:
DATABASE_URL=mysql://usuario:senha@localhost:3306/psicologia
JWT_SECRET=sua-chave-secreta-aqui
VITE_APP_ID=seu-app-id-manus
OAUTH_SERVER_URL=https://api.manus.im
# URL do servidor MiroTalk SFU (videochamada). Default: https://localhost:3010
VITE_MIROTALK_URL=https://localhost:3010
```

> **Servidor de vídeo (MiroTalk SFU):** a videochamada usa o [MiroTalk SFU](https://github.com/miroslavpejic85/mirotalksfu),
> que é self-hosted. Suba-o via Docker (`docker-compose up`, porta padrão `3010`)
> e aponte `VITE_MIROTALK_URL` para ele. As notificações de presença (aviso quando
> o paciente entra na sala) usam um WebSocket próprio do backend em `/api/ws/presence`
> e funcionam independentemente do MiroTalk.

4. **Execute as migrations do banco de dados**
```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

5. **Inicie o servidor de desenvolvimento**
```bash
pnpm dev
```

6. **Acesse a aplicação**
```
http://localhost:3000
```

---

## 📁 Estrutura do Projeto

```
psicologia-atendimento/
├── client/                    # Frontend React
│   ├── src/
│   │   ├── pages/            # Páginas principais
│   │   │   ├── Home.tsx      # Landing page
│   │   │   ├── Dashboard.tsx # Dashboard principal
│   │   │   ├── VideoCallJitsi.tsx  # Videochamada com Jitsi
│   │   │   ├── Records.tsx   # Prontuários
│   │   │   ├── Appointments.tsx    # Agendamentos
│   │   │   └── PatientDetail.tsx   # Detalhes do paciente
│   │   ├── components/       # Componentes reutilizáveis
│   │   ├── App.tsx           # Router principal
│   │   └── index.css         # Estilos globais
│   └── public/               # Assets estáticos
├── server/                    # Backend Express + tRPC
│   ├── routers.ts            # Procedures tRPC
│   ├── db.ts                 # Query helpers
│   ├── notifications.ts      # Sistema de notificações
│   └── _core/                # Framework interno
├── drizzle/                   # Schema e migrations
│   └── schema.ts             # Definição de tabelas
├── shared/                    # Código compartilhado
└── references/               # Documentação de integrações
```

---

## 🔧 Tecnologias Utilizadas

### Frontend
- **React 19** — UI library
- **TypeScript** — Type safety
- **Tailwind CSS 4** — Styling
- **tRPC** — Type-safe API calls
- **Wouter** — Routing
- **shadcn/ui** — UI components
- **Jitsi Meet** — Videochamadas

### Backend
- **Express 4** — Web server
- **tRPC 11** — RPC framework
- **Drizzle ORM** — Database ORM
- **MySQL2** — Database driver
- **Jose** — JWT handling

### DevOps
- **Vite** — Build tool
- **Vitest** — Testing framework
- **TypeScript** — Type checking
- **Prettier** — Code formatting

---

## 📊 Schema do Banco de Dados

### Tabelas Principais

**users** — Usuários do sistema
```sql
- id (PK)
- openId (OAuth)
- name
- email
- role (user | admin)
- createdAt, updatedAt
```

**therapists** — Perfil de psicólogos
```sql
- id (PK)
- userId (FK)
- crp (Conselho Regional de Psicologia)
- specialties
- bio
```

**patients** — Cadastro de pacientes
```sql
- id (PK)
- therapistId (FK)
- firstName, lastName
- email, phone
- dateOfBirth
- medicalHistory
- status (active | inactive | archived)
```

**appointments** — Agendamentos
```sql
- id (PK)
- therapistId (FK)
- patientId (FK)
- scheduledAt
- duration
- status (scheduled | completed | cancelled)
- notes
```

**sessions** — Registros de sessões
```sql
- id (PK)
- appointmentId (FK)
- patientId (FK)
- therapistId (FK)
- startedAt, endedAt
- clinicalNotes
- treatment
- nextSteps
- mood
```

**documents** — Armazenamento de documentos
```sql
- id (PK)
- patientId (FK)
- fileName
- fileKey (S3)
- fileType
- uploadedAt
```

**notifications** — Sistema de lembretes
```sql
- id (PK)
- appointmentId (FK)
- recipientType (patient | therapist)
- recipientEmail
- notificationType
- status (pending | sent | failed)
```

---

## 🔌 API tRPC

### Pacientes
```typescript
// Listar pacientes
trpc.patients.list.useQuery()

// Criar paciente
trpc.patients.create.useMutation({
  firstName: string
  lastName: string
  email: string
  phone?: string
  medicalHistory?: string
})
```

### Agendamentos
```typescript
// Listar agendamentos
trpc.appointments.list.useQuery()

// Criar agendamento
trpc.appointments.create.useMutation({
  patientId: number
  scheduledAt: string
  duration?: number
  notes?: string
})
```

### Sessões
```typescript
// Listar sessões
trpc.sessions.list.useQuery()

// Criar sessão
trpc.sessions.create.useMutation({
  appointmentId: number
  patientId: number
  clinicalNotes: string
  treatment?: string
  nextSteps?: string
  mood?: string
})
```

---

## 🎥 Como Usar a Videochamada

### Iniciar uma Chamada

1. **Acesse o Dashboard**
   - Faça login com sua conta Manus

2. **Clique em "Videochamada"**
   - Navegue até `/videocall-jitsi`

3. **Compartilhe o Link**
   - Envie o link da sala para o paciente
   - Ambos entram na mesma sala automaticamente

4. **Controles Disponíveis**
   - 🎤 Microfone — Ativar/desativar áudio
   - 📹 Câmera — Ativar/desativar vídeo
   - 🖥️ Compartilhamento — Compartilhar tela
   - ⚙️ Configurações — Ajustar dispositivos
   - 📞 Encerrar — Sair da chamada

### Recursos do Jitsi
- **Chat** — Comunicação textual
- **Gravação** — Registrar a sessão (opcional)
- **Participantes** — Ver lista de pessoas na sala
- **Qualidade** — Ajustar resolução de vídeo

---

## 🧪 Testes

### Executar Testes
```bash
pnpm test
```

### Testes Disponíveis
- ✅ `auth.logout.test.ts` — Teste de logout
- ✅ `patients.test.ts` — Teste de listagem de pacientes

### Adicionar Novos Testes
```typescript
// server/meu-recurso.test.ts
import { describe, it, expect } from 'vitest';
import { appRouter } from './routers';

describe('meu-recurso', () => {
  it('deve fazer algo', async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.meuRecurso.acao();
    expect(result).toBeDefined();
  });
});
```

---

## 📦 Build e Deploy

### Build para Produção
```bash
pnpm build
```

### Iniciar em Produção
```bash
pnpm start
```

### Deploy no Manus
1. Crie um checkpoint: `webdev_save_checkpoint`
2. Clique em "Publish" na Management UI
3. Configure domínio customizado (opcional)

---

## 🔐 Segurança

### Boas Práticas Implementadas
- ✅ OAuth 2.0 para autenticação
- ✅ JWT com assinatura segura
- ✅ CORS configurado
- ✅ CSRF protection via cookies
- ✅ SQL injection prevention (Drizzle ORM)
- ✅ XSS protection (React sanitization)
- ✅ Rate limiting (recomendado em produção)

### Dados Sensíveis
- Senhas — Nunca armazenadas (OAuth)
- Prontuários — Acesso restrito ao psicólogo
- Documentos — Armazenados em S3 com ACL privada
- Sessões — Criptografadas em trânsito (HTTPS)

---

## 🚀 Próximas Funcionalidades

### Fase 2
- [ ] Sala de espera virtual para pacientes
- [ ] Gravação automática de sessões
- [ ] Upload de documentos com S3
- [ ] Lembretes automáticos por e-mail
- [ ] Notificações in-app

### Fase 3
- [ ] Integração com calendário (Google Calendar, Outlook)
- [ ] Relatórios clínicos em PDF
- [ ] Prescrição digital
- [ ] Integração com WhatsApp
- [ ] App mobile (React Native)

### Fase 4
- [ ] Telemedicina com receitas digitais
- [ ] Integração com farmácias
- [ ] Pagamento online
- [ ] Faturamento automático
- [ ] Dashboard de analytics

---

## 📞 Suporte

### Documentação
- [Referências de Integração](./references/)
- [Guia de Desenvolvimento](./README.md)
- [Schema do Banco](./drizzle/schema.ts)

### Problemas Comuns

**Erro: "Jitsi não carrega"**
- Verifique conexão com internet
- Limpe cache do navegador
- Tente em outro navegador (Chrome recomendado)

**Erro: "Banco de dados não conecta"**
- Verifique `DATABASE_URL`
- Certifique-se que MySQL está rodando
- Execute migrations: `pnpm drizzle-kit migrate`

**Erro: "OAuth não funciona"**
- Verifique `VITE_APP_ID`
- Confirme URL de callback
- Limpe cookies do navegador

---

## 📄 Licença

Este projeto está licenciado sob a MIT License - veja o arquivo [LICENSE](LICENSE) para detalhes.

---

## 👨‍💻 Desenvolvido por

**Beatriz Chagas - Psicologia**
- Website: https://beatrizchagas.vercel.app
- Especialista em Psicologia Clínica

**Desenvolvido com ❤️ usando Manus**

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

---

## 📞 Contato

Para dúvidas ou sugestões sobre a plataforma:
- Email: contato@beatrizchagas.com
- WhatsApp: (81) 99999-9999
- Website: https://beatrizchagas.vercel.app

---

**Versão:** 1.0.0  
**Última atualização:** Julho 2026  
**Status:** ✅ Produção
