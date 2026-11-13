/**
 * Matriz de acesso: TODA rota do tRPC, chamada como visitante, paciente, psicóloga
 * (com e sem aparelho confirmado) e admin. O nível de cada rota sai da resposta, e
 * a lista abaixo é o que a gente decidiu que ela deve ser.
 *
 * Rota nova, ou rota que mudou de nível, faz este teste falhar até alguém conferir
 * e acrescentar à lista. É o jeito de uma rota esquecida sem login (ou de psicóloga
 * aberta a paciente) não chegar à produção. Só o nível é testado aqui: se a rota
 * filtra pelo DONO dos dados (IDOR) fica nos testes de cada área e no de integração.
 *
 * Roda sem banco e sem rede: as chamadas param no controle de acesso ou na
 * validação da entrada.
 */
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "";
});
vi.stubGlobal("fetch", async () => {
  throw new Error("sem rede no teste");
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type Nivel = "publica" | "conta" | "logada" | "psicologa" | "admin";

/**
 * publica   — sem login
 * conta     — logada, ANTES de confirmar o aparelho (só o próprio código de aparelho)
 * logada    — qualquer conta logada (paciente incluso), com aparelho confirmado
 * psicologa — psicóloga ou admin, com aparelho confirmado
 * admin     — só admin, com aparelho confirmado
 */
const ESPERADO: Record<Nivel, string[]> = {
  publica: [
    "auth.faixaDeSenhasVazadas", "auth.logout", "auth.me", "auth.requestPasswordReset",
    "auth.signUp", "system.health", "conhecer.buscar", "conhecer.perfil",
  ],
  conta: [
    "aparelho.confirmarCodigo", "aparelho.enviarCodigo", "auth.completarCadastro",
  ],
  logada: [
    "aparelho.encerrarSessao", "aparelho.listar", "aparelho.remover", "aparelho.sairDeTodos",
    "aparelho.sessoes", "me.avisosPorEmail",
    "me.definirAvisosPorEmail", "me.exportarMeusDados",
    "ai.history", "ai.siteHelp", "appointments.roomAccess", "chat.attachmentUrl", "chat.delete",
    "chat.edit", "chat.gifs", "chat.gifsDisponiveis", "chat.limiteDeAnexo", "chat.markRead",
    "chat.messages", "chat.send", "chat.setTyping", "chat.typingStatus", "chat.unreadCount",
    "me.appointments", "me.completeOnboarding", "me.confirmAppointment", "me.confirmEmailChange",
    "me.contato", "me.dismissAllNotifications", "me.dismissNotification", "me.documentos",
    "me.informarPagamento", "me.invitation", "me.notifications", "me.onboarding",
    "me.pixDaPsicologa", "me.profile", "me.requestEmailChange", "me.requestTherapist",
    "me.saveProfile", "me.therapist", "me.therapistRequest", "me.updatePhone", "me.urlDoDocumento",
    "videoCalls.iceServers", "conhecer.cancelarMeuPedido", "conhecer.minhaSituacao",
    "conhecer.pedir", "conhecer.salvarMeuPerfil",
  ],
  psicologa: [
    "conhecer.abrirHorario", "conhecer.aceitar", "conhecer.fecharHorario", "conhecer.minhaVitrine",
    "conhecer.pedidosRecebidos", "conhecer.recusar", "conhecer.salvarVitrine",
    "ai.chat", "ai.confirmAction", "ai.feedback", "appointments.adicionarParticipante",
    "appointments.create", "appointments.editar", "appointments.list",
    "appointments.pagamentosInformados", "appointments.participantes",
    "appointments.recusarPagamentoInformado", "appointments.removerParticipante",
    "appointments.setPayment", "appointments.updateStatus", "assinatura.definirVencimento",
    "assinatura.minha", "assinatura.mudarPlano", "chat.threads", "documents.compartilhar",
    "documents.create", "documents.delete", "documents.getByPatient", "documents.textoDoArquivo",
    "documents.urlDoArquivo", "gestao.relatorio", "listaDeEspera.listar", "listaDeEspera.remover", "listaDeEspera.salvar",
    "noteTemplates.clearContrato",
    "noteTemplates.clearModelo", "noteTemplates.getContrato", "noteTemplates.getModelo",
    "noteTemplates.importarContrato", "noteTemplates.list", "noteTemplates.save",
    "noteTemplates.saveContrato", "noteTemplates.saveModelo", "notifications.dismiss",
    "notifications.dismissAll", "notifications.list", "patients.create",
    "patients.definirCpf", "patients.definirFrequencia", "patients.delete", "patients.fotos", "patients.get", "patients.importar",
    "patients.list", "patients.update", "sessionNotes.getByAppointment",
    "sessionNotes.getByPatient", "sessionNotes.save", "sessions.classificar", "sessions.create",
    "sessions.getByPatient", "sessions.list", "therapists.definirDadosDoRecibo", "therapists.definirPix",
    "therapists.definirPixPorCopiaECola", "therapists.me", "therapists.removerPix",
    "therapists.upsert", "videoCalls.finish", "videoCalls.getByPatient", "videoCalls.start",
  ],
  admin: [
    "admin.assinaturas", "admin.definirFundador", "admin.definirSobMedida", "admin.registrarPix",
    "admin.reviewTherapistRequest", "admin.therapistRequests", "admin.tirarDoSobMedida",
  ],
};

function contexto(role: string | null, aparelhoVerificado = true): TrpcContext {
  const user = role
    ? {
        id: 424242, openId: "sb:matriz", email: "matriz@teste.local", name: "Matriz", loginMethod: "test",
        role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
      }
    : null;
  return {
    user,
    aparelhoVerificado,
    req: { protocol: "https", headers: {}, ip: "127.0.0.1", socket: {} },
    res: { clearCookie: () => {}, cookie: () => {} },
  } as unknown as TrpcContext;
}

const PERFIS = {
  visitante: contexto(null),
  paciente: contexto("user"),
  psicologaSemAparelho: contexto("therapist", false),
  psicologa: contexto("therapist"),
  admin: contexto("admin"),
  adminSemAparelho: contexto("admin", false),
};
type Perfil = keyof typeof PERFIS;
type Resposta = "passa" | "sem-login" | "proibido" | "aparelho";

/** Chama a rota sem entrada. "passa" = venceu o controle de acesso (pode falhar depois, na validação). */
async function resposta(perfil: Perfil, rota: string): Promise<Resposta> {
  const caller = appRouter.createCaller(PERFIS[perfil]) as unknown as Record<string, unknown>;
  const chamar = rota.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], caller) as (
    entrada: unknown,
  ) => Promise<unknown>;
  try {
    await chamar(undefined);
    return "passa";
  } catch (erro) {
    const { code, message } = erro as { code?: string; message?: string };
    if (code === "UNAUTHORIZED") return "sem-login";
    if (code === "FORBIDDEN") return /aparelho/i.test(message ?? "") ? "aparelho" : "proibido";
    return "passa";
  }
}

