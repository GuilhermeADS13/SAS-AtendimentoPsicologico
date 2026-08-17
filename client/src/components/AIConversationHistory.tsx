import { Clock3, Eye, Moon, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LumaStatus } from "./AIChatBox";

export type AIConversationHistoryItem = {
  id: number;
  title: string;
  lastMessageAt?: string | Date | null;
  messageCount?: number;
  status?: "active" | "archived";
};

export type AIConversationHistoryProps = {
  conversations: AIConversationHistoryItem[];
  selectedId?: number;
  lumaStatus?: LumaStatus;
  processingConversationId?: number;
  onSelect: (conversation: AIConversationHistoryItem) => void;
};

function formatDate(value?: string | Date | null) {
  if (!value) return "Sem mensagens";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem mensagens";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function AIConversationHistory({
  conversations,
  selectedId,
  lumaStatus = "attentive",
  processingConversationId,
  onSelect,
}: AIConversationHistoryProps) {
  const isProcessing = processingConversationId !== undefined;

  return (
    <aside className="flex h-full w-full max-w-sm flex-col border-r bg-card" aria-label="Histórico de conversas da Luma">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <div className="flex size-9 items-center justify-center rounded-full bg-primary/10" aria-label={lumaStatus === "sleeping" ? "Luma dormindo em modo economia" : "Luma atenta"}>
          {lumaStatus === "sleeping" ? <Moon className="size-4 text-primary" /> : <Eye className="size-4 text-primary" />}
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Histórico da Luma</h2>
          <p className="truncate text-xs text-muted-foreground">
            {isProcessing ? "Processando prontuários com cuidado" : lumaStatus === "sleeping" ? "Modo economia" : "Atenta ao atendimento"}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
            <MessageCircle className="size-6 opacity-50" />
            <p>Nenhuma conversa encontrada.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conversation) => {
              const processing = processingConversationId === conversation.id;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => onSelect(conversation)}
                  className={cn("w-full rounded-md p-3 text-left transition-colors hover:bg-accent", selectedId === conversation.id && "bg-accent")}
                  aria-current={selectedId === conversation.id ? "true" : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-sm font-medium">{conversation.title}</span>
                    {processing && <Moon className="size-4 shrink-0 animate-pulse text-primary" aria-label="Luma em processamento" />}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock3 className="size-3" />
                    <span>{formatDate(conversation.lastMessageAt)}</span>
                    {conversation.messageCount !== undefined && <span>· {conversation.messageCount} mensagens</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

export default AIConversationHistory;
