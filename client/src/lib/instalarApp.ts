import { useSyncExternalStore } from "react";

/**
 * "Instalar o app" (public/manifest.webmanifest + public/sw.js).
 *
 * O Chrome (Android e computador) avisa uma vez, logo no começo, que o site pode
 * ser instalado (`beforeinstallprompt`). O aviso é guardado aqui, desde o carregamento
 * da página, porque a tela de Configurações costuma abrir depois. iPhone e iPad não
 * têm esse aviso: lá a instalação é pelo Safari (Compartilhar > Adicionar à Tela de
 * Início), e a tela só explica o caminho.
 */
type EventoDeInstalar = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let pedido: EventoDeInstalar | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Sem isto o Chrome mostra a própria faixa de instalação; o botão é nosso.
    e.preventDefault();
    pedido = e as EventoDeInstalar;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    pedido = null;
    avisar();
  });
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

/** O navegador deixa instalar agora (há um pedido guardado). */
export function usePodeInstalar(): boolean {
  return useSyncExternalStore(assinar, () => pedido !== null, () => false);
}

/** Abre a janela de instalação do navegador. `true` se a pessoa aceitou. */
export async function instalarApp(): Promise<boolean> {
  if (!pedido) return false;
  const atual = pedido;
  pedido = null;
  avisar();
  await atual.prompt();
  return (await atual.userChoice).outcome === "accepted";
}

/** Aberto como app instalado (sem a barra do navegador). */
export function abertoComoApp(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

/** iPhone ou iPad (o iPad recente se apresenta como Mac, mas tem tela de toque). */
export function ehAparelhoApple(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

/** Registra o service worker. Só em produção: no dev ele brigaria com o Vite. */
export function registrarServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
