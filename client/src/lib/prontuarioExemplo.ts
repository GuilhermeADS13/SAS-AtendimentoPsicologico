/**
 * Prontuário de EXEMPLO (/records/exemplo): dados fictícios para a psicóloga ver
 * como o prontuário funciona — é por ele que o tour da Luma passa, inclusive
 * para quem ainda não tem paciente. Nada daqui vai para o banco: a tela não
 * busca nem grava nada no modo exemplo (ver PatientDetail).
 *
 * Datas calculadas a partir de HOJE, para o exemplo sempre parecer atual.
 */

export const ID_EXEMPLO = "exemplo";

const DIA = 86_400_000;
/** Data de N dias atrás, às 14h (horário local). */
function diasAtras(n: number): Date {
  const d = new Date(Date.now() - n * DIA);
  d.setHours(14, 0, 0, 0);
  return d;
}

export function prontuarioDeExemplo() {
  const inicio = diasAtras(91);
  const paciente = {
    id: 0,
    therapistId: 0,
    userId: null,
    firstName: "Paciente",
    lastName: "de Exemplo",
    email: "paciente@exemplo.com",
    phone: "(81) 90000-0000",
    dateOfBirth: new Date("1994-05-10T12:00:00Z"),
    address: "Rua Fictícia, 100 — Recife/PE",
    photoKey: null,
    medicalHistory: "Sem diagnósticos prévios. Nega uso de medicação contínua.",
    frequencia: "semanal",
    emergencyContact: "Contato fictício (irmã)",
    emergencyPhone: "(81) 90000-0001",
    guardianName: null,
    guardianConsentAt: null,
    initialDemand: "Ansiedade e insônia ligadas à sobrecarga no trabalho.",
    therapeuticGoals: "Reduzir a ansiedade, regularizar o sono e construir limites no trabalho.",
    dischargeSummary: null,
    dischargedAt: null,
    anamnesis: {
      profissao: "Analista administrativa",
      estadoCivil: "Solteira",
      queixaPrincipal: "Ansiedade constante e dificuldade para dormir.",
      historiaQueixa: "Começou há cerca de 3 meses, após mudança de setor no trabalho.",
      qualidadeSono: "Dorme 4 a 5 horas; acorda várias vezes.",
      comQuemReside: "Mora sozinha.",
      redeApoio: "Irmã e duas amigas próximas.",
      rotinaDiaria: "Trabalho das 8h às 18h, quase sem pausas.",
      demandaManifesta: "Quer dormir melhor e se sentir menos sobrecarregada.",
      hipoteseInicial: "Quadro ansioso reativo ao contexto de trabalho.",
    },
    tcle: {
      duracaoSessao: "50 minutos",
      frequencia: "Semanal",
      valorSessao: "R$ 150,00",
      formaPagamento: "Pix",
      antecedenciaCancelamento: "24 horas",
      local: "Online, pela videochamada da plataforma",
    },
    tcleSignedAt: inicio,
    status: "active" as const,
    createdAt: inicio,
    updatedAt: inicio,
  };

  const sessao = (id: number, dias: number, extra: Record<string, unknown>) => {
    const startedAt = diasAtras(dias);
    return {
      id,
      appointmentId: 0,
      patientId: 0,
      therapistId: 0,
      startedAt,
      endedAt: null,
      clinicalNotes: null,
      treatment: null,
      nextSteps: null,
      mood: null,
      subjective: null,
      objective: null,
      assessment: null,
      plan: null,
      moodScore: null,
      fase: null,
      createdAt: startedAt,
      updatedAt: startedAt,
      ...extra,
    };
  };
  // Mais recente primeiro, como vem do servidor.
  const sessoes = [
    sessao(8, 7, {
      moodScore: 8,
      mood: "estável",
      // Em markdown, como sai do editor de anotações (negrito e lista).
      clinicalNotes: "**Evolução**\n\nSono regular (7h). Conversamos sobre espaçar para quinzenal.\n\n- Manter o registro de sono\n- Revisar as conquistas na próxima sessão",
    }),
    sessao(7, 14, { moodScore: 7, fase: "manutencao", mood: "estável", subjective: "Conseguiu dizer não a uma demanda extra no trabalho.", plan: "Manter os registros e revisar as conquistas." }),
    sessao(6, 21, { moodScore: 7, clinicalNotes: "Identificou pensamentos automáticos no trabalho. Boa adesão às tarefas." }),
    sessao(5, 28, { moodScore: 6, mood: "mais calma", subjective: "Voltou das férias e diz que o sono melhorou.", plan: "Reestruturação cognitiva." }),
    sessao(4, 63, { moodScore: 5, fase: "intervencao", clinicalNotes: "Treino de respiração diafragmática e higiene do sono." }),
    sessao(3, 77, { moodScore: 4, clinicalNotes: "Trouxe o registro de sono: dorme 4 a 5 horas." }),
    sessao(2, 84, { moodScore: 4, mood: "ansiosa", clinicalNotes: "Psicoeducação sobre ansiedade. Combinado o registro de sono." }),
    sessao(1, 91, {
      moodScore: 3,
      fase: "avaliacao",
      mood: "ansiosa",
      subjective: "Relata insônia há 3 meses e preocupação constante com o trabalho.",
      objective: "Fala acelerada, inquieta.",
      assessment: "Quadro compatível com ansiedade; vínculo inicial bom.",
      plan: "Psicoeducação e registro de sono.",
    }),
  ];

  const documentos = [
    {
      id: -1,
      patientId: 0,
      therapistId: 0,
      sessionId: null,
      fileName: "Encaminhamento-exemplo.pdf",
      fileKey: "",
      fileUrl: "",
      fileType: "application/pdf",
      fileSize: 84_000,
      documentType: "other",
      description: null,
      createdAt: diasAtras(84),
      updatedAt: diasAtras(84),
    },
  ];

  const consulta = (id: number, dias: number, paid: boolean) => ({
    id,
    patientId: 0,
    therapistId: 0,
    scheduledAt: diasAtras(dias),
    duration: 50,
    status: "completed" as const,
    notes: null,
    price: 15_000,
    paid,
    paidAt: paid ? diasAtras(dias) : null,
    roomToken: "",
    confirmedAt: null,
    createdAt: diasAtras(dias + 2),
    updatedAt: diasAtras(dias),
    paymentUpdatedBy: null,
    paymentUpdatedByName: null,
  });
  const consultas = [consulta(-3, 21, true), consulta(-2, 14, true), consulta(-1, 7, false)];

  return { paciente, sessoes, documentos, consultas };
}
