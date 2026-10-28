import { sugestaoDeEmail } from "@shared/email";

/**
 * "Você quis dizer ana@gmail.com?" embaixo do campo de e-mail quando o domínio
 * parece erro de digitação (gmial.com, gmail.co). Só sugere: um toque aceita.
 */
export function SugestaoDeEmail({ email, aoAceitar }: { email: string; aoAceitar: (corrigido: string) => void }) {
  const sugestao = sugestaoDeEmail(email);
  if (!sugestao) return null;
  return (
    <p role="status" className="text-xs text-amber-800 dark:text-amber-300">
      Você quis dizer{" "}
      <button
        type="button"
        onClick={() => aoAceitar(sugestao)}
        className="rounded-sm font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {sugestao}
      </button>
      ?
    </p>
  );
}
