import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { LumaOwlIcon } from "@/components/Logo";
import { Loader2, Send, User, Sparkles, ThumbsUp, ThumbsDown, RotateCcw, CalendarClock, Check, ChevronRight, X } from "lucide-react";
import { useState, useEffect, useRef, type ReactNode } from "react";
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

/** Ação de escrita na agenda proposta pela Luma, aguardando confirmação humana. */
export type PendingAction = {
  code: string;
  toolName: string;
  resumo: string;
};

const ROTULO_ACAO: Record<string, string> = {
  agendar_consulta: "Agendar consulta",
  remarcar_consulta: "Remarcar consulta",
  cancelar_consulta: "Cancelar consulta",
  registrar_pagamento: "Registrar pagamento",
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
   * Menu de sugestões "rico" (ícone + rótulo + dica curta), mostrado no estado
   * vazio como cartões organizados. Quando presente, tem prioridade sobre
   * `suggestedPrompts`. O clique envia o `label` como mensagem.
   */
  suggestedMenu?: { label: string; hint?: string; icon?: ReactNode }[];

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

  /**
   * Sugestões do que fazer AGORA, mostradas depois que uma ação é concluída.
   * Sem isso, a conversa terminava em "pronto, agendei" e a pessoa ficava sem
   * saber o próximo passo.
   */
  followUpPrompts?: string[];

  /**
   * Versão "rica" das sugestões pós-ação (ícone + rótulo + dica), mostrada em
   * cartões — o mesmo visual do menu inicial. Tem prioridade sobre `followUpPrompts`.
   */
  followUpMenu?: { label: string; hint?: string; icon?: ReactNode }[];

  /**
   * Recomeçar a conversa. Fica no menu DENTRO do chat, junto das sugestões —
   * solto no topo da página ficava longe de onde a pessoa está olhando.
   */
  onRestart?: () => void;

  /** Ação de escrita proposta pela Luma e ainda não executada. */
  pendingAction?: PendingAction | null;

  /** Confirma a ação pendente. A execução acontece no servidor, sem o modelo. */
  onConfirmAction?: () => void;

  /** Descarta a proposta sem executar nada. */
  onDismissAction?: () => void;

  /** Confirmação em andamento. */
  isConfirmingAction?: boolean;
};

/**
 * A caixa de conversa da Luma.
 *
 * Só desenha: quem chama a API e guarda as mensagens é a página (ver Luma.tsx).
 * Renderiza markdown com Streamdown, rola até a última mensagem, mostra as
 * fontes autorizadas de cada resposta, o "Foi útil?", o menu "E agora?" depois
 * de uma ação e o cartão de confirmação quando a Luma propõe mexer na agenda —
 * a ação só acontece no clique em "Confirmar", nunca pelo modelo.
 *
 * @example
 * ```tsx
 * <AIChatBox
 *   messages={messages}
 *   onSendMessage={handleSend}          // a página chama ai.chat ou ai.siteHelp
 *   isLoading={chatMutation.isPending}
 *   suggestedMenu={[{ label: "Quem eu atendo hoje?", hint: "Agenda do dia" }]}
 *   pendingAction={pendingAction}       // proposta aguardando confirmação
 *   onConfirmAction={handleConfirm}     // ai.confirmAction, executa no servidor
 *   onDismissAction={() => setPendingAction(null)}
 * />
 * ```
 */
