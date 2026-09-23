import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { LumaOwlIcon } from "./Logo";
import { Calendar, CircleHelp, FileText, MessageSquare, Settings, Stethoscope, Users, Wallet, X, type LucideIcon } from "lucide-react";

/**
 * Tour de boas-vindas da Luma na PRIMEIRA entrada (paciente ou psicóloga).
 * Ele NAVEGA por cada aba e explica, ali mesmo, como fazer a ação daquela tela.
 *
 * Por que o passo vai para o sessionStorage: cada página monta o seu próprio
 * DashboardLayout, então navegar DESMONTA e REMONTA este componente. Guardando o
 * passo, o tour continua de onde parou em vez de reiniciar a cada tela.
 *
 * O card é flutuante e NÃO bloqueia a tela: a pessoa vê (e usa) a página enquanto
 * lê a explicação.
 *
 * "Já viu" fica no BANCO, por conta (users.onboardingSeenAt). A primeira versão
 * usava localStorage e o tour reaparecia a cada navegador/dispositivo, mesmo com
 * o mesmo login. Só o passo em andamento fica no sessionStorage — é transitório.
 *
 * Para rever, qualquer tela dispara `window.dispatchEvent(new Event(OPEN_ONBOARDING_EVENT))`.
 */

export const OPEN_ONBOARDING_EVENT = "luma:onboarding";
const STEP_PREFIX = "luma-onboarding-step:";

type Role = "therapist" | "patient";
// `target`: seletor CSS do elemento a destacar na PÁGINA (holofote). Sem ele
// (ex.: passo de boas-vindas), o fundo escurece por inteiro e o card fica embaixo.
type Step = { path: string; icon: LucideIcon | null; title: string; body: string; target?: string };

const therapistSteps: Step[] = [
  {
    path: "/dashboard",
    icon: null,
    title: "Oi, eu sou a Luma 🦉",
    body: "Vou passar por cada tela e destacar, na hora, onde fica cada coisa e o que fazer ali. É rápido — e você pode pular quando quiser.",
  },
  {
    path: "/records",
    icon: Users,
    title: "Cadastrar pacientes",
    body: "Aqui você cadastra e acompanha seus pacientes. Comece em “Novo Paciente”. Depois, o ícone de olho abre o prontuário: histórico, sessões, documentos e TCLE.",
    target: '[data-tour="novo-paciente"]',
  },
  {
    path: "/records",
    icon: FileText,
    title: "Modelos de prontuário",
    body: "Envie aqui o seu modelo de prontuário (PDF ou DOCX): eu passo a seguir esse formato. No mesmo lugar, você cria modelos de anotação para inserir com um clique na sessão.",
    target: '[data-tour="modelos-prontuario"]',
  },
  {
    path: "/mensagens",
    icon: MessageSquare,
    title: "Mensagens",
    body: "Converse por texto com seus pacientes e troque arquivos por aqui. É o mesmo chat que abre dentro da videochamada.",
    target: '[data-tour="mensagens"]',
  },
  {
    path: "/appointments",
    icon: Calendar,
    title: "Agendar consultas",
    body: "Marque uma consulta em “Nova Consulta”. A lista mostra as próximas no topo (com o selo “Próxima”), e você pode buscar pelo nome do paciente.",
    target: '[data-tour="nova-consulta"]',
  },
  {
    path: "/financeiro",
    icon: Wallet,
    title: "Financeiro",
    body: "O dinheiro num lugar só: quanto já entrou, quanto está pendente e o total — sem abrir consulta por consulta.",
    target: '[data-tour="financeiro"]',
  },
  {
    path: "/luma",
    icon: null,
    title: "Falar comigo",
    body: "Escolha o paciente e me peça em português (ex.: “marque a Ana quinta às 14h”). Eu monto a ação; ela só acontece quando você clicar em Confirmar.",
    target: '[data-tour="luma-composer"]',
  },
  {
    path: "/configuracoes",
    icon: Settings,
    title: "Configurações da conta",
    body: "Seus dados de acesso: e-mail, senha e telefone. Para trocar o e-mail, chega um código no seu e-mail; para a senha, peço a senha atual.",
    target: '[data-tour="config-acesso"]',
  },
  {
    path: "/ajuda",
    icon: CircleHelp,
    title: "Ajuda quando precisar",
    body: "Dúvidas comuns e o contato do suporte ficam aqui — e é por aqui que você revê este tour quando quiser. Bom trabalho! 💜",
    target: '[data-tour="ajuda"]',
  },
];

