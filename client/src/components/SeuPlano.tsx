import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { formatarData } from "@shared/datas";
import { diaDoVencimentoNoMes, diasNoMes, novoPagoAte } from "@shared/assinatura";
import { pixComValor } from "@shared/pix";
import {
  DESCONTO_FUNDADOR,
  DIAS_DE_TESTE_GRATIS,
  MAX_PACIENTES_NA_TABELA,
  MESES_PAGOS_NO_ANUAL,
  PLANOS,
  formatarReais,
  valorDoPlano,
  type Ciclo,
  type Plano,
} from "@shared/precos";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { PIX_COPIA_E_COLA, linkWhatsAppDoSuporte } from "@/lib/suporte";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { CopiarPix } from "@/components/CopiarPix";
import { QrDoPix } from "@/components/QrDoPix";
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
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { LumaOwlIcon } from "@/components/Logo";
import { LumaDoPlano, LumaFlutuante } from "@/components/LumaDoPlano";

type Resumo = NonNullable<RouterOutputs["assinatura"]["minha"]>;

/** Uma frase por plano: a voz que cresce junto com o consultório. */
const LEMA: Record<string, string> = {
  pro: "O começo da sua voz no consultório.",
  max: "Um consultório com ritmo firme.",
  unlimited: "Muitas vozes, uma clínica inteira.",
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Onda sonora decorativa (tema VozInterior) no cartão do plano. Alturas fixas,
 * calculadas uma vez: decoração, não dado — por isso aria-hidden.
 */
const ONDA = Array.from({ length: 48 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.17)));
function OndaSonora() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-y-6 left-[50%] right-[30%] hidden items-center gap-[3px] opacity-15 xl:flex">
      {ONDA.map((h, i) => (
        <span key={i} className="w-[3px] flex-1 rounded-full bg-current" style={{ height: `${Math.round(h * 70)}%` }} />
      ))}
    </div>
  );
}

