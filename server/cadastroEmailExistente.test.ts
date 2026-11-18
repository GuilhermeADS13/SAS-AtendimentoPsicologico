import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

/**
 * Cadastro com e-mail que JÁ tem conta: a tela responde igual (não revela quem
 * faz terapia na plataforma), mas o dono do e-mail recebe o aviso com o link de
 * criar nova senha — antes não recebia nada e ficava esperando.
 */
const supabaseAdmin = vi.hoisted(() => ({
  gerarLinkDeCadastro: vi.fn(),
  gerarLinkDeRecuperacao: vi.fn(),
  trocarEmailSupabase: vi.fn(),
}));
const mailer = vi.hoisted(() => ({ sendEmail: vi.fn(async () => true) }));
vi.mock("./supabaseAdmin", async (importOriginal) => ({ ...(await importOriginal<object>()), ...supabaseAdmin }));
vi.mock("./mailer", async (importOriginal) => ({ ...(await importOriginal<object>()), ...mailer }));

const { appRouter } = await import("./routers");

let ip = 10;
const publico = () =>
  appRouter.createCaller({
    user: null,
    // IP novo a cada teste: o limite por IP do cadastro não interfere.
    req: { get: () => undefined, headers: {}, socket: { remoteAddress: `10.0.0.${ip++}` } } as unknown as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  });

const cadastro = (email: string) => ({
  email,
  senha: "Senha@Forte1",
  nome: "Ana Souza",
  celular: "81999990000",
  aceitouPolitica: true as const,
});

beforeEach(() => {
  // Senha não vazada (o HIBP devolve uma lista sem o hash dela).
  vi.stubGlobal("fetch", vi.fn(async () => new Response("00000000000000000000000000000000000:1")));
  supabaseAdmin.gerarLinkDeCadastro.mockReset();
  supabaseAdmin.gerarLinkDeRecuperacao.mockReset();
  mailer.sendEmail.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("cadastro com e-mail já cadastrado", () => {
  it("responde igual ao cadastro novo e avisa o DONO do e-mail, com o link de nova senha", async () => {
    supabaseAdmin.gerarLinkDeCadastro.mockResolvedValue(null);
    supabaseAdmin.gerarLinkDeRecuperacao.mockResolvedValue("https://exemplo.com/recuperar");
    await expect(publico().auth.signUp(cadastro("ja.tem@exemplo.com"))).resolves.toEqual({ ok: true });
    // O envio é em segundo plano (ver o teste do tempo abaixo).
    await vi.waitFor(() => expect(mailer.sendEmail).toHaveBeenCalledTimes(1));
    const [para, assunto, html] = mailer.sendEmail.mock.calls[0] as unknown as [string, string, string];
    expect(para).toBe("ja.tem@exemplo.com");
    expect(assunto).toBe("Você já tem conta no VozInterior");
    expect(html).toContain("https://exemplo.com/recuperar");
  });

  it("cadastro novo segue mandando a confirmação (e não o aviso)", async () => {
    supabaseAdmin.gerarLinkDeCadastro.mockResolvedValue("https://exemplo.com/confirmar");
    await expect(publico().auth.signUp(cadastro("nova.conta@exemplo.com"))).resolves.toEqual({ ok: true });
    await vi.waitFor(() => expect(mailer.sendEmail).toHaveBeenCalledTimes(1));
    expect(supabaseAdmin.gerarLinkDeRecuperacao).not.toHaveBeenCalled();
    expect(mailer.sendEmail.mock.calls[0]?.[1]).toBe("Confirme seu e-mail — VozInterior");
  });

  it("falha que não é 'já cadastrado' (sem link de recuperação): não manda nada", async () => {
    supabaseAdmin.gerarLinkDeCadastro.mockResolvedValue(null);
    supabaseAdmin.gerarLinkDeRecuperacao.mockResolvedValue(null);
    await expect(publico().auth.signUp(cadastro("outro.erro@exemplo.com"))).resolves.toEqual({ ok: true });
    await vi.waitFor(() => expect(supabaseAdmin.gerarLinkDeRecuperacao).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(mailer.sendEmail).not.toHaveBeenCalled();
  });

  /**
   * O tempo da resposta não pode depender de o e-mail já ter conta: quem já tem conta
   * passa por mais etapas (link de recuperação, banco). Aqui o Supabase nem responde, e
   * mesmo assim o cadastro responde na hora, igual para todo mundo.
   */
  it("responde sem esperar o Supabase nem o envio (o tempo não revela quem tem conta)", async () => {
    supabaseAdmin.gerarLinkDeCadastro.mockReturnValue(new Promise(() => {}));
    await expect(publico().auth.signUp(cadastro("qualquer@exemplo.com"))).resolves.toEqual({ ok: true });
    expect(mailer.sendEmail).not.toHaveBeenCalled();
  });
});
