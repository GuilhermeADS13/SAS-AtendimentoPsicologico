import { useAuth } from "@/_core/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { LogoLockup } from "@/components/Logo";
import { LumaDoPlano, LumaFlutuante } from "@/components/LumaDoPlano";
import { Rodape } from "@/components/Rodape";
import { WhatsAppFlutuante } from "@/components/WhatsAppFlutuante";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  Check,
  FileText,
  KeyRound,
  Lock,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Video,
  Wallet,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { LINK_CADASTRO_PSICOLOGA } from "@shared/entradaNoSite";
import { entrarNaDemonstracao } from "@/lib/demonstracao";
import {
  DESCONTO_FUNDADOR,
  DIAS_DE_TESTE_GRATIS,
  PLANOS,
  TEXTO_LUMA_NO_PRONTUARIO,
  TEXTO_RELATORIO_DE_GESTAO,
  VAGAS_DE_FUNDADOR,
  formatarReais,
} from "@shared/precos";
import { MAX_PESSOAS_NA_CHAMADA } from "@shared/chamadaEmGrupo";

/**
 * Home pública. Repaginada em 2026-11-06: as telas são do próprio sistema, com
 * dados fictícios (public/home/*.webp, recortadas das telas do Instagram; a do
 * paciente sem o QR do Pix). Nada de número, depoimento ou cliente inventado:
 * ainda não há clientes. Preços e vagas saem de shared/precos.ts, como em /precos.
 */

const MENOR_PRECO = formatarReais(PLANOS[0].precoCentavos ?? 0);

/** Os 4 momentos do dia a dia, alternando texto e tela. */
const ROTINA: {
  id: string;
  icone: typeof Video;
  rotulo: string;
  titulo: string;
  itens: string[];
  imagem: string;
  alt: string;
}[] = [
  {
    id: "agenda",
    icone: Video,
    rotulo: "Agenda e videochamada",
    titulo: "Marque, lembre e atenda sem sair do navegador",
    itens: [
      "Consulta avulsa ou toda semana no mesmo horário, com o valor da sessão.",
      "Lembrete por e-mail na véspera, e o paciente confirma a presença.",
      `Videochamada sem instalar nada, também para casal e família: até ${MAX_PESSOAS_NA_CHAMADA} pessoas.`,
      "A chamada é protegida de ponta a ponta e não é gravada.",
    ],
    imagem: "/home/agenda.webp",
    alt: "Tela de agendamentos com uma consulta marcada, presença confirmada e os botões para entrar na videochamada e avisar no WhatsApp",
  },
  {
    id: "prontuario",
    icone: FileText,
    rotulo: "Prontuário",
    titulo: "O prontuário no formato que o CFP pede",
    itens: [
      "Anamnese, TCLE, sessões e a evolução do paciente numa linha do tempo.",
      "14 modelos de registro de sessão, como SOAP, DAP, BIRP, TCC, infantil e casal.",
      "O sistema avisa o que ainda falta, seguindo a Resolução CFP 001/2009.",
      "Baixe o prontuário em PDF ou Word quando precisar.",
    ],
    imagem: "/home/prontuario.webp",
    alt: "Prontuário de um paciente de exemplo, com as abas Anamnese, Sessões, Evolução, Documentos, TCLE e Pagamentos",
  },
  {
    id: "financeiro",
    icone: Wallet,
    rotulo: "Financeiro e Pix",
    titulo: "Receba por Pix, direto na sua conta",
    itens: [
      "O paciente paga pelo QR code ou pelo copia e cola, já com o valor.",
      "Ele avisa que pagou e você só confere e confirma.",
      "Veja quem ainda não pagou e cobre no WhatsApp com um toque.",
      "Sem taxa por consulta: o dinheiro vai direto para você.",
    ],
    imagem: "/home/financeiro.webp",
    alt: "Tela do Financeiro com o recebido no mês, um pagamento para confirmar e a lista de quem ainda não pagou, com o botão Cobrar no WhatsApp",
  },
  {
    id: "mensagens",
    icone: MessageCircle,
    rotulo: "Mensagens",
    titulo: "Converse com o paciente fora do seu WhatsApp pessoal",
    itens: [
      "Conversas privadas: só você e o paciente veem.",
      "Envie arquivos, emojis e GIFs, e veja quando a mensagem foi lida.",
      "Compartilhe um laudo ou atestado com o paciente só quando decidir.",
    ],
    imagem: "/home/mensagens.webp",
    alt: "Tela de mensagens com a lista de conversas com pacientes e as não lidas no topo",
  },
];

