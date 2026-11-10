import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileDown, ImagePlus, Share2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  baixarArquivo,
  enviarArquivo,
  imagemDoComprovante,
  podeEnviarArquivo,
  reciboEmPdf,
  reciboEmWord,
  type Comprovante,
} from "@/lib/recibo-export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatarBRL } from "@shared/dinheiro";
import { cpfValido, mascaraCpf, oQueFaltaNoRecibo, soDigitosDoCpf, type DadosDoRecibo } from "@shared/recibo";

const FUSO = "America/Sao_Paulo";
const chaveDoMes = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit" }).format(d).slice(0, 7);
const nomeDoMes = (chave: string) => {
  const [ano, mes] = chave.split("-").map(Number);
  const texto = new Date(Date.UTC(ano, mes - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};
const dataCurta = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: FUSO });
const MAX_COMPROVANTES = 5;

/** "Rua X, 100, Recife/PE" -> "Recife/PE": a cidade para a linha da data. */
function cidadeDoEndereco(endereco: string): string {
  const partes = endereco.split(",").map((p) => p.trim()).filter(Boolean);
  return partes.length > 1 ? partes[partes.length - 1] : "";
}

type Consulta = { id: number; scheduledAt: Date | string; price: number | null; paid: boolean };

/**
 * Recibo de pagamento das sessões pagas de um paciente (shared/recibo.ts). Os dados
 * que faltam para o Imposto de Renda (CPF e endereço dela, CPF do paciente) são
 * preenchidos aqui mesmo e ficam salvos para os próximos recibos.
 */
