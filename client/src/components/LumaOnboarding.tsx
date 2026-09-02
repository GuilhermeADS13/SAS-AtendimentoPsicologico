import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { LumaOwlIcon } from "./Logo";
import { Calendar, CircleHelp, Stethoscope, UserRound, Users, Wallet, X, type LucideIcon } from "lucide-react";

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
type Step = { path: string; icon: LucideIcon | null; title: string; body: string };

const therapistSteps: Step[] = [
  {
    path: "/dashboard",
    icon: null,
    title: "Oi, eu sou a Luma 🦉",
    body: "Vou te levar por cada área e mostrar como fazer as coisas. Leva menos de um minuto — e você pode pular quando quiser.",
  },
  {
    path: "/records",
    icon: Users,
    title: "Pacientes",
    body: "Para cadastrar alguém: clique em “Novo Paciente”, preencha os dados e confirme em “Cadastrar”. Depois, use a busca para encontrar um paciente e o ícone de olho para abrir o prontuário.",
  },
  {
    path: "/appointments",
    icon: Calendar,
    title: "Agendamentos",
    body: "Para marcar: clique em “Nova Consulta”, escolha o paciente, a data, a duração e o valor. Na lista, clique em “Pago / Pagamento pendente” para trocar o pagamento, e use os ícones para editar, entrar na sala ou cancelar.",
  },
  {
    path: "/financeiro",
    icon: Wallet,
    title: "Financeiro",
    body: "O resumo do dinheiro: o que já foi recebido e o que está pendente, com o total. Serve para acompanhar sem abrir consulta por consulta.",
  },
  {
    path: "/luma",
    icon: null,
    title: "Falar comigo",
    body: "Escolha o paciente no topo e me peça em português mesmo: “marque a Ana quinta às 14h”. Eu preparo a ação e você confirma no botão — nada acontece sem o seu “sim”.",
  },
  {
    path: "/ajuda",
    icon: CircleHelp,
    title: "Ajuda quando precisar",
    body: "As dúvidas mais comuns estão aqui, junto do contato do suporte. E é por aqui que você pode rever este tour depois. Pronto — bom trabalho! 💜",
  },
];

const patientSteps: Step[] = [
  {
    path: "/consultas",
    icon: null,
    title: "Oi, eu sou a Luma 🦉",
    body: "Vou te mostrar o sistema rapidinho, passando por cada tela. Pode pular quando quiser.",
  },
  {
    path: "/consultas",
    icon: Calendar,
    title: "Minhas Consultas",
    body: "Aqui ficam as suas consultas. Use “Confirmar presença” para avisar que vai comparecer e, no horário marcado, clique em “Entrar na sala” para abrir a videochamada.",
  },
  {
    path: "/psicologa",
    icon: Stethoscope,
    title: "Minha Psicóloga",
    body: "Os dados da profissional que te atende ficam aqui — útil quando precisar falar com ela fora do sistema.",
  },
  {
    path: "/profile",
    icon: UserRound,
    title: "Meu Cadastro",
    body: "Mantenha telefone e e-mail atualizados aqui: é por eles que chegam os lembretes das suas consultas.",
  },
  {
    path: "/luma",
    icon: null,
    title: "Falar comigo",
    body: "Ficou com dúvida de como usar o sistema? É só me perguntar aqui, a qualquer hora.",
  },
  {
    path: "/ajuda",
    icon: CircleHelp,
    title: "Ajuda quando precisar",
    body: "As dúvidas mais comuns estão aqui, junto do contato do suporte — e dá para rever este tour por aqui. Boas-vindas! 💜",
  },
];

export default function LumaOnboarding({ role, userId }: { role: Role; userId?: number | string }) {
  const stepKey = userId != null ? `${STEP_PREFIX}${userId}` : null;
  const steps = role === "therapist" ? therapistSteps : patientSteps;
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4"
      role="region"
      aria-live="polite"
      aria-label="Tour de boas-vindas da Luma"
    >
      <div className="pointer-events-auto mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {Icone ? <Icone className="h-5 w-5" /> : <LumaOwlIcon className="h-6 w-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-foreground">{step.title}</h2>
              <span className="shrink-0 text-xs text-muted-foreground">
                {index + 1} de {steps.length}
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </div>
          <button
            onClick={encerrar}
            aria-label="Fechar tour"
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
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
  );
}
