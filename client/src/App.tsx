import { Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import { metaDaPagina } from "@shared/paginasDoSite";

// Carregadas junto do bundle: são o primeiro contato e precisam pintar na hora.
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "@/pages/NotFound";

/**
 * O resto entra sob demanda.
 *
 * Antes as 20 páginas vinham num arquivo só de 2,1 MB (606 KB comprimido): quem
 * abria apenas o login baixava junto a sala de videochamada, o gerador de PDF e
 * todas as telas da psicóloga. Num celular em rede lenta isso é vários segundos
 * olhando para uma tela branca — e o paciente que clica no link da consulta no
 * horário marcado é exatamente quem menos pode esperar.
 *
 * Depois do login, o DashboardLayout pré-carrega as telas do papel da pessoa em
 * segundo plano (ver paginas.tsx), para a primeira entrada em cada uma não esperar.
 */
import {
  Ajuda,
  Appointments,
  Assinatura,
  Configuracoes,
  Dashboard,
  E2EAgentChat,
  Financeiro,
  Luma,
  Mensagens,
  MyAppointments,
  MyTherapist,
  MeusDocumentos,
  PatientDetail,
  Precos,
  Privacidade,
  Profile,
  Records,
  Termos,
  TherapistRequests,
  VideoCallDynamic,
} from "@/paginas";

/** Enquanto o pedaço da rota chega. Discreto: na maioria das vezes dura um piscar. */
function CarregandoRota() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Carregando">
      <div className="size-10 animate-spin rounded-full border-2 border-muted border-b-primary" />
    </div>
  );
}
import ErrorBoundary from "./components/ErrorBoundary";
import PortaoDoAparelho from "./components/PortaoDoAparelho";
import PortaoDoCadastro from "./components/PortaoDoCadastro";
import { TherapistOnly } from "./components/TherapistOnly";
import { EntrarNaDemonstracao, FaixaDaDemonstracao } from "./components/FaixaDaDemonstracao";
import { ThemeProvider } from "./contexts/ThemeContext";

/**
 * Título e descrição da aba ao navegar. O servidor já entrega certo na primeira
 * abertura (server/paginaHtml.ts); aqui é a troca entre páginas sem recarregar.
 */
function TituloDaPagina() {
  const [local] = useLocation();
  useEffect(() => {
    const meta = metaDaPagina(local);
    document.title = meta.titulo;
    document.querySelector('meta[name="description"]')?.setAttribute("content", meta.descricao);
  }, [local]);
  return null;
}

function Router() {
  // Rotas clínicas ficam atrás do TherapistOnly; o paciente só acessa /profile
  // (seu cadastro) e /videocall (o atendimento).
  return (
    <Suspense fallback={<CarregandoRota />}>
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/login"} component={Login} />
      <Route path={"/redefinir-senha"} component={ResetPassword} />
      {/* Pública de propósito: quase todo pedido de suporte é "não consigo
          entrar" — atrás do login, a ajuda falharia quando mais é precisa. */}
      <Route path={"/ajuda"} component={Ajuda} />
      {/* Pública: o consentimento do cadastro aponta para cá. */}
      <Route path={"/privacidade"} component={Privacidade} />
      <Route path={"/termos"} component={Termos} />
      {/* Pública: é a vitrine para quem ainda não tem conta. */}
      <Route path={"/precos"} component={Precos} />
      {/* Pública: o sistema com dados fictícios, sem cadastro (lib/demonstracao.ts). */}
      <Route path={"/demonstracao"} component={EntrarNaDemonstracao} />
      {import.meta.env.VITE_E2E === "true" && (
        <Route path={"/__e2e__/agent-chat"} component={E2EAgentChat} />
      )}
      <Route path={"/luma"} component={Luma} />
      <Route path={"/dashboard"}>
        {() => (
          <TherapistOnly>
            <Dashboard />
          </TherapistOnly>
        )}
      </Route>
      {/* A sala sempre vem de um agendamento (ou de um link compartilhado).
          Não existe sala avulsa: sem paciente não há prontuário nem anotações. */}
      <Route path={"/videocall/:roomId"}>
        {(params) => <VideoCallDynamic roomId={params.roomId} />}
      </Route>
      <Route path={"/records"}>
        {() => (
          <TherapistOnly>
            <Records />
          </TherapistOnly>
        )}
      </Route>
      <Route path={"/records/:id"}>
        {() => (
          <TherapistOnly>
            <PatientDetail />
          </TherapistOnly>
        )}
      </Route>
      <Route path={"/appointments"}>
        {() => (
          <TherapistOnly>
            <Appointments />
          </TherapistOnly>
        )}
      </Route>
      <Route path={"/financeiro"}>
        {() => (
          <TherapistOnly>
            <Financeiro />
          </TherapistOnly>
        )}
      </Route>
      <Route path={"/assinatura"}>
        {() => (
          <TherapistOnly>
            <Assinatura />
          </TherapistOnly>
        )}
      </Route>
      <Route path={"/solicitacoes"}>
        {() => (
          <TherapistOnly adminOnly>
            <TherapistRequests />
          </TherapistOnly>
        )}
      </Route>
      <Route path={"/mensagens"} component={Mensagens} />
      <Route path={"/consultas"} component={MyAppointments} />
      <Route path={"/psicologa"} component={MyTherapist} />
      <Route path={"/documentos"} component={MeusDocumentos} />
      <Route path={"/profile"} component={Profile} />
      {/* Sem TherapistOnly: e-mail e senha são da conta, não do papel. */}
      <Route path={"/configuracoes"} component={Configuracoes} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <FaixaDaDemonstracao />
          <PortaoDoAparelho>
            <PortaoDoCadastro>
              <TituloDaPagina />
              <Router />
            </PortaoDoCadastro>
          </PortaoDoAparelho>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
