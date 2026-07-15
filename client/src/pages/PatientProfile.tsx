import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserRound, Calendar } from "lucide-react";

function toDateInput(value: unknown): string {
  if (!value) return "";
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** Área do paciente: cadastro próprio + suas consultas agendadas. */
export default function PatientProfile() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.me.profile.useQuery();
  const { data: appointments = [] } = trpc.me.appointments.useQuery();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    dateOfBirth: "",
    address: "",
  });

  useEffect(() => {
    if (!profile) return;
    setForm({
      firstName: profile.firstName ?? "",
      lastName: profile.lastName ?? "",
      phone: profile.phone ?? "",
      dateOfBirth: toDateInput(profile.dateOfBirth),
      address: profile.address ?? "",
    });
  }, [profile]);

  const save = trpc.me.saveProfile.useMutation({
    onSuccess: () => {
      utils.me.profile.invalidate();
      toast.success("Cadastro salvo!");
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar"),
  });

  const handleSave = () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error("Informe nome e sobrenome.");
      return;
    }
    save.mutate({
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      address: form.address || undefined,
    });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Meu Cadastro</h1>
        <p className="text-muted-foreground">
          Seus dados de contato para o atendimento.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="w-5 h-5 text-primary" />
            {user?.email}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Nome *</Label>
                  <Input
                    id="firstName"
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Sobrenome *</Label>
                  <Input
                    id="lastName"
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="(81) 99999-9999"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Data de Nascimento</Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Endereço</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <Button
                onClick={handleSave}
                disabled={save.isPending}
                className="bg-primary hover:bg-primary/90"
              >
                {save.isPending ? "Salvando..." : "Salvar cadastro"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Consultas do paciente */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Minhas Consultas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {appointments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma consulta agendada. A psicóloga enviará o link da sala quando agendar.
            </p>
          ) : (
            <div className="space-y-2">
              {appointments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded border border-border p-3"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {new Date(a.scheduledAt).toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.duration} min · {a.status === "scheduled" ? "Agendada" : a.status}
                      {a.confirmedAt ? " · presença confirmada" : ""}
                    </p>
                  </div>
                  {a.status === "scheduled" && (
                    <Button
                      size="sm"
                      onClick={() =>
                        (window.location.href = `/videocall/sala-apt${a.id}?apt=${a.id}&pat=${a.patientId}`)
                      }
                      className="bg-primary hover:bg-primary/90"
                    >
                      Entrar na sala
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
