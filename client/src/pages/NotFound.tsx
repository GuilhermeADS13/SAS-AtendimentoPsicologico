import { Button } from "@/components/ui/button";
import { LogoLockup } from "@/components/Logo";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import { Link } from "wouter";

/**
 * Endereço que não existe. Antes era a tela padrão do modelo do Manus, em inglês e
 * com um alerta vermelho: para quem chega por um link quebrado da bio, parecia que
 * o sistema tinha caído. O servidor responde 404 de verdade (server/_core/vite.ts).
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-4">
          <Link href="/" aria-label="Página inicial">
            <LogoLockup markClassName="w-8 h-8" />
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md space-y-5 text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Erro 404</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground text-balance">
            Não encontramos esta página
          </h1>
          <p className="text-muted-foreground text-pretty">
            O endereço pode ter sido digitado errado ou a página mudou de lugar.
          </p>
          <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row">
            <Button asChild>
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar ao início
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/ajuda">
                <LifeBuoy className="mr-2 h-4 w-4" />
                Ver a ajuda
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
