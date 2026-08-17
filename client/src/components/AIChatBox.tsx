import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Loader2, Send, User, Sparkles, ThumbsUp, ThumbsDown, Moon, Eye } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Streamdown } from "streamdown";

/**
 * Message type matching server-side LLM Message interface
 */
export type MessageSource = {
  sourceType: "patient" | "session" | "document";
  sourceId: number;
  patientId: number;
  label?: string;
  requiresReview?: boolean;
};

export type Message = {
  id?: number;
  role: "system" | "user" | "assistant";
  content: string;
  sources?: MessageSource[];
};

export type LumaStatus = "attentive" | "sleeping";
export type LumaFeedback = "helpful" | "not_helpful";

export type AIChatBoxProps = {
  /**
   * Messages array to display in the chat.
   * Should match the format used by invokeLLM on the server.
   */
  messages: Message[];

  /**
   * Callback when user sends a message.
   * Typically you'll call a tRPC mutation here to invoke the LLM.
   */
  onSendMessage: (content: string) => void;

  /**
   * Whether the AI is currently generating a response
   */
  isLoading?: boolean;

  /**
   * Placeholder text for the input field
   */
  placeholder?: string;

  /**
   * Custom className for the container
   */
  className?: string;

  /**
   * Height of the chat box (default: 600px)
   */
  height?: string | number;

  /**
   * Empty state message to display when no messages
   */
  emptyStateMessage?: string;

  /**
   * Suggested prompts to display in empty state
   * Click to send directly
   */
  suggestedPrompts?: string[];

  /**
   * Display identity for the assistant persona
   */
  agentName?: string;

  /**
   * Short description shown beside the assistant name
   */
  agentSubtitle?: string;

  /** Visual status while the agent processes a large history/document. */
  lumaStatus?: LumaStatus;

  /** Optional label shown while the agent is processing. */
  processingLabel?: string;

  /** Called when a professional rates an assistant response. */
  onMessageFeedback?: (message: Message, rating: LumaFeedback) => void;

  /** Existing rating by stable message id, when feedback is persisted. */
  feedbackByMessageId?: Record<number, LumaFeedback>;
};

/**
 * A ready-to-use AI chat box component that integrates with the LLM system.
 *
 * Features:
 * - Matches server-side Message interface for seamless integration
 * - Markdown rendering with Streamdown
 * - Auto-scrolls to latest message
 * - Loading states
 * - Uses global theme colors from index.css
 *
 * @example
 * ```tsx
 * const ChatPage = () => {
 *   const [messages, setMessages] = useState<Message[]>([
 *     { role: "system", content: "You are a helpful assistant." }
 *   ]);
 *
 *   const chatMutation = trpc.ai.chat.useMutation({
 *     onSuccess: (response) => {
 *       // Assuming your tRPC endpoint returns the AI response as a string
 *       setMessages(prev => [...prev, {
 *         role: "assistant",
 *         content: response
 *       }]);
 *     },
 *     onError: (error) => {
 *       console.error("Chat error:", error);
 *       // Optionally show error message to user
 *     }
 *   });
 *
 *   const handleSend = (content: string) => {
 *     const newMessages = [...messages, { role: "user", content }];
 *     setMessages(newMessages);
 *     chatMutation.mutate({ messages: newMessages });
 *   };
 *
 *   return (
 *     <AIChatBox
 *       messages={messages}
 *       onSendMessage={handleSend}
 *       isLoading={chatMutation.isPending}
 *       suggestedPrompts={[
 *         "Explain quantum computing",
 *         "Write a hello world in Python"
 *       ]}
 *     />
 *   );
 * };
 * ```
 */
