/**
 * "Encontrar uma psicóloga" (2026-11-13): busca pública, perfil do paciente e pedido de
 * primeira conversa. Regras puras em shared/conhecer.ts; aqui, banco e permissões.
 *
 * Quem vê o quê:
 * - Busca e perfil público: qualquer pessoa, só psicólogas que LIGARAM "aparecer na busca"
 *   e estão com o acesso em dia. Nada de valor da sessão, e-mail ou telefone.
 * - O perfil do paciente (inclusive "o que procura") só vai para a psicóloga a quem ele
 *   pediu o horário.
 * - Aceitar cria a ficha do paciente e a consulta na agenda dela; daí em diante vale o
 *   fluxo normal (e-mail de nova consulta, sala de vídeo, prontuário).
 */
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  appointments,
  assinaturas,
  ferias,
  horariosParaConhecer,
  patients,
  pedidosParaConhecer,
  perfisDePaciente,
  therapists,
  users,
} from "../drizzle/schema";
import {
  ANTECEDENCIA_MINIMA_MIN,
  DURACAO_PRIMEIRA_CONVERSA,
  DURACOES_PERMITIDAS,
  EXPLICACAO_DO_MOTIVO,
  MAX_CONVITES_PENDENTES,
  MAX_CONVITES_POR_DIA,
  MAX_HORARIOS_ABERTOS,
  MAX_PEDIDOS_POR_DIA,
  MAX_MENSAGEM,
  MAX_OQUE_PROCURA,
  MODALIDADES,
  UFS,
  IDADE_MINIMA,
  type OrigemDoPedido,
  type Uf,
  faltaParaAparecer,
  horarioPodeSerAberto,
  horarioPodeSerPedido,
  idadeEmAnos,
  modalidadeAtende,
  motivoParaNaoPedir,
  perfilCasaComTexto,
  primeiroNome,
  separarNome,
  statusVisivel,
} from "../shared/conhecer";
import { exigirAssinaturaAtiva, exigirVagaNoPlano, iniciarTesteNoPrimeiroPaciente, liberadaPelaLinha } from "./assinaturas";
import { horarioEmConflito } from "./ai/clinical-tools";
import { getDb } from "./db";
import { horarioEmFerias } from "./ferias";
import { emailComMarca, esc } from "./emailLayout";
import { sendEmail } from "./mailer";
import { appUrl, rodarCicloDeNotificacoes } from "./notifications";
import { normalizarEmail } from "./roomAccess";
import { assinarFotos } from "./storage";
import { fotoPertenceAoUsuario, uidSupabase } from "./storageKeys";
import { celularDaConta } from "./supabaseAdmin";
import { protectedProcedure, publicProcedure, router, therapistProcedure } from "./_core/trpc";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const POR_PAGINA = 12;
const MINUTO = 60 * 1000;
const ROTULO_DA_CONVERSA = "Primeira conversa (pela busca do VozInterior)";

