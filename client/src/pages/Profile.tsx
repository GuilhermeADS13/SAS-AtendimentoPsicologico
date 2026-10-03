import { useEffect, useId, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarUpload } from "@/components/AvatarUpload";
import { AcoesDoPaciente, CartaoPsicologa, listaDeTexto } from "@/components/CartaoPsicologa";
import { getAvatarSignedUrl } from "@/lib/supabase";
import { maskCrp } from "@shared/crp";
import { reaisParaCentavos, centavosParaInput } from "@shared/dinheiro";
import { iniciais } from "@/lib/iniciais";
import { cn } from "@/lib/utils";
import { Check, Eye, GraduationCap, HeartHandshake, IdCard, Lock, Plus, Wallet, X } from "lucide-react";

export default function Profile() {
  const { isTherapist, loading: roleLoading } = useRole();

  // Paciente vê o próprio cadastro; a psicóloga vê o perfil profissional.
  if (roleLoading) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Carregando...</p>
      </DashboardLayout>
    );
  }

  // O cadastro do paciente foi unificado em "Configurações da conta". Quem chegar
  // aqui por link/bookmark antigo é levado para lá, em vez de ver uma tela órfã.
  if (!isTherapist) {
    return <Redirect to="/configuracoes" />;
  }

  return <TherapistProfile />;
}

const BIO_MAX = 600;
const FORMACAO_MAX = 400;

// Opções de público atendido (conjunto fixo, na ordem etária + arranjos).
const PUBLICOS = ["Crianças", "Adolescentes", "Adultos", "Idosos", "Casais", "Famílias"];

// Sugestões de especialidade: um clique adiciona. Só aparecem as que faltam.
const SUGESTOES_ESPECIALIDADE = [
  "Ansiedade",
  "Depressão",
  "Luto",
  "Relacionamentos",
  "Autoestima",
  "Burnout",
  "TDAH",
  "Trauma",
  "Orientação profissional",
  "Terapia Cognitivo-Comportamental",
];

type Formulario = {
  crp: string;
  specialties: string;
  bio: string;
  photoKey: string;
  formacao: string;
  publicoAtendido: string;
  preco: string; // preço padrão em reais (texto do input); convertido no salvar
};

const VAZIO: Formulario = { crp: "", specialties: "", bio: "", photoKey: "", formacao: "", publicoAtendido: "", preco: "" };

/**
 * Formulário → payload do therapists.upsert.
 *
 * Campos vazios vão como "" (e não `undefined`): o Drizzle IGNORA chaves
 * undefined no UPDATE, então apagar a última especialidade, a bio ou a formação e
 * salvar não fazia nada — o valor antigo voltava na próxima carga.
 */
function montarPayload(f: Formulario) {
  return {
    crp: f.crp.trim(),
    specialties: f.specialties,
    bio: f.bio,
    photoKey: f.photoKey,
    formacao: f.formacao,
    publicoAtendido: f.publicoAtendido,
    // Reais (texto) → centavos. Vazio manda null (limpa o preço padrão).
    sessionPrice: reaisParaCentavos(f.preco),
  };
}

const mesmoFormulario = (a: Formulario, b: Formulario) =>
  (Object.keys(a) as Array<keyof Formulario>).every((k) => a[k].trim() === b[k].trim());

