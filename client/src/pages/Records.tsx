import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Eye, Trash2, Check, X } from "lucide-react";

const emptyForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  medicalHistory: "",
};

export default function Records() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: patients = [], isLoading } = trpc.patients.list.useQuery();
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  const createPatient = trpc.patients.create.useMutation({
    onSuccess: () => {
      utils.patients.list.invalidate();
      setFormData(emptyForm);
      setIsOpen(false);
      toast.success("Paciente cadastrado com sucesso!");
    },
    onError: (e) => toast.error(e.message || "Erro ao cadastrar paciente"),
  });

  // Paciente a excluir (o AlertDialog abre com ele).
  const [toDelete, setToDelete] = useState<{ id: number; nome: string } | null>(null);
  // Solicitação a recusar — recusar apaga o cadastro, então confirma antes.
  const [toReject, setToReject] = useState<{ id: number; nome: string } | null>(null);

  const deletePatient = trpc.patients.delete.useMutation({
    onSuccess: (r) => {
      utils.patients.list.invalidate();
      setToDelete(null);
      toast.success(
        r.action === "deleted"
          ? "Paciente excluído."
          : `Paciente arquivado — o prontuário foi mantido (${r.sessoes} sessão(ões), ${r.consultas} consulta(s)).`,
      );
    },
    onError: (e) => toast.error(e.message || "Erro ao excluir paciente"),
  });

  // Quem se cadastrou sozinho e escolheu esta psicóloga: espera aceite.
  const { data: pendentes = [] } = trpc.patients.pendingRequests.useQuery();

  const reviewRequest = trpc.patients.reviewRequest.useMutation({
    onSuccess: (r) => {
      utils.patients.pendingRequests.invalidate();
      utils.patients.list.invalidate();
      toast.success(
        r.action === "accepted"
          ? "Paciente aceito! Já pode agendar consultas."
          : "Solicitação recusada.",
      );
    },
    onError: (e) => toast.error(e.message || "Erro ao responder a solicitação"),
  });

  // Arquivado sai da grade, mas o prontuário continua no banco. (Pendente já
  // não vem no patients.list.)
  const filteredPatients = patients.filter(
    (patient) =>
      patient.status !== "archived" &&
      `${patient.firstName} ${patient.lastName} ${patient.email}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
  );

  const handleAddPatient = () => {
    if (formData.firstName && formData.lastName && formData.email) {
      createPatient.mutate({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone || undefined,
        medicalHistory: formData.medicalHistory || undefined,
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Prontuários</h1>
          <p className="text-muted-foreground">
            Gerencie os prontuários e histórico clínico dos pacientes
          </p>
        </div>

        {/* Search and Add Button */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Buscar paciente..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Plus className="w-4 h-4 mr-2" />
                Novo Paciente
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Cadastrar Novo Paciente</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">Nome</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) =>
                        setFormData({ ...formData, firstName: e.target.value })
                      }
                      placeholder="Nome"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Sobrenome</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) =>
                        setFormData({ ...formData, lastName: e.target.value })
                      }
                      placeholder="Sobrenome"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    placeholder="E-mail"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    placeholder="(81) 99999-9999"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="medicalHistory">Histórico Médico</Label>
                  <Textarea
                    id="medicalHistory"
                    value={formData.medicalHistory}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        medicalHistory: e.target.value,
                      })
                    }
                    placeholder="Histórico clínico..."
                    rows={4}
                  />
                </div>
                <Button
                  onClick={handleAddPatient}
                  className="w-full bg-primary hover:bg-primary/90"
                >
                  Cadastrar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Solicitações de vínculo: quem se cadastrou sozinho escolhendo você. */}
        {pendentes.length > 0 && (
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base">
                Solicitações de atendimento ({pendentes.length})
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Estas pessoas se cadastraram no site e escolheram você. Elas só
                entram na sua grade depois que você aceitar.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendentes.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {p.firstName} {p.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {p.email}
                      {p.phone ? ` · ${p.phone}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={reviewRequest.isPending}
                      onClick={() => reviewRequest.mutate({ id: p.id, action: "accept" })}
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Aceitar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={reviewRequest.isPending}
                      onClick={() => setToReject({ id: p.id, nome: `${p.firstName} ${p.lastName}` })}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Recusar
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Patients Table */}
        <Card>
          <CardHeader>
            <CardTitle>Pacientes Cadastrados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data de Cadastro</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPatients.length > 0 ? (
                    filteredPatients.map((patient) => (
                      <TableRow key={patient.id}>
                        <TableCell className="font-medium">
                          {patient.firstName} {patient.lastName}
                        </TableCell>
                        <TableCell>{patient.email}</TableCell>
                        <TableCell>{patient.phone || "—"}</TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              patient.status === "active"
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {patient.status === "active" ? "Ativo" : "Inativo"}
                          </span>
                        </TableCell>
                        <TableCell>
                          {new Date(patient.createdAt).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setLocation(`/records/${patient.id}`)}
                              className="text-primary hover:bg-primary/10"
                              title="Ver prontuário"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setToDelete({
                                  id: patient.id,
                                  nome: `${patient.firstName} ${patient.lastName}`,
                                })
                              }
                              className="text-destructive hover:bg-destructive/10"
                              title="Excluir da minha grade"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <p className="text-muted-foreground">
                          Nenhum paciente encontrado
                        </p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!toReject} onOpenChange={(o) => !o && setToReject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recusar {toReject?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              O cadastro é apagado e a pessoa não entra na sua grade. Como você
              nunca a atendeu, não há prontuário a guardar. Ela pode se cadastrar
              de novo depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (toReject) {
                  reviewRequest.mutate(
                    { id: toReject.id, action: "reject" },
                    { onSuccess: () => setToReject(null) },
                  );
                }
              }}
              disabled={reviewRequest.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {reviewRequest.isPending ? "Recusando..." : "Recusar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {toDelete?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              O paciente sai da sua grade. Se ele já tiver consulta, sessão ou
              documento registrado, o prontuário é <strong>arquivado</strong> em vez
              de apagado — a guarda do prontuário é obrigatória por 5 anos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) deletePatient.mutate({ id: toDelete.id });
              }}
              disabled={deletePatient.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deletePatient.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
