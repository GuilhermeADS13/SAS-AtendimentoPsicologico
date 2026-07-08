# Plataforma de Atendimento Psicológico Online - TODO

## Autenticação e Usuários
- [x] Tela de login com OAuth Manus
- [x] Tela de registro/convite para psicóloga
- [ ] Perfil da psicóloga com informações profissionais (nome, CRP, foto, especialidades)
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
- [ ] Histórico de videochamadas - próxima fase
- [ ] Gravação de chamadas - próxima fase

## Módulo de Prontuários
- [x] Schema de banco de dados para pacientes e prontuários
- [x] Cadastro de pacientes (dados pessoais, contato, histórico clínico)
- [x] Listagem de pacientes
- [ ] Edição de dados do paciente - próxima fase
- [ ] Registro de sessões (data, anotações, evolução clínica) - próxima fase
- [ ] Visualização de histórico de sessões - próxima fase
- [ ] Linha do tempo de progresso do paciente - próxima fase
- [ ] Upload e armazenamento seguro de documentos (laudos, receitas, anexos) - próxima fase
- [ ] Visualização de documentos anexados - próxima fase
- [ ] Exclusão segura de documentos - próxima fase

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
- [ ] Envio automático de e-mail para pacientes (24h antes) - próxima fase
- [ ] Envio automático de alertas para psicóloga (novo agendamento, cancelamento) - próxima fase
- [ ] Notificações in-app para psicóloga - próxima fase
- [ ] Histórico de notificações enviadas - próxima fase

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
