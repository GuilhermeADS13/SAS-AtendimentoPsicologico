import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { aparelhosConfiaveis, codigosDeAparelho } from "../drizzle/schema";
import { getDb } from "./db";
import { emailComMarca } from "./emailLayout";
import { sendEmail } from "./mailer";

/**
 * Verificação de aparelho novo: segunda etapa sem aplicativo nem SMS.
 *
 * Psicóloga e admin entram com a senha e, num aparelho desconhecido, confirmam um
 * código recebido por e-mail. Daí o aparelho fica confiável por 30 dias. Quem tem
 * só a senha vazada não passa, e trocar de celular ou de número não tranca ninguém.
 * Paciente fica de fora: só vê os próprios dados, e mais uma etapa o afastaria.
 *
 * A prova do aparelho é um token aleatório num cookie httpOnly (script não lê). No
 * banco fica só o hash: quem ler o banco não consegue se passar pelo aparelho.
 *
 * Plano B: com VERIFICACAO_DE_APARELHO=desligada no Render, ninguém é barrado. É
 * para o envio de e-mail cair (cota da Brevo) e o próprio admin ficar de fora.
 */

export const COOKIE_DO_APARELHO = "sas_aparelho";
export const DIAS_DE_APARELHO_CONFIAVEL = 30;
const MINUTOS_DO_CODIGO = 10;
const MAXIMO_DE_TENTATIVAS = 5;
/** O cookie é lido a cada requisição, e o chat consulta a cada poucos segundos. */
const CACHE_MS = 5 * 60_000;

const DIA_MS = 24 * 60 * 60_000;
const hash = (texto: string) => createHash("sha256").update(texto).digest("hex");

export function precisaVerificarAparelho(role: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.VERIFICACAO_DE_APARELHO === "desligada") return false;
  // Fora de produção não há e-mail de verdade (e o login de dev nem tem cookie).
  if (env.NODE_ENV !== "production") return false;
  return role === "therapist" || role === "admin";
}

/** Valor de um cookie no cabeçalho `Cookie` (serve para HTTP e para WebSocket). */
export function lerCookie(cabecalho: string | undefined, nome: string): string | null {
  for (const parte of (cabecalho ?? "").split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim();
  }
  return null;
}

/** "ana.souza@gmail.com" → "an***@gmail.com": a tela confirma o destino sem expor tudo. */
export function mascararEmail(email: string): string {
  const [nome, dominio] = email.split("@");
  return dominio ? `${nome.slice(0, 2)}***@${dominio}` : "seu e-mail";
}

const confiaveisEmCache = new Map<string, { expira: number; revalidarEm: number }>();

async function aparelhoEhConfiavel(userId: number, token: string, agora: Date): Promise<boolean> {
  const tokenHash = hash(token);
  const chave = `${userId}:${tokenHash}`;
  const emCache = confiaveisEmCache.get(chave);
  if (emCache && emCache.revalidarEm > agora.getTime() && emCache.expira > agora.getTime()) return true;

  const db = await getDb();
  if (!db) return false;
  const [linha] = await db
    .select({ expiraEm: aparelhosConfiaveis.expiraEm })
    .from(aparelhosConfiaveis)
    .where(and(eq(aparelhosConfiaveis.userId, userId), eq(aparelhosConfiaveis.tokenHash, tokenHash), gt(aparelhosConfiaveis.expiraEm, agora)))
    .limit(1);
  if (!linha) return false;
  if (confiaveisEmCache.size > 5000) confiaveisEmCache.clear();
  confiaveisEmCache.set(chave, { expira: linha.expiraEm.getTime(), revalidarEm: agora.getTime() + CACHE_MS });
  return true;
}

/** Esta conta pode usar este aparelho? Vale para a API e para os WebSockets do vídeo. */
export async function aparelhoLiberado(
  user: { id: number; role: string },
  cabecalhoCookie: string | undefined,
  agora: Date = new Date(),
): Promise<boolean> {
  if (!precisaVerificarAparelho(user.role)) return true;
  const token = lerCookie(cabecalhoCookie, COOKIE_DO_APARELHO);
  if (!token) return false;
  return aparelhoEhConfiavel(user.id, token, agora);
}

/** Gera o código, guarda só o hash e envia. Lança se o e-mail não sair. */
export async function enviarCodigoDeAparelho(user: { id: number; name: string | null; email: string | null }): Promise<void> {
  if (!user.email) throw new Error("Sua conta não tem e-mail. Fale com o suporte.");
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const valores = { codigoHash: hash(codigo), expiraEm: new Date(Date.now() + MINUTOS_DO_CODIGO * 60_000), tentativas: 0 };
  await db
    .insert(codigosDeAparelho)
    .values({ userId: user.id, ...valores })
    .onConflictDoUpdate({ target: codigosDeAparelho.userId, set: valores });

  const base = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000";
  const enviado = await sendEmail(
    user.email,
    "Seu código de acesso — VozInterior",
    emailComMarca({
      nome: user.name,
      titulo: "Confirme que é você",
      corpo: `<p style="margin:0 0 12px">Sua conta foi acessada num aparelho novo. Digite este código para continuar:</p>
        <p style="margin:8px 0 4px;font-size:30px;font-weight:700;letter-spacing:6px;color:#215756">${codigo}</p>`,
      observacao: `O código vale por ${MINUTOS_DO_CODIGO} minutos. Se não foi você, alguém tem a sua senha: troque-a agora.`,
      base,
    }),
  );
  if (!enviado) throw new Error("Não conseguimos enviar o código. Tente de novo em instantes.");
}

/**
 * Confere o código e, se estiver certo, registra o aparelho e devolve o token do
 * cookie. A tentativa é contada ANTES de comparar e numa só operação no banco:
 * chamadas em paralelo não ganham tentativas a mais para adivinhar os 6 dígitos.
 */
export async function confirmarCodigoDeAparelho(userId: number, codigo: string, agora: Date = new Date()): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [linha] = await db
    .update(codigosDeAparelho)
    .set({ tentativas: sql`${codigosDeAparelho.tentativas} + 1` })
    .where(and(eq(codigosDeAparelho.userId, userId), gt(codigosDeAparelho.expiraEm, agora), lt(codigosDeAparelho.tentativas, MAXIMO_DE_TENTATIVAS)))
    .returning({ codigoHash: codigosDeAparelho.codigoHash });
  if (!linha) throw new Error("Código vencido ou tentativas esgotadas. Peça um novo.");

  const certo = timingSafeEqual(Buffer.from(hash(codigo.trim())), Buffer.from(linha.codigoHash));
  if (!certo) throw new Error("Código incorreto. Confira e tente de novo.");

  await db.delete(codigosDeAparelho).where(eq(codigosDeAparelho.userId, userId));
  await db.delete(aparelhosConfiaveis).where(and(eq(aparelhosConfiaveis.userId, userId), lt(aparelhosConfiaveis.expiraEm, agora)));
  const token = randomBytes(32).toString("base64url");
  await db.insert(aparelhosConfiaveis).values({
    userId,
    tokenHash: hash(token),
    expiraEm: new Date(agora.getTime() + DIAS_DE_APARELHO_CONFIAVEL * DIA_MS),
  });
  return token;
}
