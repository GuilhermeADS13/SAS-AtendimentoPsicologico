import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { googleCalendarUrl, icsEvento, nomeArquivoIcs, type EventoAgenda } from "@shared/calendario";

/**
 * "Adicionar à agenda": manda a consulta para o calendário da própria pessoa, que
 * passa a lembrá-la sozinho (além do nosso e-mail). Google por link; .ics para
 * quem usa Apple/Outlook. Nada é sincronizado — ver shared/calendario.ts.
 */
export default function AddToCalendar({
  evento,
  className,
}: {
  evento: EventoAgenda;
  className?: string;
}) {
  const baixarIcs = () => {
    const blob = new Blob([icsEvento(evento)], { type: "text/calendar;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = nomeArquivoIcs(evento);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={className}
          title="Adicionar esta consulta ao seu calendário"
        >
          <CalendarPlus className="h-4 w-4" /> Adicionar à agenda
        </Button>
      </DropdownMenuTrigger>
      {/* Sem jargão: ".ics" não diz nada para quem usa o sistema. Cada opção
          descreve PARA ONDE a consulta vai e o que acontece ao clicar. */}
      {/* max-w: 288px (w-72) passa da tela num celular estreito. */}
      <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Onde você quer salvar esta consulta?
        </DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <a href={googleCalendarUrl(evento)} target="_blank" rel="noreferrer" className="flex-col items-start gap-0.5">
            <span>Google Agenda</span>
            <span className="text-xs text-muted-foreground">Abre já preenchida — é só salvar</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={baixarIcs} className="flex-col items-start gap-0.5">
          <span>Apple, Outlook ou outro</span>
          <span className="text-xs text-muted-foreground">Baixa um arquivo; abra-o e a consulta entra no seu calendário</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
