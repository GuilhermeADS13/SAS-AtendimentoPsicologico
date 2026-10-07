import { lazy, type ComponentType } from "react";

/**
 * Página carregada sob demanda que também pode ser PRÉ-carregada.
 *
 * Só o `React.lazy` deixava a primeira entrada em cada tela lenta: o pedaço da
 * página só começava a baixar no clique, e enquanto isso o `Suspense` trocava a
 * tela inteira (menu lateral junto) por um spinner. A Luma é o pior caso, porque
 * puxa o renderizador de Markdown (~260 KB comprimidos).
 *
 * Depois de pré-carregada, a página renderiza o módulo DIRETO, sem passar pelo
 * `lazy` — que suspende pelo menos um tique mesmo com o arquivo já baixado e
 * mostraria o spinner piscando.
 */
function paginaSobDemanda<P extends object>(carregar: () => Promise<{ default: ComponentType<P> }>) {
  let modulo: { default: ComponentType<P> } | undefined;
  let pendente: Promise<{ default: ComponentType<P> }> | undefined;
  const preCarregar = () =>
    (pendente ??= carregar().then(
      (m) => (modulo = m),
      (erro) => {
        // Falhou (rede caiu, deploy novo trocou os arquivos): deixa tentar de
        // novo no clique em vez de guardar a falha para sempre.
        pendente = undefined;
        throw erro;
      },
    ));
  const Lazy = lazy(preCarregar) as unknown as ComponentType<P>;
  function Pagina(props: P) {
    const Componente = modulo?.default ?? Lazy;
    return <Componente {...props} />;
  }
  Pagina.preCarregar = preCarregar;
  return Pagina;
}

export const Dashboard = paginaSobDemanda(() => import("@/pages/Dashboard"));
export const VideoCallDynamic = paginaSobDemanda(() => import("@/pages/VideoCallDynamic"));
export const Records = paginaSobDemanda(() => import("@/pages/Records"));
export const Mensagens = paginaSobDemanda(() => import("@/pages/Mensagens"));
export const Appointments = paginaSobDemanda(() => import("@/pages/Appointments"));
export const PatientDetail = paginaSobDemanda(() => import("@/pages/PatientDetail"));
export const Profile = paginaSobDemanda(() => import("@/pages/Profile"));
export const Configuracoes = paginaSobDemanda(() => import("@/pages/Configuracoes"));
export const MyAppointments = paginaSobDemanda(() => import("@/pages/MyAppointments"));
export const MyTherapist = paginaSobDemanda(() => import("@/pages/MyTherapist"));
export const TherapistRequests = paginaSobDemanda(() => import("@/pages/TherapistRequests"));
export const Ajuda = paginaSobDemanda(() => import("@/pages/Ajuda"));
export const Privacidade = paginaSobDemanda(() => import("@/pages/Privacidade"));
export const E2EAgentChat = paginaSobDemanda(() => import("@/pages/E2EAgentChat"));
export const Luma = paginaSobDemanda(() => import("@/pages/Luma"));
export const Financeiro = paginaSobDemanda(() => import("@/pages/Financeiro"));

// Na ordem de quem tem mais chance de ser aberto primeiro. A sala de vídeo fica
// por último: é a maior, e quem vai para ela normalmente chega por link direto.
const DA_PSICOLOGA = [Dashboard, Appointments, Records, Mensagens, PatientDetail, Luma, Financeiro, Profile, Configuracoes, Ajuda, VideoCallDynamic];
const DO_PACIENTE = [MyAppointments, Mensagens, Luma, MyTherapist, Profile, Configuracoes, Ajuda, VideoCallDynamic];

/**
 * Baixa em segundo plano as telas do papel de quem entrou, uma por vez e só com
 * o navegador ocioso — para não disputar rede com a tela que está abrindo agora.
 * Respeita o "economia de dados" do celular. Devolve a função que cancela.
 */
export function preCarregarPaginas(psicologa: boolean): () => void {
  const conexao = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conexao?.saveData) return () => {};

  const fila = [...(psicologa ? DA_PSICOLOGA : DO_PACIENTE)];
  let cancelado = false;
  let agendado: number | undefined;
  const quandoOcioso = (fn: () => void) =>
    typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback(fn, { timeout: 4000 })
      : window.setTimeout(fn, 1500);

  const proxima = () => {
    const pagina = fila.shift();
    if (cancelado || !pagina) return;
    pagina
      .preCarregar()
      .catch(() => {}) // falhou: a página carrega normalmente no clique
      .finally(() => {
        if (!cancelado) agendado = quandoOcioso(proxima);
      });
  };
  agendado = quandoOcioso(proxima);

  return () => {
    cancelado = true;
    if (agendado === undefined) return;
    if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(agendado);
    else window.clearTimeout(agendado);
  };
}
