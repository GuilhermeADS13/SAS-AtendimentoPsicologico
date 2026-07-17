import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Bell } from "lucide-react";
import { useLocation } from "wouter";
import { playNotificationPing } from "@/lib/sound";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

export function NotificationsBell() {
  const [, setLocation] = useLocation();
  const { data: notifications = [] } = trpc.notifications.list.useQuery(undefined, {
    refetchInterval: 60_000,
    retry: false,
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="w-5 h-5" />
          {pending > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
              {pending > 9 ? "9+" : pending}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notificações</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="px-2 py-6 text-sm text-muted-foreground text-center">
            Nenhuma notificação
          </div>
        ) : (
          notifications.slice(0, 8).map((n) => (
            <DropdownMenuItem
              key={n.id}
              onClick={() => setLocation(`/appointments?ap=${n.appointmentId}`)}
              className="flex flex-col items-start gap-0.5 cursor-pointer"
            >
              <span className="text-sm font-medium text-foreground">
                {TYPE_LABEL[n.notificationType] ?? "Notificação"}
              </span>
              <span className="text-xs text-muted-foreground truncate max-w-full">
                {n.recipientEmail} · {new Date(n.createdAt).toLocaleDateString("pt-BR")} ·{" "}
                {STATUS_LABEL[n.status] ?? n.status}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
