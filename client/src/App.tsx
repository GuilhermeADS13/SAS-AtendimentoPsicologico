import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import Dashboard from "@/pages/Dashboard";
import VideoCallDynamic from "@/pages/VideoCallDynamic";
import Records from "@/pages/Records";
import Appointments from "@/pages/Appointments";
import PatientDetail from "@/pages/PatientDetail";
import Profile from "@/pages/Profile";
import MyAppointments from "@/pages/MyAppointments";
import Login from "@/pages/Login";
import Home from "@/pages/Home";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { TherapistOnly } from "./components/TherapistOnly";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  // Rotas clínicas ficam atrás do TherapistOnly; o paciente só acessa /profile
  // (seu cadastro) e /videocall (o atendimento).
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/login"} component={Login} />
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
      <Route path={"/consultas"} component={MyAppointments} />
      <Route path={"/profile"} component={Profile} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
