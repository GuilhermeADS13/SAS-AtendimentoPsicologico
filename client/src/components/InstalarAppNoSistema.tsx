import { useState } from "react";
import { toast } from "sonner";
import { Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ComoInstalar } from "@/components/ConfiguracoesDaConta";
import { abertoComoApp, ehAparelhoApple, ehSafariNoMacQueInstala, instalarApp, usePodeInstalar } from "@/lib/instalarApp";
import { emDemonstracao } from "@/lib/demonstracao";

/**
 * "Instalar o app" dentro do sistema, para quem nunca abre as Configurações:
 * um item no menu lateral (computador) e um aviso que dá para fechar no topo das
 * telas (pensado para o celular, onde o menu fica escondido). Os dois somem com o
 * app instalado e não aparecem na demonstração.
 */

/** Item do menu: instala na hora, ou abre o passo a passo quando o navegador não oferece o botão. */
export function ItemInstalarApp() {
  const podeInstalar = usePodeInstalar();
  const [comoFazer, setComoFazer] = useState(false);
  if (abertoComoApp() || emDemonstracao()) return null;
  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={async () => {
            if (!podeInstalar) return setComoFazer(true);
            if (await instalarApp()) toast.success("Pronto! O VozInterior foi instalado.");
          }}
          tooltip="Instalar o app"
          className="h-10 font-normal"
        >
          <Smartphone className="h-4 w-4" />
          <span>Instalar o app</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <Dialog open={comoFazer} onOpenChange={setComoFazer}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Instalar o VozInterior</DialogTitle>
            <DialogDescription>Abre com um toque pela tela inicial do celular ou do computador, sem baixar nada de loja.</DialogDescription>
          </DialogHeader>
          <ComoInstalar aoInstalar={() => setComoFazer(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

const CHAVE_DO_AVISO = "vozinterior-aviso-instalar-fechado";

function avisoFechado(): boolean {
  try {
    return localStorage.getItem(CHAVE_DO_AVISO) === "1";
  } catch {
    return false;
  }
}

/**
 * Aviso no topo. Só aparece onde dá para instalar de verdade: com o botão do
 * navegador (Chrome/Edge, Android e computador), no iPhone/iPad pelo Safari ou no
 * Safari do Mac (Arquivo > Adicionar ao Dock).
 * Fechou, não volta neste aparelho.
 */
export function AvisoInstalarApp() {
  const podeInstalar = usePodeInstalar();
  const [fechado, setFechado] = useState(avisoFechado);
  const [comoFazer, setComoFazer] = useState(false);
  if (fechado || abertoComoApp() || emDemonstracao() || !(podeInstalar || ehAparelhoApple() || ehSafariNoMacQueInstala())) return null;

  const fechar = () => {
    setFechado(true);
    try {
      localStorage.setItem(CHAVE_DO_AVISO, "1");
    } catch {}
  };

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm">
      <Smartphone className="size-5 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-foreground">
        <strong className="font-semibold">Use como aplicativo:</strong>{" "}
        <span className="text-muted-foreground">abre com um toque pela tela inicial, sem loja.</span>
      </p>
      <Button
        size="sm"
        className="h-8 shrink-0"
        onClick={async () => {
          if (!podeInstalar) return setComoFazer(true);
          if (await instalarApp()) {
            toast.success("Pronto! O VozInterior foi instalado.");
            fechar();
          }
        }}
      >
        Instalar
      </Button>
      <button
        type="button"
        onClick={fechar}
        aria-label="Fechar o aviso de instalar o app"
        className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <Dialog open={comoFazer} onOpenChange={setComoFazer}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Instalar o VozInterior</DialogTitle>
            <DialogDescription>Leva poucos segundos e não ocupa espaço como um app de loja.</DialogDescription>
          </DialogHeader>
          <ComoInstalar />
        </DialogContent>
      </Dialog>
    </div>
  );
}
