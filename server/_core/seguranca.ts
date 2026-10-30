import type { NextFunction, Request, Response } from "express";

/**
 * Proteções de borda: identificação do cliente, limite de requisições e cabeçalhos
 * de segurança. Tudo em memória — o serviço roda numa instância só no Render, e
 * uma dependência a mais traria um store distribuído que não é necessário aqui.
 */

/**
 * IP real de quem chamou.
 *
 * O app fica atrás da Cloudflare (confirmado pelo cabeçalho CF-RAY) e do proxy do
 * Render, então `req.ip` seria o IP do proxy e TODO mundo contaria no mesmo balde.
 * O `CF-Connecting-IP` é posto pela Cloudflare e ela sobrescreve qualquer valor
 * que o cliente tenha mandado, então não dá para forjar por ali. O
 * `x-forwarded-for` entra só como segundo plano (ambiente sem Cloudflare); ele é
 * falsificável, o que apenas permitiria escapar do limite — nunca atingir outra
 * pessoa, já que a chave é usada só para contar.
 */
type PedidoComIp = {
  get?: (nome: string) => string | undefined;
  headers?: Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string };
};

/** Lê um cabeçalho tanto do Express (`req.get`) quanto do upgrade de WebSocket (`req.headers`). */
function cabecalho(req: PedidoComIp, nome: string): string | undefined {
  if (typeof req.get === "function") return req.get(nome) ?? undefined;
  const v = req.headers?.[nome];
  return Array.isArray(v) ? v[0] : v;
}

