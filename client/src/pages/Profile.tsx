import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import PatientProfile from "./PatientProfile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserRound } from "lucide-react";

export default function Profile() {
  const { isTherapist, loading: roleLoading } = useRole();

  // Paciente vê o próprio cadastro; a psicóloga vê o perfil profissional.
  if (roleLoading) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Carregando...</p>
      </DashboardLayout>
    );
  }

  if (!isTherapist) {
    return (
      <DashboardLayout>
        <PatientProfile />
      </DashboardLayout>
    );
  }

  return <TherapistProfile />;
}

/** Perfil profissional da psicóloga (CRP, especialidades, bio). */
function TherapistProfile() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: therapist, isLoading } = trpc.therapists.me.useQuery();

  const [form, setForm] = useState({
    crp: "",
    specialties: "",
    bio: "",
    photoUrl: "",
  });

  useEffect(() => {
    if (!therapist) return;
    setForm({
      crp: therapist.crp ?? "",
      specialties: therapist.specialties ?? "",
      bio: therapist.bio ?? "",
      photoUrl: therapist.photoUrl ?? "",
    });
  }, [therapist]);

  const upsert = trpc.therapists.upsert.useMutation({
    onSuccess: () => {
      utils.therapists.me.invalidate();
      toast.success("Perfil salvo com sucesso!");
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar o perfil"),
  });

  const handleSave = () => {
    if (!form.crp.trim()) {
      toast.error("Informe o CRP.");
      return;
    }
    upsert.mutate({
      crp: form.crp,
      specialties: form.specialties || undefined,
      bio: form.bio || undefined,
      photoUrl: form.photoUrl || undefined,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Perfil Profissional</h1>
          <p className="text-muted-foreground">
            Dados que aparecem para os pacientes e no seu prontuário.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="w-5 h-5 text-primary" />
              {user?.name || "Psicóloga"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="crp">CRP (Conselho Regional de Psicologia) *</Label>
                  <Input
                    id="crp"
                    value={form.crp}
                    onChange={(e) => setForm({ ...form, crp: e.target.value })}
                    placeholder="Ex.: 06/123456"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="specialties">Especialidades</Label>
                  <Input
                    id="specialties"
                    value={form.specialties}
                    onChange={(e) => setForm({ ...form, specialties: e.target.value })}
                    placeholder="Ex.: Terapia Cognitivo-Comportamental, Ansiedade, Casais"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="photoUrl">URL da Foto</Label>
                  <Input
                    id="photoUrl"
                    value={form.photoUrl}
                    onChange={(e) => setForm({ ...form, photoUrl: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio">Bio / Apresentação</Label>
                  <Textarea
                    id="bio"
                    rows={5}
                    value={form.bio}
                    onChange={(e) => setForm({ ...form, bio: e.target.value })}
                    placeholder="Conte um pouco sobre sua abordagem e experiência..."
                  />
                </div>
                <Button
                  onClick={handleSave}
                  disabled={upsert.isPending}
                  className="bg-primary hover:bg-primary/90"
                >
                  {upsert.isPending ? "Salvando..." : "Salvar Perfil"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
