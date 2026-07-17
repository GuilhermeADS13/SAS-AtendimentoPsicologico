# Plataforma de Atendimento Psicológico Online — TODO

Estado em 2026-07-15. Em produção: https://sas-atendimento-psicologico.onrender.com

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

## Design e Identidade Visual
- [x] Paleta de cores (#EAD2A8, #8B6946) no Tailwind
- [x] Layout responsivo e acessível
- [ ] **Logo da Beatriz Chagas** — ainda é o quadrado "BC" em Login.tsx:101

## Área da psicóloga
- [x] Dashboard com indicadores
- [x] Grade de pacientes (listar, cadastrar, ver prontuário)
- [x] Excluir paciente: apaga quem não tem histórico, arquiva quem tem (guarda de 5 anos)
- [x] Bloqueio de e-mail duplicado no cadastro
- [x] Sino de notificações in-app
- [ ] Linha do tempo de progresso do paciente

## Área do paciente
- [x] "Minhas Consultas" como tela inicial (próximas + anteriores, entrar na sala)
- [x] "Meu Cadastro" — dados pessoais mantidos pelo próprio paciente
- [x] O que o paciente edita atualiza sozinho na grade da psicóloga (mesma linha no banco)

## Módulo de Videochamada
- [x] MiroTalk SFU embutido (instância pública; VITE_MIROTALK_URL para self-host)
- [x] Sala por agendamento (sala-apt<id>), ligando prontuário e anotações
- [x] Prontuário em aba separada da chamada, só para a psicóloga
- [x] Botão "Copiar link da sala" (psicóloga)
- [x] Anotações da sessão com auto-save durante a chamada
- [x] Notificações de presença em tempo real (WebSocket)
- [x] Registro da chamada no banco (videoCalls) + campo recordingUrl
- [ ] Gravação de fato — exige self-host do MiroTalk (a instância pública não grava)
- [ ] Tela de histórico de videochamadas

## Prontuários
- [x] Cadastro, listagem, edição e visualização
- [x] Registro e histórico de sessões (evolução clínica)
- [x] Upload/download/exclusão de documentos (Supabase Storage privado + URL assinada)

## Agendamento
- [x] Criação, listagem e cancelamento (psicóloga)
- [x] Status: agendado, realizado, cancelado, não compareceu
- [x] Confirmação de presença pelo paciente (appointments.confirm + confirmedAt)
- [ ] Calendário com escolha de horário pelo paciente

## Lembretes e Notificações
- [x] Fila de e-mail com retentativa (agendador a cada 15 min)
- [x] Alertas para a psicóloga (novo agendamento, cancelamento, nova solicitação de CRP)
- [x] Aviso de solicitação com notifiedAt/notifyError (não se perde, mostra o motivo da falha)
- [ ] **Envio de e-mail via API HTTP da Brevo** — código pronto; falta o usuário pôr
      BREVO_API_KEY (xkeysib-...) no Render. O Render free bloqueia SMTP.
- [ ] Deliverability: remetente é @gmail (freemail) → Gmail/Outlook mandam p/ spam.
      Resolve com domínio próprio (o mesmo do item da URL).

## Infra, Segurança e Testes
- [x] Postgres no Supabase (migrado do MySQL) via pooler de transações
- [x] RLS ligado em todas as 10 tabelas (sem políticas = trancado na API pública)
- [x] Auth SÓ Supabase — login OAuth do Manus (forjável) removido, 9 arquivos mortos apagados
- [x] Senha forte imposta no Supabase Auth (min 8, maiúscula/minúscula/número/símbolo)
- [x] Deploy contínuo no Render (Docker, plano free)
- [x] CI no GitHub Actions (typecheck + testes unitários + integração com Postgres)
- [x] Schema do código == banco de produção (auditado programaticamente em 2026-07-15)
- [ ] **Rotacionar segredos que vazaram no chat**: JWT_SECRET, senha do banco,
      App Password do Gmail, PAT do Supabase, chave da Brevo
- [ ] **Projeto Supabase separado para dev** — hoje `.env.local` aponta para produção
- [ ] Leaked Password Protection (HaveIBeenPwned) — só no plano Pro do Supabase
- [ ] Sem FOREIGN KEY no banco: órfão é possível. Evitado no código; considerar FKs.
- [ ] Ligar "Leaked Password Protection" no painel do Supabase Auth
- [ ] Backup e recuperação de dados
- [ ] Remover resíduo do framework Manus em `server/_core/`
