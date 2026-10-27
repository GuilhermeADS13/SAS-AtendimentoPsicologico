import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { LumaOwlIcon } from "./Logo";
import { Calendar, CircleHelp, ClipboardList, FileText, Filter, FolderOpen, MessageSquare, Settings, Stethoscope, TrendingUp, Users, Wallet, X, type LucideIcon } from "lucide-react";

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
/**
 * O tour pede ao prontuário para abrir uma aba (detail = valor da aba). O
 * prontuário ouve este evento; o tour repete o pedido até o conteúdo aparecer,
 * porque a página pode montar depois da navegação.
 */
export const ABA_DO_TOUR_EVENT = "luma:aba-do-prontuario";
/** Passos que acontecem DENTRO de um prontuário: o de exemplo (ver prontuarioExemplo.ts). */
const PRONTUARIO = "/records/exemplo";
const STEP_PREFIX = "luma-onboarding-step:";

type Role = "therapist" | "patient";
// `target`: seletor CSS do elemento a destacar na PÁGINA (holofote). Sem ele
// (ex.: passo de boas-vindas), o fundo escurece por inteiro e o card fica embaixo.
// `alinharPeloFim`: alvo mais alto que o espaço livre cujo ponto principal fica
// embaixo (o chat da Luma, com o campo de escrever no fim).
// `aba`: no prontuário, a aba que o passo abre (ver ABA_DO_TOUR_EVENT).
type Step = { path: string; icon: LucideIcon | null; title: string; body: string; target?: string; alinharPeloFim?: boolean; aba?: string };

