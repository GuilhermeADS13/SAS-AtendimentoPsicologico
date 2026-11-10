/**
 * Dados FICTÍCIOS da demonstração (lib/demonstracao.ts). Pessoas, telefones e
 * e-mails inventados; datas calculadas a partir de hoje, para a agenda sempre
 * parecer atual. Cada valor é tipado com a saída real da rota: se o servidor
 * mudar o formato, o typecheck acusa aqui.
 */
import type { RouterOutputs } from "./trpc";
import { prontuarioDeExemplo } from "./prontuarioExemplo";
import { planoEfetivo, valorDoPlano } from "@shared/precos";
import { avisosComPadrao } from "@shared/avisosPorEmail";

type O = RouterOutputs;
const DIA = 86_400_000;

/** Hoje + N dias, na hora dada (horário do aparelho). */
function dia(n: number, hora: number, minuto = 0): Date {
  const d = new Date(Date.now() + n * DIA);
  d.setHours(hora, minuto, 0, 0);
  return d;
}

const ID_PSICOLOGA = 9001;
const ID_USUARIA = 9000;

const PACIENTES = [
  { id: 101, firstName: "Ana Beatriz", lastName: "Rocha", phone: "(81) 90000-1001", status: "active", desde: 120 },
  { id: 102, firstName: "Carlos", lastName: "Menezes", phone: "(81) 90000-1002", status: "active", desde: 75 },
  { id: 103, firstName: "Juliana", lastName: "Prates", phone: "(81) 90000-1003", status: "active", desde: 40 },
  { id: 104, firstName: "Marcos", lastName: "Vieira", phone: "(81) 90000-1004", status: "active", desde: 20 },
  { id: 105, firstName: "Helena", lastName: "Duarte", phone: "(81) 90000-1005", status: "pending", desde: 3 },
] as const;

function paciente(p: (typeof PACIENTES)[number]): O["patients"]["get"] {
  const base = prontuarioDeExemplo().paciente;
  return {
    ...(base as unknown as NonNullable<O["patients"]["get"]>),
    id: p.id,
    therapistId: ID_PSICOLOGA,
    firstName: p.firstName,
    lastName: p.lastName,
    email: `${p.firstName.split(" ")[0].toLowerCase()}@exemplo.com`,
    phone: p.phone,
    status: p.status,
    createdAt: dia(-p.desde, 10),
    updatedAt: dia(-1, 10),
  } as NonNullable<O["patients"]["get"]>;
}

let proximoId = 5000;
function consulta(patientId: number, quando: Date, extra: Partial<O["appointments"]["list"][number]> = {}): O["appointments"]["list"][number] {
  const passou = quando.getTime() < Date.now();
  return {
    id: proximoId++,
    therapistId: ID_PSICOLOGA,
    patientId,
    scheduledAt: quando,
    duration: 50,
    status: passou ? "completed" : "scheduled",
    notes: null,
    price: 15_000,
    paid: passou,
    paidAt: passou ? quando : null,
    roomToken: "demonstracao",
    confirmedAt: passou ? quando : null,
    pagamentoInformadoEm: null,
    createdAt: dia(-30, 9),
    updatedAt: quando,
    paymentUpdatedBy: null,
    paymentUpdatedByName: null,
    ...extra,
  };
}

/** A agenda é montada uma vez por carregamento (ids estáveis enquanto a pessoa navega). */
let agendaMontada: O["appointments"]["list"] | null = null;
function agenda(): O["appointments"]["list"] {
  if (agendaMontada) return agendaMontada;
  const lista: O["appointments"]["list"] = [];
  // Histórico semanal de quem já está em atendimento.
  PACIENTES.slice(0, 4).forEach((p, i) => {
    for (let semana = Math.floor(p.desde / 7); semana >= 1; semana--) {
      lista.push(consulta(p.id, dia(-semana * 7 + i, 9 + i * 2)));
    }
  });
  // Hoje e os próximos dias.
  lista.push(consulta(101, dia(0, 14), { confirmedAt: dia(-1, 20) }));
  lista.push(consulta(102, dia(0, 16)));
  lista.push(consulta(103, dia(1, 10), { confirmedAt: dia(0, 8) }));
  lista.push(consulta(104, dia(2, 18)));
  lista.push(consulta(105, dia(3, 15)));
  lista.push(consulta(101, dia(7, 14)));
  // Uma que ficou sem pagar e uma em que o paciente avisou o Pix.
  lista.push(consulta(102, dia(-5, 16), { paid: false, paidAt: null }));
  lista.push(consulta(103, dia(-3, 10), { paid: false, paidAt: null, pagamentoInformadoEm: dia(-2, 19) }));
  // Uma desmarcada na semana que vem (a lista de espera tem quem queira o horário).
  lista.push(consulta(104, dia(6, 10), { status: "cancelled", confirmedAt: null }));
  agendaMontada = lista.sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  return agendaMontada;
}

