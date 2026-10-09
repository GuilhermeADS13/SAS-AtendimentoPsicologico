import { useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { Bold, ClipboardList, Eye, Italic, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { alternarLista, alternarMarca, inserirModelo, type Edicao } from "@shared/notasMarkdown";
import { cn } from "@/lib/utils";

export type ModeloDeAnotacao = { nome: string; corpo: string };

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

  const editar = (transformar: (texto: string, inicio: number, fim: number) => Edicao) => {
    const ta = campoRef.current;
    const focado = typeof document !== "undefined" && document.activeElement === ta;
    // Sem foco nem posição guardada, escreve no FIM — nunca no começo.
    const bruto = focado && ta
      ? { inicio: ta.selectionStart, fim: ta.selectionEnd }
      : selecaoRef.current ?? { inicio: valor.length, fim: valor.length };
    const r = transformar(valor, Math.min(bruto.inicio, valor.length), Math.min(bruto.fim, valor.length));
    aoMudar(r.texto);
    selecaoRef.current = { inicio: r.inicio, fim: r.fim };
    requestAnimationFrame(() => {
      campoRef.current?.focus();
      campoRef.current?.setSelectionRange(r.inicio, r.fim);
    });
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

      {/* Botões de 32px: no celular o alvo anterior (28px) era pequeno demais. */}
      <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
        <Button type="button" variant="ghost" size="sm" className="size-8 p-0" title="Negrito (envolve o trecho selecionado)" aria-label="Negrito" disabled={verFormatado} onClick={() => editar((t, i, f) => alternarMarca(t, i, f, "**"))}>
          <Bold className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="size-8 p-0" title="Itálico (envolve o trecho selecionado)" aria-label="Itálico" disabled={verFormatado} onClick={() => editar((t, i, f) => alternarMarca(t, i, f, "*"))}>
          <Italic className="size-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="size-8 p-0" title="Lista: marca ou desmarca as linhas selecionadas" aria-label="Lista com marcadores" disabled={verFormatado} onClick={() => editar((t, i, f) => alternarLista(t, i, f))}>
          <List className="size-4" />
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
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
