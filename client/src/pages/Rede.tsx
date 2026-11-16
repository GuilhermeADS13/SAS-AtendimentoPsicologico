import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { MAX_MENSAGEM, ROTULO_DA_PREFERENCIA, ROTULO_DO_STATUS, UFS, ehUf, horarioPodeSerPedido, type StatusDoPedido } from "@shared/conhecer";
import { trpc } from "@/lib/trpc";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/utils";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PedidosParaConhecer } from "@/components/PedidosParaConhecer";
import { VitrineNaBusca } from "@/components/VitrineNaBusca";
import { FORMATO_DIA_E_HORA, FormularioDoPaciente, MeusPedidos, primeiraMaiuscula } from "@/components/BuscaDePsicologas";
import { MapPin, Search, Send } from "lucide-react";

const TODOS = "todos";
const COR_DO_STATUS: Record<StatusDoPedido, string> = {
  pendente: "bg-amber-100 text-amber-900",
  aceito: "bg-primary/10 text-primary",
  recusado: "bg-muted text-muted-foreground",
  cancelado: "bg-muted text-muted-foreground",
  expirado: "bg-muted text-muted-foreground",
};

const quando = (d: Date | string) => primeiraMaiuscula(FORMATO_DIA_E_HORA.format(new Date(d)));

function Selo({ status }: { status: StatusDoPedido }) {
  return <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", COR_DO_STATUS[status])}>{ROTULO_DO_STATUS[status]}</span>;
}

// ── Psicóloga ─────────────────────────────────────────────────────────────────

