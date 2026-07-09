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
    };
  } catch {
    // Token inválido/expirado/assinatura incorreta.
    return null;
  }
}
