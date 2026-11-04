/**
 * Validação do token de login (JWT do Supabase): é o que decide quem é quem em
 * TODA chamada da API. Um servidor local publica a chave pública (JWKS), como o
 * Supabase faz, e cada teste tenta entrar com um token válido ou forjado.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";

type Verificar = (token: string) => Promise<Record<string, unknown> | null>;

let servidor: http.Server;
let base = "";
let verificar: Verificar;
let chavePrivada: CryptoKey;
let chavePublicaJwk: JWK;

const KID = "chave-de-teste";

async function token(
  claims: Record<string, unknown>,
  opcoes: { emissor?: string; publico?: string; expira?: string | number; chave?: CryptoKey; kid?: string; semSub?: boolean } = {},
) {
  let jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: opcoes.kid ?? KID })
    .setIssuer(opcoes.emissor ?? `${base}/auth/v1`)
    .setAudience(opcoes.publico ?? "authenticated")
    .setIssuedAt()
    .setExpirationTime(opcoes.expira ?? "1h");
  if (!opcoes.semSub) jwt = jwt.setSubject("uid-da-ana");
  return jwt.sign(opcoes.chave ?? chavePrivada);
}

const b64url = (dados: string | Buffer) => Buffer.from(dados).toString("base64url");

beforeAll(async () => {
  const par = await generateKeyPair("ES256", { extractable: true });
  chavePrivada = par.privateKey as CryptoKey;
  chavePublicaJwk = { ...(await exportJWK(par.publicKey)), kid: KID, alg: "ES256", use: "sig" };

  servidor = http.createServer((req, res) => {
    if (req.url === "/auth/v1/.well-known/jwks.json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ keys: [chavePublicaJwk] }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;

  // O módulo lê a URL do Supabase no import: define antes e importa de novo.
  vi.stubEnv("SUPABASE_URL", base);
  vi.stubEnv("SUPABASE_JWKS_URL", "");
  vi.resetModules();
  verificar = (await import("./supabaseAuth")).verifySupabaseToken as unknown as Verificar;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise((ok) => servidor.close(ok));
});

describe("verifySupabaseToken", () => {
  it("aceita o token certo e lê os dados do cadastro", async () => {
    const t = await token({
      email: "ana@exemplo.com",
      user_metadata: { name: "Ana", crp_solicitado: "06/123456", telefone: "81999990000" },
    });
    expect(await verificar(t)).toEqual({
      sub: "uid-da-ana",
      email: "ana@exemplo.com",
      name: "Ana",
      crpSolicitado: "06/123456",
      telefone: "81999990000",
    });
  });

  it("usa full_name quando não há name", async () => {
    const t = await token({ user_metadata: { full_name: "Ana Souza" } });
    expect((await verificar(t))?.name).toBe("Ana Souza");
  });

  it("ignora dados do cadastro que não são texto (objeto no lugar do nome, etc.)", async () => {
    const t = await token({ email: 123, user_metadata: { name: { $ne: null }, crp_solicitado: ["x"], telefone: 81 } });
    expect(await verificar(t)).toEqual({ sub: "uid-da-ana", email: undefined, name: undefined, crpSolicitado: undefined, telefone: undefined });
  });

  it("recusa token vencido", async () => {
    const t = await token({}, { expira: Math.floor(Date.now() / 1000) - 60 });
    expect(await verificar(t)).toBeNull();
  });

  it("recusa token que ainda não vale (nbf no futuro)", async () => {
    const t = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: KID })
      .setIssuer(`${base}/auth/v1`)
      .setAudience("authenticated")
      .setSubject("uid-da-ana")
      .setNotBefore("1h")
      .setExpirationTime("2h")
      .sign(chavePrivada);
    expect(await verificar(t)).toBeNull();
  });

  it("recusa emissor de outro projeto", async () => {
    expect(await verificar(await token({}, { emissor: "https://outro.supabase.co/auth/v1" }))).toBeNull();
  });

  it("recusa token de outro público (ex.: a chave anon)", async () => {
    expect(await verificar(await token({}, { publico: "anon" }))).toBeNull();
  });

  it("recusa token assinado por outra chave, mesmo com o kid certo", async () => {
    const outra = await generateKeyPair("ES256");
    expect(await verificar(await token({}, { chave: outra.privateKey as CryptoKey }))).toBeNull();
  });

  it("recusa token sem sub", async () => {
    expect(await verificar(await token({}, { semSub: true }))).toBeNull();
  });

  it("recusa token adulterado depois de assinado (troca do sub)", async () => {
    const [cabecalho, , assinatura] = (await token({})).split(".");
    const payloadForjado = b64url(
      JSON.stringify({ sub: "uid-de-outra-pessoa", iss: `${base}/auth/v1`, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 }),
    );
    expect(await verificar(`${cabecalho}.${payloadForjado}.${assinatura}`)).toBeNull();
  });

  it('recusa token sem assinatura (alg "none")', async () => {
    const cabecalho = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
    const payload = b64url(
      JSON.stringify({ sub: "uid-da-ana", iss: `${base}/auth/v1`, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 }),
    );
    expect(await verificar(`${cabecalho}.${payload}.`)).toBeNull();
  });

  it("recusa a confusão de algoritmo (HS256 assinado com a chave PÚBLICA como segredo)", async () => {
    const segredo = new TextEncoder().encode(JSON.stringify(chavePublicaJwk));
    const t = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256", kid: KID })
      .setIssuer(`${base}/auth/v1`)
      .setAudience("authenticated")
      .setSubject("uid-da-ana")
      .setExpirationTime("1h")
      .sign(segredo);
    expect(await verificar(t)).toBeNull();
  });

  it("recusa lixo e texto vazio sem lançar erro", async () => {
    for (const lixo of ["", "abc", "a.b.c", "....", "x".repeat(10_000)]) {
      expect(await verificar(lixo)).toBeNull();
    }
  });
});
