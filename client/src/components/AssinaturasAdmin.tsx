import { useState } from "react";
import { toast } from "sonner";
import { formatarData } from "@shared/datas";
import { formatarReais, type Ciclo } from "@shared/precos";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Pix = { therapistId: number; nome: string; ciclo: Ciclo; valor: number | null };

/**
 * Controle do Pix (só admin): cada psicóloga com plano, valor do ciclo e até
 * quando está liberada. "Registrar Pix" soma 1 mês (ou 1 ano) ao que já estava pago.
 */
export function AssinaturasAdmin() {
  const utils = trpc.useUtils();
  const { data: linhas = [] } = trpc.admin.assinaturas.useQuery();
  const [confirmar, setConfirmar] = useState<Pix | null>(null);

  const registrar = trpc.admin.registrarPix.useMutation({
    onSuccess: (r) => {
      utils.admin.assinaturas.invalidate();
      setConfirmar(null);
      toast.success(`Pix registrado. Liberada até ${formatarData(r.pagoAte)}.`);
    },
    onError: (e) => toast.error(e.message || "Erro ao registrar o Pix"),
  });
  const fundador = trpc.admin.definirFundador.useMutation({
    onSuccess: () => utils.admin.assinaturas.invalidate(),
    onError: (e) => toast.error(e.message || "Erro ao mudar Psicóloga Fundadora"),
  });

  const [coro, setCoro] = useState<Linha | null>(null);

  const pagantes = linhas.filter((l) => !l.isento);
  if (!pagantes.length) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">Assinaturas ({pagantes.length})</h2>
      {pagantes.map((l) => {
        const s = l.situacao;
        const situacao =
          s.motivo === "teste"
            ? `Teste até ${formatarData(s.ate)}`
            : s.motivo === "pago"
              ? `Pago até ${formatarData(s.ate)}`
              : s.ate
                ? `Venceu em ${formatarData(s.ate)}`
                : "Sem assinatura";
        const mensal = l.valorCentavos === null ? null : l.ciclo === "anual" ? Math.round(l.valorCentavos / 10) : l.valorCentavos;
        return (
          <Card key={l.therapistId} className={s.liberado ? undefined : "border-destructive/40"}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium text-foreground">
                  {l.nome || l.email} · CRP {l.crp}
                </p>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {l.pacientes} paciente{l.pacientes === 1 ? "" : "s"} · {l.plano} ·{" "}
                  {mensal === null ? "valor combinado" : `${formatarReais(mensal)}/mês`}
                  {l.fundador && " · Psicóloga Fundadora"}
                  {l.diaVencimento && ` · vence dia ${l.diaVencimento}`}
                </p>
                {l.planoEscolhido === "unlimited" && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Coro sob medida: Luma {l.limites.lumaPorDia}/dia · anexos até {l.limites.anexoMb} MB
                  </p>
                )}
                <p className={`text-sm font-medium ${s.liberado ? "text-foreground" : "text-destructive"}`}>{situacao}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["mensal", "anual"] as const).map((ciclo) => (
                  <Button
                    key={ciclo}
                    size="sm"
                    variant={ciclo === "mensal" ? "default" : "outline"}
                    onClick={() =>
                      setConfirmar({
                        therapistId: l.therapistId,
                        nome: l.nome || l.email || "",
                        ciclo,
                        valor: mensal === null ? null : ciclo === "anual" ? mensal * 10 : mensal,
                      })
                    }
                  >
                    Pix {ciclo}
                  </Button>
                ))}
                <Button size="sm" variant="outline" onClick={() => setCoro(l)}>
                  {l.planoEscolhido === "unlimited" ? "Editar Coro" : "Colocar no Coro"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={fundador.isPending}
                  onClick={() => fundador.mutate({ therapistId: l.therapistId, fundador: !l.fundador })}
                >
                  {l.fundador ? "Tirar Fundadora" : "Tornar Fundadora"}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrar Pix {confirmar?.ciclo} de {confirmar?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              Confira no seu banco que o Pix
              {confirmar?.valor != null ? ` de ${formatarReais(confirmar.valor)}` : ""} caiu. Isso libera mais{" "}
              {confirmar?.ciclo === "anual" ? "12 meses" : "1 mês"}, contados do fim do período atual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={registrar.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirmar) registrar.mutate({ therapistId: confirmar.therapistId, ciclo: confirmar.ciclo });
              }}
            >
              {registrar.isPending ? "Registrando..." : "Registrar Pix"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {coro && <CoroDialog linha={coro} aoFechar={() => setCoro(null)} />}
    </div>
  );
}

type Linha = RouterOutputs["admin"]["assinaturas"][number];

/** "150,00" → 15000. Vazio → null (sem valor combinado). Inválido → undefined. */
function reaisParaCentavos(texto: string): number | null | undefined {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
}

/** Inteiro positivo dentro do teto; vazio → null (padrão); inválido → undefined. */
function inteiroOuPadrao(texto: string, max: number): number | null | undefined {
  if (!texto.trim()) return null;
  const n = Number(texto);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : undefined;
}

/**
 * Coro sob medida (só o Coro tem — decisão de 2026-10-27): o valor mensal que
 * você combinou, a cota da Luma e o teto do anexo. Campo vazio = padrão.
 */
function CoroDialog({ linha, aoFechar }: { linha: Linha; aoFechar: () => void }) {
  const utils = trpc.useUtils();
  const sm = linha.sobMedida;
  const [valor, setValor] = useState(sm.valorCombinado != null ? (sm.valorCombinado / 100).toFixed(2).replace(".", ",") : "");
  const [luma, setLuma] = useState(sm.lumaPorDia != null ? String(sm.lumaPorDia) : "");
  const [anexo, setAnexo] = useState(sm.anexoMb != null ? String(sm.anexoMb) : "");
  const jaNoCoro = linha.planoEscolhido === "unlimited";

  const terminar = (msg: string) => {
    utils.admin.assinaturas.invalidate();
    toast.success(msg);
    aoFechar();
  };
  const salvar = trpc.admin.definirCoro.useMutation({
    onSuccess: () => terminar(`${linha.nome || "Psicóloga"} está no Coro com as condições combinadas.`),
    onError: (e) => toast.error(e.message || "Não foi possível salvar."),
  });
  const tirar = trpc.admin.tirarDoCoro.useMutation({
    onSuccess: (r) => terminar(`Saiu do Coro e voltou para o ${r.plano}.`),
    onError: (e) => toast.error(e.message || "Não foi possível tirar do Coro."),
  });

  const valorCentavos = reaisParaCentavos(valor);
  const lumaPorDia = inteiroOuPadrao(luma, 500);
  const anexoMb = inteiroOuPadrao(anexo, 20);
  const invalido = valorCentavos === undefined || lumaPorDia === undefined || anexoMb === undefined;

  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Coro sob medida · {linha.nome || linha.email}</DialogTitle>
          <DialogDescription>
            O que você combinou com ela. Campo vazio usa o padrão: Luma 15 perguntas por dia, anexos de 10 MB e o
            pagamento mostrando "valor combinado".
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (invalido) return;
            salvar.mutate({
              therapistId: linha.therapistId,
              valorCombinado: valorCentavos ?? null,
              lumaPorDia: lumaPorDia ?? null,
              anexoMb: anexoMb ?? null,
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="coro-valor">Mensalidade combinada (R$)</Label>
            <Input id="coro-valor" inputMode="decimal" placeholder="Ex.: 250,00" value={valor} onChange={(e) => setValor(e.target.value)} />
            <p className="text-xs text-muted-foreground">No anual ela paga 10 vezes esse valor. Não leva o desconto de Fundadora.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="coro-luma">Luma por dia</Label>
              <Input id="coro-luma" inputMode="numeric" placeholder="15" value={luma} onChange={(e) => setLuma(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coro-anexo">Anexos (MB, até 20)</Label>
              <Input id="coro-anexo" inputMode="numeric" placeholder="10" value={anexo} onChange={(e) => setAnexo(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Lembre: a Luma roda na Groq grátis, que aguenta umas 80 perguntas por dia somando todas as clientes.
          </p>
          {invalido && (
            <p className="text-sm text-destructive">
              Confira os campos: valor em reais, Luma de 1 a 500 e anexos de 1 a 20 MB.
            </p>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {jaNoCoro ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                disabled={tirar.isPending}
                onClick={() => tirar.mutate({ therapistId: linha.therapistId })}
              >
                Tirar do Coro
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={invalido || salvar.isPending}>
              {salvar.isPending ? "Salvando..." : jaNoCoro ? "Salvar condições" : "Colocar no Coro"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
