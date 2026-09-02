/**
 * "Adicionar à agenda" — link do Google Agenda e arquivo .ics.
 *
 * Escolha deliberada: NÃO sincronizamos via API do Google. Sincronizar exigiria
 * OAuth, tela de consentimento e guardar refresh tokens de terceiros — peso de
 * segurança/LGPD que não se paga num app clínico pequeno. Aqui a pessoa clica e o
 * evento entra no calendário DELA, que passa a fazer o lembrete sozinho. O .ics
 * cobre quem não usa Google (Apple, Outlook).
 */

export type EventoAgenda = {
  titulo: string;
  inicio: Date;
  duracaoMin: number;
  descricao?: string;
  /** Link da sala da videochamada, quando houver. */
  url?: string;
  /** Identificador estável do evento (permite o calendário atualizar em vez de duplicar). */
  uid?: string;
};

/** Data no formato do Google Agenda / iCalendar, sempre em UTC: 20260825T170000Z. */
function paraUTC(data: Date): string {
  return data.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function fim(evento: EventoAgenda): Date {
  const minutos = evento.duracaoMin > 0 ? evento.duracaoMin : 60;
  return new Date(evento.inicio.getTime() + minutos * 60_000);
}

function corpo(evento: EventoAgenda): string {
  return [evento.descricao, evento.url].filter(Boolean).join("\n\n");
}

/** Link que abre o Google Agenda com o evento pronto para salvar. */
export function googleCalendarUrl(evento: EventoAgenda): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: evento.titulo,
    dates: `${paraUTC(evento.inicio)}/${paraUTC(fim(evento))}`,
  });
  const detalhes = corpo(evento);
  if (detalhes) params.set("details", detalhes);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Escapa texto para iCalendar (RFC 5545): barra, vírgula e ponto e vírgula são
 * separadores no formato, e a quebra de linha vira o literal \n.
 */
function escaparIcs(texto: string): string {
  return texto
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Conteúdo de um arquivo .ics com um alarme 30 min antes. Linhas terminam em
 * CRLF porque o RFC 5545 exige — sem isso vários clientes recusam o arquivo.
 */
export function icsEvento(evento: EventoAgenda, agora = new Date()): string {
  const uid = evento.uid || `${paraUTC(evento.inicio)}-vozinterior`;
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VozInterior//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${paraUTC(agora)}`,
    `DTSTART:${paraUTC(evento.inicio)}`,
    `DTEND:${paraUTC(fim(evento))}`,
    `SUMMARY:${escaparIcs(evento.titulo)}`,
  ];
  const detalhes = corpo(evento);
  if (detalhes) linhas.push(`DESCRIPTION:${escaparIcs(detalhes)}`);
  if (evento.url) linhas.push(`URL:${evento.url}`);
  linhas.push(
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Lembrete da consulta",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  );
  return linhas.join("\r\n");
}

/** Nome sugerido para o arquivo baixado. */
export function nomeArquivoIcs(evento: EventoAgenda): string {
  return `consulta-${paraUTC(evento.inicio).slice(0, 8)}.ics`;
}
