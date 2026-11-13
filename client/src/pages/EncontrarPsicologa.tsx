import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ROTULO_DA_MODALIDADE, UFS, ehUf, type Modalidade } from "@shared/conhecer";
import { trpc } from "@/lib/trpc";
import { useRole } from "@/hooks/useRole";
import { iniciais } from "@/lib/iniciais";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Rodape } from "@/components/Rodape";
import {
  AvisoDeCrise,
  CabecalhoDaBusca,
  FORMATO_DIA_E_HORA,
  FormularioDoPaciente,
  MeusPedidos,
  primeiraMaiuscula,
} from "@/components/BuscaDePsicologas";
import { ArrowRight, BadgeCheck, CalendarClock, MapPin, Search, UserRound, Video } from "lucide-react";

const TODAS = "todas";

/** Área do paciente logado no topo da busca: os pedidos dele e o perfil. */
function PainelDoPaciente() {
  const { data } = trpc.conhecer.minhaSituacao.useQuery();
  if (!data) return null;
  const temPedidos = data.pedidos.length > 0;
  return (
    <section aria-labelledby="titulo-painel" className="space-y-3">
      <h2 id="titulo-painel" className="text-lg font-semibold text-foreground">
        {temPedidos ? "Seus pedidos" : "Seu perfil"}
      </h2>
      {data.motivo === "vinculado" && <p className="text-sm text-muted-foreground">{data.explicacao}</p>}
      <MeusPedidos />
      <Accordion type="single" collapsible defaultValue={data.perfil ? undefined : "perfil"} className="rounded-xl border bg-card px-4">
        <AccordionItem value="perfil" className="border-none">
          <AccordionTrigger className="text-sm">
            {data.perfil ? "Editar meu perfil" : "Complete seu perfil para pedir um horário"}
          </AccordionTrigger>
          <AccordionContent>
            <FormularioDoPaciente />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

export default function EncontrarPsicologa() {
  const { user, isTherapist } = useRole();
  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState("");
  const [modalidade, setModalidade] = useState<string>(TODAS);
  const [uf, setUf] = useState<string>(TODAS);
  const [pagina, setPagina] = useState(1);

  // Busca 300 ms depois da última tecla, e volta para a primeira página.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setBusca(texto.trim());
      setPagina(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [texto]);

  const { data, isLoading } = trpc.conhecer.buscar.useQuery(
    {
      texto: busca || undefined,
      modalidade: modalidade === TODAS ? undefined : (modalidade as Modalidade),
      uf: ehUf(uf) ? uf : undefined,
      pagina,
    },
    { placeholderData: (anterior) => anterior },
  );
  const comFiltro = Boolean(busca) || modalidade !== TODAS || uf !== TODAS;

  return (
    <div className="min-h-screen bg-background">
      <CabecalhoDaBusca />

      <main className="mx-auto max-w-5xl space-y-10 px-4 py-10 md:py-14">
        <section className="space-y-4">
          <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Encontre uma psicóloga ou um psicólogo
          </h1>
          <p className="max-w-2xl text-pretty text-lg text-muted-foreground">
            Escolha um horário para uma primeira conversa curta e gratuita, por vídeo, e veja se vocês combinam. Valor, dia e
            frequência das sessões vocês combinam depois, direto.
          </p>
          <AvisoDeCrise className="max-w-2xl" />
        </section>

        {user && !isTherapist && <PainelDoPaciente />}
        {isTherapist && (
          <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
            Você entrou como psicóloga. Para aparecer aqui, ligue <strong className="text-foreground">Aparecer na busca</strong> no seu{" "}
            <Link href="/profile" className="font-medium text-primary underline-offset-4 hover:underline">
              Perfil
            </Link>
            .
          </p>
        )}

        <section aria-labelledby="titulo-resultados" className="space-y-5">
          <h2 id="titulo-resultados" className="sr-only">
            Psicólogas
          </h2>
          <div className="grid gap-2 sm:grid-cols-[1fr_11rem_10rem]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={texto}
                maxLength={100}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Tema, abordagem ou nome: ansiedade, TCC, luto..."
                aria-label="Buscar por tema, abordagem ou nome"
                className="pl-9"
              />
            </div>
            <Select
              value={modalidade}
              onValueChange={(m) => {
                setModalidade(m);
                setPagina(1);
              }}
            >
              <SelectTrigger aria-label="Modalidade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Online ou presencial</SelectItem>
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
              <SelectTrigger aria-label="Estado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todo o Brasil</SelectItem>
                {UFS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-56 rounded-2xl" />
              ))}
            </div>
          ) : !data?.itens.length ? (
            <div className="rounded-2xl border bg-card px-6 py-12 text-center">
              <p className="font-medium text-foreground">
                {comFiltro ? "Ninguém encontrado com esses filtros." : "Ainda não há perfis na busca."}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {comFiltro
                  ? "Tente outra palavra ou tire um dos filtros."
                  : "As psicólogas do VozInterior estão começando a abrir horários. Volte em alguns dias."}
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {data.total === 1 ? "1 perfil" : `${data.total} perfis`}
              </p>
              <ul className="grid gap-4 sm:grid-cols-2">
                {data.itens.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/psicologas/${p.id}`}
                      className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="size-14 shrink-0">
                          {p.fotoUrl ? <AvatarImage src={p.fotoUrl} alt="" className="object-cover" /> : null}
                          <AvatarFallback className="bg-accent font-semibold text-accent-foreground">
                            {iniciais(p.nome) || <UserRound className="size-6" />}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{p.nome}</p>
                          <p className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                            <BadgeCheck className="size-3.5" aria-hidden />
                            CRP {p.crp}
                          </p>
                        </div>
                      </div>
                      {p.abordagem && <p className="text-sm text-foreground">{p.abordagem}</p>}
                      {p.especialidades.length > 0 && (
                        <ul className="flex flex-wrap gap-1.5" aria-label="Especialidades">
                          {p.especialidades.slice(0, 4).map((e) => (
                            <li key={e} className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                              {e}
                            </li>
                          ))}
                          {p.especialidades.length > 4 && (
                            <li className="px-1 text-xs text-muted-foreground">+{p.especialidades.length - 4}</li>
                          )}
                        </ul>
                      )}
                      <p className="line-clamp-3 text-sm text-muted-foreground">{p.bioCurta}</p>
                      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Video className="size-3.5" aria-hidden />
                          {ROTULO_DA_MODALIDADE[p.modalidade ?? "online"]}
                        </span>
                        {p.uf && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3.5" aria-hidden />
                            {p.cidade ? `${p.cidade}/${p.uf}` : p.uf}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="size-3.5" aria-hidden />
                          {p.proximoHorario
                            ? primeiraMaiuscula(FORMATO_DIA_E_HORA.format(new Date(p.proximoHorario)))
                            : "Sem horário livre agora"}
                        </span>
                        <ArrowRight className="ml-auto size-4 text-primary" aria-hidden />
                      </div>
                    </Link>
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
        </section>
      </main>

      <Rodape />
    </div>
  );
}
