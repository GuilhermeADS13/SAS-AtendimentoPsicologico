import { formatarData } from "@shared/datas";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { NotificationsMenu, type NotifItem } from "./NotificationsMenu";

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

  const pending = notifications.filter((n) => n.status === "pending").length;

  // O som de notificação nova toca no NotificationsMenu, junto com o aviso na
  // tela — lá vale para a psicóloga e para o paciente.

  const items: NotifItem[] = notifications.map((n) => ({
    id: n.id,
    titulo: TYPE_LABEL[n.notificationType] ?? "Notificação",
    subtitulo: `${n.recipientEmail} · ${formatarData(n.createdAt)} · ${
      STATUS_LABEL[n.status] ?? n.status
    }`,
  }));

  const irParaConsulta = (id: number) => {
    const n = notifications.find((x) => x.id === id);
    if (n) setLocation(`/appointments?ap=${n.appointmentId}`);
  };

  return (
    <NotificationsMenu
      items={items}
      carregado={carregado}
      badge={pending}
      onItemClick={irParaConsulta}
      onDismiss={(id) => dismiss.mutate({ id })}
      onClearAll={() => dismissAll.mutate()}
    />
  );
}
