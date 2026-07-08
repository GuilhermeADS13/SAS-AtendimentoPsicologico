import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
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

interface Appointment {
  id: number;
  patientId: number;
  patientName: string;
  date: string;
  time: string;
  duration: number;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  roomId: string;
  roomUrl: string;
}

// A sala carrega os ids do agendamento/paciente na query (?apt=&pat=), que a
// VideoCallDynamic usa para o auto-save real das anotações no router sessionNotes.
const buildRoomUrl = (roomId: string, appointmentId: number, patientId: number) =>
  `/videocall/${roomId}?apt=${appointmentId}&pat=${patientId}`;

const mockAppointments: Appointment[] = [
  {
    id: 1,
    patientId: 1,
    patientName: "Maria Silva",
    date: "2026-07-08",
    time: "14:30",
    duration: 60,
    status: "scheduled",
    roomId: "psicologia-maria-silva-1720428600",
    roomUrl: buildRoomUrl("psicologia-maria-silva-1720428600", 1, 1),
  },
  {
    id: 2,
    patientId: 2,
    patientName: "João Santos",
    date: "2026-07-09",
    time: "10:00",
    duration: 60,
    status: "scheduled",
    roomId: "psicologia-joao-santos-1720512000",
    roomUrl: buildRoomUrl("psicologia-joao-santos-1720512000", 2, 2),
  },
  {
    id: 3,
    patientId: 3,
    patientName: "Ana Costa",
    date: "2026-07-07",
    time: "15:00",
    duration: 60,
    status: "completed",
    roomId: "psicologia-ana-costa-1720345200",
    roomUrl: buildRoomUrl("psicologia-ana-costa-1720345200", 3, 3),
  },
];

export default function AppointmentsNew() {
  const [, setLocation] = useLocation();
  const [appointments, setAppointments] = useState<Appointment[]>(mockAppointments);
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    patientName: "",
    date: "",
    time: "",
    duration: "60",
  });

  const generateRoomId = (patientName: string, dateTime: string) => {
    const timestamp = Math.floor(new Date(dateTime).getTime() / 1000);
    return `psicologia-${patientName.toLowerCase().replace(/\s+/g, "-")}-${timestamp}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(`${window.location.origin}${text}`);
    toast.success("Link copiado para a área de transferência!");
  };

  const openVideoCall = (roomUrl: string) => {
    setLocation(roomUrl);
  };

  const handleAddAppointment = () => {
    if (formData.patientName && formData.date && formData.time) {
      const dateTime = `${formData.date}T${formData.time}`;
      const roomId = generateRoomId(formData.patientName, dateTime);

      const newId = appointments.length + 1;
      // patientId 0: o formulário ainda não vincula um paciente do cadastro.
      // Ao integrar com o cadastro real (trpc.patients), passe o id aqui para
      // habilitar o auto-save das anotações nesta consulta.
      const newAppointment: Appointment = {
        id: newId,
        patientId: 0,
        patientName: formData.patientName,
        date: formData.date,
        time: formData.time,
        duration: parseInt(formData.duration),
        status: "scheduled",
        roomId,
        roomUrl: buildRoomUrl(roomId, newId, 0),
      };
      setAppointments([...appointments, newAppointment]);
      setFormData({
        patientName: "",
        date: "",
        time: "",
        duration: "60",
      });
      setIsOpen(false);
      toast.success("Consulta agendada com sucesso!");
    }
  };

  const updateStatus = (id: number, status: Appointment["status"]) => {
    setAppointments(
      appointments.map((apt) =>
        apt.id === id ? { ...apt, status } : apt
      )
    );
    toast.success(`Status atualizado para ${status}`);
  };

  const getStatusColor = (status: Appointment["status"]) => {
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

  const getStatusLabel = (status: Appointment["status"]) => {
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

        {/* Add Appointment Button */}
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
                <Label htmlFor="patientName">Paciente</Label>
                <Input
                  id="patientName"
                  value={formData.patientName}
                  onChange={(e) =>
                    setFormData({ ...formData, patientName: e.target.value })
                  }
                  placeholder="Nome do paciente"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Data</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) =>
                      setFormData({ ...formData, date: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Hora</Label>
                  <Input
                    id="time"
                    type="time"
                    value={formData.time}
                    onChange={(e) =>
                      setFormData({ ...formData, time: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Duração (minutos)</Label>
                <Select value={formData.duration} onValueChange={(value) => setFormData({ ...formData, duration: value })}>
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
                className="w-full bg-primary hover:bg-primary/90"
              >
                Agendar
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Appointments Table */}
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
                    <TableHead>Sala de Videochamada</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.map((appointment) => (
                    <TableRow key={appointment.id}>
                      <TableCell className="font-medium">
                        {appointment.patientName}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          {new Date(appointment.date).toLocaleDateString("pt-BR")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          {appointment.time}
                        </div>
                      </TableCell>
                      <TableCell>{appointment.duration} min</TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                            appointment.status
                          )}`}
                        >
                          {getStatusLabel(appointment.status)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded border border-border">
                            {appointment.roomId.substring(0, 20)}...
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(appointment.roomUrl)}
                            className="p-1 h-auto"
                            title="Copiar link"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {appointment.status === "scheduled" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openVideoCall(appointment.roomUrl)}
                                className="text-primary hover:bg-primary/10"
                                title="Entrar na videochamada"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  updateStatus(appointment.id, "completed")
                                }
                                className="text-green-600 hover:bg-green-100"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  updateStatus(appointment.id, "cancelled")
                                }
                                className="text-red-600 hover:bg-red-100"
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
