import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { urlDoGif } from "@shared/gif";

/**
 * Seletor de GIFs (GIPHY), como no WhatsApp: abre com os "em alta", busca
 * enquanto digita e manda ao tocar. Tudo passa pelo nosso servidor — o navegador
 * não fala com o GIPHY (ver server/gifs.ts). Sem a chave configurada no servidor,
 * o botão nem aparece.
 */
export default function SeletorDeGif({ aoEscolher, disabled }: { aoEscolher: (id: string) => void; disabled?: boolean }) {
  const disponivel = trpc.chat.gifsDisponiveis.useQuery(undefined, { staleTime: Infinity });
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");

  // Espera a pessoa parar de digitar: cada busca vai ao GIPHY, que tem cota baixa.
  useEffect(() => {
    const t = setTimeout(() => setTermo(busca.trim()), 400);
    return () => clearTimeout(t);
  }, [busca]);

  const q = trpc.chat.gifs.useQuery({ busca: termo || undefined }, { enabled: aberto, staleTime: 5 * 60_000 });
  const gifs = q.data?.gifs ?? [];

  if (!disponivel.data?.disponivel) return null;

  return (
    <Popover
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) setBusca("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 rounded-xl text-muted-foreground hover:text-foreground sm:size-9"
          disabled={disabled}
          title="GIFs"
          aria-label="GIFs"
        >
          <span className="rounded-[5px] border-[1.5px] border-current px-1 text-[10px] font-bold leading-[14px]">GIF</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={10} className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="relative border-b p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar GIFs"
            aria-label="Buscar GIFs"
            className="h-9 pl-8"
          />
        </div>
        <div className="h-72 overflow-y-auto p-2" aria-busy={q.isFetching}>
          {q.isLoading ? (
            <div className="grid grid-cols-2 gap-1.5">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : gifs.length === 0 ? (
            <p className="px-2 py-10 text-center text-sm text-muted-foreground">
              {termo ? `Nenhum GIF encontrado para “${termo}”.` : "Não foi possível carregar os GIFs agora."}
            </p>
          ) : (
            // Colunas (alvenaria): cada GIF mantém a proporção, sem corte.
            <div className="columns-2 gap-1.5">
              {gifs.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    aoEscolher(g.id);
                    setAberto(false);
                    setBusca("");
                  }}
                  className="mb-1.5 block w-full overflow-hidden rounded-lg bg-muted break-inside-avoid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ aspectRatio: `${g.largura} / ${g.altura}` }}
                  aria-label="Enviar este GIF"
                >
                  <img src={urlDoGif(g.id)} alt="" loading="lazy" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Atribuição exigida pelos termos do GIPHY. */}
        <p className="border-t px-3 py-1.5 text-right text-[10px] font-medium text-muted-foreground">Powered by GIPHY</p>
      </PopoverContent>
    </Popover>
  );
}
