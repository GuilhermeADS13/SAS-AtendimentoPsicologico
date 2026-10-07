import { Fragment, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { uploadChatFile } from "@/lib/supabase";
import { iniciais } from "@/lib/iniciais";
import { FUSO_BR, formatarHora } from "@shared/datas";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Check, CheckCheck, Download, FileText, Loader2, MessageCircle, Paperclip, Search, Send, X } from "lucide-react";

const MAX_ANEXO = 20 * 1024 * 1024; // 20 MB
// Mensagens do mesmo lado com menos que isso de intervalo formam um "bloco" (ficam
// coladas, sem repetir o espaçamento), como em qualquer mensageiro.
const JANELA_DO_BLOCO_MS = 5 * 60 * 1000;

const chaveDoDia = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: FUSO_BR });

/** "Hoje", "Ontem" ou "Quinta, 8 de outubro" — no fuso de Brasília. */
function rotuloDoDia(d: Date, agora: Date): string {
  const chave = chaveDoDia(d);
  if (chave === chaveDoDia(agora)) return "Hoje";
  if (chave === chaveDoDia(new Date(agora.getTime() - 86_400_000))) return "Ontem";
  const texto = d
    .toLocaleDateString("pt-BR", { timeZone: FUSO_BR, weekday: "long", day: "numeric", month: "long" })
    .replace("-feira", "");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Agrupa as mensagens (já em ordem cronológica) por dia de Brasília. */
function agruparPorDia<T extends { createdAt: Date | string }>(itens: T[]): Array<{ chave: string; itens: T[] }> {
  const dias: Array<{ chave: string; itens: T[] }> = [];
  for (const item of itens) {
    const chave = chaveDoDia(new Date(item.createdAt));
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.chave === chave) ultimo.itens.push(item);
    else dias.push({ chave, itens: [item] });
  }
  return dias;
}

/**
 * Conversa de UM thread do chat. É o mesmo componente usado na página Mensagens e
 * dentro da videochamada (painel estilo Meet) — as duas leem/gravam no mesmo
 * thread (chatMessages), então ficam conectadas. Sem patientId = lado do paciente
 * (o thread é resolvido pela conta). `onClose` mostra o botão de fechar (no painel
 * da chamada).
 */
