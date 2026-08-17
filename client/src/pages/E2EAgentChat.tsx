import { useState } from "react";
import { AIChatBox, type Message } from "@/components/AIChatBox";

export default function E2EAgentChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSend(content: string) {
    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setIsLoading(true);
    try {
      const input = encodeURIComponent(JSON.stringify({ 0: { json: { messages: nextMessages } } }));
      const response = await fetch(`/api/trpc/ai.chat?batch=1&input=${input}`);
      if (!response.ok) throw new Error("Falha ao conversar com o agente");
      const payload = await response.json();
      const assistantContent = payload?.[0]?.result?.data?.json?.choices?.[0]?.message?.content;
      if (typeof assistantContent !== "string") throw new Error("Resposta inválida do agente");
      setMessages((current) => [...current, { role: "assistant", content: assistantContent }]);
    } catch (error) {
      setMessages((current) => [...current, {
        role: "assistant",
        content: error instanceof Error ? error.message : "Não foi possível responder agora.",
      }]);
    } finally {
      setIsLoading(false);
    }
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
        />
      </div>
    </main>
  );
}
