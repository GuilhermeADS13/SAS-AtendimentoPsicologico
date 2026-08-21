/**
 * Integração com o Daily.co (videochamada gerenciada).
 *
 * A sala é PRIVADA e o acesso é por "meeting token" (JWT por usuário). O nome da
 * sala é o mesmo do app (apt<id>-<token>), então o controle continua sendo nosso
 * (roomAccess valida o participante antes de gerar o token).
 *
 * Se DAILY_API_KEY não estiver setada, `dailyEnabled()` é false e o app usa o
 * MiroTalk como fallback — nada quebra.
 */
const DAILY_API = "https://api.daily.co/v1";
const TTL_SECONDS = 4 * 60 * 60; // 4h: cobre a consulta com folga.

export function dailyEnabled(): boolean {
  return !!process.env.DAILY_API_KEY?.trim();
}

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.DAILY_API_KEY?.trim()}`,
    "Content-Type": "application/json",
  };
}

/** Cria a sala privada se não existir (idempotente) e devolve a URL do Daily. */
export async function ensureDailyRoom(name: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const res = await fetch(`${DAILY_API}/rooms`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      name,
      privacy: "private",
      properties: {
        exp,
        enable_chat: true,
        enable_screenshare: true,
        // Nosso app já tem a tela de preparação (câmera/mic); pula a do Daily.
        enable_prejoin_ui: false,
      },
    }),
  });
  if (res.ok) {
    const room = (await res.json()) as { url: string };
    return room.url;
  }
  // Provavelmente já existe: busca a sala.
  const get = await fetch(`${DAILY_API}/rooms/${encodeURIComponent(name)}`, { headers: authHeaders() });
  if (get.ok) {
    const room = (await get.json()) as { url: string };
    return room.url;
  }
  throw new Error(`Daily: falha ao criar/obter a sala (${res.status})`);
}

/** Gera um meeting token (JWT) para o participante entrar na sala privada. */
export async function createDailyToken(
  roomName: string,
  opts: { isOwner: boolean; userName: string },
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const res = await fetch(`${DAILY_API}/meeting-tokens`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        is_owner: opts.isOwner,
        user_name: opts.userName.slice(0, 60),
        exp,
      },
    }),
  });
  if (!res.ok) throw new Error(`Daily: falha ao criar o token (${res.status})`);
  const data = (await res.json()) as { token: string };
  return data.token;
}