export function AIChatBox({
  messages,
  onSendMessage,
  isLoading = false,
  placeholder = "Escreva sua mensagem...",
  className,
  height = "600px",
  emptyStateMessage = "Converse com a Luma, sua coruja de apoio.",
  suggestedPrompts,
  suggestedMenu,
  followUpPrompts,
  followUpMenu,
  onRestart,
  agentName = "Luma",
  agentSubtitle = "Sua coruja de apoio no atendimento psicológico",
  lumaStatus = "attentive",
  processingLabel = "Luma está observando os registros com cuidado...",
  onMessageFeedback,
  feedbackByMessageId,
  pendingAction,
  onConfirmAction,
  onDismissAction,
  isConfirmingAction = false,
}: AIChatBoxProps) {
  const [input, setInput] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputAreaRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ultimaMensagemRef = useRef<HTMLDivElement>(null);
  const espacadorRef = useRef<HTMLDivElement>(null);

  // Filter out system messages
  const displayMessages = messages.filter((msg) => msg.role !== "system");

  // Calculate min-height for last assistant message to push user message to top
  const [minHeightForLastMessage, setMinHeightForLastMessage] = useState(0);

  // Recalcula quando o chat muda de tamanho. Antes media uma vez só, ao abrir:
  // girar o tablet ou redimensionar a janela no meio da conversa deixava o
  // espaço com a medida antiga (sobrando ou faltando vão sob a última resposta).
  // O textarea também cresce ao digitar várias linhas, e isso muda a conta.
  useEffect(() => {
    const container = containerRef.current;
    const inputArea = inputAreaRef.current;
    if (!container || !inputArea) return;

    const medir = () => {
      const scrollAreaHeight = container.offsetHeight - inputArea.offsetHeight;
      // Reserve space for:
      // - padding (p-4 = 32px top+bottom)
      // - user message: 40px (item height) + 16px (margin-top from space-y-4) = 56px
      // Note: margin-bottom is not counted because it naturally pushes the assistant message down
      const userMessageReservedHeight = 56;
      setMinHeightForLastMessage(Math.max(0, scrollAreaHeight - 32 - userMessageReservedHeight));
    };

    medir();
    // Navegador antigo sem ResizeObserver fica com a medida inicial, como antes.
    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(medir);
    observador.observe(container);
    observador.observe(inputArea);
    return () => observador.disconnect();
  }, []);

  /**
   * O espaço no fim da conversa é SÓ o que falta para a última pergunta alcançar o
   * topo — nem um pixel a mais.
   *
   * Antes ele era sempre a área visível inteira: com uma resposta curta sobrava
   * quase uma tela em branco entre o "E agora?" e o campo de escrever, e o chat
   * parecia quebrado (mais visível no celular, onde a caixa é baixa).
   *
   * Medida: do topo da última pergunta até onde o conteúdo real termina (o próprio
   * espaçador). Como ele é o último elemento, a altura dele não entra na conta —
   * não há laço de medir/crescer.
   */
  const [espacoFinal, setEspacoFinal] = useState(0);
  useEffect(() => {
    const container = containerRef.current;
    const inputArea = inputAreaRef.current;
    if (!container || !inputArea) return;
    const medir = () => {
      const ultima = ultimaMensagemRef.current;
      const espacador = espacadorRef.current;
      if (!ultima || !espacador) {
        setEspacoFinal(0);
        return;
      }
      const areaVisivel = container.offsetHeight - inputArea.offsetHeight - 32; // p-4
      const alturaDoFinal = espacador.offsetTop - ultima.offsetTop;
      setEspacoFinal(Math.max(0, areaVisivel - alturaDoFinal));
    };
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(medir);
    observador.observe(container);
    observador.observe(inputArea);
    return () => observador.disconnect();
  }, [displayMessages.length, isLoading, followUpMenu, followUpPrompts, pendingAction]);

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

  /**
   * Deixa a ÚLTIMA mensagem visível, alinhada pelo começo dela.
   *
   * Dois problemas resolvidos aqui:
   *  - Antes só havia rolagem no ENVIO, então uma conversa restaurada abria na
   *    PRIMEIRA mensagem.
   *  - Rolar até o fim do container não serve: a última mensagem recebe um
   *    `minHeight` grande (para empurrar a pergunta ao topo), então o "fim" é o
   *    fim desse espaço vazio — e o texto ficava cortado acima da tela.
   *
   * Na abertura o salto é instantâneo (`auto`): animar do topo até embaixo dava
   * aquela descida rápida na cara de quem abre. Depois disso, mensagem nova rola
   * suave, que é o esperado durante a conversa.
   */
  const jaPosicionou = useRef(false);
  useEffect(() => {
    const alvo = ultimaMensagemRef.current;
    if (!alvo || displayMessages.length === 0) return;
    const primeiraVez = !jaPosicionou.current;
    jaPosicionou.current = true;
    requestAnimationFrame(() => {
      alvo.scrollIntoView({ block: "start", behavior: primeiraVez ? "auto" : "smooth" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayMessages.length, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    onSendMessage(trimmedInput);
    setInput("");
    // Volta à altura de uma linha: sem isto o campo ficava alto depois de enviar
    // um texto longo, com o espaço em branco sobrando embaixo do cursor.
    if (textareaRef.current) textareaRef.current.style.height = "";

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
      <div className="flex min-w-0 items-center gap-3 border-b px-3 py-3 sm:px-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10" aria-label={lumaStatus === "attentive" ? "Luma pensando" : "Luma pronta"}>
          <LumaOwlIcon className={"size-7"} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{agentName}</p>
          {/* "attentive" = processando (ver Luma.tsx). O texto estava trocado:
              mostrava "Modo economia durante o processamento" justamente quando
              NÃO havia processamento — afirmava o oposto do que acontecia. */}
          <p className="truncate text-xs text-muted-foreground">{lumaStatus === "attentive" ? "Pensando…" : agentSubtitle}</p>
        </div>
      </div>

      {/* Messages Area */}
      <div ref={scrollAreaRef} className="flex-1 overflow-hidden">
        {displayMessages.length === 0 ? (
          // Rola quando não cabe (celular pequeno, chat baixo) e só centraliza quando
          // sobra espaço: com `justify-center` simples, o conteúdo maior que a área
          // transbordava e os cartões de sugestão ficavam POR CIMA do texto.
          <div className="flex h-full flex-col overflow-y-auto p-4">
            <div className="flex flex-1 flex-col items-center justify-center-safe gap-6 text-muted-foreground">
              <div className="flex max-w-full shrink-0 flex-col items-center gap-3 text-center">
                <LumaOwlIcon className="size-16 opacity-85" />
                <p className="max-w-2xl break-words text-sm">{emptyStateMessage}</p>
              </div>

              {suggestedMenu && suggestedMenu.length > 0 ? (
                <div className="grid w-full max-w-xl shrink-0 grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {suggestedMenu.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => onSendMessage(item.label)}
                      disabled={isLoading}
                      className="group flex items-start gap-3 rounded-2xl border border-border bg-card px-3 py-3 text-left shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 motion-reduce:hover:translate-y-0"
                    >
                      {item.icon && (
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                          {item.icon}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">{item.label}</span>
                        {item.hint && (
                          <span className="mt-0.5 block text-xs text-muted-foreground">{item.hint}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              ) : suggestedPrompts && suggestedPrompts.length > 0 ? (
                <div className="flex w-full max-w-2xl shrink-0 flex-wrap justify-center gap-2">
                  {suggestedPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => onSendMessage(prompt)}
                      disabled={isLoading}
                      className="max-w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-center"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col space-y-4 p-4">
              {displayMessages.map((message, index) => {
                // Apply min-height to last message only if NOT loading (when loading, the loading indicator gets it)
                const isLastMessage = index === displayMessages.length - 1;
                // O espaço que deixa a última resposta subir para o topo da tela NÃO
                // fica mais na própria mensagem: ali ele empurrava o menu "E agora?"
                // uma tela inteira para baixo, longe da resposta. Virou um espaçador
                // DEPOIS do menu (no fim da lista) — a resposta continua subindo e o
                // menu fica logo abaixo dela.

                return (
                  <div
                    key={message.id ?? `${message.role}-${index}-${message.content.slice(0, 24)}`}
                    ref={isLastMessage ? ultimaMensagemRef : undefined}
                    role="article"
                    aria-label={message.role === "assistant" ? `Resposta de ${agentName}` : "Sua mensagem"}
                    className={cn(
                      "flex gap-3",
                      message.role === "user"
                        ? "justify-end items-start"
                        : "justify-start items-start"
                    )}
                  >
                    {message.role === "assistant" && (
                      <div className="size-8 shrink-0 mt-1 rounded-full bg-primary/10 flex items-center justify-center">
                        <LumaOwlIcon className={"size-7"} />
                      </div>
                    )}

                    <div
                      className={cn(
                        "min-w-0 max-w-[88%] overflow-hidden rounded-lg px-3 py-2.5 sm:max-w-[80%] sm:px-4",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {message.role === "assistant" ? (
                        <>
                          <div className="prose prose-sm dark:prose-invert max-w-none overflow-x-auto">
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
                      {/* Só oferece "Foi útil?" quando a resposta foi persistida
                          (tem id). Mensagens de erro e as do site-help não têm id
                          e não podem receber feedback — mostrar o botão nelas só
                          fazia o clique não pegar. */}
                      {message.role === "assistant" && message.id !== undefined && onMessageFeedback && (
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
                    <LumaOwlIcon className="size-7" />
                  </div>
                  <div className="min-w-0 max-w-[88%] rounded-lg bg-muted px-3 py-2.5 sm:max-w-[80%] sm:px-4">
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
                      <span className="break-words">{processingLabel}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Menu do chat. Depois de concluir uma ação, a conversa terminava
                  em "pronto, agendei" e a pessoa ficava sem saber o próximo passo;
                  e "Voltar ao início" ficava solto no topo da página, longe daqui. */}
              {((followUpMenu && followUpMenu.length > 0) || (followUpPrompts && followUpPrompts.length > 0) || (onRestart && displayMessages.length > 0)) && !isLoading && (
                <div className="ml-11 space-y-2.5">
                  {((followUpMenu && followUpMenu.length > 0) || (followUpPrompts && followUpPrompts.length > 0)) && (
                    // Rótulo com um fio ao lado: separa o menu da resposta sem
                    // precisar de espaço vazio, que era o que afastava os dois.
                    <div className="flex max-w-xl items-center gap-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">E agora?</p>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  {followUpMenu && followUpMenu.length > 0 ? (
                    <div className="grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
                      {followUpMenu.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => onSendMessage(item.label)}
                          className="group flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-all hover:border-primary/50 hover:bg-accent hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {item.icon && (
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                              {item.icon}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">{item.label}</span>
                            {item.hint && (
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.hint}</span>
                            )}
                          </span>
                          {/* Seta só no hover: mostra que o cartão é clicável sem
                              poluir a leitura quando parado. */}
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </button>
                      ))}
                    </div>
                  ) : followUpPrompts && followUpPrompts.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {followUpPrompts.map(prompt => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => onSendMessage(prompt)}
                          className="rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-accent"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {onRestart && displayMessages.length > 0 && (
                    <button
                      type="button"
                      onClick={onRestart}
                      title="Limpa a tela e começa uma conversa nova (nada é apagado)"
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <RotateCcw className="size-3.5" /> Voltar ao início
                    </button>
                  )}
                </div>
              )}

              {/* Espaço que permite a última resposta subir para o topo da tela.
                  Fica DEPOIS do menu de propósito: quando estava na própria mensagem,
                  abria um vão de uma tela entre a resposta e o "E agora?". */}
              {displayMessages.length > 0 && (
                <div
                  ref={espacadorRef}
                  aria-hidden
                  className="shrink-0"
                  style={{ height: isLoading ? 0 : `${espacoFinal}px` }}
                />
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Confirmação de ação na agenda. A Luma propõe; quem executa é a terapeuta,
          clicando aqui: o clique chama ai.confirmAction, que roda a ação no
          servidor sem passar pelo modelo. Enquanto este card estiver na tela,
          nada foi alterado. */}
      {pendingAction && (
        <div
          role="group"
          aria-label="Confirmação de alteração na agenda"
          className="border-t border-amber-300/70 bg-amber-50 px-3 py-3 dark:border-amber-900/60 dark:bg-amber-950/30 sm:px-4"
        >
          <div className="flex items-start gap-2.5">
            <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                {ROTULO_ACAO[pendingAction.toolName] ?? "Alteração na agenda"} — aguardando sua confirmação
              </p>
              <p className="mt-1 break-words text-sm text-foreground">{pendingAction.resumo}</p>
              <p className="mt-1 text-xs text-muted-foreground">Nada foi alterado ainda. A ação só acontece quando você confirmar.</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={onConfirmAction} disabled={isConfirmingAction} className="gap-1.5">
                  {isConfirmingAction
                    ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                    : <Check aria-hidden="true" className="size-3.5" />}
                  Confirmar
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={onDismissAction} disabled={isConfirmingAction} className="gap-1.5">
                  <X aria-hidden="true" className="size-3.5" /> Agora não
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <form
        ref={inputAreaRef}
        onSubmit={handleSubmit}
        data-testid="ai-chat-form"
        className="flex items-end gap-2 border-t bg-background/50 p-3 sm:p-4"
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
          className="min-h-9 min-w-0 max-h-32 flex-1 resize-none"
          rows={1}
          /* Cresce com o texto (até 128px, aí rola por dentro). Com a altura presa
             em uma linha, quem escrevia duas não enxergava o que tinha digitado. */
          onInput={(e) => {
            const campo = e.currentTarget;
            campo.style.height = "auto";
            campo.style.height = `${Math.min(campo.scrollHeight, 128)}px`;
          }}
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