const therapistSteps: Step[] = [
  {
    path: "/dashboard",
    icon: null,
    title: "Oi, eu sou a Luma 🦉",
    body: "Vou te mostrar cada tela do sistema e o que dá para fazer nela. Leva um minuto. Se preferir, toque em “Pular”.",
  },
  {
    path: "/dashboard",
    icon: null,
    title: "Perguntas prontas no painel",
    body: "Aqui ficam perguntas prontas, como “Quem eu atendo hoje?”. Toque numa delas e eu respondo na hora. E fique de olho no sininho lá em cima: ele toca e avisa quando tem novidade.",
    target: '[data-tour="luma-painel"]',
  },
  {
    path: "/records",
    icon: Users,
    title: "Cadastrar pacientes",
    body: "Comece por aqui: toque em “Novo Paciente” para cadastrar. Depois, o ícone de olho abre o prontuário, com histórico, sessões, a evolução em linha do tempo, documentos e TCLE.",
    target: '[data-tour="novo-paciente"]',
  },
  {
    path: "/records",
    icon: FileText,
    title: "Modelos de prontuário",
    body: "Tem um modelo de prontuário seu? Envie aqui (PDF ou Word) e eu passo a escrever nesse formato. Aqui também você cria textos prontos para inserir nas anotações com um clique.",
    target: '[data-tour="modelos-prontuario"]',
  },
  // Dentro do prontuário: o de EXEMPLO (dados fictícios), para quem ainda não
  // tem paciente também ver — e para o tour não expor um prontuário real na tela.
  {
    path: PRONTUARIO,
    icon: FileText,
    aba: "info",
    title: "O prontuário do paciente",
    body: "Este é o prontuário: tudo do paciente num lugar só. Em “Editar dados” você corrige o cadastro, e “Baixar prontuário” gera o PDF ou Word para guardar.",
    target: '[data-tour="prontuario-topo"]',
  },
  // Uma aba por passo: o tour ABRE a aba (aba: ...) e destaca o conteúdo dela.
  {
    path: PRONTUARIO,
    aba: "info",
    icon: ClipboardList,
    title: "Informações",
    body: "Dados e contato do paciente e o plano clínico: demanda inicial, objetivos e encerramento, como pede o registro do CFP.",
    target: '[data-tour="aba-info"]',
  },
  {
    path: PRONTUARIO,
    aba: "anamnese",
    icon: ClipboardList,
    title: "Anamnese",
    body: "A ficha da primeira sessão, com a história do paciente. Dá para completar aos poucos: toque em “Salvar anamnese” quando quiser.",
    target: '[data-tour="aba-anamnese"]',
  },
  {
    path: PRONTUARIO,
    aba: "sessions",
    icon: MessageSquare,
    title: "Sessões",
    body: "Registre cada atendimento em “Nova Sessão”: comece pelo SOAP ou abra “Mais modelos” (TCC, primeira sessão, criança, casal, risco, encerramento…). O que você escreve em “Anotações” durante a videochamada também chega aqui.",
    target: '[data-tour="aba-sessions"]',
  },
  {
    path: PRONTUARIO,
    aba: "evolucao",
    icon: TrendingUp,
    title: "Evolução",
    body: "A história do acompanhamento: um cartão por sessão, com marcos como o início e os retornos. Em “Classificar” você dá a nota de humor e a fase, e o gráfico mostra a evolução. A frequência você ajusta em “Alterar”.",
    target: '[data-tour="aba-evolucao"]',
  },
  {
    path: PRONTUARIO,
    aba: "documents",
    icon: FolderOpen,
    title: "Documentos",
    body: "Guarde arquivos do paciente, como PDF, fotos e Word, e abra quando precisar.",
    target: '[data-tour="aba-documents"]',
  },
  {
    path: PRONTUARIO,
    aba: "tcle",
    icon: FileText,
    title: "TCLE",
    body: "O termo de consentimento do contrato terapêutico: preencha os termos e gere o PDF para o paciente assinar.",
    target: '[data-tour="aba-tcle"]',
  },
  {
    path: PRONTUARIO,
    aba: "pagamentos",
    icon: Wallet,
    title: "Pagamentos",
    body: "O valor de cada consulta deste paciente, o que já foi pago e o que falta. Dá para marcar como pago ali mesmo.",
    target: '[data-tour="aba-pagamentos"]',
  },
  {
    path: "/mensagens",
    icon: MessageSquare,
    title: "Mensagens",
    body: "Converse com seus pacientes e envie arquivos, emojis e GIFs. Dois tiques (✓✓) quer dizer que a pessoa leu. Para achar uma mensagem antiga, use a lupa. Mandou errado? Toque na setinha da sua mensagem para editar (até 15 min) ou apagar para todos (até 2 dias).",
    target: '[data-tour="mensagens"]',
  },
  {
    path: "/appointments",
    icon: Calendar,
    title: "Agendamentos e videochamada",
    body: "Toque em “Nova Consulta” para marcar. Terapia de casal ou com os responsáveis da criança? Use “Convidar participantes”: até 4 pessoas na chamada. Na hora, toque em “Entrar na videochamada” na consulta.",
    target: '[data-tour="nova-consulta"]',
  },
  {
    path: "/appointments",
    icon: Filter,
    title: "Filtros",
    body: "Ache uma consulta rápido: busque pelo nome do paciente e filtre por situação (agendadas, a confirmar, realizadas, canceladas), por pagamento e por data. Para mudar o pagamento, toque em “Pagamento pendente · alterar”.",
    target: '[data-tour="filtros-agenda"]',
  },
  {
    path: "/financeiro",
    icon: Wallet,
    title: "Financeiro",
    body: "Veja quanto já recebeu e quanto falta receber. As setas trocam a semana, o mês ou o ano. Embaixo aparece quem ainda não pagou: dá para lembrar pelo WhatsApp ou marcar como pago.",
    target: '[data-tour="financeiro"]',
  },
  {
    path: "/luma",
    icon: null,
    title: "Falar comigo",
    body: "Escolha o paciente e me peça do seu jeito, por exemplo: “marque a Ana quinta às 14h”. Eu preparo tudo, mas nada acontece até você tocar em “Confirmar”. Para mudar de assunto, use “Nova conversa”.",
    target: '[data-tour="luma-chat"]',
    alinharPeloFim: true,
  },
  {
    path: "/configuracoes",
    icon: Settings,
    title: "Configurações da conta",
    body: "Aqui você troca seu e-mail, senha e telefone. Para mudar o e-mail, mando um código para ele. Para mudar a senha, peço a senha atual — é pela sua segurança.",
    target: '[data-tour="config-acesso"]',
  },
  {
    path: "/ajuda",
    icon: CircleHelp,
    title: "Ajuda quando precisar",
    body: "Ficou com dúvida? Aqui estão as respostas mais comuns e o contato do suporte. Você também pode rever este tour por aqui. Bom trabalho! 💜",
    target: '[data-tour="ajuda"]',
  },
];