export default function ChatConversa({
  patientId,
  titulo,
  subtitulo,
  fotoUrl,
  onClose,
  ativo = true,
}: {
  patientId?: number;
  titulo?: string;
  /** Linha abaixo do nome no cabeçalho (ex.: CRP). Some enquanto o outro digita. */
  subtitulo?: string;
  fotoUrl?: string | null;
  onClose?: () => void;
  /**
   * Só faz polling e marca como lido quando está ativo. Na videochamada o painel
   * fica MONTADO (para a animação de deslizar), então sem isso ele marcaria as
   * mensagens como lidas e zeraria o badge de não-lidas mesmo fechado.
   */
  ativo?: boolean;
}) {
  const utils = trpc.useUtils();
  const [texto, setTexto] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textoRef = useRef<HTMLTextAreaElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const jaRolouRef = useRef(false);

  const q = trpc.chat.messages.useQuery(
    { patientId, search: buscaAtiva || undefined },
    { refetchInterval: ativo ? 5000 : false, enabled: ativo },
  );
  const role = q.data?.role ?? null;
  const mensagens = q.data?.messages ?? [];
  const nome = titulo ?? "Conversa";

  const enviar = trpc.chat.send.useMutation({
    onSuccess: () => {
      setTexto("");
      utils.chat.messages.invalidate();
      utils.chat.threads.invalidate();
    },
    onError: (e) => toast.error(e.message || "Não foi possível enviar."),
  });
  const markRead = trpc.chat.markRead.useMutation();

  // "Está digitando": sinalizo (no máx. 1x a cada 2s enquanto escrevo) e verifico
  // o outro lado por polling curto. É por polling (o chat inteiro é), então tem
  // ~2s de latência — some sozinho pelo TTL do servidor.
  const setTyping = trpc.chat.setTyping.useMutation();
  const ultimoTypingRef = useRef(0);
  const sinalizarDigitando = () => {
    const agora = Date.now();
    if (agora - ultimoTypingRef.current > 2000) {
      ultimoTypingRef.current = agora;
      setTyping.mutate({ patientId });
    }
  };
  const typingQ = trpc.chat.typingStatus.useQuery({ patientId }, { refetchInterval: ativo ? 2000 : false, enabled: ativo });
  const outroDigitando = typingQ.data?.typing ?? false;

  // Marca como lidas as mensagens recebidas quando a conversa está aberta.
  useEffect(() => {
    if (!ativo || !q.data || !role) return;
    const temNaoLida = mensagens.some((m) => m.senderRole !== role && !m.readAt);
    if (!temNaoLida) return;
    markRead.mutate(
      { patientId },
      {
        onSuccess: () => {
          utils.chat.unreadCount.invalidate();
          utils.chat.messages.invalidate();
          utils.chat.threads.invalidate();
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, ativo]);

  // Rola para a última mensagem quando a lista muda (e não estamos buscando). A
  // primeira vez é instantânea — abrir a conversa não deve "rolar" na frente da
  // pessoa; as seguintes (mensagem nova) deslizam.
  useEffect(() => {
    if (buscaAtiva || !mensagens.length) return;
    fimRef.current?.scrollIntoView({ block: "end", behavior: jaRolouRef.current ? "smooth" : "auto" });
    jaRolouRef.current = true;
  }, [mensagens.length, buscaAtiva]);

  // O campo cresce com o texto até ~5 linhas (depois rola por dentro).
  useEffect(() => {
    const el = textoRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [texto]);

  const handleEnviarTexto = () => {
    const conteudo = texto.trim();
    if (!conteudo || enviar.isPending) return;
    enviar.mutate({ patientId, content: conteudo });
  };

  const handleAnexo = async (file: File) => {
    if (file.size > MAX_ANEXO) {
      toast.error("Arquivo muito grande (máximo 20 MB).");
      return;
    }
    setEnviando(true);
    try {
      const fileKey = await uploadChatFile(file);
      await enviar.mutateAsync({
        patientId,
        fileKey,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar o arquivo.");
    } finally {
      setEnviando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const baixarAnexo = async (messageId: number) => {
    try {
      const r = await utils.chat.attachmentUrl.fetch({ messageId, patientId });
      if (r.url) window.open(r.url, "_blank", "noopener");
      else toast.error("Não foi possível abrir o anexo.");
    } catch {
      toast.error("Não foi possível abrir o anexo.");
    }
  };

  const fecharBusca = () => {
    setBuscando(false);
    setBusca("");
    setBuscaAtiva("");
  };

  const agora = new Date();

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Cabeçalho: quem está do outro lado + busca */}
      <div className="flex items-center gap-3 border-b border-border px-3 py-2.5 sm:px-4">
        {onClose && (
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onClose} title="Fechar chat" aria-label="Fechar chat">
            <X className="size-4" />
          </Button>
        )}
        <Avatar className="size-10 shrink-0">
          {fotoUrl && <AvatarImage src={fotoUrl} alt="" className="object-cover" />}
          <AvatarFallback className="bg-accent text-sm font-semibold text-accent-foreground">
            {iniciais(titulo) || <MessageCircle className="size-4" />}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight text-foreground">{nome}</p>
          <p className={cn("truncate text-xs", outroDigitando ? "font-medium text-primary" : "text-muted-foreground")} aria-live="polite">
            {outroDigitando ? "digitando…" : subtitulo ?? "Conversa privada"}
          </p>
        </div>
        <Button
          variant={buscando ? "secondary" : "ghost"}
          size="icon"
          className="size-9 shrink-0"
          onClick={() => (buscando ? fecharBusca() : setBuscando(true))}
          title={buscando ? "Fechar busca" : "Buscar na conversa"}
          aria-label={buscando ? "Fechar busca" : "Buscar na conversa"}
          aria-pressed={buscando}
        >
          {buscando ? <X className="size-4" /> : <Search className="size-4" />}
        </Button>
      </div>

      {buscando && (
        <div className="space-y-2 border-b border-border bg-muted/30 px-3 py-2.5 sm:px-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setBuscaAtiva(busca.trim());
                if (e.key === "Escape") fecharBusca();
              }}
              onBlur={() => setBuscaAtiva(busca.trim())}
              placeholder="Buscar nas mensagens e apertar Enter"
              className="h-9 bg-card pl-9"
              aria-label="Buscar nas mensagens"
            />
          </div>
          {buscaAtiva && !q.isFetching && (
            <p className="text-xs text-muted-foreground">
              {mensagens.length === 0
                ? `Nada encontrado para “${buscaAtiva}”.`
                : `${mensagens.length} ${mensagens.length === 1 ? "mensagem encontrada" : "mensagens encontradas"} para “${buscaAtiva}”.`}
            </p>
          )}
        </div>
      )}

      {/* Mensagens */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 px-3 py-4 sm:px-4">
        {q.isLoading ? (
          <div className="space-y-3" aria-label="Carregando mensagens">
            <Skeleton className="h-10 w-2/3 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
            <Skeleton className="h-14 w-3/5 rounded-2xl" />
          </div>
        ) : mensagens.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              {buscaAtiva ? <Search className="size-6" /> : <MessageCircle className="size-6" />}
            </span>
            <p className="mt-4 font-medium text-foreground">
              {buscaAtiva ? "Nenhuma mensagem encontrada" : "Nenhuma mensagem ainda"}
            </p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              {buscaAtiva
                ? "Tente outra palavra ou feche a busca para ver a conversa inteira."
                : "Escreva abaixo para começar. Você também pode enviar arquivos de até 20 MB."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Um bloco por dia: o rótulo gruda no topo só enquanto o SEU dia está
                visível e é empurrado pelo do dia seguinte. Numa lista única, todos
                grudavam no mesmo lugar e ficavam empilhados um sobre o outro. */}
            {agruparPorDia(mensagens).map(({ chave, itens }) => (
              <section key={chave} className="pb-2">
                <div className="sticky top-0 z-10 flex justify-center py-1.5" aria-hidden>
                  <span className="rounded-full border bg-card/95 px-3 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur">
                    {rotuloDoDia(new Date(itens[0].createdAt), agora)}
                  </span>
                </div>
                <ol className="flex flex-col">
            {itens.map((m, i) => {
              const minha = m.senderRole === role;
              const quando = new Date(m.createdAt);
              const anterior = itens[i - 1];
              const mesmoBloco =
                !!anterior &&
                anterior.senderRole === m.senderRole &&
                quando.getTime() - new Date(anterior.createdAt).getTime() < JANELA_DO_BLOCO_MS;
              return (
                <Fragment key={m.id}>
                  <li className={cn("flex", minha ? "justify-end" : "justify-start", mesmoBloco ? "mt-0.5" : i === 0 ? "mt-1" : "mt-3")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-[0_1px_2px_rgb(0_0_0/0.06)] sm:max-w-[75%]",
                        minha ? "bg-primary text-primary-foreground" : "border bg-card text-foreground",
                        minha && !mesmoBloco && "rounded-tr-md",
                        !minha && !mesmoBloco && "rounded-tl-md",
                      )}
                    >
                      {m.content && <p className="whitespace-pre-wrap break-words leading-relaxed">{m.content}</p>}
                      {m.fileKey && (
                        <button
                          type="button"
                          onClick={() => baixarAnexo(m.id)}
                          className={cn(
                            "group my-1 flex w-full min-w-[12rem] items-center gap-3 rounded-xl p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2",
                            minha
                              ? "bg-white/15 hover:bg-white/25 focus-visible:ring-white/70"
                              : "bg-muted hover:bg-accent focus-visible:ring-ring",
                          )}
                          aria-label={`Abrir o anexo ${m.fileName || ""}`}
                        >
                          <span
                            className={cn(
                              "flex size-9 shrink-0 items-center justify-center rounded-lg",
                              minha ? "bg-white/20" : "bg-primary/10 text-primary",
                            )}
                          >
                            <FileText className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{m.fileName || "Anexo"}</span>
                            <span className={cn("text-xs", minha ? "text-primary-foreground/75" : "text-muted-foreground")}>
                              Toque para abrir
                            </span>
                          </span>
                          <Download className="size-4 shrink-0 opacity-70 transition-opacity group-hover:opacity-100" />
                        </button>
                      )}
                      <p
                        className={cn(
                          "mt-0.5 flex items-center justify-end gap-1 text-[10px] tabular-nums",
                          minha ? "text-primary-foreground/75" : "text-muted-foreground",
                        )}
                      >
                        {formatarHora(quando)}
                        {minha &&
                          (m.readAt ? (
                            <CheckCheck className="size-3.5" aria-label="Lida" />
                          ) : (
                            <Check className="size-3.5" aria-label="Enviada" />
                          ))}
                      </p>
                    </div>
                  </li>
                </Fragment>
              );
            })}
                </ol>
              </section>
            ))}
            {outroDigitando && !buscaAtiva && (
              <div className="mt-1 flex justify-start" aria-label={`${nome} está digitando`}>
                <span className="flex items-center gap-1 rounded-2xl rounded-tl-md border bg-card px-3.5 py-3 shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
                  {[0, 150, 300].map((atraso) => (
                    <span
                      key={atraso}
                      className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 motion-reduce:animate-none"
                      style={{ animationDelay: `${atraso}ms` }}
                    />
                  ))}
                </span>
              </div>
            )}
          </div>
        )}
        <div ref={fimRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-card p-2.5 sm:p-3">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleAnexo(f);
          }}
        />
        <div className="flex items-end gap-1.5 rounded-2xl border bg-background p-1.5 transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
            disabled={enviando}
            onClick={() => fileRef.current?.click()}
            title="Anexar arquivo (até 20 MB)"
            aria-label="Anexar arquivo"
          >
            {enviando ? <Loader2 className="size-5 animate-spin" /> : <Paperclip className="size-5" />}
          </Button>
          <Textarea
            ref={textoRef}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              sinalizarDigitando();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleEnviarTexto();
              }
            }}
            placeholder={enviando ? "Enviando o arquivo…" : "Escreva uma mensagem"}
            aria-label={`Mensagem para ${nome}`}
            rows={1}
            className="max-h-32 min-h-9 flex-1 resize-none border-0 bg-transparent px-1.5 py-2 shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <Button
            size="icon"
            className="size-9 shrink-0 rounded-xl"
            disabled={!texto.trim() || enviar.isPending}
            onClick={handleEnviarTexto}
            title="Enviar (Enter)"
            aria-label="Enviar mensagem"
          >
            {enviar.isPending && !enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
        <p className="mt-1.5 hidden px-1 text-[11px] text-muted-foreground sm:block">
          Enter envia · Shift + Enter quebra a linha
        </p>
      </div>
    </div>
  );
}
