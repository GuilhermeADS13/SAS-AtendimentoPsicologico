import { useState } from "react";
import { toast } from "sonner";
import { Hourglass, Pencil, Trash2, UserPlus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import {
  DIAS_CURTOS,
  PERIODOS,
  descricaoDaPreferencia,
  linkDoWhatsApp,
  mensagemDeHorarioLivre,
  type Periodo,
} from "@shared/listaDeEspera";
import { FUSO_BR } from "@shared/datas";

type Paciente = { id: number; firstName: string; lastName: string; status?: string | null };
type Item = { patientId: number; firstName: string; lastName: string; phone: string | null; diasDaSemana: number[]; periodos: string[]; observacao: string | null };

/** "quinta-feira, 12/11, às 14:00" */
export function quandoPorExtenso(d: Date): string {
  const dia = d.toLocaleDateString("pt-BR", { timeZone: FUSO_BR, weekday: "long", day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: FUSO_BR, hour: "2-digit", minute: "2-digit" });
  return `${dia}, às ${hora}`;
}

function Alternador({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`h-9 min-w-11 rounded-md border px-2.5 text-sm font-medium transition-colors ${
        ativo ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/** Botão "Lista de espera" da Agenda e a janela para ver, incluir, editar e tirar gente da lista. */
export function ListaDeEspera({ pacientes }: { pacientes: Paciente[] }) {
  const utils = trpc.useUtils();
  const { data: lista = [] } = trpc.listaDeEspera.listar.useQuery();
  const [aberto, setAberto] = useState(false);
  // null = olhando a lista; número = editando esse paciente; 0 = incluindo alguém.
  const [editando, setEditando] = useState<number | null>(null);
  const [pacienteId, setPacienteId] = useState(0);
  const [dias, setDias] = useState<number[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [observacao, setObservacao] = useState("");

  const salvar = trpc.listaDeEspera.salvar.useMutation({
    onSuccess: () => {
      utils.listaDeEspera.listar.invalidate();
      toast.success(editando ? "Preferência atualizada." : "Na lista de espera.");
      setEditando(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const remover = trpc.listaDeEspera.remover.useMutation({
    onSuccess: () => {
      utils.listaDeEspera.listar.invalidate();
      toast.success("Saiu da lista de espera.");
    },
    onError: (e) => toast.error(e.message),
  });

  const naLista = new Set(lista.map((i) => i.patientId));
  const disponiveis = pacientes.filter((p) => !naLista.has(p.id) && p.status !== "inactive");

  const abrirFormulario = (item?: Item) => {
    setEditando(item ? item.patientId : 0);
    setPacienteId(item?.patientId ?? 0);
    setDias(item?.diasDaSemana ?? []);
    setPeriodos((item?.periodos ?? []) as Periodo[]);
    setObservacao(item?.observacao ?? "");
  };
  const alternar = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

  return (
    <>
      <Button variant="outline" className="bg-card" onClick={() => setAberto(true)} data-tour="lista-de-espera">
        <Hourglass className="size-4" />
        Lista de espera{lista.length > 0 && <span className="tabular-nums text-muted-foreground"> ({lista.length})</span>}
      </Button>

      <Dialog
        open={aberto}
        onOpenChange={(o) => {
          setAberto(o);
          if (!o) setEditando(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando === null ? "Lista de espera" : editando ? "Mudar preferência" : "Incluir na lista de espera"}</DialogTitle>
            <DialogDescription>
              Quem quer um horário com você e quando. Se uma consulta for cancelada, a Agenda mostra quem da lista quer
              aquele horário, com a mensagem pronta no WhatsApp.
            </DialogDescription>
          </DialogHeader>

          {editando === null ? (
            <div className="space-y-3">
              {lista.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Ninguém na lista ainda.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {lista.map((item) => (
                    <li key={item.patientId} className="flex items-start gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">
                          {item.firstName} {item.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground">{descricaoDaPreferencia(item)}</p>
                        {item.observacao && <p className="mt-0.5 text-sm text-foreground/80">{item.observacao}</p>}
                      </div>
                      <Button size="icon" variant="ghost" className="size-9 shrink-0" onClick={() => abrirFormulario(item)} aria-label={`Mudar preferência de ${item.firstName}`}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-9 shrink-0 text-red-700 hover:text-red-800"
                        onClick={() => remover.mutate({ patientId: item.patientId })}
                        disabled={remover.isPending}
                        aria-label={`Tirar ${item.firstName} da lista`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {editando === 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="espera-paciente">Paciente</Label>
                  <select
                    id="espera-paciente"
                    value={pacienteId}
                    onChange={(e) => setPacienteId(Number(e.target.value))}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value={0}>Escolha o paciente</option>
                    {disponiveis
                      .slice()
                      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "pt-BR"))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.firstName} {p.lastName}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-muted-foreground">Ainda não tem ficha? Cadastre em Pacientes primeiro.</p>
                </div>
              )}
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">Dias que servem</legend>
                <div className="flex flex-wrap gap-1.5">
                  {DIAS_CURTOS.map((d, i) => (
                    <Alternador key={d} ativo={dias.includes(i)} onClick={() => setDias((atual) => alternar(atual, i))}>
                      {d}
                    </Alternador>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Nenhum marcado = qualquer dia.</p>
              </fieldset>
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">Períodos</legend>
                <div className="flex flex-wrap gap-1.5">
                  {PERIODOS.map((p) => (
                    <Alternador key={p.id} ativo={periodos.includes(p.id)} onClick={() => setPeriodos((atual) => alternar(atual, p.id))}>
                      {p.rotulo}
                    </Alternador>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Manhã até 12h, tarde até 18h. Nenhum marcado = qualquer horário.</p>
              </fieldset>
              <div className="space-y-1.5">
                <Label htmlFor="espera-obs">Observação (opcional)</Label>
                <Textarea
                  id="espera-obs"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  maxLength={300}
                  rows={2}
                  placeholder="Ex.: prefere online; pode a partir de dezembro"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {editando === null ? (
              <Button onClick={() => abrirFormulario()} disabled={disponiveis.length === 0}>
                <UserPlus className="mr-2 size-4" />
                Incluir paciente
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setEditando(null)} disabled={salvar.isPending}>
                  Voltar
                </Button>
                <Button
                  onClick={() => salvar.mutate({ patientId: pacienteId, diasDaSemana: dias, periodos, observacao })}
                  disabled={salvar.isPending || !pacienteId}
                >
                  {salvar.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * "Horário livre": abre ao cancelar uma consulta futura (e pelo aviso na consulta
 * cancelada) com quem da lista quer aquele dia e período.
 */
export function HorarioLivre({
  quando,
  interessados,
  cancelado,
  aoFechar,
}: {
  quando: Date | null;
  interessados: Item[];
  /** Logo depois de cancelar: o aviso ao paciente desmarcado vem primeiro. */
  cancelado?: { nome: string; href: string | null };
  aoFechar: () => void;
}) {
  if (!quando) return null;
  const texto = quandoPorExtenso(quando);
  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Horário livre</DialogTitle>
          <DialogDescription>
            Vagou <strong className="text-foreground">{texto}</strong>. {interessados.length === 1 ? "Uma pessoa" : `${interessados.length} pessoas`} da
            lista de espera {interessados.length === 1 ? "quer" : "querem"} este horário. Ofereça para quem você escolher.
          </DialogDescription>
        </DialogHeader>
        {cancelado && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="min-w-0 flex-1">
              <strong className="font-semibold">Primeiro, avise {cancelado.nome.split(" ")[0]}</strong> do cancelamento: o e-mail
              pode cair no spam.
            </p>
            {cancelado.href ? (
              <Button asChild size="sm" variant="outline" className="shrink-0 border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800">
                <a href={cancelado.href} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className="mr-1.5 size-4" />
                  Avisar
                </a>
              </Button>
            ) : (
              <span className="shrink-0 text-xs">Sem telefone no cadastro</span>
            )}
          </div>
        )}
        <ul className="divide-y rounded-lg border">
          {interessados.map((item) => {
            const href = linkDoWhatsApp(item.phone, mensagemDeHorarioLivre({ primeiroNome: item.firstName, quando: texto }));
            return (
              <li key={item.patientId} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">
                    {item.firstName} {item.lastName}
                  </p>
                  <p className="text-sm text-muted-foreground">{descricaoDaPreferencia(item)}</p>
                  {item.observacao && <p className="text-sm text-foreground/80">{item.observacao}</p>}
                </div>
                {href ? (
                  <Button asChild size="sm" variant="outline" className="shrink-0 border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800">
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      <WhatsAppIcon className="mr-1.5 size-4" />
                      Oferecer
                    </a>
                  </Button>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">Sem telefone</span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">A mensagem sai do seu WhatsApp; você lê antes de enviar.</p>
        <DialogFooter>
          <Button variant="outline" onClick={aoFechar}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
