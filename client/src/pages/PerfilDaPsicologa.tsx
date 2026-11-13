import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { MAX_MENSAGEM, ROTULO_DA_MODALIDADE } from "@shared/conhecer";
import { trpc } from "@/lib/trpc";
import { useRole } from "@/hooks/useRole";
import { guardarVoltaDepoisDoLogin } from "@/lib/voltarDepoisDoLogin";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { CartaoPsicologa } from "@/components/CartaoPsicologa";
import { Rodape } from "@/components/Rodape";
import { AvisoDeCrise, CabecalhoDaBusca, FormularioDoPaciente, primeiraMaiuscula } from "@/components/BuscaDePsicologas";
import { ArrowLeft, CalendarCheck, MapPin, Video } from "lucide-react";

const FORMATO_DIA = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const FORMATO_HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

type Horario = { id: number; inicio: Date | string; duracao: number };

/** Horários agrupados por dia, na ordem. */
function porDia(horarios: Horario[]): Array<{ dia: string; horarios: Horario[] }> {
  const grupos = new Map<string, Horario[]>();
  for (const h of horarios) {
    const dia = FORMATO_DIA.format(new Date(h.inicio));
    grupos.set(dia, [...(grupos.get(dia) ?? []), h]);
  }
  return Array.from(grupos, ([dia, lista]) => ({ dia, horarios: lista }));
}

/** O que aparece embaixo do horário escolhido, conforme quem está vendo. */
function PedirHorario({ horario, nome, aoPedir }: { horario: Horario; nome: string; aoPedir: () => void }) {
  const [, setLocation] = useLocation();
  const { user, isTherapist, loading } = useRole();
  const utils = trpc.useUtils();
  const { data: situacao } = trpc.conhecer.minhaSituacao.useQuery(undefined, { enabled: Boolean(user) && !isTherapist });
  const [mensagem, setMensagem] = useState("");
  const pedir = trpc.conhecer.pedir.useMutation({
    onSuccess: () => {
      void utils.conhecer.minhaSituacao.invalidate();
      void utils.conhecer.perfil.invalidate();
      aoPedir();
    },
    onError: (e) => {
      void utils.conhecer.perfil.invalidate();
      void utils.conhecer.minhaSituacao.invalidate();
      toast.error(e.message);
    },
  });

  if (loading) return null;

  if (!user) {
    const entrar = (destino: string) => {
      guardarVoltaDepoisDoLogin(window.location.pathname);
      setLocation(destino);
    };
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Para pedir o horário, entre ou crie sua conta. É grátis e leva um minuto.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => entrar("/login?criar=paciente")}>Criar conta e pedir</Button>
          <Button variant="outline" onClick={() => entrar("/login")}>
            Já tenho conta
          </Button>
        </div>
      </div>
    );
  }
  if (isTherapist) {
    return <p className="text-sm text-muted-foreground">Você entrou com uma conta de psicóloga. Para pedir horário, use uma conta de paciente.</p>;
  }
  if (!situacao) return <Skeleton className="h-24 w-full" />;
  if (situacao.motivo === "perfil") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Antes, conte um pouco sobre você</p>
        <FormularioDoPaciente />
      </div>
    );
  }
  if (situacao.motivo) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">{situacao.explicacao}</p>
        {situacao.motivo === "pendente" && (
          <Link href="/encontrar-psicologa" className="font-medium text-primary underline-offset-4 hover:underline">
            Ver meus pedidos
          </Link>
        )}
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        pedir.mutate({ horarioId: horario.id, mensagem: mensagem.trim() || undefined });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="mensagem-pedido">Quer deixar um recado para {nome.split(" ")[0]}? (opcional)</Label>
        <Textarea
          id="mensagem-pedido"
          value={mensagem}
          maxLength={MAX_MENSAGEM}
          rows={3}
          onChange={(e) => setMensagem(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={pedir.isPending} className="w-full sm:w-auto">
        {pedir.isPending ? "Enviando..." : "Pedir este horário"}
      </Button>
    </form>
  );
}

