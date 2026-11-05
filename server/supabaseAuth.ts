import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Verificação do access token (JWT) do Supabase Auth.
 *
 * Usa o JWKS público do projeto (chaves de assinatura assimétricas), então não
 * precisa de segredo no servidor. Requer que o projeto tenha as signing keys
 * assimétricas habilitadas (JWKS em /auth/v1/.well-known/jwks.json).
 */

const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  ""
).replace(/\/+$/, "");

const JWKS_URL =
  process.env.SUPABASE_JWKS_URL ||
  (SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` : "");

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks && JWKS_URL) {
    jwks = createRemoteJWKSet(new URL(JWKS_URL));
  }
  return jwks;
}

export interface SupabaseTokenUser {
  sub: string;
  email?: string;
  name?: string;
  /** CRP informado no cadastro de psicóloga (vira pedido de acesso no 1º login). */
  crpSolicitado?: string;
  /** Celular informado no cadastro (só dígitos) — ver telefoneDoCadastro.ts. */
  telefone?: string;
  /** Como a conta entra: "email", "google"... (app_metadata do Supabase). */
  provedores: string[];
  /** Quando aceitou Termos e Privacidade, para quem entrou pelo Google (ver cadastroPendente). */
  aceitouPoliticaEm?: string;
}

/** app_metadata.providers (lista) ou app_metadata.provider (um só); só textos. */
function provedoresDoToken(appMetadata: unknown): string[] {
  const app = (appMetadata as Record<string, unknown> | undefined) ?? {};
  const lista = Array.isArray(app.providers) ? app.providers : app.provider !== undefined ? [app.provider] : [];
  return lista.filter((p): p is string => typeof p === "string");
}

export async function verifySupabaseToken(
  token: string,
): Promise<SupabaseTokenUser | null> {
  const keyset = getJwks();
  if (!keyset || !SUPABASE_URL) return null;

  try {
    const { payload } = await jwtVerify(token, keyset, {
      issuer: `${SUPABASE_URL}/auth/v1`,
      audience: "authenticated",
    });

    const meta = (payload.user_metadata as Record<string, unknown> | undefined) ?? {};
    const name =
      typeof meta.name === "string"
        ? meta.name
        : typeof meta.full_name === "string"
          ? meta.full_name
          : undefined;

    if (!payload.sub) return null;

    return {
      sub: String(payload.sub),
      email: typeof payload.email === "string" ? payload.email : undefined,
      name,
      crpSolicitado: typeof meta.crp_solicitado === "string" ? meta.crp_solicitado : undefined,
      telefone: typeof meta.telefone === "string" ? meta.telefone : undefined,
      provedores: provedoresDoToken(payload.app_metadata),
      aceitouPoliticaEm: typeof meta.aceite_politica_em === "string" ? meta.aceite_politica_em : undefined,
    };
  } catch {
    // Token inválido/expirado/assinatura incorreta.
    return null;
  }
}