const LUMA_FAZ = [
  { titulo: "Agenda", texto: "Mostra, marca, remarca e cancela consultas, sempre como proposta para você confirmar." },
  { titulo: "Estrutura do prontuário", texto: "Monta modelos em branco e explica o que o CFP pede. A partir do plano Voz." },
  { titulo: "Pagamentos", texto: "Registra o pagamento de uma consulta quando você pede." },
];

const LUMA_NAO_FAZ = [
  "Não lê prontuários, sessões nem documentos.",
  "Nada muda na agenda sem o seu clique em Confirmar.",
  "Não diagnostica e não prescreve.",
];

const SIGILO = [
  { icone: BadgeCheck, titulo: "CRP verificado", texto: "O acesso profissional só é liberado depois da verificação do CRP no Cadastro Nacional de Psicólogos." },
  { icone: Lock, titulo: "Prontuário só seu", texto: "No sistema, só você abre os prontuários dos seus pacientes. Documentos ficam em armazenamento privado." },
  { icone: Video, titulo: "Chamada protegida", texto: "A videochamada é protegida de ponta a ponta e não é gravada." },
  { icone: KeyRound, titulo: "Aparelho novo pede código", texto: "Entrou de um aparelho novo? Um código chega no seu e-mail. Você vê e remove os aparelhos conectados." },
  { icone: ShieldCheck, titulo: "LGPD", texto: "Política de privacidade pública e os seus dados para baixar quando quiser." },
  { icone: Smartphone, titulo: "Sem instalar", texto: "Funciona no navegador do computador e do celular. Dá para entrar com e-mail ou com o Google." },
];

const PACIENTE = [
  "Vê as próximas consultas, confirma a presença e entra na sala com um toque.",
  "Paga por Pix, com o valor certo, e avisa que pagou.",
  "Conversa com você e recebe os documentos que você compartilhar.",
  "Não paga nada para usar.",
];

/** Moldura de janela para as telas do sistema. */
function Janela({ src, alt, largura, altura, prioridade = false }: { src: string; alt: string; largura: number; altura: number; prioridade?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-primary/10">
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-3 py-2" aria-hidden>
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
        <span className="size-2.5 rounded-full bg-border" />
      </div>
      <img
        src={src}
        alt={alt}
        width={largura}
        height={altura}
        loading={prioridade ? "eager" : "lazy"}
        decoding="async"
        {...(prioridade ? { fetchPriority: "high" as const } : {})}
        className="block h-auto w-full"
      />
    </div>
  );
}