export default function PerfilDaPsicologa() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const valido = Number.isInteger(id) && id > 0;
  const { data: p, isLoading } = trpc.conhecer.perfil.useQuery({ id }, { enabled: valido });
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [pedidoEnviado, setPedidoEnviado] = useState(false);

  // O horário escolhido pode ter sido pedido por outra pessoa: some da lista.
  useEffect(() => {
    if (escolhido !== null && p && !p.horarios.some((h) => h.id === escolhido)) setEscolhido(null);
  }, [p, escolhido]);

  useEffect(() => {
    if (p?.nome) document.title = `${p.nome} (CRP ${p.crp}) — VozInterior`;
  }, [p?.nome, p?.crp]);

  const horario = p?.horarios.find((h) => h.id === escolhido) ?? null;

  return (
    <div className="min-h-screen bg-background">
      <CabecalhoDaBusca />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:py-12">
        <div className="flex items-center justify-between gap-3">
          <Link href="/encontrar-psicologa" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            Voltar para a busca
          </Link>
          {/* No celular os horários ficam depois da apresentação: atalho até eles. */}
          {p && (
            <a href="#titulo-conversa" className="text-sm font-medium text-primary underline-offset-4 hover:underline lg:hidden">
              Ver horários
            </a>
          )}
        </div>

        {!valido || (!isLoading && !p) ? (
          <div className="rounded-2xl border bg-card px-6 py-12 text-center">
            <p className="font-medium text-foreground">Este perfil não está disponível.</p>
            <p className="mt-1 text-sm text-muted-foreground">A psicóloga pode ter saído da busca. Veja outras pessoas na busca.</p>
          </div>
        ) : isLoading || !p ? (
          <Skeleton className="h-96 w-full rounded-2xl" />
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
            <div className="space-y-4">
              <CartaoPsicologa
                dados={{
                  nome: p.nome,
                  crp: p.crp,
                  fotoUrl: p.fotoUrl,
                  especialidades: p.especialidades,
                  publicos: p.publicos,
                  formacao: p.formacao,
                  bio: p.bio,
                }}
              />
              <dl className="grid gap-3 rounded-2xl border bg-card p-5 text-sm sm:grid-cols-2">
                {p.abordagem && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Abordagem</dt>
                    <dd className="text-foreground">{p.abordagem}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Modalidade</dt>
                  <dd className="inline-flex items-center gap-1.5 text-foreground">
                    <Video className="size-4 text-primary" aria-hidden />
                    {ROTULO_DA_MODALIDADE[p.modalidade ?? "online"]}
                  </dd>
                </div>
                {p.uf && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Onde</dt>
                    <dd className="inline-flex items-center gap-1.5 text-foreground">
                      <MapPin className="size-4 text-primary" aria-hidden />
                      {p.cidade ? `${p.cidade}/${p.uf}` : p.uf}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <aside aria-labelledby="titulo-conversa" className="space-y-4 lg:sticky lg:top-6">
              <div className="space-y-4 rounded-2xl border bg-card p-5">
                <div>
                  <h2 id="titulo-conversa" className="font-semibold text-foreground">
                    Primeira conversa gratuita
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Uma conversa curta, por vídeo, para vocês se conhecerem. Se fizer sentido seguir, o valor e os horários das
                    sessões vocês combinam direto.
                  </p>
                </div>

                {pedidoEnviado ? (
                  <div className="space-y-2 rounded-xl bg-primary/5 p-4 text-sm">
                    <p className="flex items-center gap-2 font-medium text-foreground">
                      <CalendarCheck className="size-4 text-primary" aria-hidden />
                      Pedido enviado
                    </p>
                    <p className="text-muted-foreground">
                      {p.nome.split(" ")[0]} recebe um aviso e confirma por aqui. Você recebe um e-mail com a resposta, e a
                      conversa confirmada aparece em Consultas, com o botão para entrar na chamada.
                    </p>
                    <Link href="/encontrar-psicologa" className="font-medium text-primary underline-offset-4 hover:underline">
                      Ver meus pedidos
                    </Link>
                  </div>
                ) : p.horarios.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem horários livres agora. Volte em alguns dias.</p>
                ) : (
                  <>
                    <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                      {porDia(p.horarios).map((g) => (
                        <div key={g.dia}>
                          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{primeiraMaiuscula(g.dia)}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {g.horarios.map((h) => (
                              <button
                                key={h.id}
                                type="button"
                                aria-pressed={escolhido === h.id}
                                onClick={() => setEscolhido(escolhido === h.id ? null : h.id)}
                                className={cn(
                                  "rounded-lg border px-3 py-1.5 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  escolhido === h.id
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "bg-background text-foreground hover:border-primary/50",
                                )}
                              >
                                {FORMATO_HORA.format(new Date(h.inicio))}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    {horario ? (
                      <div className="space-y-3 border-t pt-4">
                        <p className="text-sm text-foreground">
                          {primeiraMaiuscula(FORMATO_DIA.format(new Date(horario.inicio)))}, às{" "}
                          {FORMATO_HORA.format(new Date(horario.inicio))} ({horario.duracao} min)
                        </p>
                        <PedirHorario
                          horario={horario}
                          nome={p.nome}
                          aoPedir={() => {
                            setPedidoEnviado(true);
                            setEscolhido(null);
                          }}
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Escolha um horário.</p>
                    )}
                  </>
                )}
              </div>
              <AvisoDeCrise />
            </aside>
          </div>
        )}
      </main>
      <Rodape />
    </div>
  );
}
