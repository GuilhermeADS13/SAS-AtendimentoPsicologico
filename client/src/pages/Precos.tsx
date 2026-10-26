import { useState } from "react";
import { Link } from "wouter";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { LogoLockup } from "@/components/Logo";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { linkWhatsAppDoSuporte } from "@/lib/suporte";
import {
  DESCONTO_FUNDADOR,
  DIAS_DE_TESTE_GRATIS,
  FAIXAS_DE_PRECO,
  MAX_PACIENTES_NA_TABELA,
  MESES_PAGOS_NO_ANUAL,
  PLANOS,
  VAGAS_DE_FUNDADOR,
  type Ciclo,
  type Plano,
  formatarReais,
  mensalidadeEmCentavos,
  planoPara,
  valorDaCobranca,
} from "@shared/precos";
import { ArrowRight, Check } from "lucide-react";

/** O que todo plano tem. A diferença entre eles é a quantidade (pacientes, Luma, anexos). */
const INCLUSO_EM_TODOS = [
  "Prontuário com a aba Evolução",
  "Agenda com lembrete por e-mail",
  "Videochamada no navegador, também em grupo (até 4 pessoas)",
  "Mensagens com o paciente",
  "Financeiro",
];

const DUVIDAS = [
  {
    pergunta: "O que conta como paciente?",
    resposta:
      "Cada paciente cadastrado por você. Quem só entra na chamada em grupo — o cônjuge na terapia de casal, o outro responsável pela criança — não conta.",
  },
  {
    pergunta: "E se eu passar de 10 pacientes?",
    resposta:
      "Você passa para o Max. O preço continua seguindo a mesma tabela, sem salto: o 11º paciente custa R$ 2,50.",
  },
  {
    pergunta: "Como funciona o teste grátis?",
    resposta: `São ${DIAS_DE_TESTE_GRATIS} dias com tudo liberado, sem cartão, a partir da aprovação do seu CRP. É um teste por pessoa (por CRP e por celular). Se você não renovar, agenda, chamada e Luma pausam — seus prontuários continuam abertos.`,
  },
  {
    pergunta: "Como eu pago?",
    resposta: `Por Pix, todo mês ou uma vez por ano. No anual você paga ${MESES_PAGOS_NO_ANUAL} meses e leva 12. Por enquanto não aceitamos cartão.`,
  },
  {
    pergunta: "O que é o preço de fundadora?",
    resposta: `As ${VAGAS_DE_FUNDADOR} primeiras psicólogas pagam ${DESCONTO_FUNDADOR * 100}% a menos que a tabela, para sempre, enquanto forem clientes.`,
  },
  {
    pergunta: "A Luma tem limite?",
    resposta:
      "A Luma que consulta os prontuários sim: 5 perguntas por dia no Pro e 15 no Max. A Luma que tira dúvidas dos seus pacientes sobre o site não tem limite.",
  },
  {
    pergunta: "O paciente paga alguma coisa?",
    resposta: "Não. Só a psicóloga paga; o paciente usa de graça.",
  },
];

function reais(pacientes: number): string {
  const centavos = mensalidadeEmCentavos(pacientes);
  return centavos === null ? "Fale comigo" : formatarReais(centavos);
}

/** "de R$ 20 a R$ 105 por mês" — a faixa de preço que o plano cobre. */
function faixaDoPlano(plano: Plano): string {
  if (plano.ate === null) return "Preço combinado com você";
  return `${reais(plano.de)} a ${reais(plano.ate)} por mês`;
}

function pacientesDoPlano(plano: Plano): string {
  if (plano.ate === null) return `Mais de ${plano.de - 1} pacientes`;
  return `${plano.de} a ${plano.ate} pacientes`;
}

function itensDoPlano(plano: Plano): string[] {
  if (plano.perguntasLumaPorDia === null) {
    return ["Tudo do Max", "Cota da Luma e anexos sob medida", "Condições combinadas pelo WhatsApp"];
  }
  return [
    ...INCLUSO_EM_TODOS,
    `Luma: ${plano.perguntasLumaPorDia} perguntas por dia`,
    `Anexos de até ${plano.anexoMaxMb} MB`,
  ];
}

