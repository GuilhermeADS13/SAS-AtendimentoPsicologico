import { describe, expect, it } from "vitest";
import { googleCalendarUrl, icsEvento, nomeArquivoIcs } from "../shared/calendario";

// 25/08/2026 às 14:00 no horário de Brasília (-03:00) = 17:00 UTC.
const evento = {
  titulo: "Consulta com Beatriz",
  inicio: new Date("2026-08-25T14:00:00-03:00"),
  duracaoMin: 50,
  descricao: "Sessão online; entre pelo link alguns minutos antes.",
  url: "https://app.exemplo/videocall/apt7-token",
  uid: "apt7@vozinterior",
};

describe("adicionar à agenda", () => {
  it("monta o link do Google com início e fim em UTC", () => {
    const url = googleCalendarUrl(evento);
    expect(url).toContain("calendar.google.com");
    expect(url).toContain("action=TEMPLATE");
    // 14:00 -03:00 => 17:00Z; +50 min => 17:50Z.
    expect(decodeURIComponent(url)).toContain("dates=20260825T170000Z/20260825T175000Z");
    // URLSearchParams codifica espaço como "+" (form-urlencoded), que o Google
    // interpreta como espaço — por isso o "+" vira %20 antes de decodificar.
    expect(decodeURIComponent(url.replace(/\+/g, "%20"))).toContain("Consulta com Beatriz");
  });

  it("usa 60 min quando a duração não é válida", () => {
    const url = googleCalendarUrl({ ...evento, duracaoMin: 0 });
    expect(decodeURIComponent(url)).toContain("20260825T170000Z/20260825T180000Z");
  });

  it("gera um .ics válido, com alarme e linhas em CRLF", () => {
    const ics = icsEvento(evento, new Date("2026-08-01T12:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("\r\nUID:apt7@vozinterior\r\n");
    expect(ics).toContain("\r\nDTSTART:20260825T170000Z\r\n");
    expect(ics).toContain("\r\nDTEND:20260825T175000Z\r\n");
    expect(ics).toContain("TRIGGER:-PT30M");
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("escapa vírgula e ponto e vírgula no texto (separadores do formato)", () => {
    const ics = icsEvento({ ...evento, titulo: "Consulta: Ana, Bia; Cia" });
    expect(ics).toContain("SUMMARY:Consulta: Ana\\, Bia\\; Cia");
  });

  it("nomeia o arquivo pela data da consulta", () => {
    expect(nomeArquivoIcs(evento)).toBe("consulta-20260825.ics");
  });
});