function Rotulo({ children, claro = false }: { children: ReactNode; claro?: boolean }) {
  return (
    <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${claro ? "text-primary-foreground/75" : "text-primary"}`}>
      {children}
    </p>
  );
}

export default function Home() {
  const { isAuthenticated } = useAuth();
  const { isTherapist } = useRole();
  const [, setLocation] = useLocation();

  // Redireciona autenticados conforme o papel (efeito, nunca durante o render).
  useEffect(() => {
    if (isAuthenticated) setLocation(isTherapist ? "/dashboard" : "/consultas");
  }, [isAuthenticated, isTherapist, setLocation]);

  const irPara = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 bg-background/85 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <LogoLockup markClassName="w-8 h-8" />
          {/* "Testar grátis" sempre à vista. No celular, os atalhos saem para caber. */}
          <div className="flex items-center gap-1 sm:gap-2">
            <Button onClick={() => irPara("funcionalidades")} size="sm" variant="ghost" className="hidden md:inline-flex">
              Funcionalidades
            </Button>
            <Button onClick={() => irPara("luma")} size="sm" variant="ghost" className="hidden md:inline-flex">
              Luma
            </Button>
            <Button onClick={() => setLocation("/precos")} size="sm" variant="ghost" className="hidden sm:inline-flex">
              Preços
            </Button>
            <Button onClick={() => setLocation("/login")} size="sm" variant="ghost">
              Entrar
            </Button>
            <Button onClick={() => setLocation(LINK_CADASTRO_PSICOLOGA)} size="sm">
              Testar grátis
            </Button>
          </div>
        </div>
      </nav>

      <main>
        {/* Topo */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-24 h-[480px] bg-[radial-gradient(ellipse_at_top,_var(--brand-sand)_0%,_transparent_65%)] opacity-40"
          />
          <div className="container relative mx-auto px-6 pt-16 pb-20 md:pt-20">
            <div className="mx-auto max-w-3xl text-center">
              <Rotulo>Para psicólogas e psicólogos</Rotulo>
              <h1 className="mt-4 text-4xl md:text-6xl font-bold text-foreground leading-[1.1] tracking-tight text-balance">
                Agenda, prontuário, videochamada e Pix{" "}
                <span className="text-primary">num lugar só</span>
              </h1>
              <p className="mt-6 text-lg md:text-xl text-muted-foreground leading-relaxed text-pretty">
                Por um preço fixo, a partir de {MENOR_PRECO} por mês. Você cuida do paciente; o VozInterior cuida do resto.
              </p>
              <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={() => setLocation(LINK_CADASTRO_PSICOLOGA)} size="lg" className="gap-2">
                  Testar grátis por {DIAS_DE_TESTE_GRATIS} dias
                  <ArrowRight className="w-4 h-4" />
                </Button>
                {/* O sistema de verdade, com dados fictícios e sem cadastro (lib/demonstracao.ts). */}
                <Button onClick={() => entrarNaDemonstracao()} size="lg" variant="outline">
                  Ver por dentro, sem cadastro
                </Button>
              </div>
              <ul className="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {["Sem cartão", "Acesso só com CRP verificado", "O paciente não paga nada"].map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5">
                    <Check className="size-4 text-primary" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mx-auto mt-14 max-w-5xl">
              <Janela
                src="/home/painel.webp"
                alt="Painel do VozInterior com as consultas do dia, os pacientes, os atendimentos do mês, o valor a receber e o atalho para a Luma"
                largura={1600}
                altura={1000}
                prioridade
              />
            </div>
          </div>
        </section>

        {/* Dia a dia */}
        <section id="funcionalidades" className="scroll-mt-16 border-t border-border bg-secondary/40">
          <div className="container mx-auto px-6 py-20 md:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <Rotulo>O dia a dia do consultório</Rotulo>
              <h2 className="mt-3 text-3xl md:text-4xl font-bold text-foreground tracking-tight text-balance">
                Do agendamento ao Pix, sem pular de aplicativo
              </h2>
              <p className="mt-4 text-lg text-muted-foreground text-pretty">
                Sem alternar entre agenda, planilha, aplicativo de vídeo e o WhatsApp pessoal.
              </p>
            </div>

            <div className="mt-16 space-y-20 md:space-y-28">
              {ROTINA.map(({ id, icone: Icone, rotulo, titulo, itens, imagem, alt }, i) => (
                <div key={id} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
                  <div className={i % 2 === 1 ? "lg:order-2" : undefined}>
                    <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                      <Icone className="size-4" aria-hidden />
                      {rotulo}
                    </div>
                    <h3 className="mt-4 text-2xl md:text-3xl font-bold text-foreground tracking-tight text-balance">{titulo}</h3>
                    <ul className="mt-6 space-y-3">
                      {itens.map((item) => (
                        <li key={item} className="flex gap-3 text-muted-foreground leading-relaxed">
                          <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Janela src={imagem} alt={alt} largura={1200} altura={873} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Luma */}
        <section id="luma" className="scroll-mt-16 relative overflow-hidden bg-primary text-primary-foreground">
          <div className="container mx-auto px-6 py-20 md:py-24">
            <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
              <div>
                <div className="flex items-center gap-5">
                  <LumaFlutuante>
                    <img
                      src="/luma-3d.webp"
                      alt=""
                      aria-hidden="true"
                      width={112}
                      height={112}
                      loading="lazy"
                      className="size-24 rounded-[28%] object-cover sm:size-28"
                    />
                  </LumaFlutuante>
                  <div>
                    <Rotulo claro>A sua assistente</Rotulo>
                    <h2 className="mt-2 text-3xl md:text-4xl font-bold tracking-tight">Conheça a Luma</h2>
                  </div>
                </div>
                <p className="mt-6 text-lg leading-relaxed text-primary-foreground/85 text-pretty">
                  Peça numa frase, como “marca a Ana toda quinta às 14h”. A Luma prepara tudo e mostra o resumo. Você
                  confere e toca em Confirmar.
                </p>
                <div className="mt-8 space-y-4">
                  {LUMA_FAZ.map(({ titulo, texto }) => (
                    <div key={titulo} className="flex gap-3">
                      <Sparkles className="mt-1 size-4 shrink-0 opacity-80" aria-hidden />
                      <p className="leading-relaxed">
                        <strong className="font-semibold">{titulo}.</strong>{" "}
                        <span className="text-primary-foreground/80">{texto}</span>
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-8 rounded-xl bg-white/10 p-5 ring-1 ring-white/15">
                  <p className="flex items-center gap-2 font-semibold">
                    <ShieldCheck className="size-4" aria-hidden />
                    O que a Luma não faz
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-primary-foreground/85">
                    {LUMA_NAO_FAZ.map((t) => (
                      <li key={t} className="flex gap-2">
                        <Lock className="mt-0.5 size-3.5 shrink-0 opacity-75" aria-hidden />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <Janela
                src="/home/luma.webp"
                alt="Conversa com a Luma: ela preparou 4 consultas semanais com uma paciente e espera a confirmação da psicóloga"
                largura={1200}
                altura={873}
              />
            </div>
          </div>
        </section>

        {/* Sigilo */}
        <section className="container mx-auto px-6 py-20 md:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <Rotulo>Sigilo e CFP</Rotulo>
            <h2 className="mt-3 text-3xl md:text-4xl font-bold text-foreground tracking-tight text-balance">
              Feito para o sigilo do consultório
            </h2>
          </div>
          <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {SIGILO.map(({ icone: Icone, titulo, texto }) => (
              <div key={titulo} className="rounded-xl border border-border bg-card p-6">
                <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10">
                  <Icone className="size-5 text-primary" aria-hidden />
                </div>
                <h3 className="mt-5 font-semibold text-foreground">{titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{texto}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Paciente */}
        <section className="border-y border-border bg-secondary/40">
          <div className="container mx-auto grid items-center gap-10 px-6 py-20 md:py-24 lg:grid-cols-2 lg:gap-14">
            <div className="mx-auto w-full max-w-md lg:order-2">
              <div className="overflow-hidden rounded-[2rem] border-8 border-foreground/85 bg-background p-3 shadow-xl shadow-primary/10">
                <img
                  src="/home/paciente.webp"
                  alt="Tela do paciente no celular: a próxima consulta, com os botões Confirmar presença, Entrar na sala e Adicionar à agenda"
                  width={640}
                  height={481}
                  loading="lazy"
                  decoding="async"
                  className="block h-auto w-full rounded-xl"
                />
              </div>
            </div>
            <div>
              <Rotulo>Para o seu paciente</Rotulo>
              <h2 className="mt-3 text-3xl md:text-4xl font-bold text-foreground tracking-tight text-balance">
                Simples para quem está do outro lado
              </h2>
              <p className="mt-4 text-lg text-muted-foreground text-pretty">
                Você cadastra o paciente pelo e-mail; ele cria a conta e já encontra tudo pronto, no celular ou no computador.
              </p>
              <ul className="mt-6 space-y-3">
                {PACIENTE.map((t) => (
                  <li key={t} className="flex gap-3 text-muted-foreground leading-relaxed">
                    <CalendarCheck className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Planos */}
        <section className="container mx-auto px-6 py-20 md:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <Rotulo>Planos</Rotulo>
            <h2 className="mt-3 text-3xl md:text-4xl font-bold text-foreground tracking-tight text-balance">
              Um preço fixo, sem surpresa no fim do mês
            </h2>
            <p className="mt-4 text-lg text-muted-foreground text-pretty">
              Todos os planos têm agenda, prontuário, videochamada, mensagens, financeiro e a Luma. Muda a quantidade.
            </p>
          </div>
          <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {PLANOS.map((p) => (
              <div
                key={p.id}
                className={`flex flex-col rounded-2xl border bg-card p-6 ${p.id === "max" ? "border-primary shadow-lg shadow-primary/10" : "border-border"}`}
              >
                <LumaDoPlano plano={p.id} className="h-16 w-24 text-primary" />
                <h3 className="mt-3 text-xl font-bold text-foreground">{p.nome}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {p.ate === null ? `Mais de ${p.de - 1} pacientes, clínicas e equipes` : `Até ${p.ate} pacientes`}
                </p>
                <p className="mt-4 text-3xl font-bold tabular-nums text-foreground">
                  {p.precoCentavos === null ? "Sob medida" : formatarReais(p.precoCentavos)}
                  {p.precoCentavos !== null && <span className="text-base font-medium text-muted-foreground">/mês</span>}
                </p>
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                    <li className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      {p.perguntasLumaPorDia === null ? "Cota da Luma sob medida" : `Luma: ${p.perguntasLumaPorDia} perguntas por dia`}
                    </li>
                    {p.lumaNoProntuario && (
                      <li className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        {TEXTO_LUMA_NO_PRONTUARIO}
                      </li>
                    )}
                    {p.relatorioDeGestao && (
                      <li className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        {TEXTO_RELATORIO_DE_GESTAO}
                      </li>
                    )}
                </ul>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-8 flex max-w-5xl flex-col items-center gap-4 rounded-2xl bg-accent px-6 py-5 text-center sm:flex-row sm:justify-between sm:text-left">
            <p className="text-sm text-accent-foreground">
              <Sparkles className="mr-1.5 inline size-4 align-[-2px]" aria-hidden />
              As {VAGAS_DE_FUNDADOR} primeiras viram <strong>Psicóloga Fundadora</strong> e pagam{" "}
              {DESCONTO_FUNDADOR * 100}% a menos, para sempre.
            </p>
            <Button onClick={() => setLocation("/precos")} variant="outline" className="shrink-0 gap-2 bg-card">
              Ver planos e perguntas
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>

        {/* Chamada final */}
        <section className="container mx-auto px-6 pb-24">
          <div className="rounded-2xl bg-primary px-6 py-16 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground tracking-tight text-balance">
              Comece o seu teste grátis
            </h2>
            <p className="mt-4 text-lg text-primary-foreground/80 max-w-xl mx-auto text-pretty">
              {DIAS_DE_TESTE_GRATIS} dias com tudo liberado, sem cartão. Eles só começam a contar quando você cadastra o
              primeiro paciente.
            </p>
            <Button
              onClick={() => setLocation(LINK_CADASTRO_PSICOLOGA)}
              size="lg"
              variant="secondary"
              className="mt-8 gap-2"
            >
              Criar minha conta
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </section>
      </main>

      <Rodape />
      <WhatsAppFlutuante />
    </div>
  );
}
