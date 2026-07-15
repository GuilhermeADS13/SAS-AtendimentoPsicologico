# Plataforma de Atendimento Psicológico Online — TODO

Estado em 2026-07-15. Em produção: https://sas-atendimento-psicologico.onrender.com

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
- [x] E-mail para pacientes (fila + SMTP Gmail + agendador opt-in)
- [x] Alertas para a psicóloga (novo agendamento, cancelamento, nova solicitação de CRP)
- [x] Histórico de notificações enviadas

## Infra, Segurança e Testes
- [x] Postgres no Supabase (migrado do MySQL) via pooler de transações
- [x] RLS ligado em todas as 10 tabelas (sem políticas = trancado na API pública)
- [x] Deploy contínuo no Render (Docker, plano free)
- [x] CI no GitHub Actions (typecheck + 24 testes unitários + testes de integração com Postgres)
- [ ] **Rotacionar segredos que vazaram no chat**: App Password do Gmail, senha do banco, PAT do Supabase
- [ ] **Projeto Supabase separado para dev** — hoje `.env.local` aponta para produção
- [ ] Ligar "Leaked Password Protection" no painel do Supabase Auth
- [ ] Backup e recuperação de dados
- [ ] Remover resíduo do framework Manus em `server/_core/`
