import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, FileText, Calendar, MessageSquare, Pencil } from "lucide-react";

// Converte Date | string | null para o formato do <input type="date"> (YYYY-MM-DD).
function toDateInput(value: unknown): string {
  if (!value) return "";
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export default function PatientDetail() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const patientId = Number(params.id);
  const utils = trpc.useUtils();

  const { data: patient, isLoading } = trpc.patients.get.useQuery(
    { id: patientId },
    { enabled: patientId > 0 },
  );

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    address: "",
    medicalHistory: "",
    emergencyContact: "",
    emergencyPhone: "",
  });

  // Preenche o formulário quando o paciente carrega.
  useEffect(() => {
    if (!patient) return;
    setForm({
      firstName: patient.firstName ?? "",
      lastName: patient.lastName ?? "",
      email: patient.email ?? "",
      phone: patient.phone ?? "",
      dateOfBirth: toDateInput(patient.dateOfBirth),
      address: patient.address ?? "",
      medicalHistory: patient.medicalHistory ?? "",
      emergencyContact: patient.emergencyContact ?? "",
      emergencyPhone: patient.emergencyPhone ?? "",
    });
  }, [patient]);

  const updatePatient = trpc.patients.update.useMutation({
    onSuccess: () => {
      utils.patients.get.invalidate({ id: patientId });
      utils.patients.list.invalidate();
      setIsEditOpen(false);
      toast.success("Dados do paciente atualizados!");
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar alterações"),
  });

  const handleSave = () => {
    updatePatient.mutate({
      id: patientId,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      dateOfBirth: form.dateOfBirth || undefined,
      address: form.address,
      medicalHistory: form.medicalHistory,
      emergencyContact: form.emergencyContact,
      emergencyPhone: form.emergencyPhone,
    });
  };

  // Sessões e documentos ainda são placeholders (itens separados do TODO).
  const sessions: { id: number; date: string; time: string; notes: string; mood: string }[] = [];
  const documents: { id: number; name: string; type: string; date: string }[] = [];

  if (isLoading) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Carregando prontuário...</p>
      </DashboardLayout>
    );
  }

  if (!patient) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Button variant="ghost" onClick={() => setLocation("/records")} className="p-0">
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <p className="text-muted-foreground">
            Paciente não encontrado (ou você não tem acesso a ele).
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const statusLabel =
    patient.status === "active" ? "Ativo" : patient.status === "inactive" ? "Inativo" : "Arquivado";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setLocation("/records")} className="p-0">
              <ArrowLeft className="w-6 h-6" />
            </Button>
            <div className="space-y-1">
              <h1 className="text-3xl font-bold text-foreground">
                {patient.firstName} {patient.lastName}
              </h1>
              <p className="text-muted-foreground">{patient.email}</p>
            </div>
          </div>
          <Button onClick={() => setIsEditOpen(true)} className="bg-primary hover:bg-primary/90">
            <Pencil className="w-4 h-4 mr-2" />
            Editar dados
          </Button>
        </div>

        {/* Patient Info cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Telefone</p>
              <p className="text-lg font-semibold text-foreground">{patient.phone || "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Data de Nascimento</p>
              <p className="text-lg font-semibold text-foreground">
                {patient.dateOfBirth
                  ? new Date(patient.dateOfBirth).toLocaleDateString("pt-BR")
                  : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="text-lg font-semibold text-green-600">{statusLabel}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total de Sessões</p>
              <p className="text-lg font-semibold text-foreground">{sessions.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="info">Informações</TabsTrigger>
            <TabsTrigger value="sessions">Sessões</TabsTrigger>
            <TabsTrigger value="documents">Documentos</TabsTrigger>
          </TabsList>

          {/* Info Tab */}
          <TabsContent value="info" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Informações Pessoais</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Endereço</p>
                  <p className="text-foreground">{patient.address || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Contato de Emergência</p>
                  <p className="text-foreground">
                    {patient.emergencyContact || "—"}
                    {patient.emergencyPhone ? ` · ${patient.emergencyPhone}` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Histórico Médico</p>
                  <p className="text-foreground whitespace-pre-wrap">
                    {patient.medicalHistory || "—"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sessions Tab (placeholder — item futuro do TODO) */}
          <TabsContent value="sessions" className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Histórico de Sessões</h2>
            {sessions.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-muted-foreground">
                  <MessageSquare className="w-5 h-5 mb-2" />
                  Registro de sessões em breve (próxima fase do prontuário).
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <Card key={session.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-foreground">
                          {new Date(session.date).toLocaleDateString("pt-BR")} às {session.time}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">{session.notes}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Documents Tab (placeholder — item futuro do TODO) */}
          <TabsContent value="documents" className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Documentos</h2>
            <Card>
              <CardContent className="pt-6 text-muted-foreground">
                <FileText className="w-5 h-5 mb-2" />
                Upload de documentos (laudos, receitas) em breve — depende da
                integração com S3.
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog de edição */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar dados do paciente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Nome</Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Sobrenome</Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="emergencyContact">Contato de Emergência</Label>
                <Input
                  id="emergencyContact"
                  value={form.emergencyContact}
                  onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emergencyPhone">Telefone de Emergência</Label>
                <Input
                  id="emergencyPhone"
                  value={form.emergencyPhone}
                  onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="medicalHistory">Histórico Médico</Label>
              <Textarea
                id="medicalHistory"
                rows={4}
                value={form.medicalHistory}
                onChange={(e) => setForm({ ...form, medicalHistory: e.target.value })}
              />
            </div>
            <Button
              onClick={handleSave}
              disabled={updatePatient.isPending}
              className="w-full bg-primary hover:bg-primary/90"
            >
              {updatePatient.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
