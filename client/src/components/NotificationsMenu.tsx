import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bell, X } from "lucide-react";
import { playNotificationPing } from "@/lib/sound";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Avisos da Rede (pedido, convite) no sino. Eles saem sozinhos quando alguém responde;
 * o "x" só os esconde neste navegador. O id é o do pedido somado a esta base, para não
 * bater com os ids das notificações de consulta.
 */
export const BASE_DOS_AVISOS_DA_REDE = 1_000_000_000;
const CHAVE_OCULTOS = "vozinterior-avisos-da-rede-ocultos";

export function useAvisosDaRedeOcultos() {
  const [ocultos, setOcultos] = useState<Set<number>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(CHAVE_OCULTOS) ?? "[]") as number[]);
    } catch {
      return new Set();
    }
  });
  const ocultar = (ids: number[]) =>
    setOcultos((atual) => {
      const novo = new Set([...Array.from(atual), ...ids]);
      try {
        // Só os últimos 200: pedido antigo já saiu da lista de qualquer jeito.
        localStorage.setItem(CHAVE_OCULTOS, JSON.stringify(Array.from(novo).slice(-200)));
      } catch {
        // Sem localStorage, esconde só até recarregar.
      }
      return novo;
    });
  return { ocultos, ocultar };
}

export type NotifItem = {
  id: number;
  /** Linha principal, ex.: "Consulta cancelada". */
  titulo: string;
  /** Linha de baixo (data; para a psicóloga também e-mail e status). */
  subtitulo: string;
};

/**
 * Visual da sineta, compartilhado pela psicóloga e pelo paciente. Só apresenta —
 * quem busca os dados e trata clique/ocultar são os containers.
 *
 * Menu controlado de propósito: clicar numa notificação navega E fecha o menu,
 * mas clicar no "x" (ocultar) precisa NÃO fechar, para dar para limpar várias
 * seguidas. Por isso as linhas não são DropdownMenuItem (que fecha ao clicar).
 */
export function NotificationsMenu({
  items,
  badge,
  onItemClick,
  onDismiss,
  onClearAll,
  carregado,
}: {
  items: NotifItem[];
  /** A primeira busca já voltou (mesmo vazia). Antes disso, nada vira aviso. */
  carregado: boolean;
  badge: number;
  onItemClick: (id: number) => void;
  onDismiss: (id: number) => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = useState(false);

  /**
   * Notificação NOVA aparece na tela e fica até 1 minuto (ou até fechar no "x").
   * Antes só o número no sino mudava — fácil de não ver. A referência são os ids já
   * vistos (o sino junta avisos de consulta com pedidos e convites da Rede, então "o
   * maior id" não serve); na primeira carga só memoriza (senão a pessoa veria um aviso
   * por notificação antiga a cada página aberta).
   */
  const idsVistos = useRef<Set<number> | null>(null);
  useEffect(() => {
    // Espera a 1ª busca terminar — mesmo VAZIA: sem isso, quem abriu a página sem
    // notificação nenhuma nunca veria o aviso da primeira que chegasse.
    if (!carregado) return;
    if (idsVistos.current === null) {
      idsVistos.current = new Set(items.map((n) => n.id));
      return;
    }
    const vistos = idsVistos.current;
    const novos = items.filter((n) => !vistos.has(n.id));
    for (const n of novos) vistos.add(n.id);
    if (!novos.length) return;
    // Som junto com o aviso — UMA vez, por mais que cheguem várias.
    playNotificationPing();
    // No máximo 3 de uma vez: uma rajada (ex.: a semanal) não pode cobrir a tela.
    for (const n of novos.slice(0, 3)) {
      // No TOPO, logo abaixo do sino (e não no canto de baixo, junto dos avisos
      // comuns), maior e com a cor da marca: é para ser visto.
      toast(n.titulo, {
        id: `notif-${n.id}`,
        description: n.subtitulo,
        duration: 60_000,
        closeButton: true,
        position: "top-right",
        icon: <Bell className="size-5 text-primary" />,
        action: { label: "Ver", onClick: () => onItemClick(n.id) },
        classNames: {
          toast: "!w-[min(24rem,calc(100vw-2rem))] !gap-3 !p-4 !border-l-4 !border-l-primary !shadow-xl",
          title: "!text-[15px] !font-semibold",
          description: "!text-sm",
          actionButton: "!h-8 !px-3 !text-sm !bg-primary !text-primary-foreground",
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, carregado]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {/* Sino de 24px num alvo de 40px: no tamanho padrão (20px) ele sumia no
            canto do cabeçalho. */}
        <Button variant="ghost" size="icon" className="relative size-10" aria-label="Notificações">
          <Bell className="size-6" />
          {badge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-destructive-foreground ring-2 ring-background">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between pr-1">
          <DropdownMenuLabel>Notificações</DropdownMenuLabel>
          {items.length > 0 && (
            <button
              onClick={() => onClearAll()}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded"
            >
              Limpar todas
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-2 py-6 text-sm text-muted-foreground text-center">
            Nenhuma notificação
          </div>
        ) : (
          items.slice(0, 8).map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-1 px-1 py-1 hover:bg-accent/50 rounded"
            >
              <button
                onClick={() => {
                  onItemClick(n.id);
                  setOpen(false);
                }}
                className="flex flex-col items-start gap-0.5 flex-1 min-w-0 px-1 py-1 text-left"
              >
                <span className="text-sm font-medium text-foreground">{n.titulo}</span>
                <span className="text-xs text-muted-foreground truncate max-w-full">
                  {n.subtitulo}
                </span>
              </button>
              {/* Ocultar: some da lista sem fechar o menu (dá para limpar várias). */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(n.id);
                }}
                aria-label="Remover notificação"
                className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