/** Convite para a primeira conversa: ela escolhe um horário aberto dela e deixa um recado. */
function ConvidarDialog({ paciente, aoFechar }: { paciente: { id: number; primeiroNome: string } | null; aoFechar: () => void }) {
  const utils = trpc.useUtils();
  const { data: vitrine } = trpc.conhecer.minhaVitrine.useQuery(undefined, { enabled: paciente !== null });
  const [horarioId, setHorarioId] = useState<string>("");
  const [mensagem, setMensagem] = useState("");
  const convidar = trpc.conhecer.convidar.useMutation({
    onSuccess: () => {
      void utils.conhecer.mural.invalidate();
      void utils.conhecer.convitesEnviados.invalidate();
      void utils.conhecer.minhaVitrine.invalidate();
      toast.success("Convite enviado. A pessoa recebe um e-mail e responde pela Rede.");
      setHorarioId("");
      setMensagem("");
      aoFechar();
    },
    onError: (e) => toast.error(e.message),
  });
  // Livres e que ainda podem ser pedidos (a mesma regra do servidor, que confere de novo).
  const livres = (vitrine?.horarios ?? []).filter((h) => !h.pedido && horarioPodeSerPedido(new Date(h.inicio)));
  // O servidor só deixa convidar com o perfil visível na busca: o mesmo aviso aqui, com o que falta.
  const semPerfilNaBusca = vitrine && (!vitrine.naBusca || vitrine.falta.length > 0);

  return (
    <Dialog open={paciente !== null} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar {paciente?.primeiroNome} para uma primeira conversa</DialogTitle>
          <DialogDescription>Curta e gratuita, por vídeo. Se a pessoa aceitar, ela vira sua paciente e a conversa entra na Agenda.</DialogDescription>
        </DialogHeader>
        {semPerfilNaBusca ? (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {vitrine.falta.length
              ? `Para convidar, complete no seu Perfil: ${vitrine.falta.join(" e ")}. Depois ligue “Aparecer na busca”.`
              : "Para convidar, ligue “Aparecer na busca” na aba Meu perfil na busca: é por ele que a pessoa conhece você antes de aceitar."}
          </p>
        ) : livres.length === 0 ? (
          <p className="rounded-xl bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
            Você não tem horário livre. Abra um na aba Meu perfil na busca e volte aqui.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="convite-horario">Horário</Label>
              <Select value={horarioId} onValueChange={setHorarioId}>
                <SelectTrigger id="convite-horario">
                  <SelectValue placeholder="Escolha um dos seus horários" />
                </SelectTrigger>
                <SelectContent>
                  {livres.map((h) => (
                    <SelectItem key={h.id} value={String(h.id)}>
                      {quando(h.inicio)} · {h.duracao} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="convite-recado">Recado (opcional)</Label>
              <Textarea id="convite-recado" value={mensagem} maxLength={MAX_MENSAGEM} rows={3} onChange={(e) => setMensagem(e.target.value)} />
              <p className="text-xs text-muted-foreground">Sem valores nem promessas de resultado (Código de Ética, art. 20).</p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>
            Voltar
          </Button>
          <Button
            disabled={!paciente || !horarioId || Boolean(semPerfilNaBusca) || convidar.isPending}
            onClick={() =>
              paciente && convidar.mutate({ pacienteId: paciente.id, horarioId: Number(horarioId), mensagem: mensagem.trim() || undefined })
            }
            className="gap-2"
          >
            <Send className="size-4" />
            {convidar.isPending ? "Enviando..." : "Enviar convite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Mural() {
  const [uf, setUf] = useState(TODOS);
  const [modalidade, setModalidade] = useState(TODOS);
  const [pagina, setPagina] = useState(1);
  const [convidando, setConvidando] = useState<{ id: number; primeiroNome: string } | null>(null);
  const { data, isLoading, error } = trpc.conhecer.mural.useQuery(
    {
      uf: ehUf(uf) ? uf : undefined,
      modalidade: modalidade === "online" || modalidade === "presencial" ? modalidade : undefined,
      pagina,
    },
    { placeholderData: (anterior) => anterior },
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pessoas que procuram psicóloga e escolheram aparecer aqui. Você vê o primeiro nome e o que elas contaram; o contato é
        por convite, num horário seu.
      </p>
      <div className="flex flex-wrap gap-2">
        <Select
          value={modalidade}
          onValueChange={(m) => {
            setModalidade(m);
            setPagina(1);
          }}
        >
          <SelectTrigger className="w-48" aria-label="Modalidade">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Online ou presencial</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="presencial">Presencial</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={uf}
          onValueChange={(u) => {
            setUf(u);
            setPagina(1);
          }}
        >
          <SelectTrigger className="w-40" aria-label="Estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todo o Brasil</SelectItem>
            {UFS.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error.message}</p>
      ) : !data?.itens.length ? (
        <div className="rounded-2xl border bg-card px-6 py-10 text-center">
          <p className="font-medium text-foreground">Ninguém no mural por enquanto.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Quem procura psicóloga e liga “Aparecer para psicólogas” no perfil aparece aqui.
          </p>
        </div>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.itens.map((p) => (
              <li key={p.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">
                      {p.primeiroNome}
                      {p.idade !== null && <span className="font-normal text-muted-foreground">, {p.idade} anos</span>}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" aria-hidden />
                        {p.cidade}/{p.uf}
                      </span>
                      <span>{ROTULO_DA_PREFERENCIA[p.modalidade ?? "ambos"]}</span>
                    </p>
                  </div>
                  {p.convidado ? (
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-foreground">Convidado</span>
                  ) : (
                    <Button size="sm" className="gap-1.5" onClick={() => setConvidando({ id: p.id, primeiroNome: p.primeiroNome })}>
                      <Send className="size-3.5" />
                      Convidar
                    </Button>
                  )}
                </div>
                {p.oQueProcura ? (
                  <p className="whitespace-pre-line text-sm text-foreground">{p.oQueProcura}</p>
                ) : (
                  <p className="text-sm italic text-muted-foreground">Não contou o que procura.</p>
                )}
              </li>
            ))}
          </ul>
          {(pagina > 1 || data.temMais) && (
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>
                Anterior
              </Button>
              <span className="text-sm tabular-nums text-muted-foreground">Página {pagina}</span>
              <Button variant="outline" size="sm" disabled={!data.temMais} onClick={() => setPagina(pagina + 1)}>
                Próxima
              </Button>
            </div>
          )}
        </>
      )}
      <ConvidarDialog paciente={convidando} aoFechar={() => setConvidando(null)} />
    </div>
  );
}

function ConvitesEnviados() {
  const utils = trpc.useUtils();
  const { data = [], isLoading } = trpc.conhecer.convitesEnviados.useQuery();
  const cancelar = trpc.conhecer.cancelarConvite.useMutation({
    onSuccess: () => {
      void utils.conhecer.convitesEnviados.invalidate();
      void utils.conhecer.minhaVitrine.invalidate();
      void utils.conhecer.mural.invalidate();
      toast.success("Convite cancelado. O horário ficou livre de novo.");
    },
    onError: (e) => toast.error(e.message),
  });
  if (isLoading) return <Skeleton className="h-24 w-full rounded-2xl" />;
  if (!data?.length) {
    return <p className="text-sm text-muted-foreground">Você ainda não convidou ninguém. Os convites aparecem aqui com a resposta.</p>;
  }
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {data.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <div>
            <p className="font-medium text-foreground">{c.primeiroNome}</p>
            <p className="text-muted-foreground">
              {quando(c.inicio)} · {c.duracao} min
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Selo status={c.status} />
            {c.status === "pendente" && (
              <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={cancelar.isPending} onClick={() => cancelar.mutate({ id: c.id })}>
                Cancelar
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function RedeDaPsicologa() {
  return (
    <Tabs defaultValue="mural" className="space-y-4">
      <TabsList className="flex h-auto flex-wrap justify-start">
        <TabsTrigger value="mural">Pacientes procurando</TabsTrigger>
        <TabsTrigger value="pedidos">Pedidos recebidos</TabsTrigger>
        <TabsTrigger value="convites">Convites enviados</TabsTrigger>
        <TabsTrigger value="vitrine">Meu perfil na busca</TabsTrigger>
      </TabsList>
      <TabsContent value="mural">
        <Mural />
      </TabsContent>
      <TabsContent value="pedidos">
        <PedidosParaConhecer
          vazio={<p className="text-sm text-muted-foreground">Nenhum pedido esperando. Quando alguém pedir um horário seu pela busca, ele aparece aqui e no alto da Agenda.</p>}
        />
      </TabsContent>
      <TabsContent value="convites">
        <ConvitesEnviados />
      </TabsContent>
      <TabsContent value="vitrine">
        <VitrineNaBusca />
      </TabsContent>
    </Tabs>
  );
}

// ── Paciente ──────────────────────────────────────────────────────────────────

function ConvitesRecebidos() {
  const utils = trpc.useUtils();
  const { data } = trpc.conhecer.minhaSituacao.useQuery();
  const responder = trpc.conhecer.responderConvite.useMutation({
    onSuccess: (_r, vars) => {
      void utils.conhecer.minhaSituacao.invalidate();
      void utils.me.therapist.invalidate();
      void utils.me.appointments.invalidate();
      toast.success(
        vars.aceitar
          ? "Conversa marcada! Ela aparece em Minhas Consultas, com o botão para entrar na chamada."
          : "Convite recusado.",
      );
    },
    onError: (e) => {
      void utils.conhecer.minhaSituacao.invalidate();
      toast.error(e.message);
    },
  });
  const convites = (data?.convites ?? []).filter((c) => c.status === "pendente");
  if (!convites.length) return null;
  return (
    <section aria-labelledby="titulo-convites" className="space-y-3">
      <h2 id="titulo-convites" className="text-lg font-semibold text-foreground">
        Convites para você
      </h2>
      <ul className="space-y-3">
        {convites.map((c) => (
          <li key={c.id} className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/psicologas/${c.therapistId}`} className="font-semibold text-foreground hover:underline">
                  {c.nome || "Psicóloga"}
                </Link>
                <p className="text-sm text-foreground">
                  Primeira conversa gratuita: {quando(c.inicio)} · {c.duracao} min
                </p>
                <Link href={`/psicologas/${c.therapistId}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                  Ver o perfil dela
                </Link>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={responder.isPending}
                  onClick={() => responder.mutate({ id: c.id, aceitar: false })}
                >
                  Recusar
                </Button>
                <Button size="sm" disabled={responder.isPending} onClick={() => responder.mutate({ id: c.id, aceitar: true })}>
                  Aceitar
                </Button>
              </div>
            </div>
            {c.mensagem && <p className="mt-3 whitespace-pre-line rounded-xl bg-card px-3 py-2 text-sm text-foreground">{c.mensagem}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RedeDoPaciente() {
  const { data } = trpc.conhecer.minhaSituacao.useQuery();
  if (!data) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (data.motivo === "vinculado") {
    return <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">{data.explicacao}</p>;
  }
  return (
    <div className="space-y-8">
      <ConvitesRecebidos />
      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-foreground">Procure uma psicóloga</p>
          <p className="text-sm text-muted-foreground">Veja perfis com CRP e peça um horário para uma primeira conversa gratuita.</p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/encontrar-psicologa">
            <Search className="size-4" />
            Procurar psicólogas
          </Link>
        </Button>
      </section>
      {data.pedidos.length > 0 && (
        <section aria-labelledby="titulo-pedidos-rede" className="space-y-3">
          <h2 id="titulo-pedidos-rede" className="text-lg font-semibold text-foreground">
            Seus pedidos
          </h2>
          <MeusPedidos />
        </section>
      )}
      <section aria-labelledby="titulo-perfil-rede" className="space-y-3">
        <div>
          <h2 id="titulo-perfil-rede" className="text-lg font-semibold text-foreground">
            Seu perfil
          </h2>
          <p className="text-sm text-muted-foreground">
            Ligue “Aparecer para psicólogas” para que elas também possam te encontrar e convidar.
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <FormularioDoPaciente />
        </div>
      </section>
    </div>
  );
}

/** Rede (2026-11-16): psicólogas encontram pacientes, e pacientes encontram psicólogas. */
export default function Rede() {
  const { isTherapist, loading } = useRole();
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6" data-tour="rede">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-foreground">Rede</h1>
          <p className="text-muted-foreground">
            {isTherapist
              ? "Encontre pessoas que procuram psicóloga, responda aos pedidos e cuide do seu perfil na busca."
              : "Encontre uma psicóloga, responda aos convites e cuide do seu perfil."}
          </p>
        </div>
        {loading ? <Skeleton className="h-64 w-full rounded-2xl" /> : isTherapist ? <RedeDaPsicologa /> : <RedeDoPaciente />}
      </div>
    </DashboardLayout>
  );
}