export function AIChatBox({
  messages,
  onSendMessage,
  isLoading = false,
  placeholder = "Type your message...",
  className,
  height = "600px",
  emptyStateMessage = "Converse com a Luma, sua coruja de apoio.",
  suggestedPrompts,
  agentName = "Luma",
  agentSubtitle = "Sua coruja de apoio no atendimento psicológico",
  lumaStatus = "attentive",
  processingLabel = "Luma está observando os registros com cuidado...",
  onMessageFeedback,
  feedbackByMessageId,
}: AIChatBoxProps) {
  const [input, setInput] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputAreaRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Filter out system messages
  const displayMessages = messages.filter((msg) => msg.role !== "system");

  // Calculate min-height for last assistant message to push user message to top
  const [minHeightForLastMessage, setMinHeightForLastMessage] = useState(0);

  useEffect(() => {
    if (containerRef.current && inputAreaRef.current) {
      const containerHeight = containerRef.current.offsetHeight;
      const inputHeight = inputAreaRef.current.offsetHeight;
      const scrollAreaHeight = containerHeight - inputHeight;

      // Reserve space for:
      // - padding (p-4 = 32px top+bottom)
      // - user message: 40px (item height) + 16px (margin-top from space-y-4) = 56px
      // Note: margin-bottom is not counted because it naturally pushes the assistant message down
      const userMessageReservedHeight = 56;
      const calculatedHeight = scrollAreaHeight - 32 - userMessageReservedHeight;

      setMinHeightForLastMessage(Math.max(0, calculatedHeight));
    }
  }, []);

  // Scroll to bottom helper function with smooth animation
  const scrollToBottom = () => {
    const viewport = scrollAreaRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLDivElement;

    if (viewport) {
      requestAnimationFrame(() => {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: 'smooth'
        });
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    onSendMessage(trimmedInput);
    setInput("");

    // Scroll immediately after sending
    scrollToBottom();

    // Keep focus on input
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={`Conversa com ${agentName}`}
      aria-busy={isLoading}
      className={cn(
        "flex flex-col bg-card text-card-foreground rounded-lg border shadow-sm",
        className
      )}
      style={{ height }}
    >
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10" aria-label={lumaStatus === "sleeping" ? "Luma em modo economia" : "Luma atenta"}>
          {lumaStatus === "sleeping" ? <Moon className="size-4 text-primary" /> : <Eye className="size-4 text-primary" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{agentName}</p>
          <p className="truncate text-xs text-muted-foreground">{lumaStatus === "sleeping" ? "Modo economia durante o processamento" : agentSubtitle}</p>
        </div>
      </div>

      {/* Messages Area */}
      <div ref={scrollAreaRef} className="flex-1 overflow-hidden">
        {displayMessages.length === 0 ? (
          <div className="flex h-full flex-col p-4">
            <div className="flex flex-1 flex-col items-center justify-center gap-6 text-muted-foreground">
              <div className="flex flex-col items-center gap-3">
                <Sparkles className="size-12 opacity-20" />
                <p className="text-sm">{emptyStateMessage}</p>
              </div>

              {suggestedPrompts && suggestedPrompts.length > 0 && (
                <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                  {suggestedPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => onSendMessage(prompt)}
                      disabled={isLoading}
                      className="rounded-lg border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col space-y-4 p-4">
              {displayMessages.map((message, index) => {
                // Apply min-height to last message only if NOT loading (when loading, the loading indicator gets it)
                const isLastMessage = index === displayMessages.length - 1;
                const shouldApplyMinHeight =
                  isLastMessage && !isLoading && minHeightForLastMessage > 0;

                return (
                  <div
                    key={message.id ?? `${message.role}-${index}-${message.content.slice(0, 24)}`}
                    role="article"
                    aria-label={message.role === "assistant" ? `Resposta de ${agentName}` : "Sua mensagem"}
                    className={cn(
                      "flex gap-3",
                      message.role === "user"
                        ? "justify-end items-start"
                        : "justify-start items-start"
                    )}
                    style={
                      shouldApplyMinHeight
                        ? { minHeight: `${minHeightForLastMessage}px` }
                        : undefined
                    }
                  >
                    {message.role === "assistant" && (
                      <div className="size-8 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                        {lumaStatus === "sleeping" ? <Moon className="size-4 text-primary" /> : <Sparkles className="size-4 text-primary" />}
                      </div>
                    )}

                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-4 py-2.5",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {message.role === "assistant" ? (
                        <>
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <Streamdown>{message.content}</Streamdown>
                          </div>
                          {message.sources && message.sources.length > 0 && (
                            <details className="mt-3 border-t border-border/60 pt-2 text-xs">
                              <summary className="cursor-pointer font-medium text-muted-foreground">Fontes autorizadas ({message.sources.length})</summary>
                              <ul className="mt-2 space-y-1 text-muted-foreground" aria-label="Fontes autorizadas da resposta">
                                {message.sources.map((source) => (
                                  <li key={`${source.sourceType}-${source.sourceId}`}>
                                    {source.label ?? `${source.sourceType} ${source.sourceId}`}
                                    {source.requiresReview ? " — requer revisão profissional" : ""}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm">
                          {message.content}
                        </p>
                      )}
                      {message.role === "assistant" && onMessageFeedback && (
                        <div className="mt-2 flex items-center gap-1 border-t border-border/60 pt-2" aria-label="Avaliar resposta da Luma">
                          <span className="mr-1 text-[11px] text-muted-foreground">Foi útil?</span>
                          {(["helpful", "not_helpful"] as const).map((rating) => {
                            const selected = message.id !== undefined && feedbackByMessageId?.[message.id] === rating;
                            return (
                              <button
                                key={rating}
                                type="button"
                                aria-label={rating === "helpful" ? "Resposta útil" : "Resposta não útil"}
                                aria-pressed={selected}
                                onClick={() => onMessageFeedback(message, rating)}
                                className={cn("rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground", selected && "bg-background text-primary")}
                              >
                                {rating === "helpful" ? <ThumbsUp className="size-3.5" /> : <ThumbsDown className="size-3.5" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {message.role === "user" && (
                      <div className="size-8 shrink-0 mt-1 rounded-full bg-secondary flex items-center justify-center">
                        <User className="size-4 text-secondary-foreground" />
                      </div>
                    )}
                  </div>
                );
              })}

              {isLoading && (
                <div
                  className="flex items-start gap-3"
                  style={
                    minHeightForLastMessage > 0
                      ? { minHeight: `${minHeightForLastMessage}px` }
                      : undefined
                  }
                >
                  <div className="size-8 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="size-4 text-primary" />
                  </div>
                  <div className="rounded-lg bg-muted px-4 py-2.5">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      <span>{processingLabel}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Input Area */}
      <form
        ref={inputAreaRef}
        onSubmit={handleSubmit}
        data-testid="ai-chat-form"
        className="flex gap-2 p-4 border-t bg-background/50 items-end"
      >
        <label htmlFor="luma-chat-input" className="sr-only">Mensagem para {agentName}</label>
        <Textarea
          id="luma-chat-input"
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          data-testid="ai-chat-input"
          className="flex-1 max-h-32 resize-none min-h-9"
          rows={1}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || isLoading}
          data-testid="ai-chat-submit"
          className="shrink-0 h-[38px] w-[38px]"
        >
          <span className="sr-only">{isLoading ? "Processando mensagem" : "Enviar mensagem"}</span>
          {isLoading ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Send aria-hidden="true" className="size-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