const patientSteps: Step[] = [
  {
    path: "/consultas",
    icon: null,
    title: "Oi, eu sou a Luma 🦉",
    body: "Vou te mostrar o essencial, destacando cada parte na tela. É rápido — pode pular quando quiser.",
  },
  {
    path: "/consultas",
    icon: Calendar,
    title: "Minhas Consultas",
    body: "Suas consultas ficam aqui. Toque em “Confirmar presença” e, no horário, em “Entrar na sala” para a videochamada. Na chamada, o botão “Mensagens” abre o chat.",
    target: '[data-tour="minhas-consultas"]',
  },
  {
    path: "/mensagens",
    icon: MessageSquare,
    title: "Mensagens",
    body: "Fale por texto com o seu profissional e troque arquivos, a qualquer hora.",
    target: '[data-tour="mensagens"]',
  },
  {
    path: "/psicologa",
    icon: Stethoscope,
    title: "Minha Psicóloga",
    body: "Os dados da profissional que te atende ficam aqui — útil para falar com ela fora do sistema.",
    target: '[data-tour="psicologa"]',
  },
  {
    path: "/luma",
    icon: null,
    title: "Falar comigo",
    body: "Ficou com dúvida de como usar o sistema? É só me perguntar aqui, quando quiser.",
    target: '[data-tour="luma-composer"]',
  },
  {
    path: "/configuracoes",
    icon: Settings,
    title: "Configurações da conta",
    body: "Seus dados de cadastro e o acesso da conta. Para trocar o e-mail, chega um código por e-mail; para a senha, peço a senha atual.",
    target: '[data-tour="config-dados"]',
  },
  {
    path: "/ajuda",
    icon: CircleHelp,
    title: "Ajuda quando precisar",
    body: "Dúvidas comuns e o contato do suporte ficam aqui — e dá para rever este tour por aqui. Boas-vindas! 💜",
    target: '[data-tour="ajuda"]',
  },
];

