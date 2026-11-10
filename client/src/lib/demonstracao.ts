/**
 * Demonstração sem cadastro (2026-11-10): o sistema de verdade, com dados
 * fictícios, sem servidor e sem banco. Quem chega pela Home toca em "Ver
 * demonstração" e navega como psicóloga.
 *
 * Como funciona: o front decide quem está logado só pelo `auth.me`, então na
 * demonstração o cliente tRPC troca o link HTTP por `linkDaDemonstracao`, que
 * responde as consultas aqui mesmo (dadosDaDemonstracao.ts) e recusa toda
 * gravação com um aviso. Nenhuma chamada chega à API; nada é salvo.
 *
 * A marca fica no sessionStorage: some ao fechar a aba, e "Sair" limpa.
 */
import { TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "../../../server/routers";
import { respostaDaDemonstracao } from "./dadosDaDemonstracao";

const CHAVE = "vozinterior-demonstracao";
/** O tour abre na primeira tela da demonstração e não volta depois de visto (ou pulado). */
const CHAVE_DO_TOUR = "vozinterior-demonstracao-tour";

export function emDemonstracao(): boolean {
  try {
    return sessionStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}

/** Entra e recarrega: o cliente tRPC é montado uma vez, no carregamento. */
export function entrarNaDemonstracao(destino = "/dashboard"): void {
  try {
    sessionStorage.setItem(CHAVE, "1");
  } catch {
    // Sem sessionStorage (aba privada bloqueada) a demonstração não abre.
  }
  window.location.href = destino;
}

export function sairDaDemonstracao(destino = "/"): void {
  try {
    sessionStorage.removeItem(CHAVE);
    sessionStorage.removeItem(CHAVE_DO_TOUR);
    // O passo do tour fica guardado por conta; o da conta fictícia não deve sobrar.
    for (const k of Object.keys(sessionStorage)) if (k.startsWith("luma-onboarding-step:")) sessionStorage.removeItem(k);
  } catch {}
  window.location.href = destino;
}

function lerTourVisto(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_DO_TOUR) === "visto";
  } catch {
    return true;
  }
}

export const AVISO_DA_DEMONSTRACAO = "Isto é uma demonstração: nada é salvo. Crie sua conta grátis para usar de verdade.";

/**
 * Gravações que acontecem sozinhas na tela (marcar como lida, "digitando", fim do
 * tour): respondem "ok" em silêncio, para não pipocar aviso sem a pessoa ter feito nada.
 */
const SILENCIOSAS = new Set(["chat.markRead", "chat.setTyping", "me.completeOnboarding", "notifications.dismiss", "notifications.dismissAll"]);

export const linkDaDemonstracao: TRPCLink<AppRouter> = () => ({ op }) =>
  observable((observer) => {
    if (op.path === "auth.logout") {
      sairDaDemonstracao();
      observer.next({ result: { type: "data", data: { success: true } } });
      observer.complete();
      return;
    }
    if (op.path === "me.completeOnboarding") {
      try {
        sessionStorage.setItem(CHAVE_DO_TOUR, "visto");
      } catch {}
    }
    if (op.type === "mutation" && !SILENCIOSAS.has(op.path)) {
      observer.error(TRPCClientError.from(new Error(AVISO_DA_DEMONSTRACAO)));
      return;
    }
    const data =
      op.type === "mutation"
        ? { success: true }
        : op.path === "me.onboarding"
          ? { visto: lerTourVisto() }
          : respostaDaDemonstracao(op.path, op.input);
    // Um respiro, como a rede: a tela mostra o "carregando" que mostraria de verdade.
    const t = setTimeout(() => {
      observer.next({ result: { type: "data", data } });
      observer.complete();
    }, 120);
    return () => clearTimeout(t);
  });
