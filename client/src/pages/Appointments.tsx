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
import { Plus, Calendar, Clock, CheckCircle, XCircle, Copy, ExternalLink, Wallet, Table as TableIcon, CalendarDays, Filter, Loader2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { CalendarioAgenda } from "@/components/CalendarioAgenda";
import { reaisParaCentavos, centavosParaInput, formatarBRL } from "@shared/dinheiro";

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

const emptyForm = { patientId: "", date: "", time: "", duration: "60", repetir: "1", valor: "" };

export default function Appointments() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { user } = useAuth();

  const { data: appointments = [] } = trpc.appointments.list.useQuery();
  const { data: patients = [] } = trpc.patients.list.useQuery();
  // Preço padrão da psicóloga: preenche o valor de cada consulta nova.
  const { data: therapist } = trpc.therapists.me.useQuery();

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
  const [vista, setVista] = useState<"tabela" | "calendario">("tabela");
  const [filtroPagamento, setFiltroPagamento] = useState<"todos" | "pendentes" | "pagos">("todos");
  const [paymentUpdatingId, setPaymentUpdatingId] = useState<number | null>(null);

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
          className: "bg-card text-card-foreground border-border shadow-md",
          descriptionClassName: "text-foreground opacity-100",
          duration: 10_000,
        });
        return;
      }

      toast.success("Consulta cancelada", {
        description: "Avise o paciente — o e-mail pode cair no spam dele.",
        className: "bg-card text-card-foreground border-border shadow-md",
        descriptionClassName: "text-foreground opacity-100",
        duration: 15_000,
        action: {
          label: "Avisar no WhatsApp",
          onClick: () => window.open(href, "_blank", "noopener"),
        },
      });
    },
    onError: (e) => toast.error(e.message || "Erro ao atualizar status"),
  });

  const setPayment = trpc.appointments.setPayment.useMutation({
    onSuccess: (_data, vars) => {
      setPaymentUpdatingId(null);
      utils.appointments.list.invalidate();
      toast.success(vars.paid ? "Pagamento marcado como pago" : "Pagamento voltou para pendente");
    },
    onError: (e) => {
      setPaymentUpdatingId(null);
      toast.error(e.message || "Erro ao atualizar o pagamento");
    },
  });

  const togglePayment = (appointment: (typeof appointments)[number]) => {
    const nextPaid = !appointment.paid;
    if (nextPaid && !window.confirm("Confirmar que esta consulta foi paga?")) return;
    setPaymentUpdatingId(appointment.id);
    setPayment.mutate({ id: appointment.id, paid: nextPaid });
  };

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
      price: reaisParaCentavos(formData.valor),
    });
  };

  // Resumo financeiro do MÊS corrente (por data da consulta): recebido = pagas;
  // a receber = ainda não pagas que não foram canceladas/faltadas. Calculado no
  // cliente sobre a lista já carregada — sem query nova, escala do piloto.
  const agora = new Date();
  const doMes = appointments.filter((a) => {
    const d = new Date(a.scheduledAt);
    return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
  });
  const recebidoMes = doMes
    .filter((a) => a.paid)
    .reduce((soma, a) => soma + (a.price ?? 0), 0);
  const aReceberMes = doMes
    .filter((a) => !a.paid && a.status !== "cancelled" && a.status !== "no_show")
    .reduce((soma, a) => soma + (a.price ?? 0), 0);
  const mesLabel = agora.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const filteredAppointments = appointments.filter((appointment) =>
    filtroPagamento === "todos" || (filtroPagamento === "pagos" ? appointment.paid : !appointment.paid),
  );

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
        <Dialog
          open={isOpen}
          onOpenChange={(aberto) => {
            setIsOpen(aberto);
            // Ao abrir, preenche o valor com o preço padrão (se estiver vazio).
            if (aberto) {
              setFormData((f) => ({
                ...f,
                valor: f.valor || centavosParaInput(therapist?.sessionPrice),
              }));
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground sm:w-auto">
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
              <div className="space-y-2">
                <Label htmlFor="valor">Valor da consulta</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    R$
                  </span>
                  <Input
                    id="valor"
                    value={formData.valor}
                    onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                    placeholder="150,00"
                    inputMode="decimal"
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Já vem do preço padrão do seu perfil. Deixe vazio se não quiser registrar valor.
                </p>
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

        {/* Resumo financeiro do mês. Só aparece quando há valor a mostrar —
            sem preço registrado, não polui a tela com "R$ 0,00". */}
        {(recebidoMes > 0 || aReceberMes > 0) && (
          <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
            <Card className="border-primary/20">
              <CardContent className="flex items-center gap-3">
                <Wallet className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground capitalize">
                    Recebido · {mesLabel}
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    {formatarBRL(recebidoMes)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">A receber</p>
                  <p className="text-lg font-bold text-foreground">
                    {formatarBRL(aReceberMes)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Consultas: tabela ou calendário — os mesmos dados, duas visões. */}
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <CardTitle>Consultas Agendadas</CardTitle>
            <div className="inline-flex rounded-lg border border-border p-0.5">
              <button
                onClick={() => setVista("tabela")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm transition-colors ${
                  vista === "tabela"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <TableIcon className="w-4 h-4" /> Tabela
              </button>
              <button
                onClick={() => setVista("calendario")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm transition-colors ${
                  vista === "calendario"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <CalendarDays className="w-4 h-4" /> Calendário
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {vista === "tabela" && (
              <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Filter className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium text-foreground">Pagamento</p>
                    <p>Clique em <strong>Pendente · alterar</strong> ou <strong>Pago · alterar</strong> para atualizar o status.</p>
                  </div>
                </div>
                <Select value={filtroPagamento} onValueChange={(value) => setFiltroPagamento(value as typeof filtroPagamento)}>
                  <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar por pagamento">
                    <SelectValue placeholder="Filtrar pagamentos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os pagamentos</SelectItem>
                    <SelectItem value="pendentes">Somente pendentes</SelectItem>
                    <SelectItem value="pagos">Somente pagos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {vista === "calendario" ? (
              <CalendarioAgenda
                appointments={filteredAppointments}
                patientName={patientName}
                onSelect={(a) =>
                  setLocation(roomUrlFor(a.id, a.patientId, a.roomToken))
                }
              />
            ) : (
            <>
            <div className="grid gap-3 2xl:hidden">
              {appointments.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhuma consulta agendada.
                </div>
              ) : filteredAppointments.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhuma consulta encontrada neste filtro.
                </div>
              ) : (
                filteredAppointments.map((appointment) => {
                  const scheduled = new Date(appointment.scheduledAt);
                  const status = appointment.status as Status;
                  const roomUrl = roomUrlFor(appointment.id, appointment.patientId, appointment.roomToken);
                  const href = whatsappHref(appointment);
                  return (
                    <article key={appointment.id} className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold">{patientName(appointment.patientId)}</h3>
                          <p className="text-sm text-muted-foreground">
                            {scheduled.toLocaleDateString("pt-BR")} às {scheduled.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {appointment.duration} min
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${getStatusColor(status)}`}>
                          {getStatusLabel(status)}
                        </span>
                      </div>
                      {appointment.confirmedAt ? (
                        <p className="text-xs text-green-600">✓ Presença confirmada</p>
                      ) : null}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-y py-2">
                        <span className="text-sm font-medium">{formatarBRL(appointment.price, "Sem preço")}</span>
                        <button
                          onClick={() => togglePayment(appointment)}
                          disabled={paymentUpdatingId !== null}
                          title="Clique para alternar entre pago e pendente"
                          aria-label={`Pagamento ${appointment.paid ? "pago" : "pendente"}. Clique para alternar.`}
                          className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${appointment.paid ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"}`}
                        >
                          {paymentUpdatingId === appointment.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : appointment.paid ? <CheckCircle className="h-3 w-3" aria-hidden="true" /> : <Clock className="h-3 w-3" aria-hidden="true" />}
                          {appointment.paid ? "Pago" : "Pendente"} · alterar
                        </button>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {appointment.paidAt ? <p>Pago em {new Date(appointment.paidAt).toLocaleDateString("pt-BR")}</p> : appointment.updatedAt ? <p>Atualizado em {new Date(appointment.updatedAt).toLocaleDateString("pt-BR")}</p> : null}
                        {appointment.paymentUpdatedByName ? <p>Alterado por {appointment.paymentUpdatedByName}</p> : null}
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Button variant="outline" size="sm" onClick={() => copyToClipboard(roomUrl)} className="h-10 justify-center gap-1.5" title="Copiar link da sala">
                          <Copy className="h-4 w-4" /> Copiar sala
                        </Button>
                        {status === "scheduled" ? (
                          <Button variant="outline" size="sm" disabled={!href} onClick={() => href && window.open(href, "_blank", "noopener")} className="h-10 justify-center gap-1.5 text-green-700" title={href ? "Abrir mensagem pronta no WhatsApp" : "Paciente sem telefone cadastrado"}>
                            <WhatsAppIcon className="h-4 w-4" /> Avisar no WhatsApp
                          </Button>
                        ) : null}
                        {status === "scheduled" ? (
                          <>
                            <Button variant="outline" size="sm" onClick={() => setLocation(roomUrl)} className="h-10 justify-center gap-1.5 text-primary" title="Entrar na videochamada">
                              <ExternalLink className="h-4 w-4" /> Entrar na videochamada
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => updateStatus.mutate({ id: appointment.id, status: "completed" })} className="h-10 justify-center gap-1.5 text-green-700" title="Marcar consulta como realizada">
                              <CheckCircle className="h-4 w-4" /> Realizada
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => updateStatus.mutate({ id: appointment.id, status: "cancelled" })} className="h-10 justify-center gap-1.5 text-red-700" title="Cancelar consulta">
                              <XCircle className="h-4 w-4" /> Cancelar
                            </Button>
                          </>
                        ) : <span className="text-xs text-muted-foreground">Sem ações</span>}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
            <div className="hidden overflow-x-auto 2xl:block">
              <Table className="min-w-[1120px] table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Paciente</TableHead>
                    <TableHead className="w-[130px]">Data</TableHead>
                    <TableHead className="w-[100px]">Hora</TableHead>
                    <TableHead className="w-[100px]">Duração</TableHead>
                    <TableHead className="w-[150px]">Status</TableHead>
                    <TableHead className="w-[170px]">Pagamento</TableHead>
                    <TableHead className="w-[300px]">Sala</TableHead>
                    <TableHead className="w-[240px] text-left">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Nenhuma consulta agendada.
                      </TableCell>
                    </TableRow>
                  ) : filteredAppointments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Nenhuma consulta encontrada neste filtro.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAppointments.map((appointment) => {
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
                          className={`${
                            destacada ? "bg-primary/10 ring-1 ring-primary/40" : ""
                          } ${
                            status === "cancelled"
                              ? "bg-red-50/60 dark:bg-red-950/20"
                              : status === "no_show"
                                ? "bg-yellow-50/50 dark:bg-yellow-950/20"
                                : ""
                          }`}
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
                            <div className="flex flex-col items-start gap-1">
                              <span className="text-sm text-foreground">
                                {formatarBRL(appointment.price, "Sem preço")}
                              </span>
                              {/* Clicável: alterna pago/pendente na hora. */}
                              <button
                                onClick={() => togglePayment(appointment)}
                                disabled={paymentUpdatingId !== null}
                                title="Clique para alternar entre pago e pendente"
                                aria-label={`Pagamento ${appointment.paid ? "pago" : "pendente"}. Clique para alternar.`}
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold transition-colors ${
                                  appointment.paid
                                    ? "bg-green-100 text-green-800 hover:bg-green-200"
                                    : "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                                }`}
                              >
                                {paymentUpdatingId === appointment.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                                ) : appointment.paid ? (
                                  <CheckCircle className="h-3 w-3" aria-hidden="true" />
                                ) : (
                                  <Clock className="h-3 w-3" aria-hidden="true" />
                                )}
                                <span>{appointment.paid ? "Pago" : "Pendente"}</span>
                                <span className="text-[10px] font-medium underline underline-offset-2 opacity-80">alterar</span>
                                </button>
                              {appointment.paidAt ? (
                                <span className="text-[10px] text-muted-foreground" title="Data em que o pagamento foi registrado">
                                  Pago em {new Date(appointment.paidAt).toLocaleDateString("pt-BR")}
                                </span>
                              ) : appointment.updatedAt ? (
                                <span className="text-[10px] text-muted-foreground" title="Última atualização registrada para esta consulta">
                                  Atualizado em {new Date(appointment.updatedAt).toLocaleDateString("pt-BR")}
                                </span>
                              ) : null}
                              {appointment.paymentUpdatedByName ? (
                                <span className="text-[10px] text-muted-foreground" title="Usuário que registrou a última alteração do pagamento">
                                  Alterado por {appointment.paymentUpdatedByName}
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyToClipboard(roomUrl)}
                                className="h-8 gap-1.5 whitespace-nowrap"
                                title="Copiar link da sala"
                                aria-label="Copiar link da sala"
                              >
                                <Copy className="h-4 w-4" />
                                <span>Copiar sala</span>
                              </Button>
                              {status === "scheduled" &&
                                (() => {
                                  const href = whatsappHref(appointment);
                                  return (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={!href}
                                      onClick={() =>
                                        href && window.open(href, "_blank", "noopener")
                                      }
                                      className="h-8 gap-1.5 whitespace-nowrap text-green-700 hover:bg-green-50 hover:text-green-800 disabled:text-muted-foreground"
                                      title={
                                        href
                                          ? "Abrir mensagem pronta no WhatsApp"
                                          : "Paciente sem telefone cadastrado"
                                      }
                                      aria-label={
                                        href
                                          ? "Avisar paciente pelo WhatsApp"
                                          : "Paciente sem telefone cadastrado"
                                      }
                                    >
                                      <WhatsAppIcon className="h-4 w-4" />
                                      <span>Avisar no WhatsApp</span>
                                    </Button>
                                  );
                                })()}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="grid w-[220px] grid-cols-1 gap-2">
                              {status === "scheduled" ? (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setLocation(roomUrl)}
                                    className="h-auto min-h-8 w-full justify-start gap-1.5 whitespace-normal text-left text-primary hover:bg-primary/10"
                                    title="Entrar na videochamada"
                                    aria-label="Entrar na videochamada"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                    <span>Entrar na videochamada</span>
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => updateStatus.mutate({ id: appointment.id, status: "completed" })}
                                    className="h-auto min-h-8 w-full justify-start gap-1.5 whitespace-normal text-left text-green-700 hover:bg-green-100 hover:text-green-800"
                                    title="Marcar consulta como realizada"
                                    aria-label="Marcar consulta como realizada"
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                    <span>Realizada</span>
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => updateStatus.mutate({ id: appointment.id, status: "cancelled" })}
                                    className="h-auto min-h-8 w-full justify-start gap-1.5 whitespace-normal text-left text-red-700 hover:bg-red-100 hover:text-red-800"
                                    title="Cancelar consulta"
                                    aria-label="Cancelar consulta"
                                  >
                                    <XCircle className="h-4 w-4" />
                                    <span>Cancelar</span>
                                  </Button>
                                </>
                              ) : (
                                <span className="text-xs text-muted-foreground">Sem ações</span>
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
            </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
