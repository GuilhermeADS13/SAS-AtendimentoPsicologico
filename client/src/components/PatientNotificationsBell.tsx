import { trpc } from "@/lib/trpc";
import { formatarData } from "@shared/datas";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { NotificationsMenu, type NotifItem } from "./NotificationsMenu";

// Os tipos que o paciente recebe. Texto amigável, sem jargão de fila de e-mail.
// "Consulta agendada" chegou depois: sem rótulo, aparecia "Aviso da sua consulta".
const TYPE_LABEL: Record<string, string> = {
  appointment_reminder: "Lembrete da sua consulta",
  appointment_cancelled: "Uma consulta foi cancelada",
  new_appointment: "Nova consulta agendada",
};

/**
 * Sineta do paciente. Feed limpo: só o tipo e a data das notificações das
 * consultas dele — sem status de envio ("falhou") nem e-mail, que são coisa da
 * administração da fila, não do paciente.
 */
export function PatientNotificationsBell() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: notifications = [], isSuccess: carregado } = trpc.me.notifications.useQuery(undefined, {
    refetchInterval: 60_000,
    retry: false,
  });

  const dismiss = trpc.me.dismissNotification.useMutation({
    onSuccess: () => utils.me.notifications.invalidate(),
    onError: (e) => toast.error(e.message || "Não foi possível remover"),
  });
  const dismissAll = trpc.me.dismissAllNotifications.useMutation({
    onSuccess: () => utils.me.notifications.invalidate(),
    onError: (e) => toast.error(e.message || "Não foi possível limpar"),
  });

  const items: NotifItem[] = notifications.map((n) => ({
    id: n.id,
    titulo: TYPE_LABEL[n.notificationType] ?? "Aviso da sua consulta",
    subtitulo: formatarData(n.createdAt),
  }));

  return (
    <NotificationsMenu
      items={items}
      carregado={carregado}
      badge={items.length}
      onItemClick={() => setLocation("/consultas")}
      onDismiss={(id) => dismiss.mutate({ id })}
      onClearAll={() => dismissAll.mutate()}
    />
  );
}
