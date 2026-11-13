/**
 * Título, descrição e imagem de compartilhamento de cada página, num lugar só.
 *
 * O servidor põe esses dados no HTML (é o que o Google e a prévia do WhatsApp leem:
 * eles não rodam o JavaScript do site), e a tela troca o título ao navegar.
 * Também saem daqui o robots.txt, o sitemap.xml e o 404 de verdade.
 */

export type PaginaPublica = {
  caminho: string;
  titulo: string;
  descricao: string;
  /** Entra no sitemap (páginas que valem a pena aparecer no Google). */
  noSitemap: boolean;
};

const MARCA = "VozInterior";
/** 1200×630, JPEG (80 KB): a prévia do WhatsApp aparece mais rápido que com o PNG de 220 KB. */
export const IMAGEM_DE_COMPARTILHAMENTO = "/og-vozinterior.jpg";

export const PAGINAS_PUBLICAS: readonly PaginaPublica[] = [
  {
    caminho: "/",
    titulo: `${MARCA} — Agenda, prontuário e videochamada para psicólogas`,
    descricao:
      "Agenda, prontuário, videochamada e Pix num lugar só, para psicólogas e psicólogos do Brasil. Teste grátis por 14 dias.",
    noSitemap: true,
  },
  {
    caminho: "/precos",
    titulo: `Planos e preços — ${MARCA}`,
    descricao:
      "Um preço fixo por número de pacientes, pago por Pix. Teste grátis por 14 dias, contados a partir do primeiro paciente.",
    noSitemap: true,
  },
  {
    caminho: "/encontrar-psicologa",
    titulo: `Encontrar psicóloga — ${MARCA}`,
    descricao:
      "Encontre psicólogas e psicólogos com CRP e marque uma primeira conversa curta e gratuita, por vídeo.",
    noSitemap: true,
  },
  {
    caminho: "/ajuda",
    titulo: `Ajuda — ${MARCA}`,
    descricao: "Como entrar, agendar, atender por vídeo, cuidar do prontuário e receber pelo Pix no VozInterior.",
    noSitemap: true,
  },
  {
    caminho: "/privacidade",
    titulo: `Política de Privacidade — ${MARCA}`,
    descricao: "Quais dados o VozInterior guarda, por quê, por quanto tempo e como você exerce seus direitos pela LGPD.",
    noSitemap: true,
  },
  {
    caminho: "/termos",
    titulo: `Termos de Uso — ${MARCA}`,
    descricao: "As regras de uso do VozInterior: planos, pagamento, reembolso, responsabilidades e cancelamento.",
    noSitemap: true,
  },
  {
    caminho: "/login",
    titulo: `Entrar ou criar conta — ${MARCA}`,
    descricao: "Entre na sua conta do VozInterior ou crie a sua. Psicólogas testam grátis por 14 dias.",
    noSitemap: false,
  },
];

/**
 * Todas as rotas que o app conhece (as mesmas do App.tsx; um teste confere). O
 * que não casar com nenhuma é 404 de verdade, com o status certo para o Google.
 */
export const ROTAS_DO_APP: readonly string[] = [
  "/", "/login", "/redefinir-senha", "/ajuda", "/privacidade", "/termos", "/precos",
  "/encontrar-psicologa", "/psicologas/:id", "/demonstracao", "/__e2e__/agent-chat",
  "/luma", "/dashboard", "/videocall/:roomId", "/records", "/records/:id", "/appointments", "/financeiro",
  "/assinatura", "/solicitacoes", "/mensagens", "/consultas", "/psicologa", "/documentos", "/profile",
  "/configuracoes", "/404",
];

/** Tira query, âncora e barra do fim: "/precos/?origem=x" → "/precos". */
export function caminhoLimpo(url: string): string {
  const semQuery = url.split(/[?#]/)[0] || "/";
  return semQuery.length > 1 ? semQuery.replace(/\/+$/, "") || "/" : semQuery;
}

export function rotaExiste(url: string): boolean {
  const caminho = caminhoLimpo(url);
  if (caminho === "/404") return false;
  return ROTAS_DO_APP.some((rota) => {
    const padrao = new RegExp(`^${rota.replace(/:[^/]+/g, "[^/]+")}$`);
    return padrao.test(caminho);
  });
}

export type MetaDaPagina = {
  titulo: string;
  descricao: string;
  /** Página pública que pode aparecer no Google; as do app (logadas) e o 404 não. */
  indexar: boolean;
};

export function metaDaPagina(url: string): MetaDaPagina {
  const caminho = caminhoLimpo(url);
  const publica = PAGINAS_PUBLICAS.find((p) => p.caminho === caminho);
  if (publica) return { titulo: publica.titulo, descricao: publica.descricao, indexar: true };
  if (!rotaExiste(caminho)) {
    return { titulo: `Página não encontrada — ${MARCA}`, descricao: PAGINAS_PUBLICAS[0].descricao, indexar: false };
  }
  return { titulo: MARCA, descricao: PAGINAS_PUBLICAS[0].descricao, indexar: false };
}
