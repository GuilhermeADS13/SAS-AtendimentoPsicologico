import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRole } from "@/hooks/useRole";
import DashboardLayout from "@/components/DashboardLayout";
import ChatConversa from "@/components/ChatConversa";
import { ArrowLeft, Loader2, MessageSquare } from "lucide-react";

/** Lado da psicóloga: lista de pacientes + conversa selecionada. */
function ChatTerapeuta() {
  const threads = trpc.chat.threads.useQuery(undefined, { refetchInterval: 8000 });
  const [sel, setSel] = useState<{ id: number; nome: string } | null>(null);
  const lista = threads.data ?? [];

  return (
    <div className="grid h-[calc(100dvh-9rem)] grid-cols-1 overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-[300px_1fr]">
      {/* Lista de conversas */}
      <div className={`min-h-0 flex-col border-r border-border ${sel ? "hidden lg:flex" : "flex"}`}>
        <div className="border-b border-border p-3">
          <h2 className="font-semibold text-foreground">Conversas</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {threads.isLoading ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : lista.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhum paciente na sua grade ainda.</p>
          ) : (
            lista.map((t) => (
              <button
                key={t.patientId}
                type="button"
                onClick={() => setSel({ id: t.patientId, nome: `${t.firstName} ${t.lastName}` })}
                className={`flex w-full items-center gap-3 border-b border-border/60 px-3 py-3 text-left hover:bg-accent/50 ${
                  sel?.id === t.patientId ? "bg-accent/60" : ""
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {t.firstName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {t.firstName} {t.lastName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.lastFromMe && t.preview ? "Você: " : ""}
                    {t.preview || "Iniciar conversa"}
                  </p>
                </div>
                {t.unread > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                    {t.unread}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Conversa */}
      <div className={`min-h-0 ${sel ? "flex" : "hidden lg:flex"} flex-col`}>
        {sel ? (
          <>
            <button
              type="button"
              onClick={() => setSel(null)}
              className="flex items-center gap-1 border-b border-border p-2 text-sm text-muted-foreground lg:hidden"
            >
              <ArrowLeft className="h-4 w-4" /> Conversas
            </button>
            <div className="min-h-0 flex-1">
              <ChatConversa key={sel.id} patientId={sel.id} titulo={sel.nome} />
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <MessageSquare className="h-8 w-8" />
            <p className="text-sm">Selecione uma conversa.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Mensagens() {
  const { isTherapist } = useRole();
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div data-tour="mensagens">
          <h1 className="text-3xl font-bold text-foreground">Mensagens</h1>
          <p className="text-muted-foreground">
            {isTherapist ? "Fale com o seu paciente." : "Fale com o seu profissional."}
          </p>
        </div>
        {isTherapist ? (
          <ChatTerapeuta />
        ) : (
          <div className="h-[calc(100dvh-11rem)] overflow-hidden rounded-xl border border-border bg-card">
            <ChatConversa titulo="Minha psicóloga" />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
