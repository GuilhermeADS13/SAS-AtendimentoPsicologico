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
export function identificarCliente(req: Request): string {
  const cloudflare = req.get("cf-connecting-ip");
  if (cloudflare) return cloudflare.trim();
  const encaminhado = req.get("x-forwarded-for");
  if (encaminhado) return encaminhado.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "desconhecido";
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
 * Content-Security-Policy, por enquanto em modo RELATÓRIO.
 *
 * CSP errada quebra a aplicação sem erro visível — some um estilo, uma chamada
 * falha, e nada aparece para o usuário além da tela torta. Por isso ela entra
 * primeiro como `-Report-Only`: o navegador NÃO bloqueia nada, só anota no console
 * o que teria bloqueado. Com essa lista na mão dá para apertar o que falta e só
 * então promover para o cabeçalho que bloqueia de verdade.
 *
 * `frame-ancestors 'none'` repete o X-Frame-Options porque navegador moderno já
 * prefere a CSP; os dois juntos cobrem o antigo e o novo.
 */
const CSP_RELATORIO = [
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
  "script-src 'self'",
  // Supabase (API, Storage, Realtime), os WebSockets da própria sala e os
  // servidores STUN/TURN da videochamada.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co wss: stun: turn: turns:",
  "worker-src 'self' blob:",
  // O arquivo compartilhado DENTRO da chamada é exibido num <iframe src="blob:">
  // (WebRTCCall.tsx). Sem esta linha, frame-src herdaria default-src 'self' e o
  // visualizador de documento morreria no meio do atendimento — achado por leitura
  // de código, não pelo relatório: a tela não foi aberta na verificação.
  "frame-src 'self' blob:",
  // Para onde o navegador manda o que BLOQUEARIA. Sem isto, "modo relatório" não
  // produz evidência nenhuma: o aviso fica no console de quem navegou e some.
  "report-uri /api/csp-report",
].join("; ");

/**
 * Cabeçalhos de segurança.
 *
 * A Permissions-Policy declara `self` para câmera, microfone e captura de tela:
 * sem essas três, a videochamada — o núcleo do produto — para de funcionar. O
 * efeito prático é barrar iframe de terceiro de pedir esses recursos.
 */
export function cabecalhosDeSeguranca(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("Content-Security-Policy-Report-Only", CSP_RELATORIO);
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
