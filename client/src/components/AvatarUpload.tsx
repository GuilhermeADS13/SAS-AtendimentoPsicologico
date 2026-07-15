import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { uploadAvatarFile, getAvatarSignedUrl, removeAvatarFile } from "@/lib/supabase";
import { Camera, Loader2, Trash2, UserRound } from "lucide-react";

type Props = {
  /** Path da foto no Storage (não é URL — o bucket é privado). */
  value: string;
  /** Recebe o novo path, ou "" quando a foto é removida. */
  onChange: (photoKey: string) => void;
  /** Iniciais mostradas enquanto não há foto. */
  fallback?: string;
};

/**
 * Foto de perfil: envia o arquivo para o Storage e devolve o path.
 *
 * O componente NÃO salva no banco — quem chama decide quando persistir o path,
 * junto do resto do formulário.
 */
export function AvatarUpload({ value, onChange, fallback }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // O bucket é privado: exibir exige assinar a URL a cada carga.
  useEffect(() => {
    let ativo = true;
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    getAvatarSignedUrl(value).then((url) => {
      if (ativo) setPreviewUrl(url);
    });
    return () => {
      ativo = false;
    };
  }, [value]);

  const escolher = async (file: File) => {
    setEnviando(true);
    // Mostra a imagem local na hora; a assinada chega depois do upload.
    const local = URL.createObjectURL(file);
    setPreviewUrl(local);
    try {
      const path = await uploadAvatarFile(file);
      onChange(path);
      toast.success("Foto enviada! Salve o cadastro para confirmar.");
    } catch (e) {
      setPreviewUrl(null);
      toast.error(e instanceof Error ? e.message : "Falha ao enviar a foto");
    } finally {
      URL.revokeObjectURL(local);
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remover = async () => {
    const anterior = value;
    onChange("");
    setPreviewUrl(null);
    try {
      await removeAvatarFile(anterior);
    } catch {
      // O arquivo órfão no bucket não quebra nada: o cadastro já não aponta
      // para ele. Não vale incomodar o usuário com isso.
    }
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-20 w-20 border">
        {previewUrl ? <AvatarImage src={previewUrl} alt="Foto de perfil" /> : null}
        <AvatarFallback className="text-lg">
          {fallback || <UserRound className="w-7 h-7 text-muted-foreground" />}
        </AvatarFallback>
      </Avatar>

      <div className="space-y-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) escolher(f);
          }}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={enviando}
            onClick={() => inputRef.current?.click()}
          >
            {enviando ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Camera className="w-4 h-4 mr-2" />
            )}
            {enviando ? "Enviando..." : value ? "Trocar foto" : "Enviar foto"}
          </Button>
          {value && !enviando && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={remover}
              className="text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">JPG, PNG ou WEBP, até 5 MB.</p>
      </div>
    </div>
  );
}
