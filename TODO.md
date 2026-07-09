# Plataforma de Atendimento Psicológico Online - TODO

## Autenticação e Usuários
- [x] Tela de login com OAuth Manus
- [x] Tela de registro/convite para psicóloga
- [x] Perfil da psicóloga com informações profissionais (CRP, foto, especialidades, bio) via /profile
- [x] Gestão de papéis (psicóloga/admin vs paciente)

## Design e Identidade Visual
- [x] Paleta de cores (#EAD2A8, #8B6946) implementada no Tailwind
- [ ] Logo da Beatriz Chagas integrada
- [x] Layout responsivo e acessível
- [x] Componentes customizados seguindo identidade visual

## Dashboard Principal
- [x] Layout com navegação por abas (Videochamada, Prontuários, Agendamentos)
- [x] Sidebar com menu de navegação
- [x] Indicadores de status (consultas agendadas, pacientes, etc)

## Módulo de Videochamada

- [x] Integração com Jitsi Meet para videochamadas em tempo real
- [x] Componente JitsiMeeting criado
- [x] Página VideoCallJitsi com Jitsi integrado
- [x] Sala de espera virtual para pacientes (WaitingRoom.tsx)
- [x] Painel lateral com prontuário durante videochamada
- [x] URLs únicas por agendamento (geração automática)
- [x] Rota dinâmica para videochamada por roomId
- [x] Integração com MiroTalk SFU (substituir Jitsi)
- [x] Gravação automática de sessões com MiroTalk
- [x] Whiteboard colaborativo durante sessão (nativo do MiroTalk)
- [x] REST API integration com MiroTalk backend
- [ ] Histórico de videochamadas - próxima fase
- [ ] Gravação de chamadas - próxima fase

## Módulo de Prontuários
- [x] Schema de banco de dados para pacientes e prontuários
- [x] Cadastro de pacientes (dados pessoais, contato, histórico clínico)
- [x] Listagem de pacientes
- [x] Edição de dados do paciente (get/update via tRPC + tela PatientDetail)
- [x] Registro de sessões (data, anotações, evolução clínica) via tRPC no PatientDetail
- [x] Visualização de histórico de sessões (aba Sessões do paciente)
- [ ] Linha do tempo de progresso do paciente - próxima fase
- [x] Upload e armazenamento seguro de documentos (Supabase Storage + RLS por usuário)
- [x] Visualização de documentos anexados (URL assinada temporária)
- [x] Exclusão segura de documentos (metadado + arquivo no Storage)

## Módulo de Agendamento
- [x] Schema de banco de dados para agendamentos
- [x] Calendário interativo para seleção de datas/horários
- [x] Criação de agendamentos (psicóloga)
- [x] Visualização de agendamentos (psicóloga e paciente)
- [x] Status de agendamentos (agendado, realizado, cancelado)
- [x] Cancelamento de agendamentos
- [ ] Confirmação de presença - próxima fase

## Lembretes e Notificações
- [x] Schema para armazenar configurações de lembretes
- [x] Envio automático de e-mail para pacientes (fila + mailer SMTP + agendador opt-in)
- [x] Envio automático de alertas para psicóloga (novo agendamento, cancelamento)
- [ ] Notificações in-app para psicóloga (router notifications.list pronto; falta UI)
- [x] Histórico de notificações enviadas (notifications.list)

## Armazenamento e Segurança
- [ ] Upload de arquivos para S3 - próxima fase
- [ ] Validação de tipos de arquivo - próxima fase
- [ ] Criptografia de documentos sensíveis - próxima fase
- [ ] Controle de acesso a documentos - próxima fase
- [ ] Backup e recuperação de dados - próxima fase

## Testes
- [ ] Testes unitários para procedures tRPC - próxima fase
- [ ] Testes de integração para fluxos principais - próxima fase
- [ ] Testes de autenticação - próxima fase

## Deploy e Produção
