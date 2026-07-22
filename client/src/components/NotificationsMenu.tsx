import { useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
}: {
  items: NotifItem[];
  badge: number;
  onItemClick: (id: number) => void;
  onDismiss: (id: number) => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="w-5 h-5" />
          {badge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
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
