import { useLocation } from "wouter";
import { pixComValor } from "@shared/pix";
import { formatarBRL } from "@shared/dinheiro";
import { useMeuPix } from "@/hooks/useMeuPix";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CopiarPix } from "@/components/CopiarPix";
import { QrDoPix } from "@/components/QrDoPix";

/**
 * QR do Pix da psicóloga com o valor que o paciente deve, para ela mostrar na
 * tela (o paciente lê com o app do banco) ou copiar o código e mandar. O código
 * é o mesmo que o paciente vê em Minhas Consultas: chave dela + valor embutido.
 */
export function CobrarPorPix({
  aberto,
  aoFechar,
  nome,
  descricao,
  centavos,
}: {
  aberto: boolean;
  aoFechar: () => void;
  nome: string;
  descricao: string;
  centavos: number;
}) {
  const [, setLocation] = useLocation();
  const meuPix = useMeuPix();
  const codigo = meuPix ? pixComValor(meuPix, centavos) : null;
  const valor = formatarBRL(centavos);

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Pix de {nome}</DialogTitle>
          <DialogDescription>
            {descricao} · <span className="font-semibold text-foreground tabular-nums">{valor}</span>
          </DialogDescription>
        </DialogHeader>
        {codigo ? (
          <div className="space-y-4">
            <div className="mx-auto w-fit rounded-xl border bg-white p-2">
              <QrDoPix codigo={codigo} titulo={`QR code do Pix de ${valor}`} className="size-56" />
            </div>
            <p className="text-center text-sm text-muted-foreground">
              O paciente lê com o app do banco e o valor já vem preenchido. Ou copie o código e mande para ele.
            </p>
            <CopiarPix opcoes={[{ chave: "cobranca", rotulo: `Copiar Pix: ${valor}`, codigo }]} />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Para gerar o QR, cadastre a sua chave Pix (ou cole o seu Pix copia e cola) no Perfil.
            </p>
            <Button
              onClick={() => {
                aoFechar();
                setLocation("/profile#pix");
              }}
            >
              Cadastrar Pix
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
