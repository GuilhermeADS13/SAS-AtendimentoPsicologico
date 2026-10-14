-- Pausa noturna do "acordador" do Render (0035): das 23h às 7h de Brasília o
-- Supabase não acessa o site, e o Render pode dormir — economiza ~8 h/dia das
-- 750 h/mês grátis. Quem entrar nesse intervalo espera ~1 min uma vez.
--
-- O pg_cron do Supabase roda em GMT (UTC); Brasília = UTC-3, sem horário de
-- verão desde 2019. Ativo 07:00–22:50 BRT = 10h–23h e 0h–1h UTC.
-- cron.schedule com o MESMO nome substitui o agendamento anterior.
select cron.schedule(
  'acordar-render',
  '*/10 10-23,0-1 * * *',
  $$ select net.http_get(url := 'https://sas-atendimento-psicologico.onrender.com/', timeout_milliseconds := 30000) $$
);
