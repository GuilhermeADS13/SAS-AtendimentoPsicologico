import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={googleCalendarUrl(evento)} target="_blank" rel="noreferrer">
            Google Agenda
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={baixarIcs}>Outro calendário (.ics)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
