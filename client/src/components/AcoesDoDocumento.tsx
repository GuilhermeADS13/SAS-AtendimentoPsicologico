import { useState } from "react";
import { ChevronDown, Download, ExternalLink, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { baixarConvertido } from "@/lib/documento-export";
import { trpc } from "@/lib/trpc";
import { opcoesDeDownload, visualizacaoDoArquivo } from "@shared/formatosDeDocumento";

type Documento = { id: number; fileName: string; fileType: string | null };

/**
 * Ver e baixar um documento do prontuário.
 *
 * "Ver" busca o arquivo e o mostra por um endereço `blob:` local: a CSP só deixa
 * abrir iframe do próprio site, e o link assinado do Storage é de outro domínio.
 * O tipo do blob é o conhecido, nunca o que veio na resposta.
 */
export function AcoesDoDocumento({ doc, bloqueado }: { doc: Documento; bloqueado: () => boolean }) {
  const utils = trpc.useUtils();
  const tipo = doc.fileType ?? "";
  const visualizacao = visualizacaoDoArquivo(tipo);
  const opcoes = opcoesDeDownload(tipo);
  const [aberto, setAberto] = useState<{ url: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const buscarArquivo = async () => {
    const { url } = await utils.documents.urlDoArquivo.fetch({ id: doc.id });
    if (!url) throw new Error("Não foi possível abrir o documento.");
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error("Não foi possível abrir o documento.");
    return new Blob([await resposta.arrayBuffer()], { type: tipo });
  };

  const comAviso = async (acao: () => Promise<void>) => {
    if (bloqueado()) return;
    setOcupado(true);
    try {
      await acao();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setOcupado(false);
    }
  };

  const ver = () => comAviso(async () => setAberto({ url: URL.createObjectURL(await buscarArquivo()) }));

  const fechar = () => {
    if (aberto) URL.revokeObjectURL(aberto.url);
    setAberto(null);
  };

  const baixarOriginal = () =>
    comAviso(async () => {
      const { url } = await utils.documents.urlDoArquivo.fetch({ id: doc.id, baixar: true });
      if (!url) throw new Error("Não foi possível gerar o link do documento.");
      const link = document.createElement("a");
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
    });

  const baixarEm = (formato: "pdf" | "word") =>
    comAviso(() =>
      baixarConvertido({ fileName: doc.fileName, fileType: tipo }, formato, {
        arquivo: buscarArquivo,
        texto: async () => (await utils.documents.textoDoArquivo.fetch({ id: doc.id })).texto,
      }),
    );

  return (
    <>
      {visualizacao && (
        <Button variant="outline" size="sm" onClick={ver} disabled={ocupado}>
          <Eye className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Ver</span>
        </Button>
      )}

      {opcoes.length === 0 ? (
        <Button variant="outline" size="sm" onClick={baixarOriginal} disabled={ocupado} aria-label="Baixar">
          {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={ocupado} aria-label="Baixar">
              {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <ChevronDown className="ml-1 w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={baixarOriginal}>Arquivo original</DropdownMenuItem>
            {opcoes.map((o) => (
              <DropdownMenuItem key={o.formato} onSelect={() => baixarEm(o.formato)}>
                {o.rotulo}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog open={!!aberto} onOpenChange={(o) => !o && fechar()}>
        <DialogContent className="flex h-[90vh] w-full max-w-[min(64rem,calc(100vw-2rem))] flex-col sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{doc.fileName}</DialogTitle>
          </DialogHeader>
          {aberto && (
            <>
              <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-muted">
                {visualizacao === "pdf" ? (
                  <iframe src={aberto.url} title={doc.fileName} className="h-full w-full border-0 bg-white" />
                ) : (
                  <img src={aberto.url} alt={doc.fileName} className="h-full w-full object-contain" />
                )}
              </div>
              {/* No iPhone o PDF embutido mostra só a primeira página. */}
              <Button variant="outline" size="sm" className="self-end" asChild>
                <a href={aberto.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 w-4 h-4" />
                  Abrir em outra aba
                </a>
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