async function banco(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

async function minhaFicha(db: Db, userId: number) {
  const [t] = await db.select().from(therapists).where(eq(therapists.userId, userId)).limit(1);
  if (!t) throw new Error("Complete seu perfil profissional antes.");
  return t;
}

/**
 * O usuário já é paciente (ficha ativa ou aguardando) de alguma psicóloga? Conta também o
 * convite pelo e-mail que ainda não foi ligado à conta: quem a psicóloga já cadastrou é
 * paciente dela, mesmo antes de abrir "Minha Psicóloga" pela primeira vez.
 */
async function vinculoAtivo(db: Db, user: { id: number; email: string | null }): Promise<boolean> {
  const email = normalizarEmail(user.email);
  const [linha] = await db
    .select({ id: patients.id })
    .from(patients)
    .where(
      and(
        inArray(patients.status, ["active", "pending"]),
        email
          ? or(eq(patients.userId, user.id), and(isNull(patients.userId), eq(patients.email, email)))
          : eq(patients.userId, user.id),
      ),
    )
    .limit(1);
  return !!linha;
}

/**
 * Situação dos horários dela pelos pedidos: "pendente", "aceito" (com a consulta de pé)
 * ou "desmarcado" (aceito, mas a consulta foi desmarcada ou apagada). Desmarcado não
 * volta para a busca (o pedido aceito continua no horário), mas ela pode fechá-lo.
 *
 * Feito com join e não com subconsulta no select: numa consulta de uma tabela só, o
 * Drizzle escreve a coluna sem o nome da tabela, e "id" dentro da subconsulta virava o
 * id do pedido.
 */
async function situacaoDosHorarios(db: Db, therapistId: number, horarioIds: number[]) {
  // "convite": ela convidou alguém do mural para este horário e espera a resposta.
  const situacao = new Map<number, "pendente" | "convite" | "aceito" | "desmarcado">();
  if (!horarioIds.length) return situacao;
  const pedidos = await db
    .select({
      horarioId: pedidosParaConhecer.horarioId,
      status: pedidosParaConhecer.status,
      origem: pedidosParaConhecer.origem,
      consulta: appointments.status,
    })
    .from(pedidosParaConhecer)
    .leftJoin(appointments, eq(appointments.id, pedidosParaConhecer.appointmentId))
    .where(
      and(
        eq(pedidosParaConhecer.therapistId, therapistId),
        inArray(pedidosParaConhecer.horarioId, horarioIds),
        inArray(pedidosParaConhecer.status, ["pendente", "aceito"]),
      ),
    );
  for (const p of pedidos) {
    if (p.horarioId === null) continue;
    situacao.set(
      p.horarioId,
      p.status === "pendente"
        ? p.origem === "psicologa"
          ? "convite"
          : "pendente"
        : p.consulta && p.consulta !== "cancelled"
          ? "aceito"
          : "desmarcado",
    );
  }
  return situacao;
}

/** Perfil e pedidos da busca, para o "Baixar meus dados" (LGPD, art. 18). */
export async function dadosDaBuscaParaExportar(db: Db, userId: number) {
  const [perfil] = await db
    .select({
      cidade: perfisDePaciente.cidade,
      uf: perfisDePaciente.uf,
      nascimento: perfisDePaciente.nascimento,
      modalidade: perfisDePaciente.modalidade,
      oQueProcura: perfisDePaciente.oQueProcura,
      aparecerParaPsicologas: perfisDePaciente.noMural,
      atualizadoEm: perfisDePaciente.updatedAt,
    })
    .from(perfisDePaciente)
    .where(eq(perfisDePaciente.userId, userId))
    .limit(1);
  const pedidos = await db
    .select({
      psicologa: users.name,
      inicio: pedidosParaConhecer.inicio,
      duracaoMin: pedidosParaConhecer.duracao,
      situacao: pedidosParaConhecer.status,
      quemComecou: pedidosParaConhecer.origem,
      recado: pedidosParaConhecer.mensagem,
      pedidoEm: pedidosParaConhecer.createdAt,
    })
    .from(pedidosParaConhecer)
    .innerJoin(therapists, eq(therapists.id, pedidosParaConhecer.therapistId))
    .innerJoin(users, eq(users.id, therapists.userId))
    .where(eq(pedidosParaConhecer.pacienteUserId, userId))
    .orderBy(desc(pedidosParaConhecer.createdAt));
  return { perfilNaBuscaDePsicologas: perfil ?? null, pedidosDePrimeiraConversa: pedidos };
}

/**
 * Psicólogas que aparecem na busca: ligaram "aparecer", estão com o acesso em dia e o
 * perfil continua preenchido (quem esvazia a apresentação depois de ligar sai da busca).
 */
async function psicologasVisiveis(db: Db, ids?: number[]) {
  const linhas = await db
    .select({
      id: therapists.id,
      nome: users.name,
      role: users.role,
      // Só para conferir a pasta da foto (fotoDaPsicologa); nunca vai para o navegador.
      openId: users.openId,
      crp: therapists.crp,
      specialties: therapists.specialties,
      abordagem: therapists.abordagem,
      publicoAtendido: therapists.publicoAtendido,
      formacao: therapists.formacao,
      bio: therapists.bio,
      photoKey: therapists.photoKey,
      modalidade: therapists.modalidade,
      cidade: therapists.cidade,
      uf: therapists.uf,
      testeAte: assinaturas.testeAte,
      pagoAte: assinaturas.pagoAte,
      testeAguardando: assinaturas.testeAguardando,
      createdAt: assinaturas.createdAt,
      temAssinatura: assinaturas.id,
    })
    .from(therapists)
    .innerJoin(users, eq(users.id, therapists.userId))
    .leftJoin(assinaturas, eq(assinaturas.therapistId, therapists.id))
    .where(and(eq(therapists.naBusca, true), ids ? inArray(therapists.id, ids) : undefined));
  return linhas.filter(
    (l) =>
      (l.role === "admin" || l.role === "therapist") &&
      liberadaPelaLinha(l) &&
      faltaParaAparecer({ specialties: l.specialties, bio: l.bio }).length === 0,
  );
}

/**
 * Horários que ainda podem ser pedidos: daqui a 2 h ou mais, sem pedido em aberto e sem
 * consulta da agenda dela por cima (ela pode ter marcado alguém depois de abrir o horário).
 */
async function horariosLivres(db: Db, therapistIds: number[], agora: Date) {
  if (!therapistIds.length) return [];
  const limite = new Date(agora.getTime() + ANTECEDENCIA_MINIMA_MIN * MINUTO);
  return db
    .select({
      id: horariosParaConhecer.id,
      therapistId: horariosParaConhecer.therapistId,
      inicio: horariosParaConhecer.inicio,
      duracao: horariosParaConhecer.duracao,
    })
    .from(horariosParaConhecer)
    .where(
      and(
        inArray(horariosParaConhecer.therapistId, therapistIds),
        gt(horariosParaConhecer.inicio, limite),
        // Convite pendente para quem já ganhou psicóloga por outro caminho não segura mais
        // o horário (encerrarConvitesSemDestino o fecha de vez quando alguém pede ou ela
        // convida): assim a busca, que é pública, só lê e não grava a cada visita.
        sql`NOT EXISTS (
          SELECT 1 FROM ${pedidosParaConhecer}
          WHERE ${pedidosParaConhecer.horarioId} = ${horariosParaConhecer.id}
            AND ${pedidosParaConhecer.status} IN ('pendente', 'aceito')
            AND NOT (
              ${pedidosParaConhecer.origem} = 'psicologa' AND ${pedidosParaConhecer.status} = 'pendente'
              AND EXISTS (SELECT 1 FROM ${users} WHERE ${users.id} = ${pedidosParaConhecer.pacienteUserId} AND NOT ${SEM_PSICOLOGA})
            )
        )`,
        sql`NOT EXISTS (
          SELECT 1 FROM ${appointments}
          WHERE ${appointments.therapistId} = ${horariosParaConhecer.therapistId}
            AND ${appointments.status} <> 'cancelled'
            AND ${appointments.scheduledAt} < ${horariosParaConhecer.inicio} + (${horariosParaConhecer.duracao} * interval '1 minute')
            AND ${appointments.scheduledAt} + (${appointments.duration} * interval '1 minute') > ${horariosParaConhecer.inicio}
        )`,
        // Férias dela (server/ferias.ts): nesses dias de Brasília o horário sai da busca.
        sql`NOT EXISTS (
          SELECT 1 FROM ${ferias}
          WHERE ${ferias.therapistId} = ${horariosParaConhecer.therapistId}
            AND (${horariosParaConhecer.inicio} AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${ferias.inicio} AND ${ferias.fim}
        )`,
      ),
    )
    .orderBy(asc(horariosParaConhecer.inicio));
}

function lista(texto: string | null): string[] {
  return (texto ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * A foto que a busca pública pode assinar: só a da pasta da PRÓPRIA conta. A assinatura
 * usa a service role (fura a regra do bucket), então um caminho de outra pessoa gravado
 * no perfil viraria a foto de um paciente exposta a qualquer visitante.
 */
function fotoDaPsicologa(p: { photoKey: string | null; openId: string }): string | null {
  return p.photoKey && fotoPertenceAoUsuario(p.photoKey, p.openId) ? p.photoKey : null;
}

/** Erro de índice único do Postgres, com o nome do índice (para a mensagem certa). */
function indiceViolado(e: unknown): string | null {
  const erro = e as { code?: string; constraint?: string; constraint_name?: string; cause?: unknown };
  if (erro?.code === "23505") return erro.constraint ?? erro.constraint_name ?? "";
  if (erro?.cause) return indiceViolado(erro.cause);
  return null;
}

const nascimentoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de nascimento.")
  .refine((d) => idadeEmAnos(d) !== null, "Data de nascimento inválida.");

const POR_PAGINA_DO_MURAL = 20;
/** Chave da trava (pg_advisory_xact_lock) do teto de convites; o segundo número é a psicóloga. */
const TRAVA_DOS_CONVITES = 4021;

/** O usuário ainda não tem psicóloga: nem ficha ativa, nem convite pelo e-mail. (SQL, por linha de users.) */
const SEM_PSICOLOGA = sql`NOT EXISTS (
  SELECT 1 FROM ${patients}
  WHERE ${patients.status} IN ('active', 'pending')
    AND (${patients.userId} = ${users.id}
      OR (${patients.userId} IS NULL AND ${patients.email} = lower(trim(${users.email}))))
)`;

/**
 * Quem está no mural: ligou "aparecer para psicólogas", tem o perfil completo, tem 18 anos
 * ou mais (no dia de hoje em Brasília) e ainda não tem psicóloga. Filtro, ordem e página
 * no banco: a tela mostra 20 de cada vez.
 */
async function pacientesDoMural(
  db: Db,
  filtro: { ids?: number[]; uf?: Uf; modalidade?: "online" | "presencial"; pagina?: number },
) {
  const condicoes = and(
    eq(perfisDePaciente.noMural, true),
    eq(users.role, "user"),
    isNotNull(perfisDePaciente.cidade),
    isNotNull(perfisDePaciente.uf),
    isNotNull(perfisDePaciente.nascimento),
    sql`${perfisDePaciente.nascimento} <= ((now() AT TIME ZONE 'America/Sao_Paulo')::date - interval '${sql.raw(String(IDADE_MINIMA))} years')`,
    filtro.ids ? inArray(users.id, filtro.ids) : undefined,
    filtro.uf ? eq(perfisDePaciente.uf, filtro.uf) : undefined,
    // Sem preferência ou "tanto faz" serve para os dois.
    filtro.modalidade
      ? or(isNull(perfisDePaciente.modalidade), inArray(perfisDePaciente.modalidade, ["ambos", filtro.modalidade]))
      : undefined,
    SEM_PSICOLOGA,
  );
  const consulta = db
    .select({
      id: users.id,
      nome: users.name,
      cidade: perfisDePaciente.cidade,
      uf: perfisDePaciente.uf,
      nascimento: perfisDePaciente.nascimento,
      modalidade: perfisDePaciente.modalidade,
      oQueProcura: perfisDePaciente.oQueProcura,
      atualizadoEm: perfisDePaciente.updatedAt,
    })
    .from(perfisDePaciente)
    .innerJoin(users, eq(users.id, perfisDePaciente.userId))
    .where(condicoes)
    .orderBy(desc(perfisDePaciente.updatedAt), desc(users.id));
  if (!filtro.pagina) return { linhas: await consulta, total: 0 };
  const [linhas, [{ total }]] = await Promise.all([
    consulta.limit(POR_PAGINA_DO_MURAL + 1).offset((filtro.pagina - 1) * POR_PAGINA_DO_MURAL),
    db
      .select({ total: count() })
      .from(perfisDePaciente)
      .innerJoin(users, eq(users.id, perfisDePaciente.userId))
      .where(condicoes),
  ]);
  return { linhas, total };
}

/**
 * Convites que não têm mais a quem chegar: a pessoa ganhou psicóloga por outro caminho
 * (cadastro, convite pelo e-mail, planilha) ou quem convidou saiu da busca. Sem isto o
 * convite ficaria pendente, segurando o horário e uma das vagas de convite dela.
 */
async function encerrarConvitesSemDestino(db: Db, therapistId?: number) {
  await db.execute(sql`
    UPDATE ${pedidosParaConhecer} SET "status" = 'cancelado', "respondidoEm" = now()
    WHERE ${pedidosParaConhecer.origem} = 'psicologa' AND ${pedidosParaConhecer.status} = 'pendente'
      ${therapistId ? sql`AND ${pedidosParaConhecer.therapistId} = ${therapistId}` : sql``}
      AND (
        EXISTS (
          SELECT 1 FROM ${users}
          WHERE ${users.id} = ${pedidosParaConhecer.pacienteUserId} AND NOT ${SEM_PSICOLOGA}
        )
        OR EXISTS (
          SELECT 1 FROM ${therapists}
          WHERE ${therapists.id} = ${pedidosParaConhecer.therapistId} AND ${therapists.naBusca} = false
        )
      )
  `);
}

type Pedido = typeof pedidosParaConhecer.$inferSelect;

/**
 * Confirma a primeira conversa: ela aceitou o pedido dele, ou ele aceitou o convite dela.
 * Liga a conta a uma ficha DELA (reaproveita a antiga ou o convite pelo e-mail) e marca a
 * consulta; daí em diante vale o fluxo normal. `quem` respondeu muda só as mensagens.
 */
async function confirmarConversa(db: Db, pedido: Pedido, therapistId: number, quem: "psicologa" | "paciente") {
  const agora = new Date();
  const ehEla = quem === "psicologa";
  if (pedido.inicio.getTime() <= agora.getTime()) {
    await db.update(pedidosParaConhecer).set({ status: "expirado" }).where(eq(pedidosParaConhecer.id, pedido.id));
    throw new TRPCError({ code: "BAD_REQUEST", message: ehEla ? "O horário desse pedido já passou." : "O horário desse convite já passou." });
  }
  if (await horarioEmConflito(db, therapistId, pedido.inicio, pedido.duracao)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: ehEla
        ? "Você já tem uma consulta nesse horário. Recuse o pedido ou desmarque a outra consulta."
        : "Esse horário não está mais livre na agenda dela. Recuse o convite e escolha outro horário no perfil dela.",
    });
  }
  // Convite feito antes de ela marcar férias: aceitar não pode criar consulta no meio delas.
  // Quando é ELA que aceita um pedido nas próprias férias, a decisão é dela.
  if (!ehEla && (await horarioEmFerias(db, therapistId, pedido.inicio))) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Esse horário não está mais livre na agenda dela. Recuse o convite e escolha outro horário no perfil dela.",
    });
  }

  const [pessoa] = await db
    .select({ id: users.id, name: users.name, email: users.email, openId: users.openId })
    .from(users)
    .where(eq(users.id, pedido.pacienteUserId))
    .limit(1);
  if (!pessoa) throw new TRPCError({ code: "NOT_FOUND", message: "A conta desse paciente não existe mais." });

  // Fichas dessa conta. Ativa com OUTRA psicóloga (ou convite dela pelo e-mail): ele já
  // começou com outra pessoa.
  const fichas = await db.select().from(patients).where(eq(patients.userId, pessoa.id));
  const email = normalizarEmail(pessoa.email);
  const [conviteDeOutra] = email
    ? await db
        .select({ id: patients.id })
        .from(patients)
        .where(
          and(
            isNull(patients.userId),
            eq(patients.email, email),
            inArray(patients.status, ["active", "pending"]),
            sql`${patients.therapistId} <> ${therapistId}`,
          ),
        )
        .limit(1)
    : [];
  const comOutra = fichas.some((f) => f.therapistId !== therapistId && (f.status === "active" || f.status === "pending"));
  if (comOutra || conviteDeOutra) {
    await db.update(pedidosParaConhecer).set({ status: "cancelado", respondidoEm: agora }).where(eq(pedidosParaConhecer.id, pedido.id));
    throw new TRPCError({
      code: "CONFLICT",
      message: ehEla ? "Esse paciente já começou com outra psicóloga. O pedido foi encerrado." : EXPLICACAO_DO_MOTIVO.vinculado,
    });
  }
  const minha = fichas.find((f) => f.therapistId === therapistId);
  // Convite dela com o mesmo e-mail, ainda sem conta: aproveita a ficha em vez de duplicar.
  const [convite] = minha || !email
    ? []
    : await db
        .select()
        .from(patients)
        .where(and(eq(patients.therapistId, therapistId), eq(patients.email, email), isNull(patients.userId)))
        .limit(1);
  const ficha = minha ?? convite;
  // Ficha inativa ou arquivada que volta a ativa ocupa vaga, como na reativação pelo prontuário.
  if (!ficha || (ficha.status !== "active" && ficha.status !== "pending")) {
    await exigirVagaNoPlano(db, therapistId).catch((e: unknown) => {
      // A frase do plano é para ela ("mude de plano"); para ele, só que não dá agora.
      if (!ehEla) throw new TRPCError({ code: "CONFLICT", message: "Essa psicóloga está sem vaga para pacientes novos agora. Tente mais tarde ou procure outra." });
      throw e;
    });
  }
  // O Supabase quer o uid, sem o "sb:" do openId (com ele a busca falhava em silêncio e a
  // ficha nova ficava sem o celular do cadastro).
  const uidDaConta = uidSupabase(pessoa.openId);
  const telefone = !ficha && uidDaConta ? await celularDaConta(uidDaConta).catch(() => null) : null;

  const resultado = await db.transaction(async (tx) => {
    // Trava o pedido antes de tudo: dois "Aceitar" ao mesmo tempo (duas abas) esperam um
    // pelo outro, e o segundo encontra o pedido já respondido.
    const travados = await tx
      .update(pedidosParaConhecer)
      .set({ status: "aceito", respondidoEm: agora })
      .where(and(eq(pedidosParaConhecer.id, pedido.id), eq(pedidosParaConhecer.status, "pendente")))
      .returning({ id: pedidosParaConhecer.id });
    if (!travados.length) {
      throw new TRPCError({
        code: "CONFLICT",
        message: ehEla ? "Esse pedido acabou de ser respondido ou cancelado." : "Esse convite acabou de ser cancelado.",
      });
    }

    // Fichas antigas encerradas com outras psicólogas soltam a conta (o prontuário fica
    // com quem atendeu); a conta só tem uma ficha por vez (patients.userId é único).
    await tx
      .update(patients)
      .set({ userId: null })
      .where(and(eq(patients.userId, pessoa.id), inArray(patients.status, ["inactive", "archived"]), sql`${patients.therapistId} <> ${therapistId}`));

    let patientId: number;
    if (ficha) {
      await tx.update(patients).set({ userId: pessoa.id, status: "active" }).where(eq(patients.id, ficha.id));
      patientId = ficha.id;
    } else {
      const { firstName, lastName } = separarNome(pessoa.name);
      const [nova] = await tx
        .insert(patients)
        .values({
          therapistId,
          userId: pessoa.id,
          firstName,
          lastName,
          email: email || `sem-email-${pessoa.id}@vozinterior.invalid`,
          phone: telefone ? telefone.slice(0, 20) : null,
          status: "active",
        })
        .returning({ id: patients.id });
      patientId = nova.id;
    }

    const [consulta] = await tx
      .insert(appointments)
      .values({
        therapistId,
        patientId,
        scheduledAt: pedido.inicio,
        duration: pedido.duracao,
        notes: ROTULO_DA_CONVERSA,
        price: null,
        roomToken: nanoid(16),
      })
      .returning({ id: appointments.id });

    await tx
      .update(pedidosParaConhecer)
      .set({ patientId, appointmentId: consulta.id })
      .where(eq(pedidosParaConhecer.id, pedido.id));
    // Agora ele tem psicóloga: o pedido dele e os convites de outras que ainda esperavam
    // resposta se encerram (e os horários delas voltam para a busca).
    await tx
      .update(pedidosParaConhecer)
      .set({ status: "cancelado", respondidoEm: agora })
      .where(
        and(
          eq(pedidosParaConhecer.pacienteUserId, pessoa.id),
          eq(pedidosParaConhecer.status, "pendente"),
          sql`${pedidosParaConhecer.id} <> ${pedido.id}`,
        ),
      );
    return { patientId, appointmentId: consulta.id };
  }).catch((e: unknown) => {
    // A conta foi ligada a outra ficha no meio do caminho (índice único de userId).
    if (indiceViolado(e) !== null) {
      throw new TRPCError({ code: "CONFLICT", message: "Esse paciente acabou de ser ligado a outra ficha. Atualize a página." });
    }
    throw e;
  });

  await iniciarTesteNoPrimeiroPaciente(db, therapistId);
  // E-mail de "nova consulta" para o paciente, pelo mesmo ciclo das outras consultas.
  if (process.env.NOTIFICATIONS_ENABLED === "true") void rodarCicloDeNotificacoes();
  return resultado;
}