export function identificarCliente(req: PedidoComIp): string {
  const cloudflare = cabecalho(req, "cf-connecting-ip");
  if (cloudflare) return cloudflare.trim();
  const encaminhado = cabecalho(req, "x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "desconhecido";
}

/**
 * Limite de CONEXÕES NOVAS de WebSocket por IP (vídeo e presença).
 *
 * O upgrade de WebSocket não passa pelos middlewares do Express, então o limite
 * geral da API não vale para ele: sem isto, um IP abria milhares de conexões
 * (cada uma segura memória até o tempo de autenticação acabar). 30 por minuto
 * sobra para quem reconecta numa rede ruim.
 */
export function limitarConexoes(opcoes: { janelaMs: number; maximo: number }) {
  const baldes = new Map<string, Janela>();
  return function podeConectar(req: PedidoComIp): boolean {
    const agora = Date.now();
    if (baldes.size > MAXIMO_DE_CLIENTES) {
      baldes.forEach((janela, chave) => {
        if (janela.expiraEm <= agora) baldes.delete(chave);
      });
    }
    const chave = identificarCliente(req);
    const janela = baldes.get(chave);
    if (!janela || janela.expiraEm <= agora) {
      baldes.set(chave, { expiraEm: agora + opcoes.janelaMs, usos: 1 });
      return true;
    }
    janela.usos += 1;
    return janela.usos <= opcoes.maximo;
  };
}

/**
 * A chamada é para a Luma? `caminho` é o `req.path` já relativo ao mount do tRPC:
 * "/ai.chat" numa chamada só, ou "/ai.chat,me.contato" quando o cliente agrupa
 * várias num lote. Compara segmento a segmento em vez de procurar "ai." no texto
 * inteiro, senão um procedimento futuro com "ai." no meio do nome cairia no limite
 * apertado da Luma sem ninguém entender por quê.
 */
export function ehChamadaDaLuma(caminho: string): boolean {
  return caminho.replace(/^\//, "").split(",").some(parte => parte.trim().startsWith("ai."));
}

type Janela = { expiraEm: number; usos: number };

/** Quantos clientes distintos o balde guarda antes de uma limpeza forçada. */
const MAXIMO_DE_CLIENTES = 10_000;

/**
 * Limite por janela fixa. Simples de propósito: o objetivo é barrar laço
 * automatizado e força bruta, não modelar tráfego com precisão.
 */
export function limitarRequisicoes(opcoes: { janelaMs: number; maximo: number; mensagem: string }) {
  const baldes = new Map<string, Janela>();

  return function limitador(req: Request, res: Response, next: NextFunction) {
    const agora = Date.now();

    // Limpeza preguiçosa: sem isto o Map cresceria para sempre e viraria um
    // vazamento de memória lento num processo que fica semanas no ar.
    if (baldes.size > MAXIMO_DE_CLIENTES) {
      baldes.forEach((janela, chave) => {
        if (janela.expiraEm <= agora) baldes.delete(chave);
      });
    }

    const chave = identificarCliente(req);
    const janela = baldes.get(chave);

    if (!janela || janela.expiraEm <= agora) {
      baldes.set(chave, { expiraEm: agora + opcoes.janelaMs, usos: 1 });
      return next();
    }

    janela.usos += 1;
    if (janela.usos > opcoes.maximo) {
      const segundos = Math.max(1, Math.ceil((janela.expiraEm - agora) / 1000));
      res.setHeader("Retry-After", String(segundos));
      res.status(429).json({ error: opcoes.mensagem, retryAfter: segundos });
      return;
    }
    next();
  };
}

/**
 * Content-Security-Policy.
 *
 * A sessão do Supabase mora no navegador: script injetado leria a sessão da
 * psicóloga e todos os prontuários dela. Esta é a barreira quando um filtro
 * falha. Passou por modo relatório primeiro; em 2026-10-30 os logs só tinham
 * `eval` do teste de generators do bundle (está em try/catch, sem efeito) e as
 * telas foram abertas com ela valendo. CSP errada quebra a aplicação sem erro
 * visível, então domínio novo precisa entrar aqui.
 *
 * `frame-ancestors 'none'` repete o X-Frame-Options porque navegador moderno já
 * prefere a CSP; os dois juntos cobrem o antigo e o novo.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // blob:/data: são usados pela prévia de foto e pelo vídeo local.
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  // O Tailwind compila para arquivo, mas React injeta style inline em componente.
  "style-src 'self' 'unsafe-inline'",
  // Fundo virtual da chamada: o MediaPipe carrega o próprio JS + WebAssembly do
  // jsDelivr (virtualBackground.ts). Sem isto, a CSP valendo apagaria o fundo
  // virtual no meio do atendimento. 'wasm-unsafe-eval' é só para WebAssembly
  // (MediaPipe e o realce de código), não libera eval de JavaScript.
  // Só a pasta do MediaPipe: o jsDelivr inteiro serviria qualquer pacote público do
  // npm, e aí um atacante publicaria o próprio script e passaria pela CSP.
  "script-src 'self' https://cdn.jsdelivr.net/npm/@mediapipe/ 'wasm-unsafe-eval'",
  // Supabase (API, Storage, Realtime), os WebSockets da própria sala, os
  // servidores STUN/TURN da videochamada e os arquivos do MediaPipe (WASM no
  // jsDelivr, modelo de recorte no Google Storage).
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co wss: stun: turn: turns: https://cdn.jsdelivr.net/npm/@mediapipe/ https://storage.googleapis.com/mediapipe-models/",
  "worker-src 'self' blob:",
  // O arquivo compartilhado DENTRO da chamada é exibido num <iframe src="blob:">
  // (WebRTCCall.tsx). Sem esta linha, frame-src herdaria default-src 'self' e o
  // visualizador de documento morreria no meio do atendimento — achado por leitura
  // de código, não pelo relatório: a tela não foi aberta na verificação.
  "frame-src 'self' blob:",
  // Para onde o navegador manda o que BLOQUEOU: sem isto, uma tela quebrada pela
  // CSP só apareceria no console de quem navegou.
  "report-uri /api/csp-report",
].join("; ");

/**
 * Cabeçalhos de segurança.
 *
 * A Permissions-Policy declara `self` para câmera, microfone e captura de tela:
 * sem essas três, a videochamada — o núcleo do produto — para de funcionar. O
 * efeito prático é barrar iframe de terceiro de pedir esses recursos.
 */
export function cabecalhosDeSeguranca(req: Request, res: Response, next: NextFunction) {
  // Resposta da API traz prontuário e contato: não fica no disco do navegador
  // (computador compartilhado) nem em proxy. Rota que pode ser guardada, como a
  // imagem de GIF, troca este valor ao responder.
  if (req.path?.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader(
    "Permissions-Policy",
    "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(), usb=()",
  );
  // Só HTTPS por um ano (o serviço não atende em HTTP).
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // Impede o navegador de "adivinhar" o tipo de um arquivo servido.
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Nada de embutir o sistema em iframe de terceiro (clickjacking sobre prontuário).
  res.setHeader("X-Frame-Options", "DENY");
  // Não vaza o caminho da página (que pode conter id de paciente) para fora.
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
}
