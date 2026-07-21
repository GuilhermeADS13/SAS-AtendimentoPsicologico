import { describe, expect, it } from "vitest";
import { composeEmail } from "./notifications";

/**
 * A consulta de referência: 24/07/2026 às 15:00 no horário de Brasília
 * (18:00 UTC). O fuso é parte do teste — um e-mail que diz "às 18:00" para uma
 * consulta das 15:00 faz o paciente perder a sessão.
 */
const QUANDO = new Date("2026-07-24T18:00:00Z");

const base = {
  scheduledAt: QUANDO,
  duration: 50,
  patientFirstName: "Lucemy",
  patientLastName: "Souza",
  therapistName: "Beatriz Chagas",
};

function notificacao(
  notificationType: string,
  recipientType: "therapist" | "patient",
) {
  return {
    ...base,
    n: {
      id: 1,
      appointmentId: 7,
      recipientType,
      recipientEmail: "alguem@exemplo.com",
      notificationType,
      status: "pending",
      sentAt: null,
      errorMessage: null,
      createdAt: QUANDO,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

describe("e-mail de notificação: diz QUAL consulta", () => {
  /**
   * O problema real que motivou isto: o e-mail dizia só "Uma consulta foi
   * cancelada", e nem a psicóloga nem o paciente sabiam qual. O assunto é o que
   * mais importa — no celular, muitas vezes é a única coisa que se lê.
   */
  it("põe nome e horário no assunto do cancelamento (psicóloga)", () => {
    const { subject } = composeEmail(notificacao("appointment_cancelled", "therapist"));
    expect(subject).toContain("Lucemy Souza");
    expect(subject).toContain("24/07");
    expect(subject).toContain("15:00");
  });

  /**
   * Cada lado precisa de um nome diferente: a psicóloga quer saber de qual
   * paciente se trata; o paciente, com qual psicóloga é a consulta. Mandar o
   * nome do próprio destinatário seria inútil.
   */
  it("mostra a psicóloga ao paciente, e o paciente à psicóloga", () => {
    const psi = composeEmail(notificacao("appointment_cancelled", "therapist"));
    expect(psi.html).toContain("Lucemy Souza");
    expect(psi.html).toContain("Paciente:");

    const pac = composeEmail(notificacao("appointment_cancelled", "patient"));
    expect(pac.html).toContain("Beatriz Chagas");
    expect(pac.html).toContain("Psicóloga:");
  });

  it("escreve a data por extenso no corpo, no horário de Brasília", () => {
    const { html } = composeEmail(notificacao("new_appointment", "therapist"));
    expect(html).toContain("24 de julho de 2026");
    expect(html).toContain("15:00");
    expect(html).toContain("50 minutos");
  });

  it("nomeia quem confirmou presença", () => {
    const { subject, html } = composeEmail(
      notificacao("appointment_confirmation", "therapist"),
    );
    expect(subject).toContain("Presença confirmada");
    expect(html).toContain("Lucemy Souza");
  });

  /**
   * Nome de paciente é digitado por gente e vai direto para o HTML do e-mail.
   * Sem escapar, um "<" viraria marcação no cliente de e-mail.
   */
  it("escapa o nome do paciente em vez de deixá-lo virar HTML", () => {
    const { html } = composeEmail({
      ...notificacao("appointment_cancelled", "therapist"),
      patientFirstName: "<b>Ana</b>",
      patientLastName: "Lima",
    });
    expect(html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
    expect(html).not.toContain("<b>Ana</b>");
  });

  /**
   * Notificação sem consulta ligada não pode gerar "undefined" no e-mail —
   * melhor omitir a linha do que mostrar lixo para o paciente.
   */
  it("omite os detalhes ausentes em vez de escrever undefined", () => {
    const { subject, html } = composeEmail({
      n: notificacao("appointment_cancelled", "patient").n,
      scheduledAt: null,
      duration: null,
      patientFirstName: null,
      patientLastName: null,
      therapistName: null,
    });
    expect(subject).toBe("Consulta cancelada");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
  });
});
