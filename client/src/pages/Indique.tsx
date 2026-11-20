import { useState } from "react";
import { toast } from "sonner";
import { Copy, Gift } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { linkDeIndicacao, mensagemDeIndicacao } from "@shared/indicacao";

/** Copiar só aparece onde o navegador deixa (sem isso o botão não faria nada). */
const podeCopiar = () => typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function";

/**
 * Indique uma colega (shared/indicacao.ts): o link dela, para copiar ou mandar pelo
 * WhatsApp, e quantas colegas já criaram conta por ele. O mês grátis das duas é lançado
 * pelo suporte quando a colega assina.
 */
export default function Indique() {
  const { data } = trpc.indicacao.minha.useQuery();
  const [copiar] = useState(podeCopiar);

  const link = data ? linkDeIndicacao(window.location.origin, data.origem) : "";
  const whatsapp = link ? `https://wa.me/?text=${encodeURIComponent(mensagemDeIndicacao(link))}` : "";
  const contagem = data?.contagem;

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não deu para copiar. Toque no link e copie por ali.");
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Indique uma colega</h1>
          <p className="text-muted-foreground">
            Quando uma colega cria a conta pelo seu link e assina um plano, vocês duas ganham 1 mês grátis.
          </p>
        </div>

        <Card data-tour="indique">
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Gift className="size-5" aria-hidden />
              </span>
              <p className="text-sm text-muted-foreground">
                Mande o link para quem atende e ainda não usa o VozInterior. Depois do primeiro pagamento dela, a gente lança o mês
                grátis na sua assinatura e na dela.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="link-de-indicacao">Seu link</Label>
              <Input id="link-de-indicacao" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-sm" />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {copiar && (
                <Button variant="outline" onClick={copiarLink} disabled={!link}>
                  <Copy className="mr-2 size-4" />
                  Copiar link
                </Button>
              )}
              <Button
                variant="outline"
                disabled={!whatsapp}
                onClick={() => window.open(whatsapp, "_blank", "noopener")}
                className="border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800 dark:border-green-800 dark:text-green-400"
              >
                <WhatsAppIcon className="mr-2 size-4" />
                Enviar pelo WhatsApp
              </Button>
            </div>

            {contagem && (
              <p className="rounded-lg bg-muted/40 p-3 text-sm text-foreground">
                {contagem.criaram === 0 ? (
                  "Ninguém criou conta pelo seu link ainda."
                ) : (
                  <>
                    <strong>{contagem.criaram}</strong> {contagem.criaram === 1 ? "colega criou" : "colegas criaram"} conta pelo seu
                    link · <strong>{contagem.assinaram}</strong> {contagem.assinaram === 1 ? "já assinou" : "já assinaram"}
                  </>
                )}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
