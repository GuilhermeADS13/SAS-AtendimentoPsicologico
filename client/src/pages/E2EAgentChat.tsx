import { useState } from "react";
import { AIChatBox, type LumaFeedback, type Message } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";

export default function E2EAgentChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [feedbackByMessageId, setFeedbackByMessageId] = useState<Record<number, LumaFeedback>>({});
  const chatMutation = trpc.ai.chat.useMutation();
  const feedbackMutation = trpc.ai.feedback.useMutation();

  async function handleSend(content: string) {
    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setIsLoading(true);
    try {
      const result = await chatMutation.mutateAsync({
        messages: nextMessages.filter((message): message is Message & { role: "user" | "assistant" } => message.role !== "system"),
        conversationId,
      });
      if (typeof result.conversationId === "number") setConversationId(result.conversationId);
      setMessages((current) => [...current, {
        id: result.messageId,
        role: "assistant",
        content: result.content,
        sources: result.sources,
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        role: "assistant",
        content: error instanceof Error ? error.message : "Não foi possível responder agora.",
      }]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleMessageFeedback(message: Message, rating: LumaFeedback) {
    if (!message.id) return;
    setFeedbackByMessageId((current) => ({ ...current, [message.id as number]: rating }));
    feedbackMutation.mutate({ messageId: message.id, rating });
  }

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Agente RAG — teste E2E</h1>
        <p className="text-sm text-muted-foreground">
          Ambiente de teste da conversa com fontes autorizadas. Não usar esta rota em produção.
        </p>
        <AIChatBox
          messages={messages}
          onSendMessage={handleSend}
          isLoading={isLoading}
          placeholder="Pergunte sobre seus registros autorizados..."
          emptyStateMessage="Faça uma pergunta sobre os registros autorizados."
          height="520px"
          onMessageFeedback={handleMessageFeedback}
          feedbackByMessageId={feedbackByMessageId}
        />
      </div>
    </main>
  );
}
