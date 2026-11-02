import { z } from "zod";

/**
 * O que o paciente pode receber: documentos escritos PARA ele. Evolução e anotações
 * não entram aqui, porque mostrá-las pode comprometer as próximas sessões. Todo
 * documento nasce privado; só aparece para o paciente quando a psicóloga escolhe
 * um destes tipos para aquele arquivo.
 */
export const TIPOS_PARA_PACIENTE = [
  { id: "laudo", rotulo: "Laudo" },
  { id: "parecer", rotulo: "Parecer" },
  { id: "atestado", rotulo: "Atestado" },
  { id: "declaracao", rotulo: "Declaração" },
  { id: "relatorio", rotulo: "Relatório" },
] as const;

export type TipoParaPaciente = (typeof TIPOS_PARA_PACIENTE)[number]["id"];

export const tipoParaPacienteSchema = z.enum(["laudo", "parecer", "atestado", "declaracao", "relatorio"]);

export function rotuloDoTipo(tipo: string | null | undefined): string {
  return TIPOS_PARA_PACIENTE.find((t) => t.id === tipo)?.rotulo ?? "Documento";
}