export const conhecerRouter = router({
  // ── Público ─────────────────────────────────────────────────────────────────

  buscar: publicProcedure
    .input(
      z
        .object({
          texto: z.string().trim().max(100).optional(),
          modalidade: z.enum(MODALIDADES).optional(),
          uf: z.enum(UFS).optional(),
          pagina: z.number().int().min(1).max(100).default(1),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { itens: [], total: 0, temMais: false };
      const agora = new Date();
      const pagina = input?.pagina ?? 1;

      const todas = (await psicologasVisiveis(db)).filter(
        (p) =>
          perfilCasaComTexto(p, input?.texto ?? "") &&
          modalidadeAtende(p.modalidade, input?.modalidade) &&
          (!input?.uf || p.uf === input.uf),
      );
      const livres = await horariosLivres(db, todas.map((p) => p.id), agora);
      const proximo = new Map<number, { inicio: Date; total: number }>();
      for (const h of livres) {
        const atual = proximo.get(h.therapistId);
        if (atual) atual.total += 1;
        else proximo.set(h.therapistId, { inicio: h.inicio, total: 1 });
      }
      // Quem tem horário livre primeiro (o mais cedo antes); depois, por nome.
      const ordenadas = todas.sort((a, b) => {
        const pa = proximo.get(a.id)?.inicio.getTime() ?? Infinity;
        const pb = proximo.get(b.id)?.inicio.getTime() ?? Infinity;
        if (pa !== pb) return pa - pb;
        return (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR");
      });
      const pedaco = ordenadas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
      const fotos = await assinarFotos(pedaco.map(fotoDaPsicologa).filter((k): k is string => !!k));

      return {
        total: ordenadas.length,
        temMais: ordenadas.length > pagina * POR_PAGINA,
        itens: pedaco.map((p) => ({
          id: p.id,
          nome: p.nome ?? "",
          crp: p.crp,
          especialidades: lista(p.specialties),
          publicos: lista(p.publicoAtendido),
          abordagem: p.abordagem,
          modalidade: p.modalidade,
          cidade: p.cidade,
          uf: p.uf,
          fotoUrl: fotoDaPsicologa(p) ? fotos[p.photoKey as string] ?? null : null,
          bioCurta: (p.bio ?? "").slice(0, 220),
          proximoHorario: proximo.get(p.id)?.inicio ?? null,
          horariosLivres: proximo.get(p.id)?.total ?? 0,
        })),
      };
    }),

  perfil: publicProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const [p] = await psicologasVisiveis(db, [input.id]);
    if (!p) return null;
    const horarios = (await horariosLivres(db, [p.id], new Date())).slice(0, MAX_HORARIOS_ABERTOS);
    const foto = fotoDaPsicologa(p);
    const fotos = foto ? await assinarFotos([foto]) : {};
    return {
      id: p.id,
      nome: p.nome ?? "",
      crp: p.crp,
      especialidades: lista(p.specialties),
      publicos: lista(p.publicoAtendido),
      abordagem: p.abordagem,
      formacao: p.formacao ?? "",
      bio: p.bio ?? "",
      modalidade: p.modalidade,
      cidade: p.cidade,
      uf: p.uf,
      fotoUrl: foto ? fotos[foto] ?? null : null,
      horarios: horarios.map((h) => ({ id: h.id, inicio: h.inicio, duracao: h.duracao })),
    };
  }),

  // ── Paciente ────────────────────────────────────────────────────────────────

  /** Perfil, se pode pedir (e por que não), os pedidos dele e os convites que recebeu. */
  minhaSituacao: protectedProcedure.query(async ({ ctx }) => {
    const db = await banco();
    const agora = new Date();
    const [perfil] = await db.select().from(perfisDePaciente).where(eq(perfisDePaciente.userId, ctx.user.id)).limit(1);
    // Pedidos e convites em consultas separadas: muitos convites não podem empurrar o
    // pedido pendente dele para fora da lista (e liberar um segundo pedido na tela).
    const daOrigem = async (origem: OrigemDoPedido) =>
      (
        await db
          .select({
            id: pedidosParaConhecer.id,
            therapistId: pedidosParaConhecer.therapistId,
            nome: users.name,
            inicio: pedidosParaConhecer.inicio,
            duracao: pedidosParaConhecer.duracao,
            status: pedidosParaConhecer.status,
            mensagem: pedidosParaConhecer.mensagem,
            createdAt: pedidosParaConhecer.createdAt,
          })
          .from(pedidosParaConhecer)
          .innerJoin(therapists, eq(therapists.id, pedidosParaConhecer.therapistId))
          .innerJoin(users, eq(users.id, therapists.userId))
          .where(and(eq(pedidosParaConhecer.pacienteUserId, ctx.user.id), eq(pedidosParaConhecer.origem, origem)))
          .orderBy(desc(pedidosParaConhecer.createdAt))
          .limit(20)
      ).map((p) => ({ ...p, nome: p.nome ?? "", status: statusVisivel(p, agora) }));
    // O recado do pedido é dele; o do convite é dela e é o que ele precisa ler.
    const pedidos = (await daOrigem("paciente")).map(({ mensagem: _m, ...p }) => p);
    const convites = await daOrigem("psicologa");
    const vinculado = ctx.user.role === "therapist" || ctx.user.role === "admin" ? false : await vinculoAtivo(db, ctx.user);
    const perfilCompleto = !!(perfil?.cidade && perfil?.uf && perfil?.nascimento);
    const temPedidoPendente = pedidos.some((p) => p.status === "pendente");
    const motivo = motivoParaNaoPedir({
      role: ctx.user.role,
      vinculoAtivo: vinculado,
      perfilCompleto,
      nascimento: perfil?.nascimento,
      temPedidoPendente,
      agora,
    });
    return {
      perfil: perfil
        ? {
            cidade: perfil.cidade,
            uf: perfil.uf,
            nascimento: perfil.nascimento,
            modalidade: perfil.modalidade,
            oQueProcura: perfil.oQueProcura,
            noMural: perfil.noMural,
          }
        : null,
      motivo,
      explicacao: motivo ? EXPLICACAO_DO_MOTIVO[motivo] : null,
      pedidos,
      convites,
    };
  }),

  salvarMeuPerfil: protectedProcedure
    .input(
      z.object({
        cidade: z.string().trim().min(2, "Informe a cidade.").max(80),
        uf: z.enum(UFS),
        nascimento: nascimentoSchema,
        modalidade: z.enum(MODALIDADES).nullable(),
        oQueProcura: z.string().trim().max(MAX_OQUE_PROCURA).nullable(),
        /** Aparecer no mural das psicólogas. Desligado se não vier. */
        noMural: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role === "therapist" || ctx.user.role === "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: EXPLICACAO_DO_MOTIVO.psicologa });
      }
      const db = await banco();
      const valores = {
        cidade: input.cidade,
        uf: input.uf,
        nascimento: input.nascimento,
        modalidade: input.modalidade,
        oQueProcura: input.oQueProcura || null,
        noMural: input.noMural,
      };
      await db
        .insert(perfisDePaciente)
        .values({ userId: ctx.user.id, ...valores })
        .onConflictDoUpdate({ target: perfisDePaciente.userId, set: valores });
      return { ok: true } as const;
    }),

  pedir: protectedProcedure
    .input(z.object({ horarioId: z.number().int().positive(), mensagem: z.string().trim().max(MAX_MENSAGEM).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await banco();
      const agora = new Date();

      // Pedido pendente cujo horário passou não segura mais a vaga do paciente.
      await db
        .update(pedidosParaConhecer)
        .set({ status: "expirado" })
        .where(
          and(
            eq(pedidosParaConhecer.pacienteUserId, ctx.user.id),
            eq(pedidosParaConhecer.status, "pendente"),
            lte(pedidosParaConhecer.inicio, agora),
          ),
        );

      const [perfil] = await db.select().from(perfisDePaciente).where(eq(perfisDePaciente.userId, ctx.user.id)).limit(1);
      const [pendente] = await db
        .select({ id: pedidosParaConhecer.id })
        .from(pedidosParaConhecer)
        .where(and(eq(pedidosParaConhecer.pacienteUserId, ctx.user.id), eq(pedidosParaConhecer.status, "pendente"), eq(pedidosParaConhecer.origem, "paciente")))
        .limit(1);
      const motivo = motivoParaNaoPedir({
        role: ctx.user.role,
        vinculoAtivo: ctx.user.role === "therapist" || ctx.user.role === "admin" ? false : await vinculoAtivo(db, ctx.user),
        perfilCompleto: !!(perfil?.cidade && perfil?.uf && perfil?.nascimento),
        nascimento: perfil?.nascimento,
        temPedidoPendente: !!pendente,
        agora,
      });
      if (motivo) throw new TRPCError({ code: "FORBIDDEN", message: EXPLICACAO_DO_MOTIVO[motivo] });

      // Cada pedido avisa a psicóloga por e-mail: pedir e cancelar em laço não pode virar
      // enxurrada na caixa dela nem esgotar a cota diária de e-mails do sistema.
      const [{ feitos }] = await db
        .select({ feitos: count() })
        .from(pedidosParaConhecer)
        .where(
          and(
            eq(pedidosParaConhecer.pacienteUserId, ctx.user.id),
            eq(pedidosParaConhecer.origem, "paciente"),
            gt(pedidosParaConhecer.createdAt, new Date(agora.getTime() - 24 * 60 * MINUTO)),
          ),
        );
      if (feitos >= MAX_PEDIDOS_POR_DIA) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Você já fez ${MAX_PEDIDOS_POR_DIA} pedidos nas últimas 24 horas. Espere as respostas ou tente de novo amanhã.`,
        });
      }

      const [horario] = await db
        .select()
        .from(horariosParaConhecer)
        .where(eq(horariosParaConhecer.id, input.horarioId))
        .limit(1);
      const [psicologa] = horario ? await psicologasVisiveis(db, [horario.therapistId]) : [];
      const indisponivel = new TRPCError({ code: "CONFLICT", message: "Esse horário não está mais livre. Escolha outro." });
      if (!horario || !psicologa) throw indisponivel;
      if (!horarioPodeSerPedido(horario.inicio, agora)) throw indisponivel;
      if (await horarioEmFerias(db, horario.therapistId, horario.inicio)) throw indisponivel;
      if (await horarioEmConflito(db, horario.therapistId, horario.inicio, horario.duracao)) throw indisponivel;
      // A busca mostra livre o horário de um convite sem destino (ver horariosLivres);
      // fecha esse convite antes, senão o índice de um pedido por horário recusaria este.
      await encerrarConvitesSemDestino(db, horario.therapistId);

      try {
        await db.insert(pedidosParaConhecer).values({
          horarioId: horario.id,
          therapistId: horario.therapistId,
          pacienteUserId: ctx.user.id,
          inicio: horario.inicio,
          duracao: horario.duracao,
          mensagem: input.mensagem || null,
        });
      } catch (e) {
        const indice = indiceViolado(e);
        if (indice === null) throw e;
        if (indice.includes("paciente")) throw new TRPCError({ code: "CONFLICT", message: EXPLICACAO_DO_MOTIVO.pendente });
        throw new TRPCError({ code: "CONFLICT", message: "Alguém acabou de pedir esse horário. Escolha outro." });
      }

      void avisarPsicologaDoPedido(db, horario.therapistId, horario.inicio, ctx.user.name).catch((e) =>
        console.error("[conhecer] aviso do pedido falhou:", e instanceof Error ? e.message : e),
      );
      return { ok: true } as const;
    }),

  cancelarMeuPedido: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await banco();
    const feitos = await db
      .update(pedidosParaConhecer)
      .set({ status: "cancelado", respondidoEm: new Date() })
      .where(
        and(
          eq(pedidosParaConhecer.id, input.id),
          eq(pedidosParaConhecer.pacienteUserId, ctx.user.id),
          eq(pedidosParaConhecer.status, "pendente"),
          eq(pedidosParaConhecer.origem, "paciente"),
        ),
      )
      .returning({ id: pedidosParaConhecer.id });
    if (!feitos.length) throw new TRPCError({ code: "NOT_FOUND", message: "Esse pedido não está mais esperando resposta." });
    return { ok: true } as const;
  }),

  /** O paciente aceita ou recusa o convite de uma psicóloga do mural. */
  responderConvite: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), aceitar: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await banco();
      const [convite] = await db
        .select()
        .from(pedidosParaConhecer)
        .where(
          and(
            eq(pedidosParaConhecer.id, input.id),
            eq(pedidosParaConhecer.pacienteUserId, ctx.user.id),
            eq(pedidosParaConhecer.origem, "psicologa"),
          ),
        )
        .limit(1);
      if (!convite || convite.status !== "pendente") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Esse convite não está mais esperando resposta." });
      }
      if (!input.aceitar) {
        await db
          .update(pedidosParaConhecer)
          .set({ status: "recusado", respondidoEm: new Date() })
          .where(and(eq(pedidosParaConhecer.id, convite.id), eq(pedidosParaConhecer.status, "pendente")));
        return { ok: true } as const;
      }
      // As mesmas travas de quem pede: conta de paciente, sem psicóloga, perfil e idade.
      const [perfil] = await db.select().from(perfisDePaciente).where(eq(perfisDePaciente.userId, ctx.user.id)).limit(1);
      const motivo = motivoParaNaoPedir({
        role: ctx.user.role,
        vinculoAtivo: ctx.user.role === "therapist" || ctx.user.role === "admin" ? false : await vinculoAtivo(db, ctx.user),
        perfilCompleto: !!(perfil?.cidade && perfil?.uf && perfil?.nascimento),
        nascimento: perfil?.nascimento,
        temPedidoPendente: false,
      });
      if (motivo) throw new TRPCError({ code: "FORBIDDEN", message: EXPLICACAO_DO_MOTIVO[motivo] });
      // Saiu da busca, esvaziou o perfil ou o plano venceu: o convite não vale mais.
      if (!(await psicologasVisiveis(db, [convite.therapistId])).length) {
        throw new TRPCError({ code: "CONFLICT", message: "Essa psicóloga não está recebendo pacientes pela busca agora. Procure outra na busca." });
      }
      await confirmarConversa(db, convite, convite.therapistId, "paciente");
      void avisarPsicologaDoAceite(db, convite.therapistId, ctx.user.name, convite.inicio).catch((e) =>
        console.error("[conhecer] aviso do aceite falhou:", e instanceof Error ? e.message : e),
      );
      return { ok: true } as const;
    }),

  // ── Psicóloga ───────────────────────────────────────────────────────────────

  minhaVitrine: therapistProcedure.query(async ({ ctx }) => {
    const db = await banco();
    const [t] = await db.select().from(therapists).where(eq(therapists.userId, ctx.user.id)).limit(1);
    if (!t) return null;
    await encerrarConvitesSemDestino(db, t.id);
    const agora = new Date();
    const abertos = await db
      .select({ id: horariosParaConhecer.id, inicio: horariosParaConhecer.inicio, duracao: horariosParaConhecer.duracao })
      .from(horariosParaConhecer)
      .where(and(eq(horariosParaConhecer.therapistId, t.id), gt(horariosParaConhecer.inicio, agora)))
      .orderBy(asc(horariosParaConhecer.inicio));
    const situacao = await situacaoDosHorarios(db, t.id, abertos.map((h) => h.id));
    const horarios = abertos.map((h) => ({ ...h, pedido: situacao.get(h.id) ?? null }));
    return {
      id: t.id,
      naBusca: t.naBusca,
      abordagem: t.abordagem,
      modalidade: t.modalidade,
      cidade: t.cidade,
      uf: t.uf,
      falta: faltaParaAparecer(t),
      horarios,
    };
  }),

  salvarVitrine: therapistProcedure
    .input(
      z.object({
        naBusca: z.boolean(),
        abordagem: z.string().trim().max(200).nullable(),
        modalidade: z.enum(MODALIDADES),
        cidade: z.string().trim().max(80).nullable(),
        uf: z.enum(UFS).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await banco();
      const t = await minhaFicha(db, ctx.user.id);
      if (input.naBusca) {
        const falta = faltaParaAparecer(t);
        if (falta.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Para aparecer na busca, preencha no seu perfil: ${falta.join(" e ")}.` });
        }
        if (input.modalidade !== "online" && (!input.cidade || !input.uf)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Para atendimento presencial, informe a cidade e o estado." });
        }
      }
      await db
        .update(therapists)
        .set({
          naBusca: input.naBusca,
          abordagem: input.abordagem || null,
          modalidade: input.modalidade,
          cidade: input.cidade || null,
          uf: input.uf,
        })
        .where(eq(therapists.id, t.id));
      return { ok: true } as const;
    }),

  abrirHorario: therapistProcedure
    .input(
      z.object({
        inicio: z.string().max(40),
        duracao: z
          .number()
          .int()
          .refine((d) => (DURACOES_PERMITIDAS as readonly number[]).includes(d), "Duração inválida.")
          .default(DURACAO_PRIMEIRA_CONVERSA),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await banco();
      const t = await minhaFicha(db, ctx.user.id);
      const agora = new Date();
      const inicio = new Date(input.inicio);
      if (!horarioPodeSerAberto(inicio, agora)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Escolha um horário que comece daqui a mais de 30 minutos e dentro dos próximos 60 dias.",
        });
      }
      const abertos = await db
        .select({ inicio: horariosParaConhecer.inicio, duracao: horariosParaConhecer.duracao })
        .from(horariosParaConhecer)
        .where(and(eq(horariosParaConhecer.therapistId, t.id), gt(horariosParaConhecer.inicio, agora)));
      if (abertos.length >= MAX_HORARIOS_ABERTOS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Dá para ter até ${MAX_HORARIOS_ABERTOS} horários abertos ao mesmo tempo. Feche alguns antes de abrir mais.`,
        });
      }
      const fim = inicio.getTime() + input.duracao * MINUTO;
      if (abertos.some((h) => h.inicio.getTime() < fim && inicio.getTime() < h.inicio.getTime() + h.duracao * MINUTO)) {
        throw new TRPCError({ code: "CONFLICT", message: "Já há um horário aberto que encosta nesse. Escolha outro." });
      }
      if (await horarioEmConflito(db, t.id, inicio, input.duracao)) {
        throw new TRPCError({ code: "CONFLICT", message: "Você já tem uma consulta nesse horário." });
      }
      await db.insert(horariosParaConhecer).values({ therapistId: t.id, inicio, duracao: input.duracao }).onConflictDoNothing();
      return { ok: true } as const;
    }),

  fecharHorario: therapistProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await banco();
    const t = await minhaFicha(db, ctx.user.id);
    await encerrarConvitesSemDestino(db, t.id);
    // Só os pedidos DELA: senão a resposta diria a outra se um horário alheio tem pedido.
    const situacao = (await situacaoDosHorarios(db, t.id, [input.id])).get(input.id);
    if (situacao === "pendente" || situacao === "aceito") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Esse horário tem um pedido esperando resposta ou uma conversa marcada. Responda ao pedido ou desmarque a consulta antes.",
      });
    }
    if (situacao === "convite") {
      throw new TRPCError({ code: "CONFLICT", message: "Esse horário está num convite seu. Cancele o convite antes de fechar o horário." });
    }
    const apagados = await db
      .delete(horariosParaConhecer)
      .where(and(eq(horariosParaConhecer.id, input.id), eq(horariosParaConhecer.therapistId, t.id)))
      .returning({ id: horariosParaConhecer.id });
    if (!apagados.length) throw new TRPCError({ code: "NOT_FOUND", message: "Horário não encontrado." });
    return { ok: true } as const;
  }),

  /**
   * Pedidos que esperam a resposta dela. Só estes: o perfil do paciente é o ATUAL, e
   * quem cancelou ou foi recusado pode ter escrito outra coisa para outra psicóloga.
   */
  pedidosRecebidos: therapistProcedure.query(async ({ ctx }) => {
    const db = await banco();
    const [t] = await db.select({ id: therapists.id }).from(therapists).where(eq(therapists.userId, ctx.user.id)).limit(1);
    if (!t) return [];
    const agora = new Date();
    const linhas = await db
      .select({
        id: pedidosParaConhecer.id,
        inicio: pedidosParaConhecer.inicio,
        duracao: pedidosParaConhecer.duracao,
        status: pedidosParaConhecer.status,
        mensagem: pedidosParaConhecer.mensagem,
        createdAt: pedidosParaConhecer.createdAt,
        patientId: pedidosParaConhecer.patientId,
        nome: users.name,
        cidade: perfisDePaciente.cidade,
        uf: perfisDePaciente.uf,
        nascimento: perfisDePaciente.nascimento,
        modalidade: perfisDePaciente.modalidade,
        oQueProcura: perfisDePaciente.oQueProcura,
      })
      .from(pedidosParaConhecer)
      .innerJoin(users, eq(users.id, pedidosParaConhecer.pacienteUserId))
      .leftJoin(perfisDePaciente, eq(perfisDePaciente.userId, pedidosParaConhecer.pacienteUserId))
      .where(and(eq(pedidosParaConhecer.therapistId, t.id), eq(pedidosParaConhecer.status, "pendente"), eq(pedidosParaConhecer.origem, "paciente")))
      .orderBy(asc(pedidosParaConhecer.inicio))
      .limit(50);
    return linhas.map(({ nascimento, ...l }) => ({
      ...l,
      nome: l.nome ?? "Paciente",
      idade: idadeEmAnos(nascimento, agora),
      status: statusVisivel(l, agora),
    }));
  }),

  aceitar: therapistProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await banco();
    await exigirAssinaturaAtiva(db, ctx.user);
    const t = await minhaFicha(db, ctx.user.id);
    // Só pedidos que o PACIENTE fez: o convite dela quem aceita é ele.
    const [pedido] = await db
      .select()
      .from(pedidosParaConhecer)
      .where(
        and(
          eq(pedidosParaConhecer.id, input.id),
          eq(pedidosParaConhecer.therapistId, t.id),
          eq(pedidosParaConhecer.origem, "paciente"),
        ),
      )
      .limit(1);
    if (!pedido || pedido.status !== "pendente") {
      throw new TRPCError({ code: "NOT_FOUND", message: "Esse pedido não está mais esperando resposta." });
    }
    return confirmarConversa(db, pedido, t.id, "psicologa");
  }),

  recusar: therapistProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await banco();
    const t = await minhaFicha(db, ctx.user.id);
    const [pedido] = await db
      .update(pedidosParaConhecer)
      .set({ status: "recusado", respondidoEm: new Date() })
      .where(and(eq(pedidosParaConhecer.id, input.id), eq(pedidosParaConhecer.therapistId, t.id), eq(pedidosParaConhecer.status, "pendente"), eq(pedidosParaConhecer.origem, "paciente")))
      .returning({ pacienteUserId: pedidosParaConhecer.pacienteUserId, inicio: pedidosParaConhecer.inicio });
    if (!pedido) throw new TRPCError({ code: "NOT_FOUND", message: "Esse pedido não está mais esperando resposta." });
    void avisarPacienteDaRecusa(db, pedido.pacienteUserId, ctx.user.name).catch((e) =>
      console.error("[conhecer] aviso da recusa falhou:", e instanceof Error ? e.message : e),
    );
    return { ok: true } as const;
  }),
  // ── Rede: o mural de pacientes e os convites (2026-11-16) ──────────────────

  /** Pessoas que ligaram "aparecer para psicólogas". Primeiro nome, nunca e-mail nem telefone. */
  mural: therapistProcedure
    .input(
      z
        .object({
          uf: z.enum(UFS).optional(),
          modalidade: z.enum(["online", "presencial"]).optional(),
          pagina: z.number().int().min(1).max(100).default(1),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const db = await banco();
      // "O que te traz" pode ser dado de saúde: só quem pode convidar lê o mural.
      await exigirAssinaturaAtiva(db, ctx.user);
      const [t] = await db.select({ id: therapists.id }).from(therapists).where(eq(therapists.userId, ctx.user.id)).limit(1);
      if (!t) return { itens: [], total: 0, temMais: false };
      const agora = new Date();
      const pagina = input?.pagina ?? 1;
      const { linhas, total } = await pacientesDoMural(db, { uf: input?.uf, modalidade: input?.modalidade, pagina });
      const pedaco = linhas.slice(0, POR_PAGINA_DO_MURAL);
      const convidados = pedaco.length
        ? await db
            .select({ id: pedidosParaConhecer.pacienteUserId })
            .from(pedidosParaConhecer)
            .where(
              and(
                eq(pedidosParaConhecer.therapistId, t.id),
                eq(pedidosParaConhecer.origem, "psicologa"),
                eq(pedidosParaConhecer.status, "pendente"),
                gt(pedidosParaConhecer.inicio, agora),
                inArray(pedidosParaConhecer.pacienteUserId, pedaco.map((p) => p.id)),
              ),
            )
        : [];
      const jaConvidei = new Set(convidados.map((c) => c.id));
      return {
        total,
        temMais: linhas.length > POR_PAGINA_DO_MURAL,
        itens: pedaco.map((p) => ({
          id: p.id,
          primeiroNome: primeiroNome(p.nome),
          idade: idadeEmAnos(p.nascimento, agora),
          cidade: p.cidade,
          uf: p.uf,
          modalidade: p.modalidade,
          oQueProcura: p.oQueProcura,
          atualizadoEm: p.atualizadoEm,
          convidado: jaConvidei.has(p.id),
        })),
      };
    }),

  /** Convida alguém do mural para a primeira conversa, num horário aberto dela. */
  convidar: therapistProcedure
    .input(
      z.object({
        pacienteId: z.number().int().positive(),
        horarioId: z.number().int().positive(),
        mensagem: z.string().trim().max(MAX_MENSAGEM).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await banco();
      await exigirAssinaturaAtiva(db, ctx.user);
      const t = await minhaFicha(db, ctx.user.id);
      const agora = new Date();
      // A pessoa conhece quem convidou pelo perfil público: sem ele, nada de convite.
      if (!t.naBusca) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Para convidar, ligue “Aparecer na busca” no seu Perfil: é por ele que a pessoa conhece você antes de aceitar.",
        });
      }
      const falta = faltaParaAparecer(t);
      if (falta.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Para convidar, complete no seu Perfil: ${falta.join(" e ")}.` });
      }
      const [horario] = await db
        .select()
        .from(horariosParaConhecer)
        .where(and(eq(horariosParaConhecer.id, input.horarioId), eq(horariosParaConhecer.therapistId, t.id)))
        .limit(1);
      if (!horario || !horarioPodeSerPedido(horario.inicio, agora)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha um horário seu que comece daqui a pelo menos 2 horas." });
      }
      await encerrarConvitesSemDestino(db, t.id);
      if ((await situacaoDosHorarios(db, t.id, [horario.id])).has(horario.id)) {
        throw new TRPCError({ code: "CONFLICT", message: "Esse horário já está num pedido ou convite. Escolha outro." });
      }
      if (await horarioEmConflito(db, t.id, horario.inicio, horario.duracao)) {
        throw new TRPCError({ code: "CONFLICT", message: "Você já tem uma consulta nesse horário." });
      }
      if (await horarioEmFerias(db, t.id, horario.inicio)) {
        throw new TRPCError({ code: "CONFLICT", message: "Esse horário cai nas suas férias. Escolha outro ou apague as férias na Agenda." });
      }
      const [pessoa] = (await pacientesDoMural(db, { ids: [input.pacienteId] })).linhas;
      if (!pessoa) throw new TRPCError({ code: "NOT_FOUND", message: "Essa pessoa não está mais no mural." });
      await exigirVagaNoPlano(db, t.id);

      try {
        await db.transaction(async (tx) => {
          // Uma psicóloga convida um de cada vez: dois convites ao mesmo tempo (duas abas)
          // não passam juntos do teto.
          await tx.execute(sql`SELECT pg_advisory_xact_lock(${TRAVA_DOS_CONVITES}, ${t.id})`);
          // Convite cujo horário passou não conta no teto.
          await tx
            .update(pedidosParaConhecer)
            .set({ status: "expirado" })
            .where(
              and(
                eq(pedidosParaConhecer.therapistId, t.id),
                eq(pedidosParaConhecer.origem, "psicologa"),
                eq(pedidosParaConhecer.status, "pendente"),
                lte(pedidosParaConhecer.inicio, agora),
              ),
            );
          const [{ n }] = await tx
            .select({ n: count() })
            .from(pedidosParaConhecer)
            .where(
              and(
                eq(pedidosParaConhecer.therapistId, t.id),
                eq(pedidosParaConhecer.origem, "psicologa"),
                eq(pedidosParaConhecer.status, "pendente"),
              ),
            );
          if (n >= MAX_CONVITES_PENDENTES) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Dá para ter até ${MAX_CONVITES_PENDENTES} convites esperando resposta. Espere algumas respostas ou cancele um convite.`,
            });
          }
          // Cancelar e convidar de novo também manda e-mail: teto em 24 h, dentro da trava.
          const [{ hoje }] = await tx
            .select({ hoje: count() })
            .from(pedidosParaConhecer)
            .where(
              and(
                eq(pedidosParaConhecer.therapistId, t.id),
                eq(pedidosParaConhecer.origem, "psicologa"),
                gt(pedidosParaConhecer.createdAt, new Date(agora.getTime() - 24 * 60 * MINUTO)),
              ),
            );
          if (hoje >= MAX_CONVITES_POR_DIA) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: `Você já mandou ${MAX_CONVITES_POR_DIA} convites nas últimas 24 horas. Tente de novo amanhã.`,
            });
          }
          await tx.insert(pedidosParaConhecer).values({
            horarioId: horario.id,
            therapistId: t.id,
            pacienteUserId: pessoa.id,
            inicio: horario.inicio,
            duracao: horario.duracao,
            mensagem: input.mensagem || null,
            origem: "psicologa",
          });
        });
      } catch (e) {
        const indice = indiceViolado(e);
        if (indice === null) throw e;
        if (indice.includes("convite")) {
          throw new TRPCError({ code: "CONFLICT", message: "Você já convidou essa pessoa. Espere a resposta ou cancele o convite." });
        }
        throw new TRPCError({ code: "CONFLICT", message: "Esse horário acabou de ser pedido. Escolha outro." });
      }

      void avisarPacienteDoConvite(db, pessoa.id, ctx.user.name, horario.inicio).catch((e) =>
        console.error("[conhecer] aviso do convite falhou:", e instanceof Error ? e.message : e),
      );
      return { ok: true } as const;
    }),

  cancelarConvite: therapistProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await banco();
    const t = await minhaFicha(db, ctx.user.id);
    const feitos = await db
      .update(pedidosParaConhecer)
      .set({ status: "cancelado", respondidoEm: new Date() })
      .where(
        and(
          eq(pedidosParaConhecer.id, input.id),
          eq(pedidosParaConhecer.therapistId, t.id),
          eq(pedidosParaConhecer.origem, "psicologa"),
          eq(pedidosParaConhecer.status, "pendente"),
        ),
      )
      .returning({ id: pedidosParaConhecer.id });
    if (!feitos.length) throw new TRPCError({ code: "NOT_FOUND", message: "Esse convite não está mais esperando resposta." });
    return { ok: true } as const;
  }),

  /** Convites que ela mandou: os que esperam resposta e os dos últimos 30 dias. */
  convitesEnviados: therapistProcedure.query(async ({ ctx }) => {
    const db = await banco();
    const [t] = await db.select({ id: therapists.id }).from(therapists).where(eq(therapists.userId, ctx.user.id)).limit(1);
    if (!t) return [];
    await encerrarConvitesSemDestino(db, t.id);
    const agora = new Date();
    const desde = new Date(agora.getTime() - 30 * 24 * 60 * MINUTO);
    const linhas = await db
      .select({
        id: pedidosParaConhecer.id,
        inicio: pedidosParaConhecer.inicio,
        duracao: pedidosParaConhecer.duracao,
        status: pedidosParaConhecer.status,
        createdAt: pedidosParaConhecer.createdAt,
        nome: users.name,
      })
      .from(pedidosParaConhecer)
      .innerJoin(users, eq(users.id, pedidosParaConhecer.pacienteUserId))
      .where(
        and(
          eq(pedidosParaConhecer.therapistId, t.id),
          eq(pedidosParaConhecer.origem, "psicologa"),
          or(eq(pedidosParaConhecer.status, "pendente"), gt(pedidosParaConhecer.createdAt, desde)),
        ),
      )
      .orderBy(desc(pedidosParaConhecer.createdAt))
      .limit(30);
    return linhas.map(({ nome, ...l }) => ({ ...l, primeiroNome: primeiroNome(nome), status: statusVisivel(l, agora) }));
  }),

});

// ── Avisos por e-mail (sem dado clínico: o "o que procura" fica só no sistema) ──

function quando(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

async function avisarPsicologaDoPedido(db: Db, therapistId: number, inicio: Date, nomeDoPaciente: string | null) {
  const [dona] = await db
    .select({ nome: users.name, email: users.email })
    .from(therapists)
    .innerJoin(users, eq(users.id, therapists.userId))
    .where(eq(therapists.id, therapistId))
    .limit(1);
  if (!dona?.email) return;
  const base = appUrl();
  const quem = nomeDoPaciente ? esc(nomeDoPaciente.split(/\s+/)[0]) : "Uma pessoa";
  await sendEmail(
    dona.email,
    "Novo pedido de primeira conversa — VozInterior",
    emailComMarca({
      nome: dona.nome,
      titulo: "Pedido de primeira conversa",
      corpo: `<p style="margin:0 0 12px">${quem} viu seu perfil na busca e pediu o horário de <strong>${esc(quando(inicio))}</strong> para uma primeira conversa.</p><p style="margin:0 0 12px">Confirme ou recuse na sua Agenda. Enquanto você não responde, o horário fica guardado para esse pedido.</p>`,
      botao: { texto: "Ver o pedido", url: `${base}/appointments` },
      base,
    }),
  );
}

async function avisarPacienteDaRecusa(db: Db, pacienteUserId: number, nomeDaPsicologa: string | null) {
  const [pessoa] = await db.select({ nome: users.name, email: users.email }).from(users).where(eq(users.id, pacienteUserId)).limit(1);
  if (!pessoa?.email) return;
  const base = appUrl();
  await sendEmail(
    pessoa.email,
    "Sobre o seu pedido de primeira conversa — VozInterior",
    emailComMarca({
      nome: pessoa.nome,
      titulo: "O horário não pôde ser confirmado",
      corpo: `<p style="margin:0 0 12px">${nomeDaPsicologa ? esc(nomeDaPsicologa) : "A psicóloga"} não conseguiu confirmar o horário que você pediu. Isso acontece, e não tem a ver com você.</p><p style="margin:0 0 12px">Você pode escolher outro horário, com ela ou com outra psicóloga da busca.</p>`,
      botao: { texto: "Ver psicólogas", url: `${base}/encontrar-psicologa` },
      base,
    }),
  );
}

async function avisarPacienteDoConvite(db: Db, pacienteUserId: number, nomeDaPsicologa: string | null, inicio: Date) {
  const [pessoa] = await db.select({ nome: users.name, email: users.email }).from(users).where(eq(users.id, pacienteUserId)).limit(1);
  if (!pessoa?.email) return;
  const base = appUrl();
  await sendEmail(
    pessoa.email,
    "Convite para uma primeira conversa — VozInterior",
    emailComMarca({
      nome: pessoa.nome,
      titulo: "Você recebeu um convite",
      corpo: `<p style="margin:0 0 12px">${nomeDaPsicologa ? esc(nomeDaPsicologa) : "Uma psicóloga"} viu seu perfil e convidou você para uma primeira conversa, curta e gratuita, por vídeo, em <strong>${esc(quando(inicio))}</strong>.</p><p style="margin:0 0 12px">Veja o perfil dela e aceite ou recuse na área Rede. Recusar não tem problema.</p>`,
      botao: { texto: "Ver o convite", url: `${base}/rede` },
      base,
    }),
  );
}

async function avisarPsicologaDoAceite(db: Db, therapistId: number, nomeDoPaciente: string | null, inicio: Date) {
  const [dona] = await db
    .select({ nome: users.name, email: users.email })
    .from(therapists)
    .innerJoin(users, eq(users.id, therapists.userId))
    .where(eq(therapists.id, therapistId))
    .limit(1);
  if (!dona?.email) return;
  const base = appUrl();
  await sendEmail(
    dona.email,
    "Convite aceito — VozInterior",
    emailComMarca({
      nome: dona.nome,
      titulo: "Seu convite foi aceito",
      corpo: `<p style="margin:0 0 12px">${esc(primeiroNome(nomeDoPaciente))} aceitou seu convite para a primeira conversa de <strong>${esc(quando(inicio))}</strong>. A consulta já está na sua Agenda, e a ficha dele em Pacientes.</p>`,
      botao: { texto: "Ver a Agenda", url: `${base}/appointments` },
      base,
    }),
  );
}
