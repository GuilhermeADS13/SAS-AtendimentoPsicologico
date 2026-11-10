/**
 * Lista de espera (2026-11-10): quem quer um horário com a psicóloga e quando.
 * Quando uma consulta é desmarcada, a Agenda mostra quem da lista quer aquele dia
 * e período, com a mensagem pronta para o WhatsApp. Ninguém é avisado sozinho:
 * a psicóloga escolhe para quem oferecer.
 *
 * diasDaSemana: 0 = domingo ... 6 = sábado. Vazio = qualquer dia.
 * periodos: "manha" | "tarde" | "noite". Vazio = qualquer horário.
 */

export const PERIODOS = [
  { id: "manha", rotulo: "Manhã", ate: 12 },
  { id: "tarde", rotulo: "Tarde", ate: 18 },
  { id: "noite", rotulo: "Noite", ate: 24 },
] as const;
export type Periodo = (typeof PERIODOS)[number]["id"];
export const IDS_DOS_PERIODOS = PERIODOS.map((p) => p.id) as [Periodo, ...Periodo[]];

export const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

const FUSO = "America/Sao_Paulo";

/** Dia da semana e hora no horário de Brasília (o servidor e o aparelho podem estar em outro fuso). */
function diaEHora(d: Date): { dia: number; hora: number } {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: FUSO, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(d);
  const semana = partes.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? 0);
  return { dia: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(semana), hora };
}

export function periodoDoHorario(d: Date): Periodo {
  const { hora } = diaEHora(d);
  return PERIODOS.find((p) => hora < p.ate)!.id;
}

export type Preferencia = { diasDaSemana: number[]; periodos: string[] };

/** A pessoa da lista quer o horário que vagou? */
export function querEsteHorario(pref: Preferencia, d: Date): boolean {
  const { dia } = diaEHora(d);
  const diaServe = pref.diasDaSemana.length === 0 || pref.diasDaSemana.includes(dia);
  const periodoServe = pref.periodos.length === 0 || pref.periodos.includes(periodoDoHorario(d));
  return diaServe && periodoServe;
}

/** "Seg e Qua · Manhã" / "Qualquer dia · Tarde ou Noite". */
export function descricaoDaPreferencia(pref: Preferencia): string {
  const juntar = (itens: string[], ultimo: string) =>
    itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} ${ultimo} ${itens[itens.length - 1]}`;
  const dias = pref.diasDaSemana.length
    ? juntar([...pref.diasDaSemana].sort().map((d) => DIAS_CURTOS[d]), "e")
    : "Qualquer dia";
  const periodos = pref.periodos.length
    ? juntar(PERIODOS.filter((p) => pref.periodos.includes(p.id)).map((p) => p.rotulo), "ou")
    : "Qualquer horário";
  return `${dias} · ${periodos}`;
}

/** Link do WhatsApp para um telefone brasileiro, ou null sem telefone. */
export function linkDoWhatsApp(telefone: string | null | undefined, mensagem: string): string | null {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return null;
  const numero = digitos.startsWith("55") && digitos.length >= 12 ? digitos : `55${digitos}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

export function mensagemDeHorarioLivre({ primeiroNome, quando }: { primeiroNome: string; quando: string }): string {
  return (
    `Olá, ${primeiroNome}! Tudo bem?\n\n` +
    `Abriu um horário na minha agenda: ${quando}. Você estava na minha lista de espera; quer ficar com ele?\n\n` +
    `Me responde por aqui que eu já marco para você.`
  );
}