/** Perfil profissional da psicóloga (CRP, especialidades, bio). */
function TherapistProfile() {
  const { user } = useAuth();
  const { data: therapist, isLoading } = trpc.therapists.me.useQuery();

  const [form, setForm] = useState<Formulario>(VAZIO);
  /** Última versão salva: base do "alterações não salvas" e do "Descartar". */
  const [salvo, setSalvo] = useState<Formulario | null>(null);
  // Campo de digitação das especialidades (o valor confirmado vira etiqueta).
  const [novaEsp, setNovaEsp] = useState("");
  // Foto para a prévia. O bucket é privado → URL assinada; atualiza junto do photoKey.
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  // Carrega UMA vez. Antes o efeito rodava a cada refetch de therapists.me e
  // apagava o que estivesse sendo digitado (ex.: ao voltar o foco para a aba).
  const carregado = useRef(false);
  useEffect(() => {
    if (carregado.current || isLoading) return;
    carregado.current = true;
    const inicial: Formulario = therapist
      ? {
          crp: therapist.crp ?? "",
          specialties: therapist.specialties ?? "",
          bio: therapist.bio ?? "",
          photoKey: therapist.photoKey ?? "",
          formacao: therapist.formacao ?? "",
          publicoAtendido: therapist.publicoAtendido ?? "",
          preco: centavosParaInput(therapist.sessionPrice),
        }
      : VAZIO;
    setForm(inicial);
    setSalvo(inicial);
  }, [therapist, isLoading]);

  useEffect(() => {
    let ativo = true;
    if (!form.photoKey) {
      setFotoUrl(null);
      return;
    }
    getAvatarSignedUrl(form.photoKey).then((url) => {
      if (ativo) setFotoUrl(url);
    });
    return () => {
      ativo = false;
    };
  }, [form.photoKey]);

  const upsert = trpc.therapists.upsert.useMutation();

  // Especialidades: guardadas como texto separado por vírgula (não muda o banco),
  // exibidas e editadas como etiquetas.
  const especialidades = listaDeTexto(form.specialties);
  const publicos = listaDeTexto(form.publicoAtendido);

  const addEsp = (valor: string) => {
    const v = valor.trim().replace(/,/g, "");
    if (!v) return;
    // Não duplica (ignora maiúsc./minúsc.).
    if (especialidades.some((e) => e.toLowerCase() === v.toLowerCase())) {
      setNovaEsp("");
      return;
    }
    setForm((f) => ({ ...f, specialties: [...listaDeTexto(f.specialties), v].join(", ") }));
    setNovaEsp("");
  };
  const removeEsp = (esp: string) => {
    setForm((f) => ({ ...f, specialties: listaDeTexto(f.specialties).filter((e) => e !== esp).join(", ") }));
  };
  const togglePublico = (p: string) => {
    const novo = publicos.includes(p) ? publicos.filter((x) => x !== p) : [...publicos, p];
    // Mantém a ordem fixa da lista, não a ordem dos cliques.
    const ordenado = PUBLICOS.filter((x) => novo.includes(x));
    setForm((f) => ({ ...f, publicoAtendido: ordenado.join(", ") }));
  };

  const sugestoes = SUGESTOES_ESPECIALIDADE.filter(
    (s) => !especialidades.some((e) => e.toLowerCase() === s.toLowerCase()),
  ).slice(0, 7);

  const alterado = salvo !== null && (!mesmoFormulario(form, salvo) || novaEsp.trim() !== "");

  // Aviso do navegador ao fechar/recarregar com alterações não salvas.
  useEffect(() => {
    if (!alterado) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [alterado]);

  const handleSave = () => {
    if (!form.crp.trim()) {
      toast.error("Informe o CRP.");
      document.getElementById("crp")?.focus();
      return;
    }
    // Não perder uma especialidade digitada mas ainda não confirmada com Enter.
    const extra = novaEsp.trim().replace(/,/g, "");
    const final: Formulario =
      extra && !especialidades.some((e) => e.toLowerCase() === extra.toLowerCase())
        ? { ...form, specialties: [...especialidades, extra].join(", ") }
        : form;

    upsert.mutate(montarPayload(final), {
      onSuccess: () => {
        setForm(final);
        setSalvo(final);
        setNovaEsp("");
        toast.success("Perfil salvo. Seus pacientes já veem a versão nova.");
      },
      onError: (e) => toast.error(e.message || "Erro ao salvar o perfil"),
    });
  };

  const descartar = () => {
    if (!salvo) return;
    setForm(salvo);
    setNovaEsp("");
  };

  /**
   * A foto vale NA HORA. O upload grava sempre no mesmo caminho (<uid>/avatar.ext,
   * com upsert) e o "remover" apaga o arquivo do Storage na hora — então o arquivo
   * já mudou antes do "Salvar". Se o perfil só gravasse o photoKey no Salvar,
   * descartar ou sair sem salvar deixava o banco apontando para uma foto que não
   * existe mais. Salva só o photoKey, sobre a ÚLTIMA VERSÃO SALVA: o que estiver
   * sendo digitado nos outros campos continua pendente.
   */
  const trocarFoto = (photoKey: string) => {
    setForm((f) => ({ ...f, photoKey }));
    if (!salvo || !salvo.crp.trim()) {
      // Perfil ainda sem CRP salvo: a foto entra junto no primeiro "Salvar".
      toast.info("Foto pronta. Salve o perfil para ela aparecer aos pacientes.");
      return;
    }
    const comFoto = { ...salvo, photoKey };
    upsert.mutate(montarPayload(comFoto), {
      onSuccess: () => {
        setSalvo(comFoto);
        toast.success(photoKey ? "Foto atualizada." : "Foto removida.");
      },
      onError: (e) => toast.error(e.message || "Não foi possível salvar a foto"),
    });
  };

  // ── Completude do perfil ────────────────────────────────────────────────
  const itens: Array<{ id: string; rotulo: string; ok: boolean }> = [
    { id: "foto", rotulo: "Foto", ok: Boolean(form.photoKey) },
    { id: "crp", rotulo: "CRP", ok: Boolean(form.crp.trim()) },
    { id: "esp", rotulo: "Especialidades", ok: especialidades.length > 0 },
    { id: "publico", rotulo: "Público atendido", ok: publicos.length > 0 },
    { id: "formacao", rotulo: "Formação", ok: Boolean(form.formacao.trim()) },
    { id: "bio", rotulo: "Apresentação", ok: form.bio.trim().length >= 60 },
  ];
  const feitos = itens.filter((i) => i.ok).length;
  const pct = Math.round((feitos / itens.length) * 100);
  const irPara = (id: string) => {
    const alvo = document.getElementById(id === "foto" ? "secao-identificacao" : id);
    alvo?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement) alvo.focus({ preventScroll: true });
  };

  const dadosCartao = useMemo(
    () => ({
      nome: user?.name ?? "",
      crp: form.crp,
      fotoUrl,
      especialidades,
      publicos,
      formacao: form.formacao,
      bio: form.bio,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.name, form, fotoUrl],
  );

  const carregando = isLoading || salvo === null;

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-6xl space-y-6 pb-8 sm:pt-2">
        <header className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Perfil profissional</h1>
          <p className="max-w-2xl text-muted-foreground">
            O que você preencher aqui aparece para os seus pacientes em “Minha Psicóloga”.
          </p>
        </header>

        {/* Progresso no celular (no computador ele fica ao lado da prévia) */}
        {!carregando && (
          <div className="lg:hidden">
            <Progresso pct={pct} feitos={feitos} total={itens.length} />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
          {/* ---- Formulário ---- */}
          <div className="space-y-5">
            {carregando ? (
              [0, 1, 2].map((i) => <Skeleton key={i} className="h-56 w-full rounded-2xl" />)
            ) : (
              <>
                <Secao
                  id="secao-identificacao"
                  icone={IdCard}
                  titulo="Identificação"
                  descricao="Foto e registro profissional."
                >
                  <div className="space-y-2">
                    <Label>Foto</Label>
                    <AvatarUpload
                      value={form.photoKey}
                      onChange={trocarFoto}
                      fallback={iniciais(user?.name)}
                      avisoAoEnviar={null}
                    />
                    <p className="text-xs text-muted-foreground">
                      Uma foto de rosto, com boa luz, passa confiança a quem vai te conhecer.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="nome-exibido">Nome exibido</Label>
                      <Input id="nome-exibido" value={user?.name ?? ""} disabled readOnly />
                      <p className="text-xs text-muted-foreground">Vem do seu cadastro de acesso.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="crp">
                        CRP <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="crp"
                        value={form.crp}
                        onChange={(e) => setForm({ ...form, crp: maskCrp(e.target.value) })}
                        placeholder="Ex.: 06/123456"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={9}
                      />
                      <p className="text-xs text-muted-foreground">Região / número, como na carteira do CRP.</p>
                    </div>
                  </div>
                </Secao>

                <Secao
                  icone={HeartHandshake}
                  titulo="Como você atende"
                  descricao="Ajuda o paciente a saber se você é a pessoa certa para ele."
                >
                  <div className="space-y-2">
                    <Label htmlFor="esp">Especialidades e abordagens</Label>
                    {especialidades.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5">
                        {especialidades.map((e) => (
                          <li
                            key={e}
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-3 pr-1.5 text-xs font-medium text-primary"
                          >
                            {e}
                            <button
                              type="button"
                              onClick={() => removeEsp(e)}
                              aria-label={`Remover ${e}`}
                              className="rounded-full p-0.5 transition-colors hover:bg-primary/15"
                            >
                              <X className="size-3" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex gap-2">
                      <Input
                        id="esp"
                        value={novaEsp}
                        onChange={(e) => setNovaEsp(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            addEsp(novaEsp);
                          }
                        }}
                        placeholder="Digite e tecle Enter (ex.: Ansiedade)"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => addEsp(novaEsp)}
                        disabled={!novaEsp.trim()}
                        aria-label="Adicionar especialidade"
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                    {sugestoes.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="mr-1 text-xs text-muted-foreground">Sugestões:</span>
                        {sugestoes.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => addEsp(s)}
                            className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                          >
                            <Plus className="size-3" />
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <fieldset className="space-y-2">
                    <legend id="publico" tabIndex={-1} className="text-sm font-medium leading-none">
                      Público atendido
                    </legend>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {PUBLICOS.map((p) => {
                        const ativo = publicos.includes(p);
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => togglePublico(p)}
                            aria-pressed={ativo}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                              ativo
                                ? "border-primary bg-primary text-primary-foreground"
                                : "bg-card text-foreground hover:border-primary/50 hover:bg-primary/5",
                            )}
                          >
                            {ativo && <Check className="size-3.5" />}
                            {p}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                </Secao>

                <Secao
                  icone={GraduationCap}
                  titulo="Sobre você"
                  descricao="Sua trajetória e o jeito como você trabalha."
                >
                  <div className="space-y-2">
                    <Label htmlFor="formacao">Formação</Label>
                    <Textarea
                      id="formacao"
                      rows={3}
                      value={form.formacao}
                      maxLength={FORMACAO_MAX}
                      onChange={(e) => setForm({ ...form, formacao: e.target.value })}
                      placeholder={"Graduação em Psicologia — USP\nEspecialização em Terapia Cognitivo-Comportamental"}
                    />
                    <p className="text-xs text-muted-foreground">Um item por linha.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bio">Apresentação</Label>
                    <Textarea
                      id="bio"
                      rows={6}
                      value={form.bio}
                      maxLength={BIO_MAX}
                      onChange={(e) => setForm({ ...form, bio: e.target.value })}
                      placeholder="Conte, em primeira pessoa, como você acolhe, com quem trabalha e qual a sua abordagem."
                    />
                    <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
                      <p>Evite prometer resultados: o Código de Ética do psicólogo não permite.</p>
                      <span className={cn("shrink-0 tabular-nums", form.bio.length > BIO_MAX * 0.9 && "text-amber-700")}>
                        {form.bio.length}/{BIO_MAX}
                      </span>
                    </div>
                  </div>
                </Secao>

                <Secao
                  icone={Wallet}
                  titulo="Valores"
                  descricao="Usado para preencher cada consulta nova."
                  selo={
                    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      <Lock className="size-3" />
                      Só você vê
                    </span>
                  }
                >
                  <div className="max-w-xs space-y-2">
                    <Label htmlFor="preco">Preço padrão da consulta</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                      <Input
                        id="preco"
                        value={form.preco}
                        onChange={(e) => setForm({ ...form, preco: e.target.value })}
                        placeholder="150,00"
                        inputMode="decimal"
                        className="pl-9 tabular-nums"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Dá para mudar o valor em cada consulta.</p>
                  </div>
                </Secao>

                {/* Barra de salvar: gruda no rodapé enquanto houver o que salvar */}
                <div
                  className={cn(
                    "flex flex-col gap-3 rounded-2xl border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
                    // Só gruda no rodapé quando há o que salvar; "Tudo salvo" fica no fim do formulário.
                    alterado
                      ? "sticky bottom-4 z-20 border-primary/30 bg-card/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/85"
                      : "shadow-[0_1px_2px_rgb(0_0_0/0.04)]",
                  )}
                >
                  <p className="flex items-center gap-2 text-sm">
                    {alterado ? (
                      <>
                        <span className="size-2 rounded-full bg-amber-500" />
                        <span className="font-medium text-foreground">Alterações não salvas</span>
                      </>
                    ) : (
                      <>
                        <Check className="size-4 text-primary" />
                        <span className="text-muted-foreground">Tudo salvo</span>
                      </>
                    )}
                  </p>
                  <div className="flex gap-2">
                    {alterado && (
                      <Button type="button" variant="ghost" onClick={descartar} disabled={upsert.isPending}>
                        Descartar
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={handleSave}
                      disabled={!alterado || upsert.isPending}
                      className="flex-1 sm:flex-none"
                    >
                      {upsert.isPending ? "Salvando..." : "Salvar perfil"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ---- Prévia: exatamente o cartão que o paciente vê ---- */}
          <aside className="space-y-4 lg:sticky lg:top-20" aria-label="Prévia do perfil">
            {!carregando && (
              <div className="hidden lg:block">
                <Progresso pct={pct} feitos={feitos} total={itens.length} itens={itens} onIr={irPara} />
              </div>
            )}
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Eye className="size-4" />
              Como o paciente vê
            </p>
            {carregando ? (
              <Skeleton className="h-96 w-full rounded-2xl" />
            ) : (
              <CartaoPsicologa
                dados={dadosCartao}
                previa
                acoes={<AcoesDoPaciente />}
              />
            )}
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Secao({
  id,
  icone: Icone,
  titulo,
  descricao,
  selo,
  children,
}: {
  id?: string;
  icone: ComponentType<{ className?: string }>;
  titulo: string;
  descricao: string;
  selo?: ReactNode;
  children: ReactNode;
}) {
  const tituloId = useId();
  return (
    <section
      id={id}
      aria-labelledby={tituloId}
      className="rounded-2xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04)]"
    >
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icone className="size-[18px]" />
          </span>
          <div>
            <h2 id={tituloId} className="font-semibold leading-tight text-foreground">
              {titulo}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{descricao}</p>
          </div>
        </div>
        {selo}
      </div>
      <div className="space-y-5 px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

function Progresso({
  pct,
  feitos,
  total,
  itens,
  onIr,
}: {
  pct: number;
  feitos: number;
  total: number;
  itens?: Array<{ id: string; rotulo: string; ok: boolean }>;
  onIr?: (id: string) => void;
}) {
  const completo = feitos === total;
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">
          {completo ? "Perfil completo" : "Perfil"} <span className="text-muted-foreground">· {feitos} de {total}</span>
        </p>
        <span className="text-sm font-semibold tabular-nums text-primary">{pct}%</span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Perfil preenchido"
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      {itens && !completo && (
        <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {itens.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onIr?.(item.id)}
                disabled={item.ok}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md py-0.5 text-left text-xs transition-colors",
                  item.ok ? "text-muted-foreground" : "text-foreground hover:text-primary",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border",
                    item.ok ? "border-primary bg-primary text-primary-foreground" : "border-dashed border-muted-foreground/50",
                  )}
                >
                  {item.ok && <Check className="size-2.5" />}
                </span>
                <span className={cn(item.ok && "line-through decoration-muted-foreground/40")}>{item.rotulo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
