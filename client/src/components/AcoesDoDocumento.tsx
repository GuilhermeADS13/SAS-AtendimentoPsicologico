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
import { opcoesDeDownload, visualizacaoDoArquivo } from "@shared/formatosDeDocumento";

type Documento = { fileName: string; fileType: string | null };

/**
 * Ver e baixar um documento do prontuário.
 *
 * "Ver" busca o arquivo e o mostra por um endereço `blob:` local: a CSP só deixa
 * abrir iframe do próprio site, e o link assinado do Storage é de outro domínio.
 * O tipo do blob é o conhecido, nunca o que veio na resposta.
 */
export function AcoesDoDocumento({
  doc,
  obterUrl,
  obterTexto,
  bloqueado,
}: {
  doc: Documento;
  /** O link vem da rota de quem está vendo: a psicóloga e o paciente têm regras diferentes. */
  obterUrl: (baixar: boolean) => Promise<string | null>;
  /** Sem ela, só o arquivo original: o paciente não converte formato. */
  obterTexto?: () => Promise<string>;
  bloqueado?: () => boolean;
}) {
  const tipo = doc.fileType ?? "";
  const visualizacao = visualizacaoDoArquivo(tipo);
  const opcoes = obterTexto ? opcoesDeDownload(tipo) : [];
  const [aberto, setAberto] = useState<{ url: string } | null>(null);
  // Um botão por vez, e o giro aparece no que foi clicado.
  const [carregando, setCarregando] = useState<"ver" | "baixar" | null>(null);
  const ocupado = carregando !== null;

  const buscarArquivo = async () => {
    const url = await obterUrl(false);
    if (!url) throw new Error("Não foi possível abrir o documento.");
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error("Não foi possível abrir o documento.");
    return new Blob([await resposta.arrayBuffer()], { type: tipo });
  };

  const comAviso = async (qual: "ver" | "baixar", acao: () => Promise<void>) => {
    if (bloqueado?.()) return;
    setCarregando(qual);
    try {
      await acao();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setCarregando(null);
    }
  };

  const ver = () => comAviso("ver", async () => setAberto({ url: URL.createObjectURL(await buscarArquivo()) }));

  const fechar = () => {
    if (aberto) URL.revokeObjectURL(aberto.url);
    setAberto(null);
  };

  const baixarOriginal = () =>
    comAviso("baixar", async () => {
      const url = await obterUrl(true);
      if (!url) throw new Error("Não foi possível gerar o link do documento.");
      const link = document.createElement("a");
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
    });

  const baixarEm = (formato: "pdf" | "word") =>
    comAviso("baixar", () =>
      baixarConvertido({ fileName: doc.fileName, fileType: tipo }, formato, {
        arquivo: buscarArquivo,
        texto: obterTexto ?? (async () => ""),
      }),
    );

  return (
    <>
      {visualizacao && (
        <Button variant="outline" size="sm" onClick={ver} disabled={ocupado}>
          {carregando === "ver" ? <Loader2 className="w-4 h-4 animate-spin sm:mr-2" /> : <Eye className="w-4 h-4 sm:mr-2" />}
          <span className="hidden sm:inline">Ver</span>
        </Button>
      )}

      {opcoes.length === 0 ? (
        <Button variant="outline" size="sm" onClick={baixarOriginal} disabled={ocupado} aria-label="Baixar">
          {carregando === "baixar" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={ocupado} aria-label="Baixar">
              {carregando === "baixar" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
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
