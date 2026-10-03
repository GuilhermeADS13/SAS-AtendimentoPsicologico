import { useEffect, useState } from "react";

/**
 * "Agora" que avança sozinho, para telas que classificam coisas pelo horário.
 *
 * Sem isto, uma aba aberta por horas congela o relógio no momento em que montou:
 * o botão "Entrar" na sala nunca acende, e "última / próxima consulta" continua
 * dizendo o que era verdade de manhã. O Dashboard já fazia isso com um `useAgora`
 * local; a lista de pacientes não, e as duas telas discordavam.
 */
export function useAgora(intervaloMs = 60_000): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);
  return agora;
}
