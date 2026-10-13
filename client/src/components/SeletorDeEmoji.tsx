import { useRef, useState } from "react";
import { Car, Clock, Heart, Lightbulb, PawPrint, Smile, Trophy, Hand, Coffee, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CATEGORIAS_DE_EMOJI } from "@shared/emoji";
import { cn } from "@/lib/utils";

const CHAVE_RECENTES = "sas:emojis-recentes";
const MAX_RECENTES = 24;

const ICONES: Record<string, LucideIcon> = {
  recentes: Clock,
  rostos: Smile,
  pessoas: Hand,
  simbolos: Heart,
  natureza: PawPrint,
  comida: Coffee,
  atividades: Trophy,
  viagens: Car,
  objetos: Lightbulb,
};

function lerRecentes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_RECENTES) || "[]");
    return Array.isArray(v) ? v.filter((e) => typeof e === "string").slice(0, MAX_RECENTES) : [];
  } catch {
    return [];
  }
}

/**
 * Seletor de emojis das Mensagens, no jeito do WhatsApp: abas de categoria no
 * topo, uma rolagem só (a aba acompanha a rolagem), e "Recentes" primeiro. Fica
 * ABERTO depois de escolher, para mandar vários seguidos.
 */
export default function SeletorDeEmoji({ aoEscolher, disabled }: { aoEscolher: (emoji: string) => void; disabled?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [recentes, setRecentes] = useState<string[]>(lerRecentes);
  const [ativa, setAtiva] = useState("");
  const rolagemRef = useRef<HTMLDivElement>(null);
  const secoesRef = useRef<Record<string, HTMLElement | null>>({});

  const categorias = [
    ...(recentes.length ? [{ chave: "recentes", nome: "Recentes", emojis: recentes }] : []),
    ...CATEGORIAS_DE_EMOJI,
  ];
  const abaAtiva = ativa || categorias[0].chave;

  const escolher = (emoji: string) => {
    aoEscolher(emoji);
    const novos = [emoji, ...recentes.filter((e) => e !== emoji)].slice(0, MAX_RECENTES);
    setRecentes(novos);
    try {
      localStorage.setItem(CHAVE_RECENTES, JSON.stringify(novos));
    } catch {
      /* navegador sem armazenamento: os recentes valem só nesta visita */
    }
  };

  const irPara = (chave: string) => {
    const caixa = rolagemRef.current;
    const secao = secoesRef.current[chave];
    // A caixa é `relative`: o offsetTop da seção já é medido a partir dela.
    if (caixa && secao) caixa.scrollTop = secao.offsetTop;
    setAtiva(chave);
  };

  // A aba acende conforme a seção que está no topo da rolagem.
  const aoRolar = () => {
    const caixa = rolagemRef.current;
    if (!caixa) return;
    const topo = caixa.scrollTop + 8;
    let atual = categorias[0].chave;
    for (const c of categorias) {
      const s = secoesRef.current[c.chave];
      if (s && s.offsetTop <= topo) atual = c.chave;
    }
    // No fim da rolagem, a última seção (curta) nunca chega ao topo: acende ela.
    if (caixa.scrollTop + caixa.clientHeight >= caixa.scrollHeight - 2) atual = categorias[categorias.length - 1].chave;
    if (atual !== abaAtiva) setAtiva(atual);
  };

  return (
    <Popover open={aberto} onOpenChange={(v) => { setAberto(v); if (v) setAtiva(""); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 rounded-xl text-muted-foreground hover:text-foreground sm:size-9"
          disabled={disabled}
          title="Emojis"
          aria-label="Emojis"
        >
          <Smile className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={10}
        className="w-[min(22rem,calc(100vw-1.5rem))] p-0"
        // Não devolve o foco ao botão ao fechar; no celular isso abria o teclado.
        onCloseAutoFocus={(e) => e.preventDefault()}
        // O foco volta ao campo de texto a cada emoji (para continuar digitando);
        // sem isto, o Popover tomava isso como "saiu" e fechava no 1º emoji.
        // Fecha com clique fora ou Esc.
        onFocusOutside={(e) => e.preventDefault()}
      >
        <div role="tablist" aria-label="Categorias de emoji" className="flex items-center justify-between gap-0.5 border-b px-1.5 py-1">
          {categorias.map((c) => {
            const Icone = ICONES[c.chave] ?? Smile;
            const selecionada = c.chave === abaAtiva;
            return (
              <button
                key={c.chave}
                type="button"
                role="tab"
                aria-selected={selecionada}
                title={c.nome}
                aria-label={c.nome}
                onClick={() => irPara(c.chave)}
                className={cn(
                  "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selecionada && "bg-accent text-primary",
                )}
              >
                <Icone className="size-4" />
              </button>
            );
          })}
        </div>
        <div ref={rolagemRef} onScroll={aoRolar} className="relative h-64 overflow-y-auto px-2 pb-2">
          {categorias.map((c) => (
            <section key={c.chave} ref={(el) => { secoesRef.current[c.chave] = el; }} aria-label={c.nome}>
              <p className="sticky top-0 z-10 bg-popover py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {c.nome}
              </p>
              <div className="grid grid-cols-8 gap-0.5">
                {c.emojis.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => escolher(e)}
                    aria-label={`Inserir ${e}`}
                    className="flex aspect-square items-center justify-center rounded-md text-[22px] leading-none transition-transform hover:scale-110 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
