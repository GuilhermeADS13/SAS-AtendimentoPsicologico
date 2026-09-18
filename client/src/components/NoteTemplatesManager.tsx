import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { uploadModelFile } from "@/lib/supabase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Plus, Trash2, Star, Upload, Loader2, FileUp } from "lucide-react";
import type { NoteTemplate } from "@shared/prontuario";

const MODELO_MAX = 20 * 1024 * 1024; // 20 MB

/**
 * Gerencia os modelos de anotação do psicólogo (nome + corpo em markdown; um pode
 * ser o padrão). A lista inteira é salva de uma vez. Os modelos aparecem depois
 * como botões de inserir nas anotações da videochamada e no registro de sessão.
 */
export default function NoteTemplatesManager() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.noteTemplates.list.useQuery();
  const [modelos, setModelos] = useState<NoteTemplate[]>([]);

  useEffect(() => {
    if (data) setModelos(data);
  }, [data]);

  const salvar = trpc.noteTemplates.save.useMutation({
    onSuccess: () => {
      utils.noteTemplates.list.invalidate();
      toast.success("Modelos salvos.");
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar modelos"),
  });

  const adicionar = () =>
    setModelos((m) => [
      ...m,
      { id: crypto.randomUUID(), nome: "", corpo: "", padrao: m.length === 0 },
    ]);
  const atualizar = (id: string, campo: Partial<NoteTemplate>) =>
    setModelos((m) => m.map((t) => (t.id === id ? { ...t, ...campo } : t)));
  const remover = (id: string) => setModelos((m) => m.filter((t) => t.id !== id));
  const marcarPadrao = (id: string) =>
    setModelos((m) => m.map((t) => ({ ...t, padrao: t.id === id })));

  const handleSalvar = () => {
    const limpos = modelos
      .map((t) => ({ ...t, nome: t.nome.trim() }))
      .filter((t) => t.nome);
    if (limpos.some((t) => !t.corpo.trim())) {
      toast.error("Há um modelo com nome mas sem conteúdo.");
      return;
    }
    salvar.mutate(limpos);
  };

  // Modelo de prontuário por upload (PDF/DOCX): o servidor extrai o texto e a Luma
  // passa a seguir esse formato.
  const modeloRef = useRef<HTMLInputElement>(null);
  const [enviandoModelo, setEnviandoModelo] = useState(false);
  const modeloAtual = trpc.noteTemplates.getModelo.useQuery();
  const salvarModelo = trpc.noteTemplates.saveModelo.useMutation({
    onSuccess: () => {
      utils.noteTemplates.getModelo.invalidate();
      toast.success("Modelo de prontuário enviado. A Luma vai seguir esse formato.");
    },
    onError: (e) => toast.error(e.message || "Falha ao processar o modelo."),
  });
  const limparModelo = trpc.noteTemplates.clearModelo.useMutation({
    onSuccess: () => {
      utils.noteTemplates.getModelo.invalidate();
      toast.success("Modelo removido.");
    },
    onError: (e) => toast.error(e.message),
  });
  const handleModelo = async (file: File) => {
    if (file.size > MODELO_MAX) {
      toast.error("Arquivo muito grande (máximo 20 MB).");
      return;
    }
    setEnviandoModelo(true);
    try {
      const fileKey = await uploadModelFile(file);
      await salvarModelo.mutateAsync({
        fileKey,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar o modelo.");
    } finally {
      setEnviandoModelo(false);
      if (modeloRef.current) modeloRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Modelos de anotação
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Crie seus modelos de prontuário. Eles viram botões de inserir nas anotações da
          videochamada e no registro de sessão. Aceita formatação em markdown
          (**negrito**, *itálico*, listas com &quot;- &quot;). Marque um como padrão para
          já abrir preenchido numa anotação nova.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload do modelo de prontuário do profissional — a Luma segue o formato. */}
        <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center gap-2">
            <FileUp className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Seu modelo de prontuário (arquivo)</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Envie o seu modelo de prontuário em PDF ou DOCX. A Luma passa a seguir esse
            formato ao te ajudar a organizar a sessão e as notas — é só o formato, ela não
            inventa dados clínicos. Guardamos apenas o texto do modelo.
          </p>
          <input
            ref={modeloRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleModelo(f);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={enviandoModelo}
              onClick={() => modeloRef.current?.click()}
            >
              {enviandoModelo ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-4 w-4" />
              )}
              {enviandoModelo
                ? "Processando..."
                : modeloAtual.data?.temModelo
                  ? "Substituir modelo"
                  : "Enviar modelo (PDF/DOCX)"}
            </Button>
            {modeloAtual.data?.temModelo && (
              <>
                <span className="text-xs text-muted-foreground">
                  Atual: {modeloAtual.data.nome || "modelo enviado"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  disabled={limparModelo.isPending}
                  onClick={() => limparModelo.mutate()}
                  title="Remover modelo"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        <p className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Modelos digitados
        </p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : modelos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum modelo ainda. Adicione o seu formato de anotação.
          </p>
        ) : (
          modelos.map((t) => (
            <div key={t.id} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center gap-2">
                <Label htmlFor={`nome-${t.id}`} className="sr-only">
                  Nome do modelo
                </Label>
                <Input
                  id={`nome-${t.id}`}
                  value={t.nome}
                  onChange={(e) => atualizar(t.id, { nome: e.target.value })}
                  placeholder="Nome do modelo (ex.: Evolução TCC)"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant={t.padrao ? "default" : "outline"}
                  size="sm"
                  onClick={() => marcarPadrao(t.id)}
                  title="Definir como padrão"
                  className="shrink-0"
                >
                  <Star className={`w-4 h-4 ${t.padrao ? "fill-current" : ""}`} />
                  <span className="ml-1.5 hidden sm:inline">
                    {t.padrao ? "Padrão" : "Tornar padrão"}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remover(t.id)}
                  title="Remover modelo"
                  className="shrink-0 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <Textarea
                value={t.corpo}
                onChange={(e) => atualizar(t.id, { corpo: e.target.value })}
                placeholder={"Conteúdo do modelo.\nEx.:\n**Queixa**\n\n**Evolução**\n\n**Conduta**"}
                rows={5}
                className="text-sm"
              />
            </div>
          ))
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={adicionar}>
            <Plus className="w-4 h-4 mr-1.5" />
            Adicionar modelo
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSalvar}
            disabled={salvar.isPending}
            className="bg-primary hover:bg-primary/90"
          >
            {salvar.isPending ? "Salvando..." : "Salvar modelos"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