export default function Precos() {
  // O controle vai até 31, que representa "mais de 30" (Unlimited).
  const [pacientes, setPacientes] = useState(8);
  const [ciclo, setCiclo] = useState<Ciclo>("mensal");
  const plano = planoPara(pacientes);
  const centavos = mensalidadeEmCentavos(pacientes);
  const acimaDaTabela = centavos === null;
  const rotuloPacientes = acimaDaTabela ? `${MAX_PACIENTES_NA_TABELA}+` : String(pacientes);
  const valor = valorDaCobranca(pacientes, { ciclo }) ?? 0;
  const valorFundadora = valorDaCobranca(pacientes, { ciclo, fundador: true }) ?? 0;
  const porPeriodo = ciclo === "anual" ? "/ano" : "/mês";

  const mensagem = acimaDaTabela
    ? "Olá! Atendo mais de 30 pacientes e quero conversar sobre o plano Unlimited do VozInterior."
    : `Olá! Quero assinar o VozInterior: ${pacientes} paciente${pacientes > 1 ? "s" : ""}, plano ${plano.nome}, ${ciclo} (${formatarReais(valor)}${porPeriodo}).`;
  const whats = linkWhatsAppDoSuporte(mensagem);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/60">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" aria-label="Página inicial">
            <LogoLockup />
          </Link>
          <Button size="sm" asChild>
            <Link href="/login">Entrar</Link>
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12 md:py-16 space-y-16">
        {/* Calculadora: a página existe para responder "quanto EU vou pagar". */}
        <section className="grid gap-10 md:grid-cols-[1fr_1.1fr] md:items-center">
          <div className="space-y-4">
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground text-balance">
              Pague pelo tamanho do seu consultório
            </h1>
            <p className="text-lg text-muted-foreground text-pretty">
              Você paga por paciente cadastrado — e quanto mais pacientes, menor o
              valor de cada um.
            </p>
            <ul className="space-y-2 text-foreground">
              <li className="flex gap-2">
                <Check className="w-5 h-5 mt-0.5 shrink-0 text-primary" />
                <span>
                  <strong>{DIAS_DE_TESTE_GRATIS} dias grátis</strong>, sem cartão
                </span>
              </li>
              <li className="flex gap-2">
                <Check className="w-5 h-5 mt-0.5 shrink-0 text-primary" />
                <span>
                  As {VAGAS_DE_FUNDADOR} primeiras psicólogas ganham{" "}
                  <strong>{DESCONTO_FUNDADOR * 100}% de desconto para sempre</strong>
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border bg-card p-6 md:p-8 shadow-sm space-y-6">
            <div className="flex items-baseline justify-between gap-4">
              <label htmlFor="qtd-pacientes" className="font-medium text-foreground">
                Quantos pacientes você atende?
              </label>
              <span className="text-3xl font-bold tabular-nums text-primary">{rotuloPacientes}</span>
            </div>
            <input
              id="qtd-pacientes"
              type="range"
              min={1}
              max={MAX_PACIENTES_NA_TABELA + 1}
              step={1}
              value={pacientes}
              onChange={(e) => setPacientes(Number(e.target.value))}
              aria-valuetext={acimaDaTabela ? "mais de 30 pacientes" : `${pacientes} pacientes`}
              className="w-full h-2 cursor-pointer accent-[var(--primary)]"
            />
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>1</span>
              <span>10</span>
              <span>20</span>
              <span>30+</span>
            </div>

            {/* Mensal ou anual: o anual é 10 meses pelo preço de 12. */}
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
                  {c === "mensal" ? "Mensal" : "Anual · 2 meses grátis"}
                </button>
              ))}
            </div>

            <div className="rounded-xl bg-secondary/60 p-5 space-y-1" aria-live="polite">
              <p className="text-sm font-semibold uppercase tracking-wider text-primary">
                Plano {plano.nome}
              </p>
              {acimaDaTabela ? (
                <>
                  <p className="text-3xl font-bold text-foreground">Fale comigo</p>
                  <p className="text-sm text-muted-foreground">
                    Para mais de 30 pacientes, o preço é combinado com você.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-4xl font-bold text-foreground tabular-nums">
                    {formatarReais(valor)}
                    <span className="text-base font-normal text-muted-foreground"> {porPeriodo}</span>
                  </p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {ciclo === "anual"
                      ? `Sai a ${formatarReais(Math.round(valor / 12))} por mês · pago por Pix`
                      : `${formatarReais(Math.round(centavos / pacientes))} por paciente · pago por Pix`}
                  </p>
                  <p className="text-sm text-primary tabular-nums">
                    Fundadoras pagam {formatarReais(valorFundadora)}
                    {porPeriodo}
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {whats && (
                <Button asChild size="lg" className="gap-2 sm:flex-1">
                  <a href={whats} target="_blank" rel="noopener noreferrer">
                    <WhatsAppIcon className="w-4 h-4" />
                    {acimaDaTabela ? "Fale comigo" : "Assinar pelo WhatsApp"}
                  </a>
                </Button>
              )}
              <Button asChild size="lg" variant="outline" className="gap-2 sm:flex-1">
                <Link href="/login">
                  Testar {DIAS_DE_TESTE_GRATIS} dias grátis
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Os três planos; o da quantidade escolhida acima fica em destaque. */}
        <section className="space-y-6">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Os planos
          </h2>
          <div className="grid gap-5 md:grid-cols-3">
            {PLANOS.map((p) => {
              const atual = p.id === plano.id;
              return (
                <div
                  key={p.id}
                  data-plano={p.id}
                  className={`rounded-2xl border bg-card p-6 flex flex-col gap-4 transition-colors ${
                    atual ? "border-primary ring-2 ring-primary/30" : ""
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xl font-bold text-foreground">{p.nome}</h3>
                      {atual && (
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                          Seu plano
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{pacientesDoPlano(p)}</p>
                  </div>
                  <p className="text-lg font-semibold text-foreground tabular-nums">{faixaDoPlano(p)}</p>
                  <ul className="space-y-2 text-sm text-foreground/90">
                    {itensDoPlano(p).map((item) => (
                      <li key={item} className="flex gap-2">
                        <Check className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        {/* Transparência: a conta inteira, para ninguém achar que tem pegadinha. */}
        <section className="grid gap-8 md:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Como o preço é calculado
            </h2>
            <p className="text-muted-foreground text-pretty">
              Cada paciente a mais custa menos que o anterior. O total nunca dá salto
              quando você muda de faixa.
            </p>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-left">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Pacientes</th>
                    <th className="px-4 py-2.5 font-medium text-right">Cada um custa</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {FAIXAS_DE_PRECO.map((faixa, i) => {
                    const de = i === 0 ? 1 : FAIXAS_DE_PRECO[i - 1].ate + 1;
                    return (
                      <tr key={faixa.ate} className="border-t">
                        <td className="px-4 py-2.5">
                          {de === faixa.ate - 1 ? `${de}º e ${faixa.ate}º` : `${de}º ao ${faixa.ate}º`}
                        </td>
                        <td className="px-4 py-2.5 text-right">{formatarReais(faixa.centavos)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Como assinar</h2>
            <ol className="space-y-4">
              {[
                ["Crie sua conta", `Depois da verificação do CRP, você usa tudo por ${DIAS_DE_TESTE_GRATIS} dias, de graça.`],
                ["Chame no WhatsApp", "Diga quantos pacientes você atende e receba a chave Pix."],
                ["Pague por Pix", "Todo mês, ou uma vez por ano com 2 meses grátis. O valor segue a tabela ao lado."],
              ].map(([titulo, texto], i) => (
                <li key={titulo} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-foreground">{titulo}</p>
                    <p className="text-sm text-muted-foreground">{texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="space-y-4 max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Dúvidas</h2>
          <Accordion type="single" collapsible className="rounded-xl border bg-card px-4">
            {DUVIDAS.map((d) => (
              <AccordionItem key={d.pergunta} value={d.pergunta}>
                <AccordionTrigger className="text-left">{d.pergunta}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{d.resposta}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      </main>
    </div>
  );
}
