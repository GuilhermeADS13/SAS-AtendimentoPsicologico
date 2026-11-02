import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TIPOS_PARA_PACIENTE, type TipoParaPaciente } from "@shared/documentosDoPaciente";

/**
 * Escolhe como o paciente vê o documento. Nada é compartilhado sem este clique, e
 * a lista só tem documentos escritos para ele: evolução e anotações não entram.
 */
export function CompartilharDocumento({
  tipo,
  bloqueado,
  aoEscolher,
}: {
  tipo: string | null;
  bloqueado: () => boolean;
  aoEscolher: (tipo: TipoParaPaciente | null) => void;
}) {
  const escolher = (novo: TipoParaPaciente | null) => {
    if (!bloqueado()) aoEscolher(novo);
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={tipo ? "default" : "outline"} size="sm" title="Compartilhar com o paciente">
          <Share2 className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">{tipo ? "Compartilhado" : "Compartilhar"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          O paciente verá este arquivo como:
        </DropdownMenuLabel>
        {TIPOS_PARA_PACIENTE.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => escolher(t.id)}>
            {t.rotulo}
          </DropdownMenuItem>
        ))}
        {tipo && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => escolher(null)}>
              Deixar de compartilhar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
