import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { uploadModelFile } from "@/lib/supabase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Trash2, Upload } from "lucide-react";
import { CAMPOS_DO_CONTRATO, TAMANHO_MAXIMO_DO_CONTRATO } from "@shared/contrato";

const ARQUIVO_MAX = 20 * 1024 * 1024; // 20 MB

/**
 * Modelo de contrato da psicóloga. Vale para todos os pacientes dela: o que muda
 * por paciente são os campos, preenchidos ao gerar o PDF. O arquivo enviado vira
 * texto editável porque quase nunca vem pronto: um PDF desenhado sai fora de
 * ordem, e os espaços em branco precisam virar campos.
 */
export default function ContratoModeloManager() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.noteTemplates.getContrato.useQuery();
  const [texto, setTexto] = useState("");
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (data) setTexto(data.texto ?? "");
  }, [data]);

  const salvar = trpc.noteTemplates.saveContrato.useMutation({
    onSuccess: () => {
      utils.noteTemplates.getContrato.invalidate();
      toast.success("Modelo de contrato salvo.");
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar o modelo"),
  });
  const importar = trpc.noteTemplates.importarContrato.useMutation({
    onSuccess: () => {
      utils.noteTemplates.getContrato.invalidate();
      toast.success("Arquivo lido. Confira o texto e troque os espaços em branco pelos campos.");
    },
    // O erro é tratado no catch de aoEscolherArquivo, que também cobre o upload.
  });
  const removerModelo = trpc.noteTemplates.clearContrato.useMutation({
    onSuccess: () => {
      utils.noteTemplates.getContrato.invalidate();
      toast.success("Modelo removido.");
    },
    onError: (e) => toast.error(e.message),
  });

  const aoEscolherArquivo = async (file: File) => {
    if (file.size > ARQUIVO_MAX) {
      toast.error("Arquivo muito grande (máximo 20 MB).");
      return;
    }
    setEnviando(true);
    try {
      const fileKey = await uploadModelFile(file);
      await importar.mutateAsync({ fileKey, fileName: file.name, fileType: file.type || "application/octet-stream" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar o arquivo.");
    } finally {
      setEnviando(false);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  };

  /** Põe o campo onde está o cursor (ou no fim, se o campo de texto não foi tocado). */
  const inserirCampo = (chave: string) => {
    const ta = campoRef.current;
    const campo = `{{${chave}}}`;
    const inicio = ta?.selectionStart ?? texto.length;
    const fim = ta?.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, inicio) + campo + texto.slice(fim));
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(inicio + campo.length, inicio + campo.length);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={arquivoRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) aoEscolherArquivo(f);
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={enviando} onClick={() => arquivoRef.current?.click()}>
          {enviando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
          {enviando ? "Lendo o arquivo..." : "Enviar meu contrato (PDF/DOCX)"}
        </Button>
        {data?.texto && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10"
            disabled={removerModelo.isPending}
            onClick={() => removerModelo.mutate()}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Remover modelo
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {data?.nome ? `Enviado: ${data.nome}` : data?.texto ? "Modelo próprio" : "Nenhum modelo ainda"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Guardamos só o texto, então o PDF sai no formato do sistema, sem a logo e as cores do
        arquivo. Confira o texto e use <strong># </strong> no título e <strong>## </strong> nas seções.
      </p>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          Clique para pôr um campo onde está o cursor. Ele é preenchido em cada paciente.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {CAMPOS_DO_CONTRATO.map((c) => (
            <Button
              key={c.chave}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-2.5 text-xs"
              title={`{{${c.chave}}}`}
              onClick={() => inserirCampo(c.chave)}
            >
              {c.rotulo}
            </Button>
          ))}
        </div>
      </div>

      <Textarea
        ref={campoRef}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={TAMANHO_MAXIMO_DO_CONTRATO}
        disabled={isLoading}
        aria-label="Texto do modelo de contrato"
        placeholder={"Envie o seu contrato ou escreva aqui.\n\nExemplo:\n# CONTRATO TERAPÊUTICO\n\n## Paciente\nNome: {{paciente}}"}
        className="min-h-[320px] text-sm leading-relaxed"
      />

      <Button
        type="button"
        onClick={() => salvar.mutate({ texto })}
        disabled={salvar.isPending || !texto.trim()}
        className="w-full bg-primary hover:bg-primary/90"
      >
        {salvar.isPending ? "Salvando..." : "Salvar modelo"}
      </Button>
    </div>
  );
}
