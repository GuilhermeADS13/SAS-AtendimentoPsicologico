# Plano de resposta a incidente de segurança

Para usar **durante** um problema: suspeita de invasão, vazamento, senha ou chave
exposta, conta tomada, acesso indevido a prontuário. Siga na ordem. Anote tudo com
data e hora no registro (seção 6) desde o primeiro minuto: o prazo legal conta a
partir de quando se soube.

Escrito em 2026-11-24. Revisar a cada 6 meses ou depois de qualquer incidente.

---

## 0. Quem é quem (decide quem avisa a ANPD)

| Dado | Controlador | O VozInterior é |
|---|---|---|
| Prontuário, sessões, documentos, dados do paciente | **a psicóloga** de cada paciente | operador |
| Conta, assinatura e pagamento da psicóloga; conta do paciente (login) | **o VozInterior** | controlador |

- Dados de paciente: quem comunica a ANPD e os pacientes é a psicóloga. O nosso
  dever é avisá-la **no mesmo dia**, com tudo o que ela precisa para isso (modelo na
  seção 5.2), e ajudar.
- Dados da conta das psicólogas: quem comunica é o VozInterior.

---

## 1. Primeira hora: conter

Prioridade é parar o vazamento, mesmo que o sistema fique fora do ar.

**Se o ataque está em andamento ou não se sabe o tamanho:**
- Render → serviço → **Suspend**. Derruba o site inteiro; não apaga nada.
- Só a Luma: `AI_AGENT_ENABLED=false` no Render.
- Só os e-mails automáticos: `NOTIFICATIONS_ENABLED=false`.
- **Não** desligar `VERIFICACAO_DE_APARELHO` durante um ataque: ela é o que segura
  quem só tem a senha.

**Chave ou senha exposta** (no chat, no Git, num print, num log): trocar na origem e
depois no painel do Render (Environment). Trocar só no Render não basta.

| Variável no Render | Onde gerar outra |
|---|---|
| `DATABASE_URL` (senha do banco) | Supabase → Database → reset da senha |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API keys |
| `BREVO_API_KEY` | Brevo → SMTP & API → API Keys |
| `LLM_API_KEY`, `LLM_FALLBACK_*` | Groq → API Keys (uma por conta) |
| `METERED_API_KEY` | Metered (TURN) |
| `TELEGRAM_BOT_TOKEN` | BotFather → /revoke |
| `PROMETHEUS_METRICS_TOKEN` | qualquer valor aleatório novo |

Atenção: push que mexe no `render.yaml` reaplica os `value:` do arquivo por cima do
painel. Segredo nunca vai no arquivo.

**Conta tomada:**
- Uma conta: no painel de admin, trocar o e-mail pelo suporte (encerra as sessões)
  e pedir à dona para trocar a senha; em Configurações → "Sair de todos os
  aparelhos" ela tira os aparelhos confiáveis.
- Todas as contas: rotacionar a chave de assinatura JWT no Supabase (derruba todas
  as sessões) e apagar os aparelhos confiáveis de todo mundo
  (`delete from "aparelhosConfiaveis"`: todos pedem o código de novo).

---

## 2. Primeiras horas: guardar as provas

Antes de consertar, copiar (o Render guarda log por pouco tempo):
- Logs do Render do período (procure `[seguranca]`, `[trpc]`, `[csp]`).
- Logs do Supabase: Auth (logins), API e Postgres.
- Alertas recebidos no Telegram (`⚠️ VozInterior: ...`).
- O que foi visto, por quem e quando.

Guarde numa pasta fora do repositório. Não cole dado de paciente em chat nem em
issue.

---

## 3. Entender o tamanho

Responder por escrito:
1. O que aconteceu e como entraram (ou como o dado saiu)?
2. Quais dados: prontuário e anotações? documentos? mensagens? só nome e e-mail?
   senhas (o Supabase guarda só o hash)?
3. De quem: quantas psicólogas e quantos pacientes? Tem menor de idade?
4. Desde quando e até quando?
5. O dado ficou exposto ou também foi alterado ou apagado? (Backup noturno no
   repositório privado de backups.)

---

## 4. Precisa comunicar?

Pela LGPD (art. 48) e pela Resolução CD/ANPD nº 15/2024, comunica-se o incidente que
pode trazer **risco ou dano relevante** aos titulares. No VozInterior quase todo
vazamento envolve **dado de saúde** (dado sensível), o que pesa para "relevante".
Na dúvida, comunicar.

