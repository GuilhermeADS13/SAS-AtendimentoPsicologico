import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { formatarData } from "@shared/datas";
import { DIAS_DE_VENCIMENTO } from "@shared/assinatura";
import { pixComValor } from "@shared/pix";
import {
  DESCONTO_FUNDADOR,
  DIAS_DE_TESTE_GRATIS,
  MAX_PACIENTES_NA_TABELA,
  MESES_PAGOS_NO_ANUAL,
  PLANOS,
  formatarReais,
  valorDaCobranca,
  type Ciclo,
} from "@shared/precos";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { PIX_COPIA_E_COLA, linkWhatsAppDoSuporte } from "@/lib/suporte";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { CopiarPix } from "@/components/CopiarPix";
import { AlertTriangle, CalendarDays, Gauge, Paperclip, ShieldCheck, Sparkles, Users } from "lucide-react";
import { LumaOwlIcon } from "@/components/Logo";

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
    <div aria-hidden className="pointer-events-none absolute inset-y-6 left-[40%] right-[34%] hidden items-center gap-[3px] opacity-15 lg:flex">
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
  const cheio = valorDaCobranca(data.pacientes) ?? null;
  const mensal = valorDaCobranca(data.pacientes, { fundador: data.fundador });
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
      <div className="relative grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
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
              {data.fundador && cheio !== null && cheio > 0 && (
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

/** A trilha Sussurro → Voz → Coro, com a posição dela e o custo do próximo paciente. */
function TrilhaDosPlanos({ data }: { data: Resumo }) {
  const n = data.pacientes;
  // Escala VISUAL da trilha: o Coro (31+) não tem fim, então ganha um trecho
  // fixo de 6 "pacientes" — com 1/31 da largura o nome dele nem cabia.
  const fim = MAX_PACIENTES_NA_TABELA + 6;
  const larguraDe = (p: (typeof PLANOS)[number]) => ((p.ate ?? fim) - (p.de - 1)) / fim;
  const pos = (n > MAX_PACIENTES_NA_TABELA ? MAX_PACIENTES_NA_TABELA + 3 : Math.max(n, 0)) / fim;
  const agora = valorDaCobranca(n, { fundador: data.fundador });
  const depois = valorDaCobranca(n + 1, { fundador: data.fundador });
  const proximo = agora !== null && depois !== null ? depois - agora : null;
  const seguinte = PLANOS.find((p) => p.de > n);

  return (
    <section className="space-y-5 rounded-2xl border bg-card p-6">
      <div className="space-y-1">
        <h3 className="font-semibold text-foreground">Sua voz cresce com o consultório</h3>
        <p className="text-sm text-muted-foreground">
          O plano acompanha quantos pacientes você atende — e cada paciente a mais custa menos.
        </p>
      </div>

      <div className="space-y-2">
        <div className="relative pt-7">
          {/* Marcador da posição atual */}
          <div className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${pos * 100}%` }}>
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground tabular-nums">
              {n > MAX_PACIENTES_NA_TABELA ? `${MAX_PACIENTES_NA_TABELA}+` : n}
            </span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full">
            {PLANOS.map((p) => (
              <div
                key={p.id}
                className={`h-full border-r-2 border-card last:border-r-0 ${p.id === data.plano.id ? "bg-primary" : "bg-primary/15"}`}
                style={{ width: `${larguraDe(p) * 100}%` }}
              />
            ))}
          </div>
        </div>
        <div className="flex text-xs">
          {PLANOS.map((p) => {
            const ativo = p.id === data.plano.id;
            return (
              <div key={p.id} style={{ width: `${larguraDe(p) * 100}%` }} className="min-w-0 pr-1">
                <p className={`truncate font-semibold ${ativo ? "text-primary" : "text-muted-foreground"}`}>{p.nome}</p>
                <p className="truncate text-muted-foreground tabular-nums">{p.ate === null ? `${p.de}+` : `${p.de}–${p.ate}`}</p>
              </div>
            );
          })}
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-secondary/50 p-3">
          <dt className="text-xs text-muted-foreground">O próximo paciente custa</dt>
          <dd className="text-lg font-semibold tabular-nums text-foreground">
            {proximo === null ? "valor combinado" : `+ ${formatarReais(proximo)}/mês`}
          </dd>
        </div>
        <div className="rounded-xl bg-secondary/50 p-3">
          <dt className="text-xs text-muted-foreground">Próximo plano</dt>
          <dd className="text-sm font-medium text-foreground">
            {seguinte
              ? `${seguinte.nome} a partir de ${seguinte.de} pacientes${
                  seguinte.perguntasLumaPorDia ? ` · Luma ${seguinte.perguntasLumaPorDia}/dia` : " · condições combinadas"
                }`
              : "Você está no maior plano"}
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        Não contam: pacientes marcados como inativos (na ficha do paciente) e quem só entra nas chamadas em
        grupo.{" "}
        <Link href="/precos" className="text-primary underline underline-offset-4">
          Ver a tabela completa
        </Link>
      </p>
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
          paciente ({formatarReais(valorDaCobranca(1, { fundador: data.fundador }) ?? 0)}).
        </p>
      </section>
    );
  }

  const valor = valorDaCobranca(data.pacientes, { fundador: data.fundador, ciclo }) ?? 0;
  const mensal = valorDaCobranca(data.pacientes, { fundador: data.fundador }) ?? 0;
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
        {/* QR estático da conta (sem valor): para quem está no computador e paga
            pelo celular. Recortado e invertido para preto sobre branco — alguns
            apps de banco não leem o QR claro sobre escuro. */}
        <figure className="mx-auto space-y-2 text-center md:mx-0">
          <img
            src="/pix-qrcode.png"
            alt="QR code do Pix para pagar o VozInterior"
            width={168}
            height={168}
            className="mx-auto size-42 rounded-xl border bg-white p-2 [image-rendering:pixelated]"
          />
          <figcaption className="max-w-[11rem] text-xs text-muted-foreground">
            No computador? Escaneie com o celular e digite {formatarReais(valor)}.
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
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <TrilhaDosPlanos data={data} />
        <UsoDoPlano data={data} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <PagarAssinatura data={data} />
        <DiaDoVencimento atual={data.diaVencimento} />
      </div>
    </div>
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
    <section className="space-y-4 rounded-2xl border bg-card p-6">
      <div className="space-y-1">
        <h3 id="dia-vencimento" className="flex items-center gap-2 font-semibold text-foreground">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden /> Dia do vencimento
        </h3>
        <p className="text-sm text-muted-foreground">O dia do mês que fica melhor para você pagar.</p>
      </div>
      <div role="radiogroup" aria-labelledby="dia-vencimento" className="grid grid-cols-5 gap-2">
        {DIAS_DE_VENCIMENTO.map((dia) => (
          <button
            key={dia}
            type="button"
            role="radio"
            aria-checked={atual === dia}
            disabled={definir.isPending}
            onClick={() => atual !== dia && definir.mutate({ dia })}
            className={`flex aspect-square flex-col items-center justify-center rounded-xl border text-lg font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${
              atual === dia ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/60"
            }`}
          >
            {dia}
            <span className={`text-[10px] font-normal ${atual === dia ? "opacity-80" : "text-muted-foreground"}`}>dia</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {atual
          ? `Seu Pix vence todo dia ${atual}. O próximo vale até o dia ${atual} do mês seguinte (nunca menos de 1 mês).`
          : "Escolha um dia: o próximo Pix já vale até ele."}{" "}
        Três dias antes, mandamos um lembrete por e-mail.
      </p>
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