async function nivelObservado(rota: string): Promise<Nivel | string> {
  const r = Object.fromEntries(
    await Promise.all((Object.keys(PERFIS) as Perfil[]).map(async (p) => [p, await resposta(p, rota)] as const)),
  ) as Record<Perfil, Resposta>;
  if (r.visitante === "passa") return "publica";
  if (r.psicologa === "proibido" && r.admin === "passa" && r.adminSemAparelho === "aparelho") return "admin";
  if (r.paciente === "proibido" && r.psicologa === "passa" && r.psicologaSemAparelho === "aparelho") return "psicologa";
  if (r.paciente === "passa" && r.psicologaSemAparelho === "aparelho") return "logada";
  if (r.paciente === "passa" && r.psicologaSemAparelho === "passa") return "conta";
  return `desconhecido ${JSON.stringify(r)}`;
}

const todasAsRotas = Object.keys(
  (appRouter as unknown as { _def: { procedures: Record<string, unknown> } })._def.procedures,
).sort();

describe("matriz de acesso das rotas", () => {
  it("toda rota do servidor está na lista, e nenhuma da lista sumiu", () => {
    const listadas = Object.values(ESPERADO).flat().sort();
    expect(todasAsRotas.filter((r) => !listadas.includes(r)), "rotas novas: classifique em ESPERADO").toEqual([]);
    expect(listadas.filter((r) => !todasAsRotas.includes(r)), "rotas que não existem mais").toEqual([]);
  });

  it("cada rota tem o nível de acesso esperado", async () => {
    const divergentes: string[] = [];
    for (const [nivel, rotas] of Object.entries(ESPERADO)) {
      for (const rota of rotas) {
        const observado = await nivelObservado(rota);
        if (observado !== nivel) divergentes.push(`${rota}: esperado ${nivel}, observado ${observado}`);
      }
    }
    expect(divergentes).toEqual([]);
  }, 60_000);

  it("só estas rotas atendem sem login", () => {
    // Abrir uma rota a visitantes é decisão de segurança: entra aqui de propósito.
    expect(ESPERADO.publica).toEqual([
      "auth.faixaDeSenhasVazadas", "auth.logout", "auth.me", "auth.requestPasswordReset",
      "auth.signUp", "system.health",
      // Busca de psicólogas aberta ao público (decisão do Guilherme em 2026-11-13). Só
      // mostra quem ligou "aparecer na busca", sem valor, e-mail nem telefone.
      "conhecer.buscar", "conhecer.perfil",
    ]);
  });
});
