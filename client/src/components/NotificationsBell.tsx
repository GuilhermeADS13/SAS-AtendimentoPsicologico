import { formatarData } from "@shared/datas";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { BASE_DOS_AVISOS_DA_REDE, NotificationsMenu, useAvisosDaRedeOcultos, type NotifItem } from "./NotificationsMenu";

const FORMATO_DO_HORARIO = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const TYPE_LABEL: Record<string, string> = {
  appointment_reminder: "Lembrete de consulta",
  appointment_confirmation: "Confirmação de consulta",
  appointment_cancelled: "Consulta cancelada",
  new_appointment: "Novo agendamento",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "pendente",
  sent: "enviado",
  failed: "falhou",
};

/** Sineta da psicóloga: histórico das notificações das consultas dela. */
export function NotificationsBell() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: notifications = [], isSuccess: carregado } = trpc.notifications.list.useQuery(undefined, {
    refetchInterval: 60_000,
    retry: false,
  });

  const dismiss = trpc.notifications.dismiss.useMutation({
    onSuccess: () => utils.notifications.list.invalidate(),
    onError: (e) => toast.error(e.message || "Não foi possível remover"),
  });
  const dismissAll = trpc.notifications.dismissAll.useMutation({
    onSuccess: () => utils.notifications.list.invalidate(),
    onError: (e) => toast.error(e.message || "Não foi possível limpar"),
  });

  // Pedidos de primeira conversa (Rede) esperando resposta: entram no sino junto das
  // consultas e somem sozinhos quando ela aceita ou recusa.
  const { data: pedidos } = trpc.conhecer.pedidosRecebidos.useQuery(undefined, { refetchInterval: 60_000, retry: false });
  const { ocultos, ocultar } = useAvisosDaRedeOcultos();
  const avisosDaRede: NotifItem[] = (pedidos ?? [])
    .filter((p) => p.status === "pendente")
    .map((p) => ({
      id: BASE_DOS_AVISOS_DA_REDE + p.id,
      titulo: "Pedido de primeira conversa",
      subtitulo: `${p.nome.split(" ")[0]} · ${FORMATO_DO_HORARIO.format(new Date(p.inicio))}`,
    }))
    .filter((a) => !ocultos.has(a.id));

  const pending = notifications.filter((n) => n.status === "pending").length + avisosDaRede.length;

  // O som de notificação nova toca no NotificationsMenu, junto com o aviso na
  // tela — lá vale para a psicóloga e para o paciente.

  const items: NotifItem[] = [...avisosDaRede, ...notifications.map((n) => ({
    id: n.id,
    titulo: TYPE_LABEL[n.notificationType] ?? "Notificação",
    subtitulo: `${n.recipientEmail} · ${formatarData(n.createdAt)} · ${
      STATUS_LABEL[n.status] ?? n.status
    }`,
  }))];

  const irParaConsulta = (id: number) => {
    if (id >= BASE_DOS_AVISOS_DA_REDE) return setLocation("/rede?aba=pedidos");
    const n = notifications.find((x) => x.id === id);
    if (n) setLocation(`/appointments?ap=${n.appointmentId}`);
  };

  return (
    <NotificationsMenu
      items={items}
      carregado={carregado}
      badge={pending}
      onItemClick={irParaConsulta}
      onDismiss={(id) => (id >= BASE_DOS_AVISOS_DA_REDE ? ocultar([id]) : dismiss.mutate({ id }))}
      onClearAll={() => {
        ocultar(avisosDaRede.map((a) => a.id));
        dismissAll.mutate();
      }}
    />
  );
}
