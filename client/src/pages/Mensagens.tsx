import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRole } from "@/hooks/useRole";
import { uploadChatFile } from "@/lib/supabase";
import { formatarDataHora } from "@shared/datas";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Paperclip, Search, Send, FileText, MessageSquare } from "lucide-react";

const MAX_ANEXO = 20 * 1024 * 1024; // 20 MB

/** Conversa de um thread. Sem patientId = lado do paciente (thread resolvido pela conta). */
function Conversa({ patientId, titulo }: { patientId?: number; titulo?: string }) {
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
            className="h-9 w-36 pl-8 sm:w-48"
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
          onChange={(e) => setTexto(e.target.value)}
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
              <Conversa key={sel.id} patientId={sel.id} titulo={sel.nome} />
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
        <div>
          <h1 className="text-3xl font-bold text-foreground">Mensagens</h1>
          <p className="text-muted-foreground">
            {isTherapist
              ? "Converse com seus pacientes e troque arquivos com segurança."
              : "Converse com a sua psicóloga e troque arquivos com segurança."}
          </p>
        </div>
        {isTherapist ? (
          <ChatTerapeuta />
        ) : (
          <div className="h-[calc(100dvh-11rem)] overflow-hidden rounded-xl border border-border bg-card">
            <Conversa titulo="Minha psicóloga" />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
