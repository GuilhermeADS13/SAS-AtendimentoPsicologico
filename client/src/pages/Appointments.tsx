import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";
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
import { useAuth } from "@/_core/hooks/useAuth";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";

type Status = "scheduled" | "completed" | "cancelled" | "no_show";

// Nome da sala = apt<id>-<roomToken>. O token aleatório torna o link impossível
// de adivinhar (o modelo Zoom/Meet); antes era sala-apt<id>, sequencial. Os ids
// vão na query (?apt=&pat=), que a VideoCallDynamic usa para o auto-save das
// anotações. Consultas antigas sem token caem no formato legado (só a sala nova
// é segura).
const roomNameFor = (appointmentId: number, roomToken: string | null) =>
  roomToken ? `apt${appointmentId}-${roomToken}` : `sala-apt${appointmentId}`;
const roomUrlFor = (appointmentId: number, patientId: number, roomToken: string | null) =>
  `/videocall/${roomNameFor(appointmentId, roomToken)}?apt=${appointmentId}&pat=${patientId}`;

const emptyForm = { patientId: "", date: "", time: "", duration: "60", repetir: "1" };

export default function Appointments() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { user } = useAuth();

  const { data: appointments = [] } = trpc.appointments.list.useQuery();
  const { data: patients = [] } = trpc.patients.list.useQuery();

  // Consulta a destacar quando se chega pela sineta (/agendamentos?ap=<id>):
  // a notificação leva direto aqui e realça qual consulta é.
  const search = useSearch();
  const highlightId = Number(new URLSearchParams(search).get("ap")) || 0;

  useEffect(() => {
    if (!highlightId || appointments.length === 0) return;
    const el = document.querySelector(`[data-appt="${highlightId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, appointments.length]);

  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);

  const patientOf = (patientId: number) => patients.find((pt) => pt.id === patientId);

  const patientName = (patientId: number) => {
    const p = patientOf(patientId);
    return p ? `${p.firstName} ${p.lastName}` : "Paciente";
  };

  // Monta o link wa.me que abre o WhatsApp com o número do paciente e a mensagem
  // pronta. Quem envia é a psicóloga (abre no aparelho dela) — não é automático.
  // Retorna null se o paciente não tem telefone (aí o botão fica desabilitado).
  //
  // O cancelamento também passa por aqui porque o e-mail não é confiável: o
  // remetente é de domínio gratuito e cai em spam. Um lembrete perdido é um
  // aborrecimento; um CANCELAMENTO perdido faz o paciente entrar numa sala vazia
  // esperando por uma consulta que não vai acontecer.
  const whatsappHref = (
    appt: (typeof appointments)[number],
    tipo: "lembrete" | "cancelamento" = "lembrete",
  ): string | null => {
    const digits = (patientOf(appt.patientId)?.phone ?? "").replace(/\D/g, "");
    if (!digits) return null;
    const numero = digits.startsWith("55") ? digits : `55${digits}`; // 55 = Brasil

    const dt = new Date(appt.scheduledAt);
    const data = dt.toLocaleDateString("pt-BR");
    const hora = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const url = `${window.location.origin}${roomUrlFor(appt.id, appt.patientId, appt.roomToken)}`;
    const primeiroNome = patientName(appt.patientId).split(" ")[0];
    const comPsi = user?.name ? ` com ${user.name}` : "";

    // No cancelamento não vai link de sala: mandar a sala de uma consulta que não
    // vai acontecer é justamente o engano que se quer evitar.
    const msg =
      tipo === "cancelamento"
        ? `Olá, ${primeiroNome}!\n\n` +
          `Preciso cancelar nossa consulta do dia ${data} às ${hora}.\n\n` +
          `Me avise um horário que funcione para você que eu remarco. Desculpe o transtorno!`
        : `Olá, ${primeiroNome}! 👋\n\n` +
          `Lembrete da sua consulta${comPsi}: ${data} às ${hora}.\n\n` +
          `No horário, é só entrar pela sala: ${url}\n\n` +
          `Qualquer dúvida, me chame por aqui.`;

    return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
  };

  const createAppt = trpc.appointments.create.useMutation({
    onSuccess: (data) => {
      utils.appointments.list.invalidate();
      setFormData(emptyForm);
      setIsOpen(false);
      toast.success(
        data.criadas > 1
          ? `${data.criadas} consultas agendadas, uma por semana!`
          : "Consulta agendada com sucesso!",
      );
    },
    onError: (e) => toast.error(e.message || "Erro ao agendar"),
  });

  const updateStatus = trpc.appointments.updateStatus.useMutation({
    onSuccess: (_data, vars) => {
      utils.appointments.list.invalidate();

      if (vars.status !== "cancelled") {
        toast.success("Status atualizado");
        return;
      }

      // Cancelamento é o aviso que não pode se perder. O e-mail sai, mas pode
      // cair em spam — e aí o paciente entra numa sala vazia esperando por uma
      // consulta que não existe mais. Então oferece o WhatsApp na hora.
      //
      // Não abre sozinho de propósito: o navegador bloquearia a janela fora de
      // um clique, e a psicóloga precisa ler a mensagem antes de enviar.
      const appt = appointments.find((a) => a.id === vars.id);
      const href = appt ? whatsappHref(appt, "cancelamento") : null;

      if (!href) {
        toast.success("Consulta cancelada", {
          description:
            "Avise o paciente: ele não tem telefone no cadastro para o WhatsApp.",
          duration: 10_000,
        });
        return;
      }

      toast.success("Consulta cancelada", {
        description: "Avise o paciente — o e-mail pode cair no spam dele.",
        duration: 15_000,
        action: {
          label: "Avisar no WhatsApp",
          onClick: () => window.open(href, "_blank", "noopener"),
        },
      });
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
      repetirSemanas: parseInt(formData.repetir) || 1,
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
              {/* Terapia é semanal: repetir cria N consultas independentes, no
                  mesmo dia/hora das semanas seguintes, cada uma com sua sala. */}
              <div className="space-y-2">
                <Label htmlFor="repetir">Repetir semanalmente</Label>
                <Select
                  value={formData.repetir}
                  onValueChange={(value) => setFormData({ ...formData, repetir: value })}
                >
                  <SelectTrigger id="repetir">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Não repetir (só esta)</SelectItem>
                    <SelectItem value="4">Por 4 semanas</SelectItem>
                    <SelectItem value="8">Por 8 semanas</SelectItem>
                    <SelectItem value="12">Por 12 semanas</SelectItem>
                  </SelectContent>
                </Select>
                {formData.repetir !== "1" && (
                  <p className="text-xs text-muted-foreground">
                    Serão criadas {formData.repetir} consultas, sempre no mesmo dia e
                    horário. Cada uma pode ser cancelada ou remarcada sozinha.
                  </p>
                )}
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
                      const roomUrl = roomUrlFor(
                        appointment.id,
                        appointment.patientId,
                        appointment.roomToken,
                      );
                      const destacada = appointment.id === highlightId;
                      return (
                        <TableRow
                          key={appointment.id}
                          data-appt={appointment.id}
                          className={
                            destacada ? "bg-primary/10 ring-1 ring-primary/40" : ""
                          }
                        >
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
                            {appointment.confirmedAt ? (
                              <span className="block text-[10px] text-green-600 mt-1">
                                ✓ Presença confirmada
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(roomUrl)}
                                className="p-1 h-auto"
                                title="Copiar link da sala"
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                              {status === "scheduled" &&
                                (() => {
                                  const href = whatsappHref(appointment);
                                  return (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={!href}
                                      onClick={() =>
                                        href && window.open(href, "_blank", "noopener")
                                      }
                                      className="p-1 h-auto text-green-600 hover:bg-green-50 disabled:text-muted-foreground"
                                      title={
                                        href
                                          ? "Avisar por WhatsApp"
                                          : "Paciente sem telefone cadastrado"
                                      }
                                    >
                                      <WhatsAppIcon className="w-4 h-4" />
                                    </Button>
                                  );
                                })()}
                            </div>
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
