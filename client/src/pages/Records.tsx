import { useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  CalendarClock,
  CalendarPlus,
  Check,
  CircleAlert,
  FileText,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import NoteTemplatesManager from "@/components/NoteTemplatesManager";
import { useAgora } from "@/hooks/useAgora";
import { iniciais } from "@/lib/iniciais";
import { cn } from "@/lib/utils";
import { FUSO_BR, formatarData, formatarHora } from "@shared/datas";

const emptyForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  medicalHistory: "",
};

type Filtro = "todos" | "active" | "pending" | "inactive";
type Ordem = "nome" | "proxima" | "recentes";

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** "(81) 99999-0000" enquanto digita. Aceita fixo (10 dígitos) e celular (11). */
function mascaraTelefone(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** "há 3 semanas", "em 2 dias" — para a última/próxima consulta. */
const relativo = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
function tempoRelativo(d: Date, agora: number): string {
  const dias = Math.round((d.getTime() - agora) / 86_400_000);
  if (Math.abs(dias) < 7) return relativo.format(dias, "day");
  if (Math.abs(dias) < 45) return relativo.format(Math.round(dias / 7), "week");
  if (Math.abs(dias) < 365) return relativo.format(Math.round(dias / 30), "month");
  return relativo.format(Math.round(dias / 365), "year");
}

/** "Seg, 06/10 · 14:00" no fuso de Brasília. */
function diaEHora(d: Date): string {
  const semana = d.toLocaleDateString("pt-BR", { timeZone: FUSO_BR, weekday: "short" }).replace(".", "");
  const dia = d.toLocaleDateString("pt-BR", { timeZone: FUSO_BR, day: "2-digit", month: "2-digit" });
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${dia} · ${formatarHora(d)}`;
}

/** Link do WhatsApp com o número do paciente (sem mensagem pronta). */
function linkWhatsApp(telefone: string | null | undefined): string | null {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return null;
  return `https://wa.me/${digitos.startsWith("55") ? digitos : `55${digitos}`}`;
}

const STATUS: Record<string, { rotulo: string; classe: string }> = {
  active: { rotulo: "Ativo", classe: "bg-primary/10 text-primary" },
  pending: { rotulo: "Aguardando cadastro", classe: "bg-amber-100 text-amber-800" },
  inactive: { rotulo: "Inativo", classe: "bg-muted text-muted-foreground" },
};

export default function Records() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: patients = [], isLoading } = trpc.patients.list.useQuery();
  // Para "última" e "próxima consulta" de cada paciente. É a mesma consulta do
  // Dashboard e da Agenda, então quase sempre já vem do cache.
  const { data: consultas = [] } = trpc.appointments.list.useQuery();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [ordem, setOrdem] = useState<Ordem>("nome");
  // "Novo paciente" no Dashboard chega com ?novo=1: abre o cadastro direto.
  const [isOpen, setIsOpen] = useState(() => abrirPeloLink());
  const [modelosOpen, setModelosOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [tentouEnviar, setTentouEnviar] = useState(false);
  // Avanca sozinho: sem isto, "ha 3 semanas" e a classificacao ultima/proxima
  // congelam no momento em que a aba abriu. O Dashboard ja fazia assim.
  const relogio = useAgora();

  const createPatient = trpc.patients.create.useMutation({
    onSuccess: () => {
      utils.patients.list.invalidate();
      setFormData(emptyForm);
      setTentouEnviar(false);
      setIsOpen(false);
      toast.success("Paciente cadastrado. Quando ele criar a conta com esse e-mail, o acesso é liberado.");
    },
    onError: (e) => toast.error(e.message || "Erro ao cadastrar paciente"),
  });

  // Paciente a excluir (o AlertDialog abre com ele).
  const [toDelete, setToDelete] = useState<{ id: number; nome: string } | null>(null);

  const deletePatient = trpc.patients.delete.useMutation({
    onSuccess: (r) => {
      utils.patients.list.invalidate();
      setToDelete(null);
      toast.success(
        r.action === "deleted"
          ? "Paciente excluído."
          : `Paciente arquivado — o prontuário foi mantido (${r.sessoes} sessão(ões), ${r.consultas} consulta(s)).`,
      );
    },
    onError: (e) => toast.error(e.message || "Erro ao excluir paciente"),
  });

  // Arquivado sai da grade, mas o prontuário continua no banco.
  const naGrade = useMemo(() => patients.filter((p) => p.status !== "archived"), [patients]);

  const linhas = useMemo(() => {
    const agora = relogio.getTime();
    const porPaciente = new Map<number, { ultima?: Date; proxima?: Date }>();
    for (const c of consultas) {
      if (c.status === "cancelled") continue;
      const inicio = new Date(c.scheduledAt);
      const atual = porPaciente.get(c.patientId) ?? {};
      // Última: a mais recente que já passou e não foi falta. Não exige "realizada"
      // marcada: quem esquece de marcar ainda quer ver quando foi a última.
      if (inicio.getTime() < agora && c.status !== "no_show") {
        if (!atual.ultima || inicio > atual.ultima) atual.ultima = inicio;
      } else if (inicio.getTime() >= agora && c.status === "scheduled") {
        if (!atual.proxima || inicio < atual.proxima) atual.proxima = inicio;
      }
      porPaciente.set(c.patientId, atual);
    }
    return naGrade.map((p) => ({
      ...p,
      nome: `${p.firstName} ${p.lastName}`.trim(),
      ...porPaciente.get(p.id),
      // `pendencias` vem pronto do servidor (CFP 001/2009): a tela precisa saber o
      // que falta, e o conteúdo do prontuário não precisa trafegar para isso.
    }));
  }, [naGrade, consultas, relogio]);

  const contagem = useMemo(
    () => ({
      todos: linhas.length,
      active: linhas.filter((p) => p.status === "active").length,
      pending: linhas.filter((p) => p.status === "pending").length,
      inactive: linhas.filter((p) => p.status === "inactive").length,
    }),
    [linhas],
  );

  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const termoDigitos = termo.replace(/\D/g, "");
  const visiveis = linhas
    .filter((p) => filtro === "todos" || p.status === filtro)
    .filter((p) => {
      if (!termo) return true;
      if (`${p.nome} ${p.email}`.toLocaleLowerCase("pt-BR").includes(termo)) return true;
      // Busca por telefone com ou sem máscara.
      return termoDigitos.length >= 3 && (p.phone ?? "").replace(/\D/g, "").includes(termoDigitos);
    })
    .sort((a, b) => {
      if (ordem === "recentes") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (ordem === "proxima") {
        // Quem tem consulta marcada vem antes, da mais próxima para a mais distante.
        const ta = a.proxima?.getTime() ?? Infinity;
        const tb = b.proxima?.getTime() ?? Infinity;
        if (ta !== tb) return ta - tb;
      }
      return a.nome.localeCompare(b.nome, "pt-BR");
    });

  const agora = relogio.getTime();

  // Validação do cadastro: mostra o erro do campo só depois da 1ª tentativa.
  const erros = {
    firstName: !formData.firstName.trim() ? "Informe o nome." : "",
    lastName: !formData.lastName.trim() ? "Informe o sobrenome." : "",
    email: !formData.email.trim()
      ? "Informe o e-mail."
      : !EMAIL_VALIDO.test(formData.email.trim())
        ? "E-mail inválido."
        : "",
    phone:
      formData.phone && formData.phone.replace(/\D/g, "").length < 10 ? "Telefone incompleto (DDD + número)." : "",
  };
  const formularioValido = !Object.values(erros).some(Boolean);

  const handleAddPatient = () => {
    setTentouEnviar(true);
    if (!formularioValido) return;
    createPatient.mutate({
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      email: formData.email.trim(),
      phone: formData.phone || undefined,
      medicalHistory: formData.medicalHistory || undefined,
    });
  };

  const abrir = (id: number) => setLocation(`/records/${id}`);

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-6xl space-y-6 pb-8 sm:pt-2">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Pacientes e prontuários
            </h1>
            <p className="text-muted-foreground">
              {isLoading
                ? "Carregando seus pacientes…"
                : contagem.todos === 0
                  ? "Cadastre seus pacientes para abrir o prontuário de cada um."
                  : `${contagem.todos} ${contagem.todos === 1 ? "paciente" : "pacientes"} na sua grade · ${contagem.active} em atendimento`}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            {/* Modelos de prontuário/anotação: vivem AQUI (Prontuários), não em
                Configurações da conta (que é só acesso: e-mail, senha, telefone). */}
            <Dialog open={modelosOpen} onOpenChange={setModelosOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="bg-card" data-tour="modelos-prontuario">
                  <FileText className="size-4" />
                  <span className="truncate">Meus modelos</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] sm:max-w-2xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Modelos de prontuário e anotação</DialogTitle>
                  <DialogDescription>
                    O seu modelo de prontuário (PDF ou DOCX) e os modelos de anotação usados nas sessões. A Luma segue
                    esse formato ao organizar suas anotações.
                  </DialogDescription>
                </DialogHeader>
                <NoteTemplatesManager />
              </DialogContent>
            </Dialog>

            <Dialog
              open={isOpen}
              onOpenChange={(aberto) => {
                setIsOpen(aberto);
                if (!aberto) setTentouEnviar(false);
              }}
            >
              <DialogTrigger asChild>
                <Button data-tour="novo-paciente">
                  <UserPlus className="size-4" />
                  Novo paciente
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Novo paciente</DialogTitle>
                  <DialogDescription>
                    O paciente fica como “aguardando cadastro” até criar a conta com este mesmo e-mail.
                  </DialogDescription>
                </DialogHeader>
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddPatient();
                  }}
                  noValidate
                >
                  <div className="grid grid-cols-2 gap-3">
                    <Campo id="firstName" rotulo="Nome" obrigatorio erro={tentouEnviar ? erros.firstName : ""}>
                      <Input
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        autoComplete="off"
                        autoFocus
                      />
                    </Campo>
                    <Campo id="lastName" rotulo="Sobrenome" obrigatorio erro={tentouEnviar ? erros.lastName : ""}>
                      <Input
                        id="lastName"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        autoComplete="off"
                      />
                    </Campo>
                  </div>
                  <Campo
                    id="email"
                    rotulo="E-mail"
                    obrigatorio
                    erro={tentouEnviar ? erros.email : ""}
                    dica="É com ele que o paciente cria a conta e recebe os lembretes."
                  >
                    <Input
                      id="email"
                      type="email"
                      inputMode="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="nome@exemplo.com"
                      autoComplete="off"
                    />
                  </Campo>
                  <Campo
                    id="phone"
                    rotulo="Telefone (WhatsApp)"
                    erro={tentouEnviar ? erros.phone : ""}
                    dica="Opcional. Usado nos avisos por WhatsApp."
                  >
                    <Input
                      id="phone"
                      inputMode="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: mascaraTelefone(e.target.value) })}
                      placeholder="(81) 99999-9999"
                      autoComplete="off"
                    />
                  </Campo>
                  <Campo id="medicalHistory" rotulo="Histórico de saúde" dica="Opcional. Dá para completar depois no prontuário.">
                    <Textarea
                      id="medicalHistory"
                      value={formData.medicalHistory}
                      onChange={(e) => setFormData({ ...formData, medicalHistory: e.target.value })}
                      placeholder="Medicações, diagnósticos prévios, acompanhamentos anteriores…"
                      rows={3}
                    />
                  </Campo>
                  <div className="flex gap-2 pt-1">
                    <Button type="button" variant="ghost" className="flex-1" onClick={() => setIsOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" className="flex-1" disabled={createPatient.isPending}>
                      {createPatient.isPending ? "Cadastrando…" : "Cadastrar paciente"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        {/* Busca, filtros e ordem */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, e-mail ou telefone"
              aria-label="Buscar paciente"
              className="bg-card pl-9 pr-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca("")}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
            <div role="tablist" aria-label="Filtrar por situação" className="flex w-full gap-1 rounded-xl border bg-card p-1 sm:w-auto">
              {(
                [
                  ["todos", "Todos"],
                  ["active", "Ativos"],
                  ["pending", "Aguardando"],
                  ...(contagem.inactive > 0 ? [["inactive", "Inativos"] as const] : []),
                ] as Array<readonly [Filtro, string]>
              ).map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  role="tab"
                  aria-selected={filtro === valor}
                  onClick={() => setFiltro(valor)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors sm:flex-none sm:px-3",
                    filtro === valor ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {rotulo}
                  <span
                    className={cn(
                      "hidden rounded-full px-1.5 text-xs tabular-nums min-[420px]:inline",
                      filtro === valor ? "bg-white/20" : "bg-muted",
                    )}
                  >
                    {contagem[valor]}
                  </span>
                </button>
              ))}
            </div>

            <Select value={ordem} onValueChange={(v) => setOrdem(v as Ordem)}>
              <SelectTrigger className="w-full bg-card sm:w-48" aria-label="Ordenar">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nome">Nome (A–Z)</SelectItem>
                <SelectItem value="proxima">Próxima consulta</SelectItem>
                <SelectItem value="recentes">Cadastro mais recente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Lista */}
        <section aria-label="Pacientes" className="overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
          {/* Cabeçalho das colunas (só no computador) */}
          <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_auto] gap-4 border-b bg-muted/40 px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid">
            <span>Paciente</span>
            <span>Última consulta</span>
            <span>Próxima consulta</span>
            <span>Prontuário</span>
            <span className="w-[168px]" aria-hidden />
          </div>

          {isLoading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : linhas.length === 0 ? (
            <Vazio
              titulo="Nenhum paciente ainda"
              texto="Cadastre o primeiro paciente: ele recebe o acesso quando criar a conta com o mesmo e-mail."
              acao={
                <Button onClick={() => setIsOpen(true)}>
                  <UserPlus className="size-4" />
                  Cadastrar paciente
                </Button>
              }
            />
          ) : visiveis.length === 0 ? (
            <Vazio
              titulo="Ninguém encontrado"
              texto={busca ? `Nenhum paciente corresponde a “${busca}” neste filtro.` : "Nenhum paciente neste filtro."}
              acao={
                <Button
                  variant="outline"
                  onClick={() => {
                    setBusca("");
                    setFiltro("todos");
                  }}
                >
                  Limpar filtros
                </Button>
              }
            />
          ) : (
            <ul className="divide-y">
              {visiveis.map((p) => {
                const status = STATUS[p.status] ?? STATUS.inactive;
                const whatsapp = linkWhatsApp(p.phone);
                return (
                  <li
                    key={p.id}
                    className="group grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-muted/40 sm:px-5 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_auto]"
                    onClick={() => abrir(p.id)}
                  >
                    {/* Paciente */}
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
                      >
                        {iniciais(p.nome) || "?"}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              abrir(p.id);
                            }}
                            className="truncate text-left font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline"
                          >
                            {p.nome}
                          </button>
                          {/* "Ativo" é o normal: o selo só aparece quando foge disso. */}
                          {p.status !== "active" && (
                            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", status.classe)}>
                              {status.rotulo}
                            </span>
                          )}
                        </div>
                        {/* E-mail e telefone eram um texto só, separados por "·":
                            ficavam colados e o truncate cortava o telefone junto.
                            Agora o corte é só no e-mail e o número fica inteiro. */}
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span className="truncate">{p.email}</span>
                          {p.phone && (
                            <>
                              <span aria-hidden className="text-muted-foreground/40">·</span>
                              <span className="whitespace-nowrap tabular-nums">{p.phone}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Ações (no celular ficam à direita do nome) */}
                    <div
                      className="flex items-center justify-end gap-1 lg:order-last lg:w-[168px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="hidden text-primary hover:bg-primary/10 hover:text-primary sm:inline-flex"
                        onClick={() => abrir(p.id)}
                      >
                        <FolderOpen className="size-4" />
                        Abrir
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-9 sm:size-8" aria-label={`Mais ações para ${p.nome}`}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => abrir(p.id)}>
                            <FolderOpen className="size-4" />
                            Abrir prontuário
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setLocation(`/appointments?novo=1&paciente=${p.id}`)}>
                            <CalendarPlus className="size-4" />
                            Agendar consulta
                          </DropdownMenuItem>
                          {whatsapp && (
                            <DropdownMenuItem asChild>
                              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                                <WhatsAppIcon className="size-4" />
                                Conversar no WhatsApp
                              </a>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setToDelete({ id: p.id, nome: p.nome })}
                          >
                            <Trash2 className="size-4" />
                            Excluir ou arquivar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Última consulta */}
                    <Info rotulo="Última" className="col-span-2 pl-[52px] lg:col-span-1 lg:pl-0">
                      {p.ultima ? (
                        <span className="flex flex-wrap items-baseline gap-x-1.5 lg:flex-col lg:gap-0">
                          <span className="text-foreground">{formatarData(p.ultima)}</span>
                          <span className="text-xs text-muted-foreground">{tempoRelativo(p.ultima, agora)}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Nenhuma ainda</span>
                      )}
                    </Info>

                    {/* Próxima consulta */}
                    <Info
                      rotulo="Próxima"
                      className="col-span-2 pl-[52px] lg:col-span-1 lg:pl-0"
                      ocultarNoCelular={!p.proxima && p.status === "inactive"}
                    >
                      {p.proxima ? (
                        <span className="inline-flex items-center gap-1.5 text-foreground">
                          <CalendarClock className="size-3.5 text-primary" />
                          {diaEHora(p.proxima)}
                        </span>
                      ) : p.status === "inactive" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/appointments?novo=1&paciente=${p.id}`);
                          }}
                          // -my-2/py-2: cresce a area de toque no celular sem empurrar a linha.
                          className="-my-2 inline-flex min-h-9 items-center gap-1 py-2 text-muted-foreground hover:text-primary lg:my-0 lg:min-h-0 lg:py-0"
                        >
                          <Plus className="size-3.5" />
                          Agendar
                        </button>
                      )}
                    </Info>

                    {/* Prontuário (CFP 001/2009) */}
                    <Info
                      rotulo="Prontuário"
                      className="col-span-2 pl-[52px] lg:col-span-1 lg:pl-0"
                      ocultarNoCelular={p.status !== "active"}
                    >
                      {p.status !== "active" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : p.pendencias.length === 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-primary">
                          <Check className="size-3.5" />
                          Completo
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 text-amber-800"
                          title={`Falta: ${p.pendencias.join(", ")}`}
                        >
                          <CircleAlert className="size-3.5" />
                          {p.pendencias.length === 1 ? "Falta 1 item" : `Faltam ${p.pendencias.length} itens`}
                        </span>
                      )}
                    </Info>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {!isLoading && linhas.some((p) => p.pendencias.length > 0) && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            “Prontuário” segue a Resolução CFP 001/2009: demanda inicial, objetivos terapêuticos, TCLE e anamnese.
            Para completar, abra o prontuário do paciente (no computador, o aviso mostra o que falta ao passar o mouse).
          </p>
        )}
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {toDelete?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              O paciente sai da sua grade. Se ele já tiver consulta, sessão ou
              documento registrado, o prontuário é <strong>arquivado</strong> em vez
              de apagado — a guarda do prontuário é obrigatória por 5 anos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) deletePatient.mutate({ id: toDelete.id });
              }}
              disabled={deletePatient.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deletePatient.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

function Campo({
  id,
  rotulo,
  obrigatorio = false,
  erro,
  dica,
  children,
}: {
  id: string;
  rotulo: string;
  obrigatorio?: boolean;
  erro?: string;
  dica?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {rotulo}
        {obrigatorio && <span className="text-destructive"> *</span>}
      </Label>
      <div className={cn(erro && "[&_input]:border-destructive [&_input]:ring-destructive/20")}>{children}</div>
      {erro ? (
        <p className="text-xs text-destructive" role="alert">
          {erro}
        </p>
      ) : dica ? (
        <p className="text-xs text-muted-foreground">{dica}</p>
      ) : null}
    </div>
  );
}

function Info({
  rotulo,
  className,
  ocultarNoCelular = false,
  children,
}: {
  rotulo: string;
  className?: string;
  /** Linha sem informação ("—"): no celular só ocupa espaço; na tabela mantém a coluna. */
  ocultarNoCelular?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0 items-center gap-1.5 text-sm", ocultarNoCelular ? "hidden lg:flex" : "flex", className)}>
      <span className="w-[68px] shrink-0 text-xs text-muted-foreground lg:hidden">{rotulo}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Vazio({ titulo, texto, acao }: { titulo: string; texto: string; acao: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <UserPlus className="size-6" />
      </span>
      <p className="mt-4 font-medium text-foreground">{titulo}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{texto}</p>
      <div className="mt-5">{acao}</div>
    </div>
  );
}

/** Lê e consome o ?novo=1 (sai da URL para um F5 não reabrir o formulário). */
function abrirPeloLink(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("novo") !== "1") return false;
  params.delete("novo");
  const resto = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${resto ? `?${resto}` : ""}`);
  return true;
}
