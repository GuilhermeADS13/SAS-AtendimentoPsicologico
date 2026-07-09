import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Calendar, Clock, CheckCircle, XCircle, Copy, ExternalLink } from "lucide-react";

type Status = "scheduled" | "completed" | "cancelled" | "no_show";

// A sala carrega os ids do agendamento/paciente na query (?apt=&pat=), que a
// VideoCallDynamic usa para o auto-save real das anotações no router sessionNotes.
const roomIdFor = (appointmentId: number) => `sala-apt${appointmentId}`;
const roomUrlFor = (appointmentId: number, patientId: number) =>
  `/videocall/${roomIdFor(appointmentId)}?apt=${appointmentId}&pat=${patientId}`;

const emptyForm = { patientId: "", date: "", time: "", duration: "60" };

export default function Appointments() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: appointments = [] } = trpc.appointments.list.useQuery();
  const { data: patients = [] } = trpc.patients.list.useQuery();

  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  const patientName = (patientId: number) => {
    const p = patients.find((pt) => pt.id === patientId);
    return p ? `${p.firstName} ${p.lastName}` : "Paciente";
  };

  const createAppt = trpc.appointments.create.useMutation({
    onSuccess: () => {
      utils.appointments.list.invalidate();
      setFormData(emptyForm);
      setIsOpen(false);
      toast.success("Consulta agendada com sucesso!");
    },
    onError: (e) => toast.error(e.message || "Erro ao agendar"),
  });

  const updateStatus = trpc.appointments.updateStatus.useMutation({
    onSuccess: () => {
      utils.appointments.list.invalidate();
      toast.success("Status atualizado");
    },
    onError: (e) => toast.error(e.message || "Erro ao atualizar status"),
  });

  const copyToClipboard = (path: string) => {
    navigator.clipboard.writeText(`${window.location.origin}${path}`);
    toast.success("Link copiado para a área de transferência!");
  };

  const handleAddAppointment = () => {
    if (!formData.patientId || !formData.date || !formData.time) {
      toast.error("Selecione o paciente, a data e a hora.");
      return;
    }
    const scheduledAt = new Date(`${formData.date}T${formData.time}`).toISOString();
    createAppt.mutate({
      patientId: Number(formData.patientId),
      scheduledAt,
      duration: parseInt(formData.duration),
    });
  };

  const getStatusColor = (status: Status) => {
    switch (status) {
      case "scheduled":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      case "no_show":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusLabel = (status: Status) => {
    switch (status) {
      case "scheduled":
        return "Agendado";
      case "completed":
        return "Realizado";
      case "cancelled":
        return "Cancelado";
      case "no_show":
        return "Não Compareceu";
      default:
        return status;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Agendamentos</h1>
          <p className="text-muted-foreground">
            Gerencie as consultas e acompanhamento dos pacientes
          </p>
        </div>

        {/* Nova Consulta */}
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="w-4 h-4 mr-2" />
              Nova Consulta
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Agendar Nova Consulta</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="patient">Paciente</Label>
                {patients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum paciente cadastrado. Cadastre um paciente em Prontuários primeiro.
                  </p>
                ) : (
                  <Select
                    value={formData.patientId}
                    onValueChange={(value) => setFormData({ ...formData, patientId: value })}
                  >
                    <SelectTrigger id="patient">
                      <SelectValue placeholder="Selecione o paciente" />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.firstName} {p.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Data</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Hora</Label>
                  <Input
                    id="time"
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Duração (minutos)</Label>
                <Select
                  value={formData.duration}
                  onValueChange={(value) => setFormData({ ...formData, duration: value })}
                >
                  <SelectTrigger id="duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 minutos</SelectItem>
                    <SelectItem value="60">1 hora</SelectItem>
                    <SelectItem value="90">1 hora 30 min</SelectItem>
                    <SelectItem value="120">2 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleAddAppointment}
                disabled={createAppt.isPending}
                className="w-full bg-primary hover:bg-primary/90"
              >
                {createAppt.isPending ? "Agendando..." : "Agendar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Tabela */}
        <Card>
          <CardHeader>
            <CardTitle>Consultas Agendadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sala</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Nenhuma consulta agendada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    appointments.map((appointment) => {
                      const scheduled = new Date(appointment.scheduledAt);
                      const status = appointment.status as Status;
                      const roomUrl = roomUrlFor(appointment.id, appointment.patientId);
                      return (
                        <TableRow key={appointment.id}>
                          <TableCell className="font-medium">
                            {patientName(appointment.patientId)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-muted-foreground" />
                              {scheduled.toLocaleDateString("pt-BR")}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-muted-foreground" />
                              {scheduled.toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </TableCell>
                          <TableCell>{appointment.duration} min</TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(status)}`}
                            >
                              {getStatusLabel(status)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(roomUrl)}
                              className="p-1 h-auto"
                              title="Copiar link da sala"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {status === "scheduled" && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setLocation(roomUrl)}
                                    className="text-primary hover:bg-primary/10"
                                    title="Entrar na videochamada"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => updateStatus.mutate({ id: appointment.id, status: "completed" })}
                                    className="text-green-600 hover:bg-green-100"
                                    title="Marcar como realizada"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => updateStatus.mutate({ id: appointment.id, status: "cancelled" })}
                                    className="text-red-600 hover:bg-red-100"
                                    title="Cancelar"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