const usuaria: NonNullable<O["auth"]["me"]> = {
  id: ID_USUARIA,
  name: "Camila Andrade",
  email: "demonstracao@exemplo.com",
  loginMethod: "demonstracao",
  role: "therapist",
  createdAt: dia(-150, 9),
  lastSignedIn: dia(0, 8),
  aparelhoVerificado: true,
  cadastroPendente: false,
};

export function respostaDaDemonstracao(caminho: string, entrada: unknown): unknown {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const exemplo = prontuarioDeExemplo();
  const pacienteDoId = (id: unknown) => PACIENTES.find((p) => p.id === Number(id));

  switch (caminho) {
    case "auth.me":
      return usuaria;
    case "therapists.me":
      return {
        id: ID_PSICOLOGA,
        userId: ID_USUARIA,
        crp: "02/00000",
        specialties: "Terapia Cognitivo-Comportamental",
        bio: "Psicóloga clínica. Atendimento online de adultos.",
        phone: "(81) 90000-0000",
        sessionPrice: 15_000,
        formacao: null,
        publicoAtendido: null,
        photoKey: null,
        noteTemplates: null,
        prontuarioModel: null,
        prontuarioModelName: null,
        contratoModelo: null,
        contratoModeloNome: null,
        pixTipo: "email",
        pixChave: "pix@exemplo.com",
        pixCidade: "RECIFE",
        cpf: null,
        endereco: null,
        createdAt: dia(-150, 9),
        updatedAt: dia(-1, 9),
      } satisfies O["therapists"]["me"];
    case "patients.list":
      return PACIENTES.map((p) => {
        const { id, firstName, lastName, email, phone, status, createdAt } = paciente(p)!;
        // Um prontuário com pendência, para o aviso aparecer como apareceria de verdade.
        const pendencias = p.id === 104 ? ["avaliação da demanda inicial", "TCLE assinado"] : [];
        return { id, firstName, lastName, email, phone, status, createdAt, pendencias };
      }) satisfies O["patients"]["list"];
    case "patients.get": {
      const p = pacienteDoId(e.id);
      return p ? paciente(p) : null;
    }
    case "patients.fotos":
      return {} as O["patients"]["fotos"];
    case "appointments.list":
      return agenda();
    case "appointments.pagamentosInformados":
      return agenda()
        .filter((a) => a.pagamentoInformadoEm && !a.paid)
        .map((a) => ({ id: a.id, patientId: a.patientId, scheduledAt: a.scheduledAt, price: a.price, pagamentoInformadoEm: a.pagamentoInformadoEm }));
    case "appointments.participantes":
      return [];
    case "sessions.getByPatient":
      return exemplo.sessoes.map((s) => ({ ...s, patientId: Number(e.patientId) })) as unknown as O["sessions"]["getByPatient"];
    case "sessions.list":
      return [];
    case "documents.getByPatient":
      return exemplo.documentos as unknown as O["documents"]["getByPatient"];
    case "listaDeEspera.listar":
      return [
        { patientId: 105, firstName: "Helena", lastName: "Duarte", phone: "(81) 90000-1005", diasDaSemana: [], periodos: ["manha"], observacao: "Prefere online", createdAt: dia(-3, 9) },
      ] satisfies O["listaDeEspera"]["listar"];
    case "assinatura.minha": {
      // Plano Voz em teste, com tudo liberado: mostra o que ela teria nos 14 dias.
      const plano = planoEfetivo("max", PACIENTES.length);
      return {
        isento: false,
        cortesia: false,
        pacientes: PACIENTES.length,
        plano,
        planoEscolhido: "max",
        situacao: { liberado: true, motivo: "teste", ate: dia(9, 23, 59), diasRestantes: 9 },
        ciclo: "mensal",
        fundador: false,
        diaVencimento: null,
        valorCombinado: null,
        valorCentavos: valorDoPlano(PACIENTES.length, "max", { fundador: false, ciclo: "mensal" }),
        lumaHoje: 0,
        lumaLimite: plano.perguntasLumaPorDia,
        anexoMaxMb: plano.anexoMaxMb,
        // O relatório da clínica (Coro) fica de fora: sem dados de equipe para mostrar.
        recursos: { lumaNoProntuario: true, relatorioDeGestao: false },
      } satisfies O["assinatura"]["minha"];
    }
    case "me.avisosPorEmail":
      return avisosComPadrao(null) satisfies O["me"]["avisosPorEmail"];
    case "me.contato":
      return { email: usuaria.email ?? "", phone: "(81) 90000-0000" } satisfies O["me"]["contato"];
    case "notifications.list":
    case "noteTemplates.list":
    case "chat.threads":
    case "chat.messages":
    case "ai.history":
    case "videoCalls.getByPatient":
    case "aparelho.listar":
    case "aparelho.sessoes":
      return [];
    case "chat.unreadCount":
      return 0;
    case "chat.typingStatus":
      return { typing: false };
    case "noteTemplates.getModelo":
    case "noteTemplates.getContrato":
    case "sessionNotes.getByAppointment":
      return null;
    default:
      // Rota que a demonstração não conhece: a tela trata como "sem dados".
      if (import.meta.env.DEV) console.info("[demonstração] sem dados para", caminho);
      return null;
  }
}