const patientSteps: Step[] = [
  {
    path: "/consultas",
    icon: null,
    title: "Oi, eu sou a Luma 🦉",
    body: "Vou te mostrar como usar o sistema, uma tela de cada vez. Leva um minuto. Se preferir, toque em “Pular”.",
  },
  {
    path: "/consultas",
    icon: Calendar,
    title: "Minhas Consultas",
    body: "Suas consultas aparecem aqui. Toque em “Confirmar presença” para avisar que vai. Na hora marcada, toque em “Entrar na sala” para a videochamada. O sininho lá em cima avisa quando uma consulta é marcada, lembrada ou cancelada.",
    target: '[data-tour="minhas-consultas"]',
  },
  {
    path: "/mensagens",
    icon: MessageSquare,
    title: "Mensagens",
    body: "Converse com a sua psicóloga quando quiser e envie arquivos, emojis e GIFs. Dois tiques (✓✓) quer dizer que ela já leu. Para achar uma mensagem antiga, use a lupa. Mandou errado? Toque na setinha da sua mensagem para editar (até 15 min) ou apagar para todos (até 2 dias).",
    target: '[data-tour="chat-composer"]',
  },
  {
    path: "/psicologa",
    icon: Stethoscope,
    title: "Minha Psicóloga",
    body: "Aqui estão os dados da sua psicóloga, inclusive o contato para falar com ela fora do sistema.",
    target: '[data-tour="psicologa"]',
  },
  {
    path: "/luma",
    icon: null,
    title: "Falar comigo",
    body: "Não sabe onde fica alguma coisa? Escreva aqui ou toque numa sugestão. Eu respondo e já sugiro o próximo passo.",
    target: '[data-tour="luma-chat"]',
    alinharPeloFim: true,
  },
  {
    path: "/configuracoes",
    icon: Settings,
    title: "Configurações da conta",
    body: "Aqui ficam seus dados de cadastro, como o telefone, e o acesso à conta. Para mudar o e-mail, mando um código para ele. Para mudar a senha, peço a senha atual.",
    target: '[data-tour="config-dados"]',
  },
  {
    path: "/ajuda",
    icon: CircleHelp,
    title: "Ajuda quando precisar",
    body: "Ficou com dúvida? Aqui estão as respostas mais comuns e o contato do suporte. Você também pode rever este tour por aqui. Boas-vindas! 💜",
    target: '[data-tour="ajuda"]',
  },
];

/**
 * Topo e altura do recorte, sem nunca subir por cima da barra fixa do topo.
 *
 * Alvo colado na barra (Configurações no celular) ou mais alto que a tela (a seção
 * inteira da Luma) fazia o anel e a área iluminada passarem POR CIMA do cabeçalho:
 * o holofote parecia "recortado errado". Agora o recorte começa logo abaixo dela.
 */
function recorteAbaixoDaBarra(r: { top: number; height: number }): { top: number; height: number } {
  const barra = document.querySelector("[data-barra-topo]")?.getBoundingClientRect().bottom ?? 0;
  const topo = Math.max(r.top - 6, barra + 4);
  const fundo = r.top + r.height + 6;
  return { top: topo, height: Math.max(0, fundo - topo) };
}

