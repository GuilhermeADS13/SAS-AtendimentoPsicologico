import { Link } from "wouter";
import { APP_NAME, LogoLockup } from "@/components/Logo";
import { RESPONSAVEL_PELO_SERVICO } from "@/lib/suporte";

const LINKS = [
  { href: "/precos", rotulo: "Preços" },
  { href: "/ajuda", rotulo: "Ajuda" },
  { href: "/termos", rotulo: "Termos de Uso" },
  { href: "/privacidade", rotulo: "Privacidade" },
];

/**
 * Rodapé das páginas públicas. Leva os links legais e quem vende o serviço — o
 * Decreto 7.962/2013 pede a identificação do fornecedor em local de destaque.
 */
export function Rodape() {
  return (
    <footer className="border-t border-border">
      <div className="container mx-auto flex flex-col gap-6 px-6 py-10">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <LogoLockup markClassName="w-6 h-6" />
          <nav aria-label="Links do rodapé" className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {l.rotulo}
              </Link>
            ))}
          </nav>
        </div>
        <p className="text-center text-xs text-muted-foreground sm:text-left">
          &copy; 2026 {APP_NAME}. Oferecido por {RESPONSAVEL_PELO_SERVICO}, pessoa física ·{" "}
          <a href="mailto:suportevozinterior@gmail.com" className="underline underline-offset-4 hover:text-foreground">
            suportevozinterior@gmail.com
          </a>
        </p>
      </div>
    </footer>
  );
}
