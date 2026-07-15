import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Calendar, Search, Video, UserRound } from "lucide-react";

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
  const [busca, setBusca] = useState("");

  const termo = busca.trim().toLowerCase();

  // Busca no que está escrito no card: psicóloga, CRP, data e status. Filtrar só
  // pelo nome da psicóloga seria inútil — o paciente tem uma só, então devolveria
  // sempre tudo ou nada.
  const filtradas = appointments.filter((a) => {
    if (!termo) return true;
    const data = new Date(a.scheduledAt);
    const texto = [
      a.therapistName ?? "",
      a.therapistCrp ?? "",
      STATUS_LABEL[a.status] ?? a.status,
      data.toLocaleString("pt-BR"),
      data.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    ]
      .join(" ")
      .toLowerCase();
    return texto.includes(termo);
  });

  const proximas = filtradas.filter((a) => a.status === "scheduled");
  const anteriores = filtradas.filter((a) => a.status !== "scheduled");

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-foreground">Minhas Consultas</h1>
            <p className="text-muted-foreground">
              Entre na sala no horário marcado. O link abre a videochamada com a psicóloga.
            </p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/psicologa")}>
            <UserRound className="w-4 h-4 mr-2" />
            Minha psicóloga
          </Button>
        </div>

        {/* Sem cadastro ainda, a psicóloga não consegue agendar. */}
        {!isLoading && !profile && (
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-foreground">Complete seu cadastro</p>
                <p className="text-sm text-muted-foreground">
                  A psicóloga precisa dos seus dados para agendar a consulta.
                </p>
              </div>
              <Button onClick={() => setLocation("/profile")}>
                <UserRound className="w-4 h-4 mr-2" />
                Meu Cadastro
              </Button>
            </CardContent>
          </Card>
        )}

        {/* A busca só aparece quando há lista o bastante para valer a pena. */}
        {appointments.length > 3 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por psicóloga, data ou status..."
              className="pl-10"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        )}

        {isLoading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : appointments.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground">
              <Calendar className="w-5 h-5 mb-2" />
              Nenhuma consulta agendada ainda. Quando a psicóloga marcar, ela aparece aqui.
            </CardContent>
          </Card>
        ) : filtradas.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground">
              Nenhuma consulta encontrada para "{busca}".
            </CardContent>
          </Card>
        ) : (
          <>
            {proximas.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Próximas</h2>
                {proximas.map((a) => (
                  <Card key={a.id} className="border-primary/30">
                    <CardContent className="flex flex-wrap items-center justify-between gap-4">
                      <div className="min-w-0">
                        {/* Com quem é a consulta vem primeiro: é o que o
                            paciente procura ao bater o olho. */}
                        <p className="font-semibold text-foreground">
                          {a.therapistName || "Sua psicóloga"}
                          {a.therapistCrp ? (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              · CRP {a.therapistCrp}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-sm text-foreground/80">
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
                    <CardContent className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">
                          {a.therapistName || "Sua psicóloga"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(a.scheduledAt).toLocaleString("pt-BR")}
                        </p>
                      </div>
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
