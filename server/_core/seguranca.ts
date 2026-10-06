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
 * Cabeçalhos de segurança.
 *
 * NÃO inclui Content-Security-Policy nem Permissions-Policy, e isso é decisão, não
 * esquecimento: uma CSP errada quebra a aplicação em produção sem erro visível, e
 * uma Permissions-Policy errada derruba a câmera e o microfone da videochamada —
 * que é justamente o núcleo do produto. Os dois merecem uma passagem própria, com
 * teste de chamada real. Os quatro abaixo não têm esse risco.
 */
export function cabecalhosDeSeguranca(_req: Request, res: Response, next: NextFunction) {
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
