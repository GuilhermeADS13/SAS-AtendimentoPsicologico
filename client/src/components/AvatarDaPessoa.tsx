import { UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * Foto de quem está do outro lado da consulta (paciente para a psicóloga,
 * psicóloga para o paciente). Sem foto — ou enquanto carrega —, o ícone de
 * pessoa num círculo da cor da marca.
 */
export function AvatarDaPessoa({ url, nome, className }: { url?: string | null; nome: string; className?: string }) {
  return (
    <Avatar className={cn("size-12 shrink-0", className)}>
      {url ? <AvatarImage src={url} alt={`Foto de ${nome}`} className="object-cover" /> : null}
      <AvatarFallback className="bg-primary/10 text-primary">
        <UserRound className="size-1/2" aria-hidden />
      </AvatarFallback>
    </Avatar>
  );
}
