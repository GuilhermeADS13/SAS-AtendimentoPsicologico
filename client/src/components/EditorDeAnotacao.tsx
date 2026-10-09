import { useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { Bold, ClipboardList, Eye, Heading2, Italic, List, ListChecks, ListOrdered, Quote, Strikethrough } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  alternarLista,
  alternarMarca,
  alternarPrefixo,
  continuarLista,
  diffMinimo,
  inserirModelo,
  type Edicao,
} from "@shared/notasMarkdown";
import { cn } from "@/lib/utils";

export type ModeloDeAnotacao = { nome: string; corpo: string };

/**
 * A barra, na ordem em que aparece. Os nomes dizem o que a psicóloga quer fazer
 * ("Citar a fala do paciente"), não o nome do recurso — e cada um tem o atalho
 * do Word no fim, para quem já tem o costume.
 */
const FERRAMENTAS: {
  chave: string;
  rotulo: string;
  titulo: string;
  icone: typeof Bold;
  separador?: boolean;
  acao?: (t: string, i: number, f: number) => Edicao;
}[] = [
  { chave: "titulo", rotulo: "Título", titulo: "Título de seção", icone: Heading2, acao: (t, i, f) => alternarPrefixo(t, i, f, "## ") },
  { chave: "negrito", rotulo: "Negrito", titulo: "Negrito (Ctrl+B)", icone: Bold, acao: (t, i, f) => alternarMarca(t, i, f, "**") },
  { chave: "italico", rotulo: "Itálico", titulo: "Itálico (Ctrl+I)", icone: Italic, acao: (t, i, f) => alternarMarca(t, i, f, "*") },
  { chave: "tachado", rotulo: "Tachado", titulo: "Tachado — para marcar o que não vale mais", icone: Strikethrough, acao: (t, i, f) => alternarMarca(t, i, f, "~~") },
  { chave: "sep1", rotulo: "", titulo: "", icone: Bold, separador: true },
  { chave: "lista", rotulo: "Lista com marcadores", titulo: "Lista (Ctrl+Shift+8)", icone: List, acao: (t, i, f) => alternarLista(t, i, f, "marcador") },
  { chave: "numerada", rotulo: "Lista numerada", titulo: "Lista numerada (Ctrl+Shift+7)", icone: ListOrdered, acao: (t, i, f) => alternarLista(t, i, f, "numerada") },
  { chave: "tarefa", rotulo: "Lista de tarefas", titulo: "Lista de tarefas — para os próximos passos", icone: ListChecks, acao: (t, i, f) => alternarLista(t, i, f, "tarefa") },
  { chave: "citacao", rotulo: "Citação", titulo: "Citação — para a fala do paciente", icone: Quote, acao: (t, i, f) => alternarPrefixo(t, i, f, "> ") },
];

/**
 * Campo de anotação clínica: modelos, formatação e pré-visualização.
 *
 * Um só componente para os DOIS lugares onde se escreve a sessão — a aba
 * "Anotações" da videochamada e o "Nova Sessão" do prontuário. Antes a barra
 * existia só na chamada, então quem registrava pelo prontuário escrevia sem
 * modelo, sem formatação e sem ver como ia ficar.
 */