export default function LumaOnboarding({ role, userId }: { role: Role; userId?: number | string }) {
  const stepKey = userId != null ? `${STEP_PREFIX}${userId}` : null;
  const steps = role === "therapist" ? therapistSteps : patientSteps;
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  // Retângulo (coords da viewport) do elemento destacado pelo holofote. null =
  // não achou / escondido (ex.: menu recolhido no celular) → escurece tudo.
  const [alvoRect, setAlvoRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  // O card do tour, para saber quanto do rodapé ele cobre (no celular, ~320px).
  const cardRef = useRef<HTMLDivElement>(null);

  // Enquanto o tour está aberto, a página ganha folga no fim: sem ela, um alvo que
  // é o ÚLTIMO item da página (o cartão da Luma no painel, no celular) não tinha
  // para onde rolar e ficava atrás do card do tour.
  useEffect(() => {
    if (!open) return;
    const anterior = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "50vh";
    return () => {
      document.body.style.paddingBottom = anterior;
    };
  }, [open]);

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
    let achou = false;
    const medir = () => {
      // Passo de uma aba do prontuário: pede para abri-la até o conteúdo existir
      // (aba fechada não é desenhada, então o alvo só aparece depois).
      if (passo.aba && !achou) window.dispatchEvent(new CustomEvent(ABA_DO_TOUR_EVENT, { detail: passo.aba }));
      const el = document.querySelector(sel) as HTMLElement | null;
      let r = el?.getBoundingClientRect();
      // Rola até o elemento ANTES de checar se está na tela. Antes a checagem vinha
      // primeiro: um alvo abaixo da dobra (no celular, o cartão da Luma no painel)
      // era dado como "fora da tela" e o tour nunca rolava até ele. "center" para
      // ele não ficar escondido atrás do card do tour, que fica no rodapé.
      if (el && r && r.width > 0 && r.height > 0 && primeira) {
        primeira = false;
        // Faixa livre: abaixo da barra do topo (~72px) e acima do card do tour.
        // Rola quando o alvo está fora da tela, ou quando CABE na faixa mas está
        // atrás do card (no celular, o cartão da Luma no painel ficava com as
        // perguntas escondidas). Alvo maior que a faixa e já com o topo visível:
        // não mexe — rolar não o mostraria inteiro mesmo.
        // Medido, e não fixo: o alvo que começava ATRÁS da barra (topo da página
        // já rolada) não contava como "fora da tela" e o recorte saía cortado —
        // o cabeçalho do prontuário aparecia sem o nome do paciente.
        const barra = document.querySelector("[data-barra-topo]")?.getBoundingClientRect().bottom ?? 56;
        const topoLivre = barra + 16;
        const alturaCard = (cardRef.current?.getBoundingClientRect().height ?? 220) + 24;
        const fundoLivre = window.innerHeight - alturaCard;
        const foraDaTela = r.top < barra + 4 || r.top > fundoLivre;
        const cabe = r.height <= fundoLivre - topoLivre;
        if (passo.alinharPeloFim && !cabe) {
          // O que importa está no FIM do alvo (o campo de escrever, no fim do chat
          // da Luma): rola até ele ficar logo acima do card do tour. O topo do alvo
          // fica sob a barra — e o recorte, cortado nela.
          const margemAnterior = el.style.scrollMarginBottom;
          el.style.scrollMarginBottom = `${alturaCard}px`;
          el.scrollIntoView({ block: "end", inline: "nearest" });
          el.style.scrollMarginBottom = margemAnterior;
          r = el.getBoundingClientRect();
        } else if (
          foraDaTela ||
          (cabe && r.bottom > fundoLivre) ||
          // Alvo maior que a faixa começando lá embaixo (o conteúdo de uma aba do
          // prontuário): sobe até o topo, senão o card do tour cobria quase tudo.
          (!cabe && r.top > topoLivre + 40)
        ) {
          const margemAnterior = el.style.scrollMarginTop;
          el.style.scrollMarginTop = `${topoLivre}px`;
          el.scrollIntoView({ block: "start", inline: "nearest" });
          el.style.scrollMarginTop = margemAnterior;
          r = el.getBoundingClientRect();
        }
      }
      // Sem elemento ou invisível (0x0, ex.: menu recolhido no celular): sem
      // holofote — o card explica e o fundo fica escuro.
      //
      // Fora da tela NÃO zera mais o holofote: ele continua grudado no elemento e
      // acompanha a rolagem. Antes, rolar a página um pouco fazia o destaque
      // desaparecer de vez e a tela inteira escurecia.
      if (!el || !r || r.width === 0 || r.height === 0) {
        setAlvoRect(null);
        return;
      }
      achou = true;
      setAlvoRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    medir();
    /**
     * Procura o alvo ATÉ ACHAR (12s), não por 3s fixos.
     *
     * A tela do passo é carregada sob demanda e ainda espera os dados do servidor;
     * no plano free, que hiberna, isso passa fácil de 3 segundos. Quando o elemento
     * aparecia depois disso, a procura já tinha parado e aquele passo ficava sem
     * destaque nenhum — era o "alguns trechos não estão pegando".
     *
     * Depois de achar, o intervalo para e quem mantém o retângulo em dia são o
     * scroll e o resize (com rAF, para não medir a cada pixel rolado).
     */
    const intervalo = window.setInterval(() => {
      medir();
      if (achou) window.clearInterval(intervalo);
    }, 250);
    const parar = window.setTimeout(() => window.clearInterval(intervalo), 12_000);

    let agendado = 0;
    const aoMover = () => {
      if (agendado) return;
      agendado = requestAnimationFrame(() => {
        agendado = 0;
        medir();
      });
    };
    window.addEventListener("scroll", aoMover, true);
    window.addEventListener("resize", aoMover);
    return () => {
      window.clearInterval(intervalo);
      window.clearTimeout(parar);
      if (agendado) cancelAnimationFrame(agendado);
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
            ...recorteAbaixoDaBarra(alvoRect),
            width: alvoRect.width + 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)",
          }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-black/60" />
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 sm:p-4">
      <div ref={cardRef} className="pointer-events-auto mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
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
