import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DURACAO_PRIMEIRA_CONVERSA,
  DURACOES_PERMITIDAS,
  MODALIDADES,
  ROTULO_DA_MODALIDADE,
  UFS,
  ehUf,
  type Modalidade,
} from "@shared/conhecer";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CalendarPlus, ExternalLink, Search, Trash2 } from "lucide-react";

const FORMATO_DIA = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
const FORMATO_HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** "aaaa-mm-dd" de amanhã, no fuso do aparelho (o mesmo da Agenda). */
function amanha(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Perfil público na busca de pacientes e os horários para a primeira conversa
 * (curta e gratuita). Fica fora do formulário do perfil: tem o próprio salvar.
 */
export function VitrineNaBusca() {
  const utils = trpc.useUtils();
  const { data: v, isLoading } = trpc.conhecer.minhaVitrine.useQuery();
  const [form, setForm] = useState({ naBusca: false, abordagem: "", modalidade: "online" as Modalidade, cidade: "", uf: "" });
  const [dia, setDia] = useState(amanha());
  const [hora, setHora] = useState("09:00");
  const [duracao, setDuracao] = useState(DURACAO_PRIMEIRA_CONVERSA);

  useEffect(() => {
    if (!v) return;
    setForm({
      naBusca: v.naBusca,
      abordagem: v.abordagem ?? "",
      modalidade: v.modalidade ?? "online",
      cidade: v.cidade ?? "",
      uf: v.uf ?? "",
    });
  }, [v]);

  const recarregar = () => utils.conhecer.minhaVitrine.invalidate();
  const salvar = trpc.conhecer.salvarVitrine.useMutation({
    onSuccess: (_r, vars) => {
      void recarregar();
      toast.success(vars.naBusca ? "Pronto: seu perfil aparece na busca." : "Salvo. Seu perfil não aparece na busca.");
    },
    onError: (e) => toast.error(e.message),
  });
  const abrir = trpc.conhecer.abrirHorario.useMutation({
    onSuccess: () => {
      void recarregar();
      toast.success("Horário aberto para primeira conversa.");
    },
    onError: (e) => toast.error(e.message),
  });
  const fechar = trpc.conhecer.fecharHorario.useMutation({
    onSuccess: () => void recarregar(),
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !v) return null;

  const alterado =
    form.naBusca !== v.naBusca ||
    form.abordagem !== (v.abordagem ?? "") ||
    form.modalidade !== (v.modalidade ?? "online") ||
    form.cidade !== (v.cidade ?? "") ||
    form.uf !== (v.uf ?? "");
  const presencial = form.modalidade !== "online";

  return (
    <section aria-labelledby="titulo-busca" className="rounded-2xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04)]" data-tour="aparecer-na-busca">
      <div className="flex items-start gap-3 border-b px-5 py-4 sm:px-6">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Search className="size-[18px]" />
        </span>
        <div>
          <h2 id="titulo-busca" className="font-semibold leading-tight text-foreground">
            Aparecer na busca de pacientes
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Quem ainda não tem psicóloga encontra seu perfil e pede um horário para uma primeira conversa, curta e gratuita.
          </p>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        <div className="flex items-center justify-between gap-4 rounded-xl bg-secondary/40 px-4 py-3">
          <div>
            <p className="font-medium text-foreground">Mostrar meu perfil na busca</p>
            <p className="text-xs text-muted-foreground">O valor da sessão nunca aparece (Código de Ética, art. 20).</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.naBusca}
            aria-label="Mostrar meu perfil na busca"
            onClick={() => setForm({ ...form, naBusca: !form.naBusca })}
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              form.naBusca ? "bg-primary" : "bg-muted-foreground/30",
            )}
          >
            <span
              className={cn(
                "absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform",
                form.naBusca ? "translate-x-[22px]" : "translate-x-0.5",
              )}
            />
          </button>
        </div>

        {v.falta.length > 0 && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Para aparecer, complete e salve no perfil acima: {v.falta.join(" e ")}.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="abordagem">Abordagem</Label>
            <Input
              id="abordagem"
              value={form.abordagem}
              maxLength={200}
              onChange={(e) => setForm({ ...form, abordagem: e.target.value })}
              placeholder="Ex.: Terapia Cognitivo-Comportamental"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="modalidade">Como você atende</Label>
            <Select value={form.modalidade} onValueChange={(m) => setForm({ ...form, modalidade: m as Modalidade })}>
              <SelectTrigger id="modalidade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODALIDADES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {ROTULO_DA_MODALIDADE[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <div className="space-y-2">
              <Label htmlFor="cidade">Cidade{presencial ? "" : " (opcional)"}</Label>
              <Input id="cidade" value={form.cidade} maxLength={80} onChange={(e) => setForm({ ...form, cidade: e.target.value })} placeholder="Recife" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="uf">Estado</Label>
              <Select value={form.uf || undefined} onValueChange={(uf) => setForm({ ...form, uf })}>
                <SelectTrigger id="uf">
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent>
                  {UFS.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {v.naBusca ? (
            <a
              href={`/psicologas/${v.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Ver meu perfil público <ExternalLink className="size-3.5" />
            </a>
          ) : (
            <span />
          )}
          <Button
            type="button"
            disabled={!alterado || salvar.isPending}
            onClick={() =>
              salvar.mutate({
                naBusca: form.naBusca,
                abordagem: form.abordagem.trim() || null,
                modalidade: form.modalidade,
                cidade: form.cidade.trim() || null,
                uf: ehUf(form.uf) ? form.uf : null,
              })
            }
          >
            {salvar.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>

        <div className="space-y-3 border-t pt-5">
          <div>
            <h3 className="font-medium text-foreground">Horários para a primeira conversa</h3>
            <p className="text-sm text-muted-foreground">
              O paciente escolhe um destes horários e você confirma. Pela videochamada do sistema, sem custo para ele.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="dia-conversa">Dia</Label>
              <Input id="dia-conversa" type="date" value={dia} onChange={(e) => setDia(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hora-conversa">Hora</Label>
              <Input id="hora-conversa" type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="w-28" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="duracao-conversa">Duração</Label>
              <Select value={String(duracao)} onValueChange={(d) => setDuracao(Number(d))}>
                <SelectTrigger id="duracao-conversa" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURACOES_PERMITIDAS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={!dia || !hora || abrir.isPending}
              onClick={() => {
                const inicio = new Date(`${dia}T${hora}`);
                if (Number.isNaN(inicio.getTime())) return toast.error("Confira o dia e a hora.");
                abrir.mutate({ inicio: inicio.toISOString(), duracao });
              }}
            >
              <CalendarPlus className="size-4" />
              Abrir horário
            </Button>
          </div>

          {v.horarios.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum horário aberto ainda.</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {v.horarios.map((h) => {
                const inicio = new Date(h.inicio);
                return (
                  <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="tabular-nums text-foreground">
                      <span className="capitalize">{FORMATO_DIA.format(inicio)}</span> · {FORMATO_HORA.format(inicio)}{" "}
                      <span className="text-muted-foreground">({h.duracao} min)</span>
                    </span>
                    {h.pedido === "aceito" ? (
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">Confirmado</span>
                    ) : h.pedido === "pendente" ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">Pedido esperando você</span>
                    ) : (
                      <span className="flex items-center gap-1">
                        {/* Aceito e depois desmarcado: não volta para a busca, só sai da lista. */}
                        {h.pedido === "desmarcado" && <span className="text-xs text-muted-foreground">Conversa desmarcada</span>}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-muted-foreground"
                          disabled={fechar.isPending}
                          onClick={() => fechar.mutate({ id: h.id })}
                          aria-label={`Fechar o horário de ${FORMATO_DIA.format(inicio)} às ${FORMATO_HORA.format(inicio)}`}
                        >
                          <Trash2 className="size-3.5" />
                          Fechar
                        </Button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
