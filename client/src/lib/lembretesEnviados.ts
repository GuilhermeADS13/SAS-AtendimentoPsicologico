/**
 * Quais lembretes de consulta ela já mandou pelo WhatsApp, neste navegador. É só uma
 * marca para ela não se perder numa lista de vários pacientes: vale 3 dias e some
 * sozinha. Sem armazenamento (janela anônima), a tela segura a marca enquanto está aberta.
 */
const CHAVE = "vozinterior:lembretes-enviados";
const VALIDADE_MS = 3 * 24 * 60 * 60 * 1000;

type Marcas = Record<string, number>;

function lerMarcas(agora: number): Marcas {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? "{}") as unknown;
    if (!salvo || typeof salvo !== "object") return {};
    return Object.fromEntries(
      Object.entries(salvo as Record<string, unknown>).filter(
        (par): par is [string, number] => typeof par[1] === "number" && agora - par[1] < VALIDADE_MS,
      ),
    );
  } catch {
    return {};
  }
}

export function lembretesEnviados(agora: number = Date.now()): Set<number> {
  return new Set(Object.keys(lerMarcas(agora)).map(Number));
}

export function marcarLembreteEnviado(consultaId: number, agora: number = Date.now()): void {
  try {
    const marcas = lerMarcas(agora);
    marcas[String(consultaId)] = agora;
    localStorage.setItem(CHAVE, JSON.stringify(marcas));
  } catch {
    /* sem armazenamento: a tela guarda a marca enquanto estiver aberta */
  }
}
