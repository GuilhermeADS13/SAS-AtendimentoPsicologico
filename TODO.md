# Plataforma de Atendimento Psicológico Online — TODO

Estado conferido no código, no banco e no Render em 2026-11-04. Em produção:
https://sas-atendimento-psicologico.onrender.com

> A URL ainda tem o nome antigo porque o subdomínio `.onrender.com` é atribuído
> na criação do serviço e **não muda com rename** — trocar exige recriar o
> serviço, ou apontar um domínio próprio. Os e-mails já usam
> `RENDER_EXTERNAL_URL`/`APP_URL`, então acompanham sozinhos quando mudar.

## Autenticação e Usuários
- [x] Login/cadastro por e-mail e senha (Supabase Auth, JWT verificado por JWKS)
- [x] Cadastro pergunta "Você é psicólogo(a)?" → pede CRP → vira solicitação pendente
- [x] Aprovação manual da psicóloga (o CRP é público, não prova identidade) + e-mail ao admin
- [x] Gestão de papéis: `therapistProcedure` (admin/therapist) vs `protectedProcedure` (paciente)
- [x] Paciente não enxerga prontuário — só suas consultas e seu cadastro
- [x] Aprovar/recusar solicitação pela interface (/solicitacoes, só admin) + e-mail ao solicitante
- [x] Entrar com o Google (2026-11-05): projeto `vozinterior-513817` no Google Cloud, app
      publicado ("Em produção"), suporte = suportevozinterior@. Conta nova pelo Google fica com
      o cadastro pendente até aceitar Termos/Privacidade e informar celular (e CRP), e a API só
      libera `auth.completarCadastro` (`shared/cadastroPendente.ts`). Apple ficou de fora (pago)

