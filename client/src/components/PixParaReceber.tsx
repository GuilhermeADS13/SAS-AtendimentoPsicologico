import { useState } from "react";
import { toast } from "sonner";
import { TIPOS_DE_CHAVE_PIX, type TipoChavePix } from "@shared/pix";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QrCode } from "lucide-react";

const ROTULO: Record<TipoChavePix, string> = {
  cpf_cnpj: "CPF ou CNPJ",
  celular: "Celular",
  email: "E-mail",
  aleatoria: "Chave aleatória",
};
const EXEMPLO: Record<TipoChavePix, string> = {
  cpf_cnpj: "000.000.000-00",
  celular: "(81) 99999-0000",
  email: "voce@exemplo.com",
  aleatoria: "123e4567-e89b-12d3-a456-426614174000",
};

/**
 * Chave Pix da psicóloga para receber dos pacientes. Com ela cadastrada, o
 * paciente vê o valor das consultas que já aconteceram e copia um Pix com o
 * valor certo, que cai DIRETO na conta dela (o VozInterior não intermedia).
 */
export function PixParaReceber() {
  const utils = trpc.useUtils();
  const { data: perfil } = trpc.therapists.me.useQuery();
  const [editando, setEditando] = useState(false);
  const [tipo, setTipo] = useState<TipoChavePix>("celular");
  const [chave, setChave] = useState("");
  const [cidade, setCidade] = useState("");

  const definir = trpc.therapists.definirPix.useMutation({
    onSuccess: () => {
      utils.therapists.me.invalidate();
      setEditando(false);
      toast.success("Chave Pix salva. Seus pacientes já podem pagar por ela.");
    },
    onError: (e) => toast.error(e.message || "Não foi possível salvar a chave."),
  });
  const remover = trpc.therapists.removerPix.useMutation({
    onSuccess: () => {
      utils.therapists.me.invalidate();
      toast.success("Chave Pix removida. Os pacientes não veem mais o botão de pagar.");
    },
    onError: (e) => toast.error(e.message || "Não foi possível remover."),
  });

  if (!perfil) return null;
  const temChave = Boolean(perfil.pixChave);
  const abrirEdicao = () => {
    setTipo((perfil.pixTipo as TipoChavePix | null) ?? "celular");
    setChave(perfil.pixChave ?? "");
    setCidade(perfil.pixCidade ?? "");
    setEditando(true);
  };

  return (
    <section id="pix" className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <QrCode className="size-5" aria-hidden />
        </span>
        <div className="space-y-1">
          <h2 className="font-semibold text-foreground">Receber dos pacientes por Pix</h2>
          <p className="text-sm text-muted-foreground">
            Nas consultas que já aconteceram, o paciente vê o valor e copia um Pix com o valor certo.
            O dinheiro cai direto na sua conta — o VozInterior não passa por ele. Quando ele avisar
            que pagou, você confirma no Financeiro.
          </p>
        </div>
      </div>

      {temChave && !editando ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/50 px-4 py-3">
          <p className="min-w-0 text-sm">
            <span className="text-muted-foreground">{ROTULO[(perfil.pixTipo as TipoChavePix) ?? "celular"]}: </span>
            <span className="break-all font-medium text-foreground">{perfil.pixChave}</span>
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={abrirEdicao}>
              Trocar
            </Button>
            <Button size="sm" variant="ghost" disabled={remover.isPending} onClick={() => remover.mutate()}>
              Remover
            </Button>
          </div>
        </div>
      ) : !editando ? (
        <Button onClick={abrirEdicao}>Cadastrar chave Pix</Button>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            definir.mutate({ tipo, chave, cidade });
          }}
        >
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Tipo de chave</legend>
            <div className="flex flex-wrap gap-2">
              {TIPOS_DE_CHAVE_PIX.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tipo === t}
                  onClick={() => setTipo(t)}
                  className={`h-9 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    tipo === t ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/60"
                  }`}
                >
                  {ROTULO[t]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <div className="space-y-1.5">
              <Label htmlFor="pix-chave">Chave</Label>
              <Input
                id="pix-chave"
                value={chave}
                onChange={(e) => setChave(e.target.value)}
                placeholder={EXEMPLO[tipo]}
                inputMode={tipo === "cpf_cnpj" || tipo === "celular" ? "numeric" : tipo === "email" ? "email" : "text"}
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pix-cidade">Sua cidade</Label>
              <Input
                id="pix-cidade"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                placeholder="Recife"
                required
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A cidade vai no código do Pix (é uma exigência do padrão do Banco Central). Use a chave
            exatamente como está cadastrada no app do seu banco.
          </p>
          <div className="flex gap-2">
            <Button type="submit" disabled={definir.isPending}>
              {definir.isPending ? "Salvando..." : "Salvar chave"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