/** Cartão de destaque: plano, valor e quanto falta do período (teste ou Pix). */
function CartaoDoPlano({ data }: { data: Resumo }) {
  const s = data.situacao;
  const vencido = !s.liberado && !data.isento;
  const cheio = valorDoPlano(data.pacientes, data.planoEscolhido, { combinado: data.valorCombinado });
  const mensal = valorDoPlano(data.pacientes, data.planoEscolhido, { fundador: data.fundador, combinado: data.valorCombinado });
  const total = s.motivo === "teste" ? DIAS_DE_TESTE_GRATIS : data.ciclo === "anual" ? 365 : 30;
  const resta = s.diasRestantes === null ? 0 : Math.min(1, Math.max(0, (s.diasRestantes + 1) / total));
  const rotuloPeriodo =
    s.motivo === "teste"
      ? `Teste grátis até ${formatarData(s.ate)}`
      : s.motivo === "pago"
        ? `Pago até ${formatarData(s.ate)}`
        : s.ate
          ? `Venceu em ${formatarData(s.ate)}`
          : "Sem assinatura";
  const faltam =
    s.diasRestantes === null ? null : s.diasRestantes === 0 ? "vence hoje" : `faltam ${plural(s.diasRestantes, "dia", "dias")}`;

  return (
    // Vencido continua no verde da marca: a faixa vermelha do topo já grita; aqui o
    // destaque é só o selo "Venceu em…".
    <section className="relative overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground shadow-sm sm:p-8">
      <OndaSonora />
      <div className="relative grid gap-6 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        {/* A Luma muda de forma com o plano (LumaDoPlano), com profundidade 3D. */}
        <LumaFlutuante>
          <LumaDoPlano plano={data.plano.id} className="h-28 w-40 sm:h-32 sm:w-44" titulo={`Luma do plano ${data.plano.nome}`} />
        </LumaFlutuante>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">Seu plano</p>
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">{data.plano.nome}</h2>
          <p className="max-w-sm text-sm opacity-85">{LEMA[data.plano.id]}</p>
          {data.fundador && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/25">
              <Sparkles className="size-3.5" aria-hidden /> Psicóloga Fundadora · {DESCONTO_FUNDADOR * 100}% para sempre
            </span>
          )}
        </div>
        <div className="space-y-1 sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">Mensalidade</p>
          {mensal === null ? (
            <p className="text-3xl font-bold">Combinada</p>
          ) : (
            <p className="tabular-nums">
              {data.fundador && cheio !== null && cheio > 0 && cheio !== mensal && (
                <span className="mr-2 text-lg line-through opacity-60">{formatarReais(cheio)}</span>
              )}
              <span className="text-4xl font-bold">{formatarReais(mensal)}</span>
              <span className="text-sm opacity-80"> /mês</span>
            </p>
          )}
          <p className="text-sm opacity-85 tabular-nums">{plural(data.pacientes, "paciente que conta", "pacientes que contam")}</p>
        </div>
      </div>

      <div className="relative mt-6 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span
            className={`flex items-center gap-1.5 font-medium ${
              vencido ? "rounded-full bg-white px-3 py-1 text-destructive" : ""
            }`}
          >
            {vencido ? <AlertTriangle className="size-4" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
            {rotuloPeriodo}
          </span>
          {faltam && <span className="opacity-85">{faltam}</span>}
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-white/20"
          role="progressbar"
          aria-label="Tempo restante do período"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(resta * 100)}
        >
          <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${resta * 100}%` }} />
        </div>
        {vencido && (
          <p className="text-sm opacity-90">
            Agendar, iniciar chamada e a Luma estão pausados até o Pix. Seus prontuários continuam abertos.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Os 3 planos lado a lado ("como a Netflix", decisão de 2026-10-26): os bônus de
 * cada um, o atual marcado e a troca. Os bônus valem na hora; o valor novo, no
 * próximo Pix. O Coro é combinado — o botão abre o WhatsApp.
 */
function EscolherPlano({ data }: { data: Resumo }) {
  const utils = trpc.useUtils();
  const [confirmar, setConfirmar] = useState<Plano | null>(null);
  const mudar = trpc.assinatura.mudarPlano.useMutation({
    onSuccess: (r) => {
      utils.assinatura.minha.invalidate();
      setConfirmar(null);
      toast.success(`Pronto: agora você está no ${r.plano}. Os bônus já valem.`);
    },
    onError: (e) => toast.error(e.message || "Não foi possível mudar de plano."),
  });
  const coro = linkWhatsAppDoSuporte("Olá! Quero conversar sobre o plano Coro do VozInterior.");
  const n = data.pacientes;
  const teto = data.plano.ate;
  const valorNovo = confirmar ? valorDoPlano(n, confirmar.id, { fundador: data.fundador, combinado: data.valorCombinado }) : null;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">Escolha seu plano</h3>
          <p className="text-sm text-muted-foreground">
            Preço fixo por plano. Os bônus valem na hora; o valor novo entra no próximo Pix.
          </p>
        </div>
        {/* Preço fixo (2026-10-27): o que importa é quanto ainda cabe no plano. */}
        <p className="text-sm text-muted-foreground tabular-nums">
          Hoje: {plural(n, "paciente", "pacientes")}
          {teto !== null && ` · cabem até ${teto} no ${data.plano.nome} (${n >= teto ? "plano cheio" : `faltam ${teto - n}`})`}.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANOS.map((p) => {
          const atual = p.id === data.planoEscolhido;
          const ehCoro = p.ate === null;
          const naoCabe = !ehCoro && n > (p.ate ?? 0);
          // Preço do plano para ELA (com Fundadora). Usa ao menos 1 paciente: o R$ 0 de
          // quem ainda não tem nenhum vale só para o plano atual, não para comparar.
          const valor = valorDoPlano(Math.max(1, n), p.id, { fundador: data.fundador, combinado: data.valorCombinado });
          const bonus = [
            ehCoro ? `Mais de ${MAX_PACIENTES_NA_TABELA} pacientes` : `Até ${p.ate} pacientes`,
            p.perguntasLumaPorDia ? `Luma: ${p.perguntasLumaPorDia} perguntas por dia` : "Luma sob medida",
            p.anexoMaxMb ? `Anexos de até ${p.anexoMaxMb} MB` : "Anexos sob medida",
            "Videochamada em grupo (até 4 pessoas)",
            "Prontuário, agenda, mensagens e financeiro",
          ];
          return (
            <article
              key={p.id}
              aria-current={atual ? "true" : undefined}
              className={`relative flex flex-col rounded-2xl border bg-card p-5 transition-shadow ${
                atual ? "border-2 border-primary shadow-md" : "hover:shadow-sm"
              }`}
            >
              {atual && (
                <span className="absolute -top-3 left-5 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                  Seu plano
                </span>
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="text-2xl font-bold tracking-tight text-foreground">{p.nome}</h4>
                  <p className="text-sm text-muted-foreground">{LEMA[p.id]}</p>
                </div>
                <LumaDoPlano plano={p.id} className="-mt-1 h-20 w-28 text-primary" />
              </div>
              <div className="my-4 min-h-14">
                {valor === null ? (
                  <p className="text-2xl font-bold text-foreground">Fale comigo</p>
                ) : (
                  <p className="tabular-nums">
                    <span className="text-2xl font-bold text-foreground">{formatarReais(valor)}</span>
                    <span className="text-sm text-muted-foreground"> /mês para você</span>
                  </p>
                )}
                {ehCoro ? (
                  <p className="text-xs text-muted-foreground">clínicas e equipes</p>
                ) : (
                  <p className="text-xs text-muted-foreground">fixo, até {p.ate} pacientes</p>
                )}
              </div>
              <ul className="mb-5 flex-1 space-y-2 text-sm text-foreground/90">
                {bonus.map((b) => (
                  <li key={b} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              {atual ? (
                <Button variant="secondary" disabled className="w-full">
                  Plano atual
                </Button>
              ) : ehCoro ? (
                coro && (
                  <Button asChild variant="outline" className="w-full gap-2">
                    <a href={coro} target="_blank" rel="noopener noreferrer">
                      <WhatsAppIcon className="size-4" /> Conversar
                    </a>
                  </Button>
                )
              ) : naoCabe ? (
                <Button variant="outline" disabled className="w-full whitespace-normal">
                  Seus {n} pacientes passam do limite
                </Button>
              ) : (
                <Button className="w-full" onClick={() => setConfirmar(p)}>
                  Mudar para {p.nome}
                </Button>
              )}
            </article>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Não contam: pacientes marcados como inativos (na ficha do paciente) e quem só entra nas chamadas em grupo.{" "}
        <Link href="/precos" className="text-primary underline underline-offset-4">
          Ver a tabela completa
        </Link>
      </p>

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mudar para o {confirmar?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              Os bônus do {confirmar?.nome} valem agora.{" "}
              {valorNovo !== null &&
                `Sua mensalidade passa a ser ${formatarReais(valorNovo)} a partir do próximo Pix (hoje, com ${plural(n, "paciente", "pacientes")}).`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={mudar.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirmar && (confirmar.id === "pro" || confirmar.id === "max")) mudar.mutate({ plano: confirmar.id });
              }}
            >
              {mudar.isPending ? "Mudando..." : `Mudar para ${confirmar?.nome ?? ""}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** Uso de hoje: Luma (com barra), anexos e pacientes. */
function UsoDoPlano({ data }: { data: Resumo }) {
  const limite = data.lumaLimite;
  const usoLuma = limite ? Math.min(1, data.lumaHoje / limite) : 0;
  const itens = [
    {
      icone: <LumaOwlIcon className="size-5" />,
      rotulo: "Luma hoje",
      valor: limite ? `${data.lumaHoje} de ${limite}` : `${data.lumaHoje} · sem limite`,
      nota: limite ? "a cota volta à meia-noite" : "conta de administradora",
      barra: limite ? usoLuma : null,
    },
    {
      icone: <Paperclip className="size-5 text-primary" aria-hidden />,
      rotulo: "Anexos nas mensagens",
      valor: `até ${data.anexoMaxMb ?? 20} MB`,
      nota: "por arquivo",
      barra: null,
    },
    {
      icone: <Users className="size-5 text-primary" aria-hidden />,
      rotulo: "Pacientes que contam",
      valor: String(data.pacientes),
      nota: "ativos e aguardando cadastro",
      barra: null,
    },
  ];
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-6">
      <h3 className="flex items-center gap-2 font-semibold text-foreground">
        <Gauge className="size-4 text-muted-foreground" aria-hidden /> Uso do plano
      </h3>
      <ul className="space-y-4">
        {itens.map((i) => (
          <li key={i.rotulo} className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">{i.icone}</span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm text-muted-foreground">{i.rotulo}</p>
                <p className="text-sm font-semibold tabular-nums text-foreground">{i.valor}</p>
              </div>
              {i.barra !== null && (
                <div className="h-1.5 overflow-hidden rounded-full bg-primary/15">
                  <div
                    className={`h-full rounded-full ${i.barra >= 1 ? "bg-amber-500" : "bg-primary"}`}
                    style={{ width: `${i.barra * 100}%` }}
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">{i.nota}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Pagar: escolhe mensal/anual, copia o Pix (ou lê o QR) e manda o comprovante. */
function PagarAssinatura({ data }: { data: Resumo }) {
  const [ciclo, setCiclo] = useState<Ciclo>(data.ciclo === "anual" ? "anual" : "mensal");
  if (data.valorCentavos === null) {
    return (
      <section className="space-y-2 rounded-2xl border bg-card p-6">
        <h3 className="font-semibold text-foreground">Pagamento</h3>
        <p className="text-sm text-muted-foreground">
          Com mais de {MAX_PACIENTES_NA_TABELA} pacientes o valor é combinado. Chame no WhatsApp do suporte (em Ajuda).
        </p>
      </section>
    );
  }
  if (data.valorCentavos === 0) {
    return (
      <section className="space-y-2 rounded-2xl border bg-card p-6">
        <h3 className="font-semibold text-foreground">Pagamento</h3>
        <p className="text-sm text-muted-foreground">
          Você ainda não tem pacientes que contam, então não há nada a pagar agora. A mensalidade começa no 1º
          paciente ({formatarReais(valorDoPlano(1, data.planoEscolhido, { fundador: data.fundador, combinado: data.valorCombinado }) ?? 0)}).
        </p>
      </section>
    );
  }

  const valor = valorDoPlano(data.pacientes, data.planoEscolhido, { fundador: data.fundador, combinado: data.valorCombinado, ciclo }) ?? 0;
  const mensal = valorDoPlano(data.pacientes, data.planoEscolhido, { fundador: data.fundador, combinado: data.valorCombinado }) ?? 0;
  const economia = mensal * 12 - mensal * MESES_PAGOS_NO_ANUAL;
  const comprovante = linkWhatsAppDoSuporte(
    `Olá! Paguei o Pix do VozInterior: ${plural(data.pacientes, "paciente", "pacientes")}, plano ${data.plano.nome}, ${ciclo} — ${formatarReais(valor)}. Segue o comprovante.`,
  );

  const Passo = ({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) => (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      <span className="absolute left-4 top-9 bottom-0 w-px bg-border [li:last-child>&]:hidden" aria-hidden />
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2 pt-1">
        <p className="font-medium text-foreground">{titulo}</p>
        {children}
      </div>
    </li>
  );

  return (
    <section className="space-y-5 rounded-2xl border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-semibold text-foreground">Pagar a assinatura</h3>
          <p className="text-sm text-muted-foreground">Por Pix, direto e sem taxa. A liberação é feita quando o comprovante chega.</p>
        </div>
        <div role="radiogroup" aria-label="Forma de pagamento" className="grid grid-cols-2 gap-1 rounded-lg bg-secondary/60 p-1 text-sm">
          {(["mensal", "anual"] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={ciclo === c}
              onClick={() => setCiclo(c)}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                ciclo === c ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {c === "mensal" ? "Mensal" : "Anual"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2 rounded-xl bg-secondary/50 px-4 py-3">
        <p className="tabular-nums">
          <span className="text-3xl font-bold text-foreground">{formatarReais(valor)}</span>
          <span className="text-sm text-muted-foreground"> {ciclo === "anual" ? "por 12 meses" : "por mês"}</span>
        </p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {ciclo === "anual"
            ? `2 meses grátis · você economiza ${formatarReais(economia)}`
            : `No anual: ${formatarReais(mensal * MESES_PAGOS_NO_ANUAL)} (2 meses grátis)`}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_auto]">
        <ol>
          <Passo n={1} titulo="Copie o código Pix">
            <CopiarPix
              opcoes={[
                { chave: ciclo, rotulo: `Copiar Pix · ${formatarReais(valor)}`, codigo: pixComValor(PIX_COPIA_E_COLA, valor) },
              ]}
            />
            <p className="text-xs text-muted-foreground">O valor já vai junto no código.</p>
          </Passo>
          <Passo n={2} titulo="Cole no app do seu banco">
            <p className="text-sm text-muted-foreground">
              Em <strong className="text-foreground">Pix → Pix Copia e Cola</strong>. Confira o valor e confirme.
            </p>
          </Passo>
          <Passo n={3} titulo="Envie o comprovante">
            {comprovante && (
              <Button asChild size="sm" variant="outline" className="gap-2">
                <a href={comprovante} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className="size-4" /> Enviar pelo WhatsApp
                </a>
              </Button>
            )}
          </Passo>
        </ol>
        {/* QR com o VALOR embutido (o mesmo código do "Copiar Pix"): quem está no
            computador escaneia com o celular e o banco já abre com o valor certo. */}
        <figure className="mx-auto space-y-2 text-center md:mx-0">
          <QrDoPix
            codigo={pixComValor(PIX_COPIA_E_COLA, valor)}
            titulo={`QR code do Pix de ${formatarReais(valor)} para pagar o VozInterior`}
            className="mx-auto size-44 rounded-xl border"
          />
          <figcaption className="max-w-[11rem] text-xs text-muted-foreground">
            No computador? Escaneie com o celular: o valor de {formatarReais(valor)} já vem preenchido.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

/** Plano, valor, uso e pagamento da psicóloga. É a aba Assinatura. */
export function SeuPlano() {
  const { data } = trpc.assinatura.minha.useQuery();
  if (!data) return null;
  return (
    <div id="plano" className="space-y-6">
      {/* A admin vê a tela inteira para testar — é exatamente o que as psicólogas veem. */}
      {data.isento && (
        <p className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm text-foreground">
          Você é administradora: nada é bloqueado nem cobrado na sua conta, e a Luma não tem cota. Esta é a tela
          que as psicólogas veem.
        </p>
      )}
      <CartaoDoPlano data={data} />
      <EscolherPlano data={data} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <PagarAssinatura data={data} />
        <div className="space-y-6">
          <UsoDoPlano data={data} />
          <DiaDoVencimento atual={data.diaVencimento} ate={data.situacao.ate} ciclo={data.ciclo} />
        </div>
      </div>
    </div>
  );
}

const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const TRES_HORAS = 3 * 60 * 60 * 1000;

/**
 * Dia do mês em que o Pix vence, escolhido num calendário (qualquer dia de 1 a
 * 31). Mostra o mês do PRÓXIMO vencimento, e as setas deixam ver os outros —
 * em fevereiro, o 30 ou 31 vira o último dia do mês (shared/assinatura.ts). O
 * dia vale a partir do próximo Pix: ele cobre até esse dia do mês seguinte
 * (nunca menos de 1 mês). Ver novoPagoAte.
 */
function DiaDoVencimento({ atual, ate, ciclo }: { atual: number | null; ate: Date | string | null; ciclo: Ciclo }) {
  const utils = trpc.useUtils();
  const definir = trpc.assinatura.definirVencimento.useMutation({
    onSuccess: (r) => {
      utils.assinatura.minha.invalidate();
      toast.success(`Pronto: seu Pix passa a vencer todo dia ${r.dia}.`);
    },
    onError: (e) => toast.error(e.message || "Não foi possível salvar o dia."),
  });
  const [deslocamento, setDeslocamento] = useState(0);

  // Até quando fica liberada se pagar agora — e é esse o mês que o calendário abre.
  const proximo = novoPagoAte({ testeAte: null, pagoAte: ate ? new Date(ate) : null, diaVencimento: atual }, ciclo);
  const base = new Date(proximo.getTime() - TRES_HORAS); // data em Brasília
  const mesVisto = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + deslocamento, 1));
  const ano = mesVisto.getUTCFullYear();
  const mes = mesVisto.getUTCMonth();
  const total = diasNoMes(ano, mes);
  const vazios = mesVisto.getUTCDay();
  const marcado = atual ? diaDoVencimentoNoMes(ano, mes, atual) : null;
  const soMes = mesVisto.toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });
  const nomeDoMes = `${soMes.charAt(0).toUpperCase()}${soMes.slice(1)} de ${ano}`;

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-6">
      <div className="space-y-1">
        <h3 id="dia-vencimento" className="flex items-center gap-2 font-semibold text-foreground">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden /> Dia do vencimento
        </h3>
        <p className="text-sm text-muted-foreground">Toque no dia do mês que fica melhor para você pagar.</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setDeslocamento((d) => d - 1)}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <p className="text-sm font-semibold text-foreground" aria-live="polite">
            {nomeDoMes}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setDeslocamento((d) => d + 1)}
            aria-label="Próximo mês"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground" aria-hidden>
          {SEMANA.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div role="radiogroup" aria-labelledby="dia-vencimento" className="grid grid-cols-7 gap-1">
          {Array.from({ length: vazios }, (_, i) => (
            <span key={`v${i}`} aria-hidden />
          ))}
          {Array.from({ length: total }, (_, i) => {
            const dia = i + 1;
            const escolhido = dia === marcado;
            return (
              <button
                key={dia}
                type="button"
                role="radio"
                aria-checked={escolhido}
                aria-label={`Dia ${dia}`}
                disabled={definir.isPending}
                onClick={() => atual !== dia && definir.mutate({ dia })}
                className={`aspect-square rounded-lg text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
                  escolhido ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-primary/10"
                }`}
              >
                {dia}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        {atual ? (
          <>
            <p>
              Seu Pix vence <strong className="text-foreground">todo dia {atual}</strong>. Se pagar agora, fica
              liberada até <strong className="text-foreground">{formatarData(proximo)}</strong>.
            </p>
            {marcado !== null && marcado !== atual && (
              <p>
                Em {soMes} o mês só tem {total} dias: vence no dia {marcado}.
              </p>
            )}
            {atual > 28 && marcado === atual && <p>Nos meses mais curtos, como fevereiro, vence no último dia do mês.</p>}
          </>
        ) : (
          <p>O próximo Pix já vale até o dia que você escolher (nunca menos de 1 mês).</p>
        )}
        <p>Três dias antes de vencer, você recebe um e-mail e um aviso aqui no sistema.</p>
      </div>
    </section>
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
