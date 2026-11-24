import { enviarTelegram } from "./telegram";

/**
 * Alerta de atividade suspeita no Telegram do admin (2026-11-24, checklist de
 * segurança item 33). Conta eventos em memória (o serviço roda numa instância só)
 * e avisa quando um tipo passa do limite na janela. Um aviso por tipo por hora:
 * ataque em andamento não pode virar enxurrada de mensagens.
 *
 * O texto vai para um serviço de fora: nada de IP, nome, e-mail ou id de conta.
 * O detalhe fica no log do Render.
 */

export type EventoDeSeguranca = "codigoErrado" | "limiteDaApi" | "limiteDoVideo";

const REGRAS: Record<EventoDeSeguranca, { limite: number; descricao: string }> = {
  // Cada código de aparelho aceita 5 tentativas; 10 erros somados entre todas as
  // contas em 10 min não acontece por engano de digitação.
  codigoErrado: { limite: 10, descricao: "códigos de acesso errados" },
  // Conta quando um IP é BARRADO (uma vez por janela de 1 min, não cada pedido).
  limiteDaApi: { limite: 3, descricao: "bloqueios por excesso de requisições na API" },
  limiteDoVideo: { limite: 3, descricao: "bloqueios por excesso de conexões de vídeo" },
};

export const JANELA_MS = 10 * 60_000;
export const PAUSA_ENTRE_AVISOS_MS = 60 * 60_000;

const ocorrencias = new Map<EventoDeSeguranca, number[]>();
const ultimoAviso = new Map<EventoDeSeguranca, number>();

/**
 * Registra o evento e devolve a mensagem do aviso quando ele deve sair (útil no
 * teste); o envio ao Telegram é feito aqui mesmo, sem travar quem chamou.
 */
export function registrarEventoDeSeguranca(tipo: EventoDeSeguranca, agora: number = Date.now()): string | null {
  const recentes = (ocorrencias.get(tipo) ?? []).filter((t) => agora - t < JANELA_MS);
  recentes.push(agora);
  ocorrencias.set(tipo, recentes);

  const { limite, descricao } = REGRAS[tipo];
  if (recentes.length < limite) return null;
  const anterior = ultimoAviso.get(tipo);
  if (anterior !== undefined && agora - anterior < PAUSA_ENTRE_AVISOS_MS) return null;

  ultimoAviso.set(tipo, agora);
  const texto =
    `⚠️ VozInterior: ${recentes.length} ${descricao} nos últimos 10 minutos. ` +
    "Pode ser um ataque. Olhe os logs do Render e o plano em docs/plano-de-incidente.md.";
  console.warn(`[seguranca] alerta: ${recentes.length} ${tipo} em 10 min`);
  enviarTelegram(texto).catch((erro) =>
    console.error("[seguranca] alerta não saiu no Telegram:", erro instanceof Error ? erro.message : "erro"),
  );
  return texto;
}

/** Só para os testes. */
export function zerarAlertasDeSeguranca() {
  ocorrencias.clear();
  ultimoAviso.clear();
}
