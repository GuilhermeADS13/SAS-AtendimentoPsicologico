import { useId } from "react";
import { Monitor, Smartphone } from "lucide-react";

/**
 * Símbolo do navegador na lista de aparelhos ("Chrome no Windows" → o círculo do
 * Chrome). Desenho simplificado, só para a pessoa reconhecer de relance; o nome
 * continua escrito ao lado. Sem nome conhecido, volta ao monitor/celular.
 */
export function LogoDoNavegador({ navegador, className = "h-6 w-6" }: { navegador: string | null; className?: string }) {
  const id = useId();
  const nome = navegador ?? "";
  const svg = (conteudo: React.ReactNode) => (
    <svg viewBox="0 0 24 24" className={`${className} shrink-0`} aria-hidden="true">
      {conteudo}
    </svg>
  );

  if (nome.startsWith("Chrome")) {
    return svg(
      <>
        <path fill="#EA4335" d="M12 12 3.34 7A10 10 0 0 1 20.66 7Z" />
        <path fill="#FBBC05" d="M12 12 20.66 7A10 10 0 0 1 12 22Z" />
        <path fill="#34A853" d="M12 12 12 22A10 10 0 0 1 3.34 7Z" />
        <circle cx="12" cy="12" r="4.8" fill="#fff" />
        <circle cx="12" cy="12" r="3.7" fill="#4285F4" />
      </>,
    );
  }
  if (nome.startsWith("Opera")) {
    return svg(
      <path
        fill="#FF1B2D"
        fillRule="evenodd"
        d="M3 12a9 10 0 1 0 18 0a9 10 0 1 0-18 0ZM8.6 12a3.4 7 0 1 0 6.8 0a3.4 7 0 1 0-6.8 0Z"
      />,
    );
  }
  if (nome.startsWith("Edge")) {
    return svg(
      <>
        <defs>
          <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0C59A4" />
            <stop offset="0.55" stopColor="#1B9DE2" />
            <stop offset="1" stopColor="#3DCB86" />
          </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="10" fill={`url(#${id}-edge)`} />
        <path fill="#fff" fillOpacity="0.85" d="M7 13.5c0-3 2.4-5 5.3-5 2.6 0 4.7 1.6 4.7 3.6H9.6c.2 2 2 3.4 4.4 3.4 1.2 0 2.3-.3 3-.8-1 1.8-3 3-5.3 3C8.8 17.7 7 15.9 7 13.5Z" />
      </>,
    );
  }
  if (nome.startsWith("Firefox")) {
    return svg(
      <>
        <circle cx="12" cy="12" r="10" fill="#FF7139" />
        <circle cx="13" cy="13" r="5.5" fill="#9059FF" />
        <path fill="#FFBD4F" d="M4.5 9.5c1-3 3.8-5.3 7.2-5.5-1.5 1.2-2 2.6-1.6 3.9C7.7 7.8 5.8 8.4 4.5 9.5Z" />
      </>,
    );
  }
  if (nome.startsWith("Safari")) {
    return svg(
      <>
        <circle cx="12" cy="12" r="10" fill="#1B88F7" />
        <circle cx="12" cy="12" r="8" fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="0.8" />
        <path fill="#FF3B30" d="M16.5 7.5 13.1 13.1 10.9 10.9Z" />
        <path fill="#fff" d="M7.5 16.5 10.9 10.9 13.1 13.1Z" />
      </>,
    );
  }
  if (nome.startsWith("Samsung")) {
    return svg(
      <>
        <circle cx="12" cy="12" r="10" fill="#7882FF" />
        <circle cx="12" cy="12" r="4.5" fill="#fff" />
        <ellipse cx="12" cy="12" rx="8" ry="2.6" fill="none" stroke="#fff" strokeWidth="1.3" transform="rotate(-25 12 12)" />
      </>,
    );
  }
  const Icone = /iPhone|iPad|Android/.test(nome) ? Smartphone : Monitor;
  return <Icone className={`${className} shrink-0 text-muted-foreground`} aria-hidden="true" />;
}
