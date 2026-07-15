import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarUpload } from "@/components/AvatarUpload";
import { iniciais } from "@/lib/iniciais";
import { UserRound, BadgeCheck } from "lucide-react";

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

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    dateOfBirth: "",
    address: "",
    photoKey: "",
  });

  useEffect(() => {
    if (profile) {
      setForm({
        firstName: profile.firstName ?? "",
        lastName: profile.lastName ?? "",
        phone: profile.phone ?? "",
        dateOfBirth: toDateInput(profile.dateOfBirth),
        address: profile.address ?? "",
        photoKey: profile.photoKey ?? "",
      });
      return;
    }
    // Ainda sem cadastro: aproveita o nome informado na criação da conta,
    // para o paciente não precisar digitar de novo.
    if (user?.name) {
      const [first, ...rest] = user.name.trim().split(/\s+/);
      setForm((f) => ({
        ...f,
        firstName: f.firstName || first || "",
        lastName: f.lastName || rest.join(" "),
      }));
    }
  }, [profile, user]);

  const save = trpc.me.saveProfile.useMutation({
    onSuccess: () => {
      utils.me.profile.invalidate();
      toast.success("Cadastro salvo!");
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar"),
  });

  // Quem pediu acesso profissional fez isso na criação da conta ("Você é
  // psicólogo(a)?"). Aqui só acompanha o andamento — não há formulário: para
  // quem se cadastrou como paciente, pedir CRP nesta tela não faz sentido.
  const { data: request } = trpc.me.therapistRequest.useQuery();

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
      photoKey: form.photoKey,
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
              <div className="space-y-2">
                <Label>Foto (opcional)</Label>
                <AvatarUpload
                  value={form.photoKey}
                  onChange={(photoKey) => setForm({ ...form, photoKey })}
                  fallback={iniciais(`${form.firstName} ${form.lastName}`.trim() || user?.name)}
                />
              </div>
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

      {/* Só aparece para quem pediu acesso profissional no cadastro. */}
      {request && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BadgeCheck className="w-5 h-5 text-primary" />
              Acesso profissional
            </CardTitle>
          </CardHeader>
          <CardContent>
            {request.status === "pending" ? (
              <p className="text-sm text-muted-foreground">
                ⏳ Sua solicitação (CRP <strong>{request.crp}</strong>) está{" "}
                <strong>em análise</strong>. Você será liberado(a) assim que o CRP for
                verificado no Cadastro Nacional de Psicólogos.
              </p>
            ) : request.status === "rejected" ? (
              <p className="text-sm text-destructive">
                Sua solicitação (CRP <strong>{request.crp}</strong>) não foi aprovada.
                Se acredita que houve um engano, entre em contato com a clínica.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                ✅ Acesso profissional aprovado (CRP <strong>{request.crp}</strong>).
              </p>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
