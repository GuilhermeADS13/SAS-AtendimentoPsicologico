import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { uploadChatFile } from "@/lib/supabase";
import { formatarDataHora } from "@shared/datas";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Paperclip, Search, Send, FileText, X } from "lucide-react";

const MAX_ANEXO = 20 * 1024 * 1024; // 20 MB

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
  onClose,
}: {
  patientId?: number;
  titulo?: string;
  onClose?: () => void;
}) {
  const utils = trpc.useUtils();
  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  const q = trpc.chat.messages.useQuery(
    { patientId, search: buscaAtiva || undefined },
    { refetchInterval: 5000 },
  );
  const role = q.data?.role ?? null;
  const mensagens = q.data?.messages ?? [];

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
  const typingQ = trpc.chat.typingStatus.useQuery({ patientId }, { refetchInterval: 2000 });
  const outroDigitando = typingQ.data?.typing ?? false;

  // Marca como lidas as mensagens recebidas quando a conversa está aberta.
  useEffect(() => {
    if (!q.data || !role) return;
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
  }, [q.data]);

  // Rola para a última mensagem quando a lista muda (e não estamos buscando).
  useEffect(() => {
    if (!buscaAtiva) fimRef.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length, buscaAtiva]);

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Cabeçalho da conversa + busca */}
      <div className="flex items-center gap-2 border-b border-border p-3">
        {onClose && (
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} title="Fechar chat" aria-label="Fechar chat">
            <X className="h-4 w-4" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{titulo ?? "Conversa"}</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setBuscaAtiva(busca.trim());
            }}
            onBlur={() => setBuscaAtiva(busca.trim())}
            placeholder="Buscar..."
            className="h-9 w-28 pl-8 sm:w-40"
          />
        </div>
      </div>

      {/* Mensagens */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/20 p-3">
        {q.isLoading ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : mensagens.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {buscaAtiva ? "Nenhuma mensagem encontrada." : "Nenhuma mensagem ainda. Diga olá! 👋"}
          </p>
        ) : (
          mensagens.map((m) => {
            const minha = m.senderRole === role;
            return (
              <div key={m.id} className={`flex ${minha ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                    minha
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-card text-foreground"
                  }`}
                >
                  {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                  {m.fileKey && (
                    <button
                      type="button"
                      onClick={() => baixarAnexo(m.id)}
                      className={`mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs underline-offset-2 hover:underline ${
                        minha ? "bg-white/15" : "bg-muted"
                      }`}
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate">{m.fileName || "Anexo"}</span>
                    </button>
                  )}
                  <p className={`mt-1 text-[10px] ${minha ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {formatarDataHora(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={fimRef} />
      </div>

      {/* "Está digitando" (com o nome do outro lado). */}
      {outroDigitando && (
        <div className="border-t border-border px-3 py-1.5 text-xs italic text-muted-foreground">
          {titulo ?? "A pessoa"} está digitando…
        </div>
      )}

      {/* Composer */}
      <div className="flex items-end gap-2 border-t border-border p-3">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleAnexo(f);
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          disabled={enviando}
          onClick={() => fileRef.current?.click()}
          title="Anexar arquivo"
          aria-label="Anexar arquivo"
        >
          {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
        </Button>
        <Textarea
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
          placeholder="Escreva uma mensagem..."
          rows={1}
          className="max-h-32 min-h-[40px] flex-1 resize-none"
        />
        <Button
          size="icon"
          className="shrink-0 bg-primary hover:bg-primary/90"
          disabled={!texto.trim() || enviar.isPending}
          onClick={handleEnviarTexto}
          title="Enviar"
          aria-label="Enviar mensagem"
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
