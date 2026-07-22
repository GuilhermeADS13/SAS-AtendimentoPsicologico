import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { playNotificationPing } from "@/lib/sound";
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
  const { data: notifications = [] } = trpc.notifications.list.useQuery(undefined, {
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

  // Toca um "ping" quando chega notificação nova. O maior id conhecido é a
  // referência; na primeira carga não toca (senão apitaria a cada abertura da
  // página). A lista é buscada de 60 em 60s, então o som pode atrasar até 1 min.
  const ultimoIdConhecido = useRef<number | null>(null);
  useEffect(() => {
    if (notifications.length === 0) return;
    const maiorId = Math.max(...notifications.map((n) => n.id));
    if (ultimoIdConhecido.current === null) {
      ultimoIdConhecido.current = maiorId; // primeira carga: só memoriza
      return;
    }
    if (maiorId > ultimoIdConhecido.current) {
      playNotificationPing();
      ultimoIdConhecido.current = maiorId;
    }
  }, [notifications]);

  const items: NotifItem[] = notifications.map((n) => ({
    id: n.id,
    titulo: TYPE_LABEL[n.notificationType] ?? "Notificação",
    subtitulo: `${n.recipientEmail} · ${new Date(n.createdAt).toLocaleDateString("pt-BR")} · ${
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
      badge={pending}
      onItemClick={irParaConsulta}
      onDismiss={(id) => dismiss.mutate({ id })}
      onClearAll={() => dismissAll.mutate()}
    />
  );
}
