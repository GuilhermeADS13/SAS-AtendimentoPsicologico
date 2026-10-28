import { useState } from "react";
import { toast } from "sonner";
import { VALOR_QUE_PEDE_CONFIRMACAO, formatarBRL, reaisParaCentavos } from "@shared/dinheiro";

const alto = (texto: string) => {
  const c = reaisParaCentavos(texto);
  return c !== null && c > VALOR_QUE_PEDE_CONFIRMACAO ? c : null;
};

/**
 * Valor de consulta alto (acima de R$ 1.000) precisa ser salvo DUAS vezes: o
 * valor vai dentro do Pix do paciente, e "15000" digitado achando que eram
 * R$ 150 virava uma cobrança de R$ 15.000. Devolve `liberado(texto)`: true =
 * pode salvar; false = avisou e espera a segunda tentativa com o mesmo valor.
 */
export function useConferirValor() {
  const [conferido, setConferido] = useState<string | null>(null);
  return (texto: string): boolean => {
    const c = alto(texto);
    if (c === null || conferido === texto) return true;
    setConferido(texto);
    toast.warning(`Confira o valor: ${formatarBRL(c)} por consulta. Se estiver certo, salve de novo.`);
    return false;
  };
}

/** Aviso embaixo do campo enquanto o valor digitado está alto. */
export function AvisoDeValorAlto({ texto }: { texto: string }) {
  const c = alto(texto);
  if (c === null) return null;
  return (
    <p role="status" className="text-xs font-medium text-amber-800 dark:text-amber-300">
      {formatarBRL(c)} por consulta. Confira se é isso mesmo.
    </p>
  );
}