export function GerarRecibo({
  aberto,
  aoFechar,
  paciente,
  consultas,
  exemplo = false,
}: {
  aberto: boolean;
  aoFechar: () => void;
  paciente: { id: number; firstName: string; lastName: string; cpf?: string | null };
  consultas: Consulta[];
  exemplo?: boolean;
}) {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const { data: perfil } = trpc.therapists.me.useQuery(undefined, { enabled: aberto });

  const pagas = useMemo(
    () =>
      consultas
        .filter((c) => c.paid && (c.price ?? 0) > 0)
        .map((c) => ({ id: c.id, data: new Date(c.scheduledAt), valorCentavos: c.price ?? 0 }))
        .sort((a, b) => +b.data - +a.data),
    [consultas],
  );
  const meses = useMemo(() => Array.from(new Set(pagas.map((c) => chaveDoMes(c.data)))), [pagas]);

  const [mes, setMes] = useState("");
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [cpf, setCpf] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cidade, setCidade] = useState("");
  const [cpfPaciente, setCpfPaciente] = useState("");
  const [outroPagou, setOutroPagou] = useState(false);
  const [pagadorNome, setPagadorNome] = useState("");
  const [pagadorCpf, setPagadorCpf] = useState("");
  const [gerando, setGerando] = useState(false);
  // Prints do Pix que o paciente mandou: só vão para o PDF, não ficam guardados.
  const [comprovantes, setComprovantes] = useState<(Comprovante & { nome: string })[]>([]);

  const anexar = async (arquivos: FileList | null) => {
    const lista = Array.from(arquivos ?? []);
    if (!lista.length) return;
    const cabem = MAX_COMPROVANTES - comprovantes.length;
    if (lista.length > cabem) toast.error(`Até ${MAX_COMPROVANTES} comprovantes por recibo.`);
    for (const arquivo of lista.slice(0, Math.max(0, cabem))) {
      try {
        const img = await imagemDoComprovante(arquivo);
        setComprovantes((atual) => [...atual, { ...img, nome: arquivo.name }]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não deu para abrir a imagem.");
      }
    }
  };

  // Ao abrir: mês mais recente com consulta paga, todas marcadas, e os dados salvos.
  useEffect(() => {
    if (!aberto) return;
    const primeiro = meses[0] ?? "";
    setMes(primeiro);
    setMarcadas(new Set(pagas.filter((c) => chaveDoMes(c.data) === primeiro).map((c) => c.id)));
    setCpfPaciente(paciente.cpf ? mascaraCpf(paciente.cpf) : "");
    setOutroPagou(false);
    setPagadorNome("");
    setPagadorCpf("");
    setComprovantes([]);
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!aberto || !perfil) return;
    setCpf(perfil.cpf ? mascaraCpf(perfil.cpf) : "");
    setEndereco(perfil.endereco ?? "");
    setCidade(cidadeDoEndereco(perfil.endereco ?? ""));
  }, [aberto, perfil]);

  const doMes = pagas.filter((c) => chaveDoMes(c.data) === mes);
  const escolhidas = doMes.filter((c) => marcadas.has(c.id));
  const nomePaciente = `${paciente.firstName} ${paciente.lastName}`.trim();

  const dados: DadosDoRecibo = {
    psicologa: { nome: user?.name ?? "", crp: perfil?.crp ?? "", cpf, endereco },
    paciente: { nome: nomePaciente, cpf: cpfPaciente },
    pagador: outroPagou && pagadorNome.trim() ? { nome: pagadorNome.trim(), cpf: pagadorCpf } : null,
    consultas: escolhidas.map((c) => ({ data: c.data, valorCentavos: c.valorCentavos })),
    cidade,
    emitidoEm: new Date(),
  };
  const falta = oQueFaltaNoRecibo(dados);
  const cpfDigitadoErrado = [cpf, cpfPaciente, outroPagou ? pagadorCpf : ""].some(
    (c) => soDigitosDoCpf(c).length > 0 && !cpfValido(c),
  );

  const salvarPsicologa = trpc.therapists.definirDadosDoRecibo.useMutation();
  const salvarPaciente = trpc.patients.definirCpf.useMutation();

  const [formato, setFormato] = useState<"pdf" | "word">("pdf");
  const [enviaArquivo] = useState(podeEnviarArquivo);

  const gerar = async (acao: "baixar" | "enviar") => {
    if (!escolhidas.length) return toast.error("Marque pelo menos uma consulta.");
    if (cpfDigitadoErrado) return toast.error("Há um CPF com número errado. Confira antes de gerar.");
    setGerando(true);
    try {
      if (!exemplo) {
        // Guarda o que ela completou, para o próximo recibo já vir pronto.
        const cpfSalvo = perfil?.cpf ?? "";
        if (soDigitosDoCpf(cpf) !== cpfSalvo || endereco.trim() !== (perfil?.endereco ?? "")) {
          await salvarPsicologa.mutateAsync({ cpf, endereco });
          utils.therapists.me.invalidate();
        }
        if (soDigitosDoCpf(cpfPaciente) !== (paciente.cpf ?? "")) {
          await salvarPaciente.mutateAsync({ patientId: paciente.id, cpf: cpfPaciente });
          utils.patients.get.invalidate({ id: paciente.id });
        }
      }
      const arquivo = `recibo-${nomePaciente}-${mes}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w-]+/g, "-");
      const blob = formato === "pdf" ? await reciboEmPdf(dados, comprovantes) : await reciboEmWord(dados, comprovantes);
      const nome = `${arquivo}.${formato === "pdf" ? "pdf" : "docx"}`;
      if (acao === "baixar") {
        baixarArquivo(blob, nome);
        toast.success("Recibo baixado.");
        aoFechar();
        return;
      }
      const titulo = `Recibo de ${nomePaciente}`;
      const r = await enviarArquivo(blob, nome, titulo);
      if (r === "enviado") aoFechar();
      // O navegador só abre a lista de apps logo depois de um toque, e gerar o
      // arquivo levou tempo demais: o arquivo já está pronto, é só tocar de novo.
      if (r === "sem-permissao") {
        toast("Recibo pronto.", {
          duration: 15_000,
          action: {
            label: "Enviar",
            onClick: () =>
              void enviarArquivo(blob, nome, titulo)
                .then((r2) => r2 === "enviado" && aoFechar())
                .catch(() => toast.error("Não deu para enviar. Use “Baixar” e mande pelo app.")),
          },
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o recibo.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !gerando && aoFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recibo de {nomePaciente}</DialogTitle>
          <DialogDescription>Das sessões pagas. O PDF sai pronto para mandar ao paciente.</DialogDescription>
        </DialogHeader>

        {pagas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma consulta paga ainda. Marque o pagamento como pago e o recibo fica disponível.
          </p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="recibo-mes">Mês</Label>
              <select
                id="recibo-mes"
                value={mes}
                onChange={(e) => {
                  setMes(e.target.value);
                  setMarcadas(new Set(pagas.filter((c) => chaveDoMes(c.data) === e.target.value).map((c) => c.id)));
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {meses.map((m) => (
                  <option key={m} value={m}>
                    {nomeDoMes(m)}
                  </option>
                ))}
              </select>
              <ul className="space-y-1 rounded-lg border p-2">
                {doMes.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={marcadas.has(c.id)}
                          onChange={(e) =>
                            setMarcadas((atual) => {
                              const nova = new Set(atual);
                              if (e.target.checked) nova.add(c.id);
                              else nova.delete(c.id);
                              return nova;
                            })
                          }
                          className="h-4 w-4 accent-primary"
                        />
                        {dataCurta(c.data)}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{formatarBRL(c.valorCentavos)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-foreground">Seus dados no recibo</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="recibo-cpf">Seu CPF</Label>
                  <Input id="recibo-cpf" inputMode="numeric" value={cpf} onChange={(e) => setCpf(mascaraCpf(e.target.value))} placeholder="000.000.000-00" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="recibo-cidade">Cidade da emissão</Label>
                  <Input id="recibo-cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Recife/PE" maxLength={60} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recibo-endereco">Endereço de atendimento</Label>
                <Input
                  id="recibo-endereco"
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  placeholder="Rua, número, bairro, cidade/UF"
                  maxLength={300}
                />
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-foreground">Paciente</legend>
              <div className="space-y-1.5">
                <Label htmlFor="recibo-cpf-paciente">CPF de {paciente.firstName}</Label>
                <Input
                  id="recibo-cpf-paciente"
                  inputMode="numeric"
                  value={cpfPaciente}
                  onChange={(e) => setCpfPaciente(mascaraCpf(e.target.value))}
                  placeholder="000.000.000-00"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={outroPagou} onChange={(e) => setOutroPagou(e.target.checked)} className="h-4 w-4 accent-primary" />
                Quem pagou foi outra pessoa (o responsável, por exemplo)
              </label>
              {outroPagou && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="recibo-pagador">Nome de quem pagou</Label>
                    <Input id="recibo-pagador" value={pagadorNome} onChange={(e) => setPagadorNome(e.target.value)} maxLength={120} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="recibo-pagador-cpf">CPF de quem pagou</Label>
                    <Input
                      id="recibo-pagador-cpf"
                      inputMode="numeric"
                      value={pagadorCpf}
                      onChange={(e) => setPagadorCpf(mascaraCpf(e.target.value))}
                      placeholder="000.000.000-00"
                    />
                  </div>
                </div>
              )}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-foreground">Comprovante do Pix (opcional)</legend>
              <p className="text-xs text-muted-foreground">
                O print que o paciente te mandou entra numa página no fim do recibo. Não fica guardado no sistema.
              </p>
              {comprovantes.length > 0 && (
                <ul className="space-y-1.5">
                  {comprovantes.map((c, i) => (
                    <li key={i} className="flex items-center gap-3 rounded-md border p-1.5 text-sm">
                      <img src={c.dataUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                      <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        aria-label={`Tirar ${c.nome}`}
                        onClick={() => setComprovantes((atual) => atual.filter((_, j) => j !== i))}
                      >
                        <X className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {comprovantes.length < MAX_COMPROVANTES && (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-foreground hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring">
                  <ImagePlus className="size-4" aria-hidden />
                  Anexar comprovante
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      void anexar(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </fieldset>

            {falta.length > 0 && (
              <p className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  O recibo sai assim mesmo, mas para valer no Imposto de Renda falta {falta.join(", ").replace(/, ([^,]*)$/, " e $1")}.
                </span>
              </p>
            )}

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-foreground">Formato</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup">
                {(
                  [
                    ["pdf", "PDF", "Pronto para mandar"],
                    ["word", "Word", "Dá para editar"],
                  ] as const
                ).map(([valor, rotulo, dica]) => (
                  <label
                    key={valor}
                    className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring ${
                      formato === valor ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="recibo-formato"
                      value={valor}
                      checked={formato === valor}
                      onChange={() => setFormato(valor)}
                      className="sr-only"
                    />
                    <span className="font-medium text-foreground">{rotulo}</span>
                    <span className="text-xs text-muted-foreground">{dica}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={aoFechar} disabled={gerando}>
            Cancelar
          </Button>
          {pagas.length > 0 && enviaArquivo && (
            <Button variant="outline" onClick={() => void gerar("enviar")} disabled={gerando || escolhidas.length === 0}>
              <Share2 className="mr-2 size-4" />
              Enviar para…
            </Button>
          )}
          {pagas.length > 0 && (
            <Button onClick={() => void gerar("baixar")} disabled={gerando || escolhidas.length === 0}>
              <FileDown className="mr-2 size-4" />
              {gerando
                ? "Gerando..."
                : `Baixar ${formato === "pdf" ? "PDF" : "Word"} (${formatarBRL(escolhidas.reduce((s, c) => s + c.valorCentavos, 0))})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