export default function LumaOnboarding({ role, userId }: { role: Role; userId?: number | string }) {
  const stepKey = userId != null ? `${STEP_PREFIX}${userId}` : null;
  const steps = role === "therapist" ? therapistSteps : patientSteps;
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  // Retângulo (coords da viewport) do elemento destacado pelo holofote. null =
  // não achou / escondido (ex.: menu recolhido no celular) → escurece tudo.
  const [alvoRect, setAlvoRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const utils = trpc.useUtils();
  // `retry: false` + tratar erro como "já viu": se o servidor falhar, o certo é
  // não mostrar o tour, e não insistir com quem talvez já o tenha concluído.
  const onboarding = trpc.me.onboarding.useQuery(undefined, { retry: false });
  const concluir = trpc.me.completeOnboarding.useMutation();

  const lerPasso = useCallback((): number | null => {
    if (!stepKey) return null;
    try {
      const valor = sessionStorage.getItem(stepKey);
      return valor === null ? null : Number(valor);
    } catch {
      return null;
    }
  }, [stepKey]);

  const salvarPasso = useCallback((i: number) => {
    if (!stepKey) return;
    try {
      sessionStorage.setItem(stepKey, String(i));
    } catch {
      /* modo privado — o tour só não sobrevive à navegação */
    }
  }, [stepKey]);

  const limparPasso = useCallback(() => {
    if (!stepKey) return;
    try {
      sessionStorage.removeItem(stepKey);
    } catch {
      /* modo privado */
    }
  }, [stepKey]);

  const marcarVisto = useCallback(() => {
    concluir.mutate();
    // Atualiza o cache na hora: sem isto, a próxima montagem (a cada navegação)
    // ainda leria "não viu" e o tour recomeçaria antes do refetch.
    utils.me.onboarding.setData(undefined, { visto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Único ponto que navega — sempre a partir de um clique (ou do início do tour),
  // nunca de um efeito de montagem, para não entrar em laço de navegação.
  const irPara = useCallback(
    (i: number) => {
      const alvo = steps[i];
      salvarPasso(i);
      setIndex(i);
      setOpen(true);
      if (alvo && window.location.pathname !== alvo.path) setLocation(alvo.path);
    },
    [steps, salvarPasso, setLocation],
  );

  // Retoma o tour depois da navegação (o layout remonta a cada tela) ou inicia na
  // primeira entrada.
  useEffect(() => {
    if (!stepKey) return;
    const salvo = lerPasso();
    if (salvo !== null && Number.isFinite(salvo)) {
      setIndex(Math.min(Math.max(0, salvo), steps.length - 1));
      setOpen(true);
      return;
    }
    // Espera a resposta do servidor antes de decidir: começar durante o load
    // faria o tour "piscar" para quem já viu.
    if (onboarding.isPending || onboarding.isError) return;
    if (onboarding.data && !onboarding.data.visto) irPara(0);
  }, [stepKey, lerPasso, irPara, steps.length, onboarding.isPending, onboarding.isError, onboarding.data]);

  // Rever depois (botão na página de Ajuda).
  useEffect(() => {
    const abrir = () => irPara(0);
    window.addEventListener(OPEN_ONBOARDING_EVENT, abrir);
    return () => window.removeEventListener(OPEN_ONBOARDING_EVENT, abrir);
  }, [irPara]);

  // Holofote: mede o elemento do passo atual (por padrão, o item de menu da rota)
  // e mantém o retângulo em dia — a página monta depois da navegação, e scroll/
  // resize mexem na posição. O render escurece tudo, menos esse retângulo.
  useEffect(() => {
    if (!open) {
      setAlvoRect(null);
      return;
    }
    const passo = steps[index];
    const sel = passo?.target ?? null;
    if (!sel) {
      // Sem alvo (ex.: passo de boas-vindas): escurece tudo e centraliza o card.
      setAlvoRect(null);
      return;
    }
    let primeira = true;
    const medir = () => {
      const el = document.querySelector(sel) as HTMLElement | null;
      const r = el?.getBoundingClientRect();
      // Sem elemento, invisível (0x0) ou fora da tela (ex.: menu recolhido no
      // celular): sem holofote — o card explica e o fundo fica escuro.
      if (
        !el || !r || r.width === 0 || r.height === 0 ||
        r.right < 0 || r.bottom < 0 || r.left > window.innerWidth || r.top > window.innerHeight
      ) {
        setAlvoRect(null);
        return;
      }
      if (primeira) {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        primeira = false;
      }
      setAlvoRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    medir();
    const intervalo = window.setInterval(medir, 300);
    const parar = window.setTimeout(() => window.clearInterval(intervalo), 3000);
    const aoMover = () => medir();
    window.addEventListener("scroll", aoMover, true);
    window.addEventListener("resize", aoMover);
    return () => {
      window.clearInterval(intervalo);
      window.clearTimeout(parar);
      window.removeEventListener("scroll", aoMover, true);
      window.removeEventListener("resize", aoMover);
    };
  }, [open, index, steps]);

  const encerrar = () => {
    marcarVisto();
    limparPasso();
    setOpen(false);
  };
  const proximo = () => {
    if (index < steps.length - 1) irPara(index + 1);
    else encerrar();
  };
  const anterior = () => {
    if (index > 0) irPara(index - 1);
  };

  if (!open) return null;
  const step = steps[index];
  if (!step) return null;
  const Icone = step.icon;
  const ultimo = index === steps.length - 1;

  return (
    <div
      /* z acima do toaster (sonner usa 999999999): os toasts nascem no mesmo
         canto de baixo e, com z-50, ficavam POR CIMA dos botões do tour —
         "Próximo" virava inclicável logo após o cadastro, que é justamente
         quando o tour abre. Um aviso transitório não pode bloquear um fluxo
         interativo; enquanto o tour está aberto, ele fica na frente. */
      className="pointer-events-none fixed inset-0 z-[1000000000]"
      role="region"
      aria-live="polite"
      aria-label="Tour de boas-vindas da Luma"
    >
      {/* Fundo modal (estilo tutorial de jogo): captura os toques para o tour
          guiar pelo botão "Próximo" — e, no celular, para tocar no escuro não
          fechar o menu aberto. Os botões do card ficam por cima e clicáveis. */}
      <div className="pointer-events-auto absolute inset-0" aria-hidden="true" />

      {/* Holofote: recorte iluminado no elemento do passo (o resto escurece pelo
          box-shadow gigante). Sem alvo (ex.: menu recolhido no celular), escurece
          tudo por igual. */}
      {alvoRect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-primary/80 transition-all duration-200"
          style={{
            left: alvoRect.left - 6,
            top: alvoRect.top - 6,
            width: alvoRect.width + 12,
            height: alvoRect.height + 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)",
          }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-black/60" />
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 sm:p-4">
      <div className="pointer-events-auto mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
        {/* Cabeçalho: ícone + rótulo do passo + título (cada um em sua linha, para
            o texto não ficar apertado) + fechar. */}
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {Icone ? <Icone className="h-5 w-5" /> : <LumaOwlIcon className="h-7 w-7" />}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              Passo {index + 1} de {steps.length}
            </p>
            <h2 className="mt-0.5 text-lg font-semibold leading-snug text-foreground">{step.title}</h2>
          </div>
          <button
            onClick={encerrar}
            aria-label="Fechar tour"
            /* Alvo de toque: com p-1 o botão media 24x24, pequeno para dedo. */
            className="-mr-1.5 -mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Corpo em largura total, com bastante respiro — antes ficava espremido
            ao lado do ícone e o texto ficava "junto". */}
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{step.body}</p>

        {/* flex-wrap: em telas estreitas as bolinhas + "Pular/Anterior/Próximo"
            passam da largura do card; sem isso, os botões saíam para fora. */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!ultimo && (
              <Button variant="ghost" size="sm" onClick={encerrar}>
                Pular
              </Button>
            )}
            {index > 0 && (
              <Button variant="outline" size="sm" onClick={anterior}>
                Anterior
              </Button>
            )}
            <Button size="sm" onClick={proximo}>
              {ultimo ? "Concluir" : "Próximo"}
            </Button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