export default function EditorDeAnotacao({
  valor,
  aoMudar,
  modelos = [],
  placeholder,
  minAltura = "min-h-[240px]",
  id,
  className,
  rodape,
}: {
  valor: string;
  aoMudar: (texto: string) => void;
  modelos?: ModeloDeAnotacao[];
  placeholder?: string;
  minAltura?: string;
  id?: string;
  className?: string;
  /** Linha abaixo do campo (ex.: "Salvo", contagem). */
  rodape?: React.ReactNode;
}) {
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const [verFormatado, setVerFormatado] = useState(false);

  /**
   * Última posição do cursor DENTRO do campo.
   *
   * Clicar num botão da barra tira o foco, e aí `selectionStart` vale 0: a
   * edição ia para o COMEÇO do texto. Numa anotação longa a mudança acontecia
   * fora da vista e parecia que o botão não fazia nada — foi o que aconteceu
   * com o botão de lista.
   */
  const selecaoRef = useRef<{ inicio: number; fim: number } | null>(null);
  const lembrarSelecao = () => {
    const ta = campoRef.current;
    if (ta) selecaoRef.current = { inicio: ta.selectionStart, fim: ta.selectionEnd };
  };

  /**
   * Aplica a edição PELO NAVEGADOR (`insertText`), trocando só o trecho que
   * mudou. É o que mantém o Ctrl+Z funcionando depois de usar a barra, como no
   * Word: reescrever o campo inteiro pelo React apaga a pilha de desfazer.
   * Se o navegador recusar (API antiga), cai no caminho normal.
   */
  const aplicar = (r: Edicao) => {
    const ta = campoRef.current;
    const d = diffMinimo(valor, r.texto);
    let feito = false;
    if (ta && typeof document !== "undefined" && typeof document.execCommand === "function") {
      try {
        ta.focus();
        ta.setSelectionRange(d.de, d.ate);
        feito = document.execCommand("insertText", false, d.texto);
      } catch {
        feito = false;
      }
    }
    if (!feito) aoMudar(r.texto);
    selecaoRef.current = { inicio: r.inicio, fim: r.fim };
    requestAnimationFrame(() => {
      campoRef.current?.focus();
      campoRef.current?.setSelectionRange(r.inicio, r.fim);
    });
  };

  const editar = (transformar: (texto: string, inicio: number, fim: number) => Edicao) => {
    const ta = campoRef.current;
    const focado = typeof document !== "undefined" && document.activeElement === ta;
    // Sem foco nem posição guardada, escreve no FIM — nunca no começo.
    const bruto = focado && ta
      ? { inicio: ta.selectionStart, fim: ta.selectionEnd }
      : selecaoRef.current ?? { inicio: valor.length, fim: valor.length };
    aplicar(transformar(valor, Math.min(bruto.inicio, valor.length), Math.min(bruto.fim, valor.length)));
  };

  /** Atalhos do Word/Notion + Enter que continua a lista. */
  const aoTeclar = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const comando = e.ctrlKey || e.metaKey;
    if (comando && !e.altKey) {
      const tecla = e.key.toLowerCase();
      if (tecla === "b") { e.preventDefault(); return editar((t, i, f) => alternarMarca(t, i, f, "**")); }
      if (tecla === "i") { e.preventDefault(); return editar((t, i, f) => alternarMarca(t, i, f, "*")); }
      // Ctrl+Shift+8 e Ctrl+Shift+7: os mesmos do Word para lista e lista numerada.
      if (e.shiftKey && (e.key === "8" || e.key === "*")) { e.preventDefault(); return editar((t, i, f) => alternarLista(t, i, f, "marcador")); }
      if (e.shiftKey && (e.key === "7" || e.key === "&")) { e.preventDefault(); return editar((t, i, f) => alternarLista(t, i, f, "numerada")); }
    }
    if (e.key === "Enter" && !e.shiftKey && campoRef.current) {
      const r = continuarLista(valor, campoRef.current.selectionStart);
      if (r) { e.preventDefault(); aplicar(r); }
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      {modelos.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Começar por um modelo
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {modelos.map((m, i) => (
              <Button
                key={m.nome}
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-full px-3 text-xs"
                title={`Inserir o modelo ${m.nome} no fim da anotação`}
                onClick={() => editar((t) => inserirModelo(t, m.corpo))}
              >
                {i === 0 && <ClipboardList className="mr-1 size-3.5" />}
                {m.nome}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Botões de 32px: no celular o alvo anterior (28px) era pequeno demais.
          `flex-wrap` porque no celular estreito a barra não cabe numa linha. */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/40 p-1">
        {FERRAMENTAS.map((f) =>
          f.separador ? (
            <span key={f.chave} aria-hidden className="mx-0.5 h-5 w-px bg-border" />
          ) : (
            <Button
              key={f.chave}
              type="button"
              variant="ghost"
              size="sm"
              className="size-8 p-0"
              title={f.titulo}
              aria-label={f.rotulo}
              disabled={verFormatado}
              onClick={() => editar(f.acao!)}
            >
              <f.icone className="size-4" />
            </Button>
          ),
        )}
        <Button
          type="button"
          variant={verFormatado ? "secondary" : "ghost"}
          size="sm"
          className="ml-auto h-8 px-2.5 text-xs"
          title="Ver a anotação formatada, como ela fica no prontuário"
          aria-pressed={verFormatado}
          onClick={() => setVerFormatado((v) => !v)}
        >
          <Eye className="mr-1 size-3.5" /> {verFormatado ? "Voltar a escrever" : "Ver formatado"}
        </Button>
      </div>

      {verFormatado ? (
        <div className={cn("flex-1 overflow-y-auto rounded-lg border bg-muted/20 p-3 text-sm", minAltura)}>
          {valor.trim() ? (
            <Streamdown>{valor}</Streamdown>
          ) : (
            <p className="text-muted-foreground">Nada escrito ainda — volte a escrever para começar.</p>
          )}
        </div>
      ) : (
        <Textarea
          id={id}
          ref={campoRef}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          onSelect={lembrarSelecao}
          onKeyUp={lembrarSelecao}
          onKeyDown={aoTeclar}
          onClick={lembrarSelecao}
          onBlur={lembrarSelecao}
          placeholder={placeholder}
          className={cn("flex-1 resize-y text-sm leading-relaxed", minAltura)}
        />
      )}

      {rodape && <div className="flex items-center justify-between gap-2 text-xs">{rodape}</div>}
    </div>
  );
}
