import { useEffect } from "react";
import { Eye, X } from "lucide-react";
import { LINK_CADASTRO_PSICOLOGA } from "@shared/entradaNoSite";
import { emDemonstracao, entrarNaDemonstracao, sairDaDemonstracao } from "@/lib/demonstracao";

/**
 * Aviso fixo enquanto a pessoa navega pela demonstração: dados fictícios, nada
 * é salvo, e os dois caminhos de saída (criar a conta ou voltar ao site).
 * No computador fica no alto, no meio da barra; no celular, embaixo.
 */
export function FaixaDaDemonstracao() {
  if (!emDemonstracao()) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-[60] flex items-center gap-2 rounded-full border border-primary/30 bg-card/95 py-1.5 pl-4 pr-1.5 text-sm shadow-lg backdrop-blur md:inset-x-auto md:bottom-auto md:left-1/2 md:top-2.5 md:-translate-x-1/2"
    >
      <Eye className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-foreground">
        <strong className="font-semibold">Demonstração</strong>
        <span className="text-muted-foreground"> · dados fictícios, nada é salvo</span>
      </span>
      <button
        type="button"
        onClick={() => sairDaDemonstracao(LINK_CADASTRO_PSICOLOGA)}
        className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
      >
        Criar minha conta
      </button>
      <button
        type="button"
        onClick={() => sairDaDemonstracao()}
        aria-label="Sair da demonstração"
        title="Sair da demonstração"
        className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/** /demonstracao: marca a aba e abre o painel com os dados fictícios. */
export function EntrarNaDemonstracao() {
  useEffect(() => entrarNaDemonstracao("/dashboard"), []);
  return null;
}