## Design e Identidade Visual
- [x] Paleta da marca VozInterior: verde da logo (#215756) sobre creme, tema claro e escuro
- [x] Layout responsivo e acessível
- [x] Logo — o quadrado "BC" saiu; o login usa a logo do VozInterior (LogoFull)

## Área da psicóloga
- [x] Dashboard com indicadores
- [x] Grade de pacientes (listar, cadastrar, ver prontuário)
- [x] Excluir paciente: apaga quem não tem histórico, arquiva quem tem (guarda de 5 anos)
- [x] Bloqueio de e-mail duplicado no cadastro
- [x] Sino de notificações in-app
- [x] Linha do tempo de progresso do paciente — aba "Evolução" do prontuário (shared/evolucao.ts)

## Área do paciente
- [x] "Minhas Consultas" como tela inicial (próximas + anteriores, entrar na sala)
- [x] "Meu Cadastro" — dados pessoais mantidos pelo próprio paciente
- [x] O que o paciente edita atualiza sozinho na grade da psicóloga (mesma linha no banco)

## Módulo de Videochamada
- [x] Videochamada WebRTC própria P2P (STUN grátis; TURN opcional via Metered)
- [x] Sala por agendamento (sala-apt<id>), ligando prontuário e anotações
- [x] Prontuário em aba separada da chamada, só para a psicóloga
- [x] Botão "Copiar link da sala" (psicóloga)
- [x] Anotações da sessão com auto-save durante a chamada
- [x] Notificações de presença em tempo real (WebSocket)
- [x] Registro da chamada no banco (videoCalls) + campo recordingUrl
- [ ] Gravação — não implementada e não recomendada (vídeo clínico, peso de LGPD);
      falta só a decisão final
- [-] ~~Tela de histórico de videochamadas~~ — não fazer (decisão de 2026-11-04): a
      Agenda já mostra cada consulta pelo dia

## Prontuários
- [x] Cadastro, listagem, edição e visualização
- [x] Registro e histórico de sessões (evolução clínica)
- [x] Upload/download/exclusão de documentos (Supabase Storage privado + URL assinada)
- [x] Arquivar ou excluir paciente (2026-11-05): excluir de vez só sem prontuário, com
      confirmação; com prontuário, só arquiva (guarda de 5 anos, CFP 001/2009). Filtro
      "Arquivados" na grade, com "Reativar". Arquivado não conta no limite do plano
- [ ] **Futuro:** apagar sozinho o arquivado com mais de 5 anos desde o último registro
      (ficha, sessões, anotações, consultas e os anexos no Storage). Não é urgente: em
      2026-11-05 o banco tinha 15 MB (8 pacientes com tudo ≈ 220 kB; o grátis dá 500 MB
      de banco e 1 GB de arquivos) e nenhum prontuário fará 5 anos antes de 2031

## Agendamento
- [x] Criação, listagem e cancelamento (psicóloga)
- [x] Status: agendado, realizado, cancelado, não compareceu
- [x] Confirmação de presença pelo paciente (appointments.confirm + confirmedAt)
- [-] ~~Calendário com escolha de horário pelo paciente~~ — não fazer (decisão de
      2026-11-04): quem controla a agenda é a psicóloga

## Lembretes e Notificações
- [x] Fila de e-mail com retentativa (agendador a cada 15 min)
- [x] Alertas para a psicóloga (novo agendamento, cancelamento, nova solicitação de CRP)
- [x] Aviso de solicitação com notifiedAt/notifyError (não se perde, mostra o motivo da falha)
- [x] Envio de e-mail pela API HTTP da Brevo — BREVO_API_KEY configurada no Render
      (o Render free bloqueia SMTP)
- [ ] Deliverability: remetente é @gmail (freemail) → Gmail/Outlook mandam p/ spam.
      Resolve com domínio próprio (o mesmo do item da URL).

## Infra, Segurança e Testes
- [x] Postgres no Supabase (migrado do MySQL) via pooler de transações
- [x] RLS ligado em todas as 22 tabelas (sem políticas = trancado na API pública)
- [x] Auth SÓ Supabase — login OAuth do Manus (forjável) removido, 9 arquivos mortos apagados
- [x] Senha forte imposta no Supabase Auth (min 8, maiúscula/minúscula/número/símbolo)
- [x] Deploy contínuo no Render (Docker, plano free)
- [x] CI no GitHub Actions (typecheck + testes unitários + integração com Postgres)
- [x] Schema do código == banco de produção (auditado programaticamente em 2026-07-15)
- [ ] **Rotacionar segredos que vazaram no chat**: senha do banco, App Password do
      Gmail, PAT do Supabase, chave da Brevo e chave da Groq. O JWT_SECRET não é mais usado:
      basta removê-lo do Render (ver a limpeza de variáveis abaixo)
- [x] **Banco separado para dev** — `pnpm dev:local` usa o Supabase local no Docker
      (`supabase/`, `.env.supabase.local`). O `pnpm dev` continua apontando para produção.
- [x] Senha vazada recusada (HaveIBeenPwned, k-anonimato) — feita no próprio app
      (shared/senhaVazada.ts), porque a do Supabase só existe no plano Pro
- [ ] Chaves estrangeiras: 7 existem (consultas, pacientes, participantes, assinaturas,
      aparelhos); sessões, anotações, documentos, mensagens e tabelas da IA seguem sem FK.
      Órfão é evitado no código
- [x] Backup noturno criptografado no repo privado `vozinterior-backups` (sucesso todo dia)
- [x] Resíduo do Manus em `server/_core/` removido (sobram só comentários). Fica o plugin
      de edição `vite-plugin-manus-runtime`, que só roda no dev
- [ ] **Limpar variáveis sem uso no Render**: `LLM_EMBEDDING_*` (3), `AI_WORKER_INLINE`,
      `VITE_MIROTALK_URL`, `OAUTH_SERVER_URL` e `JWT_SECRET`. O código não lê mais nenhuma
      delas (fe06a60c); falta só apagar no painel do Render (é manual: segredo)
