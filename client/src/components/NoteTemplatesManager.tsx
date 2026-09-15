import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Plus, Trash2, Star } from "lucide-react";
import type { NoteTemplate } from "@shared/prontuario";

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
