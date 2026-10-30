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
import { LumaDoPlano } from "@/components/LumaDoPlano";
import { Rodape } from "@/components/Rodape";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { linkWhatsAppDoSuporte } from "@/lib/suporte";
import {
  DESCONTO_FUNDADOR,
  DIAS_DE_TESTE_GRATIS,
  DIAS_PARA_O_PRIMEIRO_PACIENTE,
  MAX_PACIENTES_NA_TABELA,
  MESES_PAGOS_NO_ANUAL,
  PLANOS,
  TEXTO_LUMA_NO_PRONTUARIO,
  TEXTO_RELATORIO_DE_GESTAO,
  VAGAS_DE_FUNDADOR,
  type Ciclo,
  type Plano,
  formatarReais,
  planoPara,
  precoDoPlano,
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

const LEMA: Record<string, string> = {
  pro: "Para quem está começando.",
  max: "Para o consultório com agenda cheia.",
  unlimited: "Para clínicas e equipes.",
};

const DUVIDAS = [
  {
    pergunta: "O preço muda com o número de pacientes?",
    resposta:
      "Não. Cada plano tem um valor fixo por mês e um limite de pacientes: no Sussurro cabem até 10, no Voz até 30. Dentro do limite, o valor é sempre o mesmo.",
  },
  {
    pergunta: "E se eu passar de 10 pacientes?",
    resposta:
      "Ao cadastrar o 11º, o sistema sugere mudar para o Voz e faz a troca com um clique. Também dá para escolher o Voz antes, pelos bônus: a Luma ajuda na estrutura do prontuário (modelos em branco e o que o CFP pede, sem dados dos pacientes), faz 15 perguntas por dia e os anexos vão até 10 MB.",
  },
  {
    pergunta: "O que conta como paciente?",
    resposta:
      "Cada paciente cadastrado e ativo. Quem encerrou o acompanhamento pode ser marcado como inativo e deixa de contar, e quem só entra na chamada em grupo — o cônjuge na terapia de casal, o outro responsável pela criança — não conta.",
  },
  {
    pergunta: "Como funciona o teste grátis?",
    resposta: `São ${DIAS_DE_TESTE_GRATIS} dias com tudo liberado, sem cartão. Eles só começam a contar quando você cadastra o primeiro paciente, o que precisa acontecer em até ${DIAS_PARA_O_PRIMEIRO_PACIENTE} dias depois da aprovação do seu CRP. É um teste por pessoa (por CRP e por celular). Se você não renovar, agenda, chamada e Luma pausam — seus prontuários continuam abertos.`,
  },
  {
    pergunta: "Como eu pago?",
    resposta: `Por Pix, todo mês ou uma vez por ano. No anual você paga ${MESES_PAGOS_NO_ANUAL} meses e leva 12. Por enquanto não aceitamos cartão.`,
  },
  {
    pergunta: "O que é a Psicóloga Fundadora?",
    resposta: `É o desconto de lançamento: as ${VAGAS_DE_FUNDADOR} primeiras psicólogas a entrar no VozInterior viram Psicólogas Fundadoras e pagam ${DESCONTO_FUNDADOR * 100}% a menos que a tabela, para sempre, enquanto forem clientes. Depois dessas vagas, vale o preço normal.`,
  },
  {
    pergunta: "Posso cancelar? E o reembolso?",
    resposta:
      "Pode, quando quiser, pelo WhatsApp ou por e-mail. Até 7 dias depois do pagamento, devolvemos tudo. Depois disso, devolvemos a parte proporcional aos dias que você não usou: no anual, por exemplo, quem cancela no 100º dia recebe de volta os outros 265. Os detalhes estão nos Termos de Uso.",
  },
  {
    pergunta: "O paciente paga alguma coisa?",
    resposta: "Não. Só a psicóloga paga; o paciente usa de graça.",
  },
];

function pacientesDoPlano(plano: Plano): string {
  if (plano.ate === null) return `Mais de ${plano.de - 1} pacientes`;
  return `Até ${plano.ate} pacientes`;
}

function itensDoPlano(plano: Plano): string[] {
  if (plano.perguntasLumaPorDia === null) {
    return [
      "Tudo do Voz",
      TEXTO_RELATORIO_DE_GESTAO,
      "Pacientes sem limite",
      "Cota da Luma e anexos sob medida",
      "Condições combinadas pelo WhatsApp",
    ];
  }
  return [
    pacientesDoPlano(plano),
    `Luma: ${plano.perguntasLumaPorDia} perguntas por dia`,
    ...(plano.lumaNoProntuario ? [TEXTO_LUMA_NO_PRONTUARIO] : []),
    `Anexos de até ${plano.anexoMaxMb} MB`,
    ...INCLUSO_EM_TODOS,
  ];
}

export default function Precos() {
  const [ciclo, setCiclo] = useState<Ciclo>("mensal");
  // Só para indicar o plano: o preço não depende dos pacientes. 31 = "mais de 30".
  const [pacientes, setPacientes] = useState(8);
  const indicado = planoPara(pacientes);
  const porPeriodo = ciclo === "anual" ? "/ano" : "/mês";

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

      <main className="max-w-5xl mx-auto px-4 py-12 md:py-16 space-y-14">
        <section className="space-y-4 text-center">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground text-balance">
            Um preço fixo. Sem surpresa no fim do mês.
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground text-pretty">
            Escolha o plano do tamanho do seu consultório. Dentro do limite de pacientes, o valor não muda.
          </p>
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-foreground">
            <li className="flex gap-2">
              <Check className="w-5 h-5 mt-0.5 shrink-0 text-primary" />
              <span>
                <strong>{DIAS_DE_TESTE_GRATIS} dias grátis</strong>, sem cartão
              </span>
            </li>
            <li className="flex gap-2">
              <Check className="w-5 h-5 mt-0.5 shrink-0 text-primary" />
              <span>
                As {VAGAS_DE_FUNDADOR} primeiras viram <strong>Psicóloga Fundadora</strong>:{" "}
                <strong>{DESCONTO_FUNDADOR * 100}% de desconto para sempre</strong>
              </span>
            </li>
          </ul>
        </section>

        <section className="space-y-6">
          <div className="flex flex-col items-center gap-5 md:flex-row md:justify-between">
            {/* Mensal ou anual: o anual é 10 meses pelo preço de 12. */}
            <div
              role="radiogroup"
              aria-label="Forma de pagamento"
              className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-lg bg-secondary/60 p-1 text-sm"
            >
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
            <div className="w-full max-w-sm space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <label htmlFor="qtd-pacientes" className="font-medium text-foreground">
                  Quantos pacientes você atende?
                </label>
                <span className="font-bold tabular-nums text-primary">
                  {pacientes > MAX_PACIENTES_NA_TABELA ? `${MAX_PACIENTES_NA_TABELA}+` : pacientes}
                </span>
              </div>
              <input
                id="qtd-pacientes"
                type="range"
                min={1}
                max={MAX_PACIENTES_NA_TABELA + 1}
                step={1}
                value={pacientes}
                onChange={(e) => setPacientes(Number(e.target.value))}
                aria-valuetext={pacientes > MAX_PACIENTES_NA_TABELA ? "mais de 30 pacientes" : `${pacientes} pacientes`}
                className="w-full h-2 cursor-pointer accent-[var(--primary)]"
              />
              <p className="text-xs text-muted-foreground">
                Indicado para você: <strong className="text-foreground">{indicado.nome}</strong>
              </p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {PLANOS.map((p) => {
              const destaque = p.id === indicado.id;
              const preco = precoDoPlano(p.id, { ciclo });
              const fundadora = precoDoPlano(p.id, { ciclo, fundador: true });
              const mensagem =
                preco === null
                  ? "Olá! Quero conversar sobre o plano Coro do VozInterior."
                  : `Olá! Quero assinar o VozInterior: plano ${p.nome}, ${ciclo} (${formatarReais(preco)}${porPeriodo}).`;
              const whats = linkWhatsAppDoSuporte(mensagem);
              return (
                <article
                  key={p.id}
                  data-plano={p.id}
                  className={`relative flex flex-col rounded-2xl border bg-card p-6 transition-shadow ${
                    destaque ? "border-2 border-primary shadow-md" : ""
                  }`}
                >
                  {destaque && (
                    <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                      Indicado para você
                    </span>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h2 className="text-2xl font-bold tracking-tight text-foreground">{p.nome}</h2>
                      <p className="text-sm text-muted-foreground">{LEMA[p.id]}</p>
                    </div>
                    <LumaDoPlano plano={p.id} className="-mt-1 h-20 w-28 text-primary" />
                  </div>
                  <div className="my-5 min-h-16">
                    {preco === null ? (
                      <p className="text-3xl font-bold text-foreground">Fale comigo</p>
                    ) : (
                      <>
                        <p className="tabular-nums">
                          <span className="text-4xl font-bold text-foreground">{formatarReais(preco)}</span>
                          <span className="text-sm text-muted-foreground"> {porPeriodo}</span>
                        </p>
                        {fundadora !== null && (
                          <p className="text-sm text-primary tabular-nums">
                            Psicóloga Fundadora: {formatarReais(fundadora)}
                            {porPeriodo}
                          </p>
                        )}
                        {ciclo === "anual" && (
                          <p className="text-xs text-muted-foreground tabular-nums">
                            Sai a {formatarReais(Math.round(preco / 12))} por mês
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  <ul className="mb-6 flex-1 space-y-2 text-sm text-foreground/90">
                    {itensDoPlano(p).map((item) => (
                      <li key={item} className="flex gap-2">
                        <Check className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  {preco === null ? (
                    whats && (
                      <Button asChild variant="outline" className="w-full gap-2">
                        <a href={whats} target="_blank" rel="noopener noreferrer">
                          <WhatsAppIcon className="w-4 h-4" /> Fale comigo
                        </a>
                      </Button>
                    )
                  ) : (
                    <Button asChild variant={destaque ? "default" : "outline"} className="w-full gap-2">
                      <Link href="/login">
                        Testar {DIAS_DE_TESTE_GRATIS} dias grátis
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="grid gap-10 md:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Como assinar</h2>
            <ol className="space-y-4">
              {[
                ["Crie sua conta", `Depois da verificação do CRP, você usa tudo por ${DIAS_DE_TESTE_GRATIS} dias, de graça, contados a partir do primeiro paciente.`],
                ["Pague por Pix", "Na aba Assinatura do sistema tem o QR code com o valor certo. Todo mês, ou uma vez por ano com 2 meses grátis."],
                ["Mande o comprovante", "Pelo WhatsApp, com um toque. A liberação é feita assim que ele chega."],
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

          <div className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Dúvidas</h2>
            <Accordion type="single" collapsible className="rounded-xl border bg-card px-4">
              {DUVIDAS.map((d) => (
                <AccordionItem key={d.pergunta} value={d.pergunta}>
                  <AccordionTrigger className="text-left">{d.pergunta}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{d.resposta}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      </main>
      <Rodape />
    </div>
  );
}
