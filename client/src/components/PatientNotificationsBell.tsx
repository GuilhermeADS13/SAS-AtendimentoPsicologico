import { trpc } from "@/lib/trpc";
import { formatarData } from "@shared/datas";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { BASE_DOS_AVISOS_DA_REDE, NotificationsMenu, useAvisosDaRedeOcultos, type NotifItem } from "./NotificationsMenu";

const FORMATO_DO_HORARIO = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

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

  // Convites de psicólogas (Rede) esperando resposta: somem quando ele responde.
  const { data: situacao } = trpc.conhecer.minhaSituacao.useQuery(undefined, { refetchInterval: 60_000, retry: false });
  const { ocultos, ocultar } = useAvisosDaRedeOcultos();
  const convites: NotifItem[] = (situacao?.convites ?? [])
    .filter((c) => c.status === "pendente")
    .map((c) => ({
      id: BASE_DOS_AVISOS_DA_REDE + c.id,
      titulo: "Convite para uma primeira conversa",
      subtitulo: `${c.nome || "Uma psicóloga"} · ${FORMATO_DO_HORARIO.format(new Date(c.inicio))}`,
    }))
    .filter((c) => !ocultos.has(c.id));

  const items: NotifItem[] = [
    ...convites,
    ...notifications.map((n) => ({
      id: n.id,
      titulo: TYPE_LABEL[n.notificationType] ?? "Aviso da sua consulta",
      subtitulo: formatarData(n.createdAt),
    })),
  ];

  return (
    <NotificationsMenu
      items={items}
      carregado={carregado}
      badge={items.length}
      onItemClick={(id) => setLocation(id >= BASE_DOS_AVISOS_DA_REDE ? "/rede" : "/consultas")}
      onDismiss={(id) => (id >= BASE_DOS_AVISOS_DA_REDE ? ocultar([id]) : dismiss.mutate({ id }))}
      onClearAll={() => {
        ocultar(convites.map((c) => c.id));
        dismissAll.mutate();
      }}
    />
  );
}
