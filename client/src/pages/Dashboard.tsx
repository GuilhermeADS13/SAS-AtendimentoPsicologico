import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Users, FileText, Video } from "lucide-react";
import { useLocation } from "wouter";

export default function Dashboard() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  // Contadores reais para os cards de resumo.
  const { data: patients = [] } = trpc.patients.list.useQuery();
  const { data: appointments = [] } = trpc.appointments.list.useQuery();
  const { data: sessions = [] } = trpc.sessions.list.useQuery();

  const isToday = (value: unknown) => {
    const d = new Date(value as string);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  };
  const consultasHoje = appointments.filter(
    (a) => a.status === "scheduled" && isToday(a.scheduledAt),
  ).length;
  const pacientesAtivos = patients.filter((p) => p.status === "active").length;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            Bem-vindo, {user?.name || "Psicóloga"}!
          </h1>
          <p className="text-muted-foreground">
            Gerencie suas consultas, pacientes e prontuários
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-primary flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Consultas Hoje
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{consultasHoje}</div>
              <p className="text-xs text-muted-foreground mt-1">Agendadas para hoje</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-secondary/10 to-secondary/5 border-secondary/20">
            <CardHeader className="pb-3">
              {/* -foreground, não -secondary: --secondary é cor de FUNDO (0.955
                  de luminosidade) e como texto ficava em 1.14:1 sobre o cartão
                  branco — ilegível. O par -foreground é o tom de texto do tema. */}
              <CardTitle className="text-sm font-medium text-secondary-foreground flex items-center gap-2">
                <Users className="w-4 h-4" />
                Pacientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{pacientesAtivos}</div>
              <p className="text-xs text-muted-foreground mt-1">Pacientes ativos</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-accent-foreground flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Prontuários
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{sessions.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Registros de sessões</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-destructive flex items-center gap-2">
                <Video className="w-4 h-4" />
                Videochamadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">0</div>
              <p className="text-xs text-muted-foreground mt-1">Realizadas este mês</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Ações Rápidas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              onClick={() => setLocation("/appointments")}
              className="h-24 flex flex-col items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Calendar className="w-6 h-6" />
              <span>Agendar Consulta</span>
            </Button>
            <Button
              onClick={() => setLocation("/records")}
              className="h-24 flex flex-col items-center justify-center gap-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
            >
              <Users className="w-6 h-6" />
              <span>Gerenciar Pacientes</span>
            </Button>
            <Button
              onClick={() => setLocation("/records")}
              className="h-24 flex flex-col items-center justify-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              <FileText className="w-6 h-6" />
              <span>Prontuários</span>
            </Button>
            {/* A chamada começa pela agenda: é o agendamento que leva à sala
                com o prontuário e as anotações do paciente. */}
            <Button
              onClick={() => setLocation("/appointments")}
              className="h-24 flex flex-col items-center justify-center gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              <Video className="w-6 h-6" />
              <span>Iniciar Videochamada</span>
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
