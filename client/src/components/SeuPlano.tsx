import { Link } from "wouter";
import { toast } from "sonner";
import { formatarData } from "@shared/datas";
import { DIAS_DE_VENCIMENTO } from "@shared/assinatura";
import { pixComValor } from "@shared/pix";
import { DESCONTO_FUNDADOR, formatarReais, valorDaCobranca, type Ciclo } from "@shared/precos";
import { trpc } from "@/lib/trpc";
import { PIX_COPIA_E_COLA, linkWhatsAppDoSuporte } from "@/lib/suporte";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { CopiarPix } from "@/components/CopiarPix";
import { AlertTriangle, CreditCard } from "lucide-react";

type Situacao = { liberado: boolean; motivo: string; ate: Date | string | null; diasRestantes: number | null };

function textoDaSituacao(s: Situacao): string {
  const ate = formatarData(s.ate);
  const dias = s.diasRestantes === 0 ? "vence hoje" : `${s.diasRestantes} dia${s.diasRestantes === 1 ? "" : "s"}`;
  if (s.motivo === "teste") return `Teste grátis até ${ate} (${dias})`;
  if (s.motivo === "pago") return `Pago até ${ate}`;
  if (s.motivo === "vencido") return s.ate ? `Venceu em ${ate}` : "Sem assinatura";
  return "Sem assinatura";
}

