import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";

/**
 * Botões "Copiar Pix" (código "copia e cola" já com o valor). A área de
 * transferência pode não existir ou ser negada (navegador embutido de app,
 * página sem HTTPS): aí o código aparece num campo para copiar na mão, em vez de
 * o botão não fazer nada.
 */
export function CopiarPix({
  opcoes,
}: {
  opcoes: Array<{ chave: string; rotulo: string; codigo: string; destaque?: boolean }>;
}) {
  const [manual, setManual] = useState<string | null>(null);
  const copiar = async (codigo: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("sem área de transferência");
      await navigator.clipboard.writeText(codigo);
      setManual(null);
      toast.success("Código Pix copiado. Cole no app do banco, em Pix → Copia e Cola.");
    } catch {
      setManual(codigo);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {opcoes.map(({ chave, rotulo, codigo, destaque = true }) => (
          <Button
            key={chave}
            type="button"
            size="sm"
            variant={destaque ? "default" : "outline"}
            className="gap-2 tabular-nums"
            onClick={() => void copiar(codigo)}
          >
            <Copy className="w-4 h-4" />
            {rotulo}
          </Button>
        ))}
      </div>
      {manual && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Não deu para copiar sozinho. Selecione o código abaixo e copie:</p>
          <textarea
            aria-label="Código Pix copia e cola"
            readOnly
            rows={3}
            value={manual}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-md border bg-card p-2 font-mono text-xs break-all"
          />
        </div>
      )}
    </div>
  );
}
