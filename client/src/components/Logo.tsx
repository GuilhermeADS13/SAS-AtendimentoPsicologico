/**
 * Marca da plataforma. Um lugar só: trocar o arquivo ou o nome aqui reflete no
 * login, na sidebar e na home.
 *
 * Os PNGs saem de client/public, com o fundo creme do original já removido —
 * assim a logo assenta em qualquer cor de tela.
 */

export const APP_NAME = "VozInterior";
export const APP_TAGLINE = "Atendimento Psicológico Online";

/**
 * Verde-petróleo da logo (amostrado do wordmark). Fica explícito (e não em
 * `text-primary`) porque o `--primary` do app hoje é azul: usar o token
 * pintaria "VozInterior" de azul ao lado de uma coruja verde.
 */
export const BRAND_TEAL = "#215756";

/** Só o símbolo (rosto + ondas). Para sidebar, favicon e espaços apertados. */
export function LogoMark({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <img
      src="/vozinterior-mark.png"
      alt=""
      aria-hidden="true"
      className={`${className} object-contain shrink-0`}
    />
  );
}

/** Logo completa: símbolo + nome + "Atendimento Psicológico Online". */
export function LogoFull({ className = "w-48" }: { className?: string }) {
  return (
    <img
      src="/vozinterior-logo.png"
      alt={`${APP_NAME} — ${APP_TAGLINE}`}
      className={`${className} h-auto object-contain`}
    />
  );
}

/** Símbolo + nome lado a lado, para cabeçalhos. */
export function LogoLockup({ markClassName = "w-7 h-7" }: { markClassName?: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <LogoMark className={markClassName} />
      <span
        className="font-semibold tracking-tight truncate"
        style={{ color: BRAND_TEAL }}
      >
        {APP_NAME}
      </span>
    </div>
  );
}