**Prazos** (dias úteis, contados de quando se soube que dado pessoal foi atingido):

| O quê | Prazo |
|---|---|
| Comunicação à ANPD (preliminar vale) | 3 dias úteis |
| Comunicação aos titulares | 3 dias úteis |
| Informar à ANPD que os titulares foram avisados | 3 dias úteis depois do aviso |
| Complementar a comunicação à ANPD | até 20 dias úteis |

Agente de tratamento de pequeno porte tem prazo em dobro, mas essa regra pode não
valer para quem trata dado sensível. Trate como 3 dias úteis. Confira o texto
vigente da resolução antes de cada comunicação.

Comunicação à ANPD: formulário de comunicação de incidente no site da ANPD
(gov.br/anpd), pelo controlador.

---

## 5. Modelos de aviso

Cota de e-mail: a Brevo grátis manda 300 por dia, e os avisos de consulta também
gastam dessa cota. Se for avisar muita gente, `NOTIFICATIONS_ENABLED=false` por um dia
ou contratar um mês pago da Brevo.

### 5.1 Às psicólogas (dados da conta delas: nós somos o controlador)

> Assunto: Aviso de incidente de segurança no VozInterior
>
> Olá, [nome]. Em [data], identificamos [o que aconteceu, em uma frase]. Os dados
> da sua conta envolvidos foram: [lista]. [Não] houve acesso a prontuários.
>
> O que já fizemos: [medidas]. O que recomendamos: [trocar a senha / conferir os
> aparelhos em Configurações / ficar atenta a e-mails pedindo código].
>
> Riscos possíveis para você: [ex.: e-mails falsos usando o seu nome].
>
> Comunicamos o ocorrido à ANPD em [data]. Dúvidas: [canal de suporte].

### 5.2 Às psicólogas cujos pacientes foram afetados (elas são as controladoras)

> Assunto: Incidente de segurança com dados dos seus pacientes: o que você precisa saber
>
> Olá, [nome]. Em [data], identificamos [o que aconteceu]. Foram afetados dados de
> [N] pacientes seus: [quais dados] [lista de pacientes no painel / em anexo
> protegido].
>
> Como controladora desses dados, cabe a você comunicar a ANPD e os pacientes em até
> 3 dias úteis a contar de hoje, se houver risco ou dano relevante. Abaixo seguem
> as informações técnicas para o formulário da ANPD e um texto pronto para os
> pacientes. Estamos à disposição para preencher juntas.
>
> - Natureza dos dados: [...]
> - Período: [...]
> - Causa: [...]
> - Medidas tomadas: [...]
> - Medidas para reduzir o dano: [...]

### 5.3 Aos pacientes (texto que a psicóloga envia, ou nós com o aval dela)

> Olá, [nome]. Sua psicóloga, [nome], usa o VozInterior para organizar os
> atendimentos. Em [data], houve [o que aconteceu]. Seus dados envolvidos: [lista].
> Já foi feito: [medidas]. Recomendamos: [ações]. Se tiver dúvidas, fale com sua
> psicóloga ou pelo [canal].

---

## 6. Registro (obrigatório, guardar por 5 anos)

Todo incidente vai para o registro, comunicado ou não. Um arquivo por incidente,
fora do repositório público. Campos mínimos:

- Data e hora em que se soube; quem detectou e como.
- Descrição, causa, dados e titulares afetados (números, não nomes).
- Avaliação de risco e a decisão de comunicar ou não, com o porquê.
- Medidas de contenção e de correção, com datas.
- Comunicações feitas (ANPD, psicólogas, pacientes), com datas e protocolos.

---

## 7. Depois

- Corrigir a causa no código, com teste que reproduz o ataque.
- Revisar este plano e a política de privacidade se algo mudou.
- Registrar o que se aprendeu em `docs/` (sem dado pessoal).

## Onde os alertas aparecem

- Telegram do admin: pico de códigos de acesso errados e de bloqueios por excesso de
  requisições ou de conexões de vídeo (`server/alertaDeSeguranca.ts`).
- E-mail do GitHub: dependência com falha alta (workflow `auditoria.yml`, toda
  segunda e em todo PR) e alertas do Dependabot.
- Uptime: site fora do ar (`uptime.yml`).
