import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Video, UserRound } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Agendada",
  completed: "Realizada",
  cancelled: "Cancelada",
  no_show: "Não compareceu",
};

/** Tela principal do paciente: suas consultas e o acesso à sala. */
export default function MyAppointments() {
  const [, setLocation] = useLocation();
  const { data: appointments = [], isLoading } = trpc.me.appointments.useQuery();
  const { data: profile } = trpc.me.profile.useQuery();

  const proximas = appointments.filter((a) => a.status === "scheduled");
  const anteriores = appointments.filter((a) => a.status !== "scheduled");

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Minhas Consultas</h1>
          <p className="text-muted-foreground">
            Entre na sala no horário marcado. O link abre a videochamada com a psicóloga.
          </p>
        </div>

        {/* Sem cadastro ainda, a psicóloga não consegue agendar. */}
        {!isLoading && !profile && (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="pt-6 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-foreground">Complete seu cadastro</p>
                <p className="text-sm text-muted-foreground">
                  A psicóloga precisa dos seus dados para agendar a consulta.
                </p>
              </div>
              <Button onClick={() => setLocation("/profile")} className="bg-primary hover:bg-primary/90">
                <UserRound className="w-4 h-4 mr-2" />
                Meu Cadastro
              </Button>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : appointments.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-muted-foreground">
              <Calendar className="w-5 h-5 mb-2" />
              Nenhuma consulta agendada ainda. Quando a psicóloga marcar, ela aparece aqui.
            </CardContent>
          </Card>
        ) : (
          <>
            {proximas.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Próximas</h2>
                {proximas.map((a) => (
                  <Card key={a.id} className="border-primary/30">
                    <CardContent className="pt-6 flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-foreground">
                          {new Date(a.scheduledAt).toLocaleString("pt-BR")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {a.duration} min
                          {a.confirmedAt ? " · presença confirmada ✓" : ""}
                        </p>
                      </div>
                      <Button
                        onClick={() =>
                          setLocation(`/videocall/sala-apt${a.id}?apt=${a.id}&pat=${a.patientId}`)
                        }
                        className="bg-primary hover:bg-primary/90"
                      >
                        <Video className="w-4 h-4 mr-2" />
                        Entrar na sala
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {anteriores.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Anteriores</h2>
                {anteriores.map((a) => (
                  <Card key={a.id}>
                    <CardContent className="pt-6 flex items-center justify-between gap-4">
                      <p className="text-sm text-foreground">
                        {new Date(a.scheduledAt).toLocaleString("pt-BR")}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {STATUS_LABEL[a.status] ?? a.status}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
