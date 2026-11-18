/**
 * Troca do e-mail da conta, contra o Postgres real: DOIS códigos, um no e-mail atual e
 * outro no novo, e a troca exige os dois.
 *
 * Antes era um código só, mandado aos dois endereços: quem estivesse com a sessão aberta
 * de outra pessoa trocava o e-mail para um seu (o código chegava lá) e tomava a conta.
 *
 * Só roda com RUN_INTEGRATION=true e DATABASE_URL (CI ou Postgres de teste).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

const enviados = vi.hoisted(() => [] as Array<{ para: string; html: string }>);
vi.mock("./mailer", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sendEmail: vi.fn(async (para: string, _assunto: string, html: string) => {
    enviados.push({ para, html });
    return true;
  }),
}));
const supabaseAdmin = vi.hoisted(() => ({ trocarEmailSupabase: vi.fn(async () => undefined) }));
vi.mock("./supabaseAdmin", async (importOriginal) => ({ ...(await importOriginal<object>()), ...supabaseAdmin }));

const { appRouter } = await import("./routers");
import type { TrpcContext } from "./_core/context";

const RUN = process.env.RUN_INTEGRATION === "true" && Boolean(process.env.DATABASE_URL);
const ID = { A: 990401, B: 990402 } as const;
const emailDe = (id: number) => `troca-${id}@teste.local`;

function ctx(id: number): TrpcContext {
  return {
    user: {
      id, openId: `sb:troca-${id}`, email: emailDe(id), name: "Pessoa Teste", loginMethod: "test",
      role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    aparelhoVerificado: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  } as TrpcContext;
}

/** O código de 6 dígitos de um e-mail enviado. */
function codigoPara(para: string): string {
  const html = [...enviados].reverse().find((e) => e.para === para)?.html ?? "";
  const m = /letter-spacing:6px;color:#215756">(\d{6})</.exec(html);
  if (!m) throw new Error(`sem código para ${para}`);
  return m[1];
}

describe.runIf(RUN)("troca do e-mail da conta (Postgres real)", () => {
  let sql: ReturnType<typeof postgres>;

  async function limpar() {
    await sql`delete from users where id in ${sql(Object.values(ID))}`;
  }

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL as string, { prepare: false, max: 1 });
    await limpar();
    for (const id of Object.values(ID)) {
      await sql`insert into users (id, "openId", name, email, role) values (${id}, ${`sb:troca-${id}`}, 'Pessoa Teste', ${emailDe(id)}, 'user')`;
    }
  });

  afterAll(async () => {
    if (!sql) return;
    await limpar();
    await sql.end();
  });

  it("manda um código diferente para cada e-mail; só o par certo troca", async () => {
    const a = appRouter.createCaller(ctx(ID.A));
    const novo = "novo-990401@teste.local";
    expect(await a.me.requestEmailChange({ novoEmail: novo })).toEqual({ ok: true, precisaDoAtual: true });
    const doAtual = codigoPara(emailDe(ID.A));
    const doNovo = codigoPara(novo);
    expect(doAtual).not.toBe(doNovo);

    // Quem só tem o e-mail novo (a sessão roubada) não troca.
    await expect(a.me.confirmEmailChange({ codigoNovo: doNovo })).rejects.toThrow(/incorreto/);
    await expect(a.me.confirmEmailChange({ codigoAtual: doNovo, codigoNovo: doNovo })).rejects.toThrow(/incorreto/);
    // Com os dois, troca.
    await expect(a.me.confirmEmailChange({ codigoAtual: doAtual, codigoNovo: doNovo })).resolves.toEqual({ ok: true, email: novo });
    expect(supabaseAdmin.trocarEmailSupabase).toHaveBeenCalledWith(`troca-${ID.A}`, novo);
    const [linha] = await sql`select email from users where id = ${ID.A}`;
    expect(linha.email).toBe(novo);
  });

  it("cinco tentativas erradas encerram o pedido", async () => {
    const b = appRouter.createCaller(ctx(ID.B));
    await b.me.requestEmailChange({ novoEmail: "novo-990402@teste.local" });
    for (let i = 0; i < 5; i++) {
      await expect(b.me.confirmEmailChange({ codigoAtual: "000000", codigoNovo: "000000" })).rejects.toThrow();
    }
    const doAtual = codigoPara(emailDe(ID.B));
    const doNovo = codigoPara("novo-990402@teste.local");
    await expect(b.me.confirmEmailChange({ codigoAtual: doAtual, codigoNovo: doNovo })).rejects.toThrow(/Muitas tentativas|Nenhuma troca/);
  });
});