/** Plano, valor e situação da psicóloga, com o pagamento por Pix. Na aba Assinatura. */
export function SeuPlano() {
  const { data } = trpc.assinatura.minha.useQuery();
  if (!data) return null;

  const opcoes: Array<{ ciclo: Ciclo; rotulo: string }> = [
    { ciclo: "mensal", rotulo: "1 mês" },
    { ciclo: "anual", rotulo: "1 ano (2 meses grátis)" },
  ];
  // Admin nunca é bloqueada: o vermelho de "venceu" seria falso para ela.
  const vencido = !data.situacao.liberado && !data.isento;

  return (
    <Card id="plano" className={vencido ? "border-destructive/50" : undefined}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" /> Seu plano: {data.plano.nome}
          {data.fundador && <Badge variant="secondary">Psicóloga Fundadora · {DESCONTO_FUNDADOR * 100}% off</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* A admin vê a tela inteira para testar — é exatamente o que as psicólogas veem. */}
        {data.isento && (
          <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
            Você é administradora: nada é bloqueado nem cobrado na sua conta, e a Luma não tem cota.
            Esta é a tela que as psicólogas veem.
          </p>
        )}
        <p className={`flex items-center gap-2 text-sm font-medium ${vencido ? "text-destructive" : "text-foreground"}`}>
          {vencido && <AlertTriangle className="w-4 h-4" />}
          {textoDaSituacao(data.situacao)}
        </p>
        {vencido && (
          <p className="text-sm text-muted-foreground">
            Agendar, iniciar chamada e a Luma ficam bloqueados até o Pix. Seus prontuários continuam abertos.
          </p>
        )}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Pacientes que contam</dt>
            <dd className="font-semibold tabular-nums">{data.pacientes}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Mensalidade</dt>
            <dd className="font-semibold tabular-nums">
              {data.valorCentavos === null ? "Combinada" : formatarReais(valorDaCobranca(data.pacientes, { fundador: data.fundador }) ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Luma hoje</dt>
            <dd className="font-semibold tabular-nums">
              {data.lumaHoje} de {data.lumaLimite ?? "∞"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Anexos</dt>
            <dd className="font-semibold tabular-nums">até {data.anexoMaxMb ?? 20} MB</dd>
          </div>
        </dl>

        <DiaDoVencimento atual={data.diaVencimento} />

        <p className="text-xs text-muted-foreground">
          Paciente que encerrou o acompanhamento não precisa contar: abra a ficha dele e toque em
          “Marcar como inativo”. Quem só entra nas chamadas em grupo também não conta.{" "}
          <Link href="/precos" className="text-primary underline underline-offset-4">Ver a tabela</Link>
        </p>

        {data.valorCentavos === 0 && (
          <p className="rounded-xl border bg-secondary/40 p-4 text-sm text-muted-foreground">
            Você ainda não tem pacientes que contam, então não há nada a pagar agora. A
            mensalidade começa no 1º paciente ({formatarReais(valorDaCobranca(1, { fundador: data.fundador }) ?? 0)}).
          </p>
        )}
        {!!data.valorCentavos && (
          <div className="grid gap-4 rounded-xl border bg-secondary/40 p-4 sm:grid-cols-[auto_1fr]">
            {/* QR estático da conta (sem valor embutido): quem escaneia digita o
                valor. Recortado e invertido para preto sobre branco — alguns apps
                de banco não leem o QR claro sobre escuro. No celular, o caminho é o
                "copia e cola", que já leva o valor. */}
            <img
              src="/pix-qrcode.png"
              alt="QR code do Pix para pagar o VozInterior"
              width={176}
              height={176}
              className="mx-auto h-44 w-44 rounded-md bg-white [image-rendering:pixelated]"
            />
            <ol className="min-w-0 space-y-3 text-sm">
              <li className="space-y-2">
                <p>
                  <strong>1.</strong> Copie o código Pix (o valor já vai junto) e cole no app do
                  banco, em <strong>Pix → Copia e Cola</strong>:
                </p>
                <CopiarPix
                  opcoes={opcoes.map(({ ciclo }) => {
                    const centavos = valorDaCobranca(data.pacientes, { fundador: data.fundador, ciclo }) ?? 0;
                    return {
                      chave: ciclo,
                      rotulo: `Copiar Pix de ${ciclo === "mensal" ? "1 mês" : "1 ano"}: ${formatarReais(centavos)}`,
                      codigo: pixComValor(PIX_COPIA_E_COLA, centavos),
                      destaque: ciclo === "mensal",
                    };
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  No computador? Escaneie o QR com o celular e digite o valor.
                </p>
              </li>
              <li className="space-y-2">
                <p>
                  <strong>2.</strong> Mande o comprovante — a liberação é feita assim que ele chega:
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {opcoes.map(({ ciclo }) => {
                    const valor = valorDaCobranca(data.pacientes, { fundador: data.fundador, ciclo }) ?? 0;
                    const link = linkWhatsAppDoSuporte(
                      `Olá! Paguei o Pix do VozInterior: ${data.pacientes} paciente${data.pacientes === 1 ? "" : "s"}, plano ${data.plano.nome}, ${ciclo} — ${formatarReais(valor)}. Segue o comprovante.`,
                    );
                    if (!link) return null;
                    return (
                      <Button key={ciclo} asChild size="sm" variant={ciclo === "mensal" ? "default" : "outline"} className="gap-2">
                        <a href={link} target="_blank" rel="noopener noreferrer">
                          <WhatsAppIcon className="w-4 h-4" />
                          {ciclo === "mensal" ? "Enviar comprovante do mês" : "Enviar comprovante do ano"}
                        </a>
                      </Button>
                    );
                  })}
                </div>
              </li>
            </ol>
          </div>
        )}
        {data.valorCentavos === null && (
          <p className="text-sm text-muted-foreground">
            Mais de 30 pacientes: o valor é combinado. Chame no WhatsApp do suporte (em Ajuda).
          </p>
        )}
      </CardContent>
    </Card>
  );
}


/**
 * Dia do mês em que o Pix vence. Vale a partir do próximo Pix: ele cobre até esse
 * dia do mês seguinte (nunca menos de 1 mês). Ver novoPagoAte.
 */
function DiaDoVencimento({ atual }: { atual: number | null }) {
  const utils = trpc.useUtils();
  const definir = trpc.assinatura.definirVencimento.useMutation({
    onSuccess: (r) => {
      utils.assinatura.minha.invalidate();
      toast.success(`Pronto: seu Pix passa a vencer todo dia ${r.dia}.`);
    },
    onError: (e) => toast.error(e.message || "Não foi possível salvar o dia."),
  });
  return (
    <div className="space-y-2">
      <p id="dia-vencimento" className="text-sm font-medium text-foreground">
        Dia do vencimento
      </p>
      <div role="radiogroup" aria-labelledby="dia-vencimento" className="flex flex-wrap gap-2">
        {DIAS_DE_VENCIMENTO.map((dia) => (
          <button
            key={dia}
            type="button"
            role="radio"
            aria-checked={atual === dia}
            disabled={definir.isPending}
            onClick={() => atual !== dia && definir.mutate({ dia })}
            className={`h-9 min-w-12 rounded-md border px-3 text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
              atual === dia ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/60"
            }`}
          >
            {dia}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {atual
          ? `Seu Pix vence todo dia ${atual}. O próximo Pix vale até o dia ${atual} do mês seguinte (nunca menos de 1 mês).`
          : "Escolha o dia do mês que fica melhor para pagar. O próximo Pix já vale até esse dia."}{" "}
        Três dias antes de vencer, mandamos um lembrete por e-mail.
      </p>
    </div>
  );
}

/**
 * Aviso no topo de todas as telas da psicóloga: teste/Pix vencendo em até 3 dias
 * ou já vencido. Leva à aba Assinatura.
 */
export function AvisoDoPlano() {
  const { data } = trpc.assinatura.minha.useQuery(undefined, { staleTime: 5 * 60_000 });
  if (!data || data.isento) return null;
  const s = data.situacao;
  const vencendo = s.liberado && s.diasRestantes !== null && s.diasRestantes <= 3;
  if (s.liberado && !vencendo) return null;
  return (
    <div
      role="status"
      className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-sm ${
        s.liberado
          ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
          : "border-destructive/40 bg-destructive/10 text-destructive"
      }`}
    >
      <span>
        {s.liberado
          ? `${s.motivo === "teste" ? "Seu teste grátis" : "Seu plano"} ${s.diasRestantes === 0 ? "vence hoje" : `vence em ${s.diasRestantes} dia${s.diasRestantes === 1 ? "" : "s"}`}.`
          : "Seu acesso venceu: agendar, chamada e Luma estão bloqueados. Seus prontuários continuam abertos."}
      </span>
      <Link href="/assinatura" className="font-medium underline underline-offset-4">
        Renovar pelo Pix
      </Link>
    </div>
  );
}
