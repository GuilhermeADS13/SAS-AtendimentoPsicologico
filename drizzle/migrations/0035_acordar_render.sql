-- "Acordador" do Render: o plano grátis desliga o serviço depois de 15 min sem
-- tráfego, e o próximo visitante espera ~1 min na tela de carregamento do Render.
-- O cron do GitHub (uptime.yml) não serve para isso: o GitHub atrasa tarefa de
-- alta frequência e ela roda de horas em horas.
--
-- Aqui o próprio Supabase (pg_cron + pg_net, ambos do plano grátis) acessa a
-- página inicial a cada 10 min. Só um GET na página pública: não lê nem grava
-- dado nenhum. Cabe nas 750 h/mês grátis do Render (31 dias = 744 h) enquanto o
-- SAS for o ÚNICO serviço grátis da conta.
--
-- Para desligar: select cron.unschedule('acordar-render');
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'acordar-render',
  '*/10 * * * *',
  $$ select net.http_get(url := 'https://sas-atendimento-psicologico.onrender.com/', timeout_milliseconds := 30000) $$
);
