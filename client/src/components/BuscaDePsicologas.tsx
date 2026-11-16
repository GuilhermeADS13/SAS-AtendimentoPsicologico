import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  MAX_OQUE_PROCURA,
  ROTULO_DO_STATUS,
  UFS,
  ehUf,
  type Modalidade,
  type StatusDoPedido,
} from "@shared/conhecer";
import { trpc } from "@/lib/trpc";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogoLockup } from "@/components/Logo";

export const FORMATO_DIA_E_HORA = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** "sábado, 14 de novembro" → "Sábado, 14 de novembro" (o `capitalize` do CSS pega toda palavra). */
export function primeiraMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Cabeçalho das páginas da busca: quem não entrou vê "Entrar" e "Criar conta". */
export function CabecalhoDaBusca() {
  const { user, isTherapist, loading } = useRole();
  return (
    <header className="border-b bg-card/60">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" aria-label="Página inicial">
          <LogoLockup />
        </Link>
        {!loading && (
          <div className="flex items-center gap-1 sm:gap-2">
            {user ? (
              <Button size="sm" variant="outline" asChild>
                <Link href={isTherapist ? "/dashboard" : "/consultas"}>Minha área</Link>
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" asChild>
                  <Link href="/login">Entrar</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/login?criar=paciente">Criar conta</Link>
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

/** Para o paciente, "ambos" é "tanto faz". */
const PREFERENCIA: Record<Modalidade, string> = { online: "Online", presencial: "Presencial", ambos: "Tanto faz" };

/**
 * Perfil do paciente na busca: o mínimo para pedir uma primeira conversa. O "o que
 * procura" só é lido pela psicóloga para quem ele pedir horário.
 */
export function FormularioDoPaciente({ aoSalvar }: { aoSalvar?: () => void }) {
  const { data } = trpc.conhecer.minhaSituacao.useQuery();
  // Monta só com os dados na mão: o Select do Radix não atualiza o rótulo quando o valor
  // muda por código com o campo fechado (a preferência salva aparecia em branco).
  if (!data) return null;
  return <CamposDoPaciente perfil={data.perfil} aoSalvar={aoSalvar} />;
}

type PerfilSalvo = {
  cidade: string | null;
  uf: string | null;
  nascimento: string | null;
  modalidade: Modalidade | null;
  oQueProcura: string | null;
  noMural: boolean;
} | null;

function CamposDoPaciente({ perfil, aoSalvar }: { perfil: PerfilSalvo; aoSalvar?: () => void }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState(() => ({
    cidade: perfil?.cidade ?? "",
    uf: perfil?.uf ?? "",
    nascimento: perfil?.nascimento ?? "",
    modalidade: perfil?.modalidade ?? ("ambos" as Modalidade),
    oQueProcura: perfil?.oQueProcura ?? "",
    noMural: perfil?.noMural ?? false,
  }));

  const salvar = trpc.conhecer.salvarMeuPerfil.useMutation({
    onSuccess: () => {
      void utils.conhecer.minhaSituacao.invalidate();
      toast.success("Perfil salvo.");
      aoSalvar?.();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (form.cidade.trim().length < 2 || !ehUf(form.uf) || !form.nascimento) {
          toast.error("Preencha a cidade, o estado e a data de nascimento.");
          return;
        }
        salvar.mutate({
          cidade: form.cidade.trim(),
          uf: form.uf,
          nascimento: form.nascimento,
          modalidade: form.modalidade,
          oQueProcura: form.oQueProcura.trim() || null,
          noMural: form.noMural,
        });
      }}
    >
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="paciente-cidade">Cidade</Label>
          <Input
            id="paciente-cidade"
            value={form.cidade}
            maxLength={80}
            autoComplete="address-level2"
            onChange={(e) => setForm({ ...form, cidade: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="paciente-uf">Estado</Label>
          <Select value={form.uf} onValueChange={(uf) => setForm({ ...form, uf })}>
            <SelectTrigger id="paciente-uf">
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="paciente-nascimento">Data de nascimento</Label>
          <Input
            id="paciente-nascimento"
            type="date"
            value={form.nascimento}
            max={new Date().toISOString().slice(0, 10)}
            autoComplete="bday"
            onChange={(e) => setForm({ ...form, nascimento: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="paciente-modalidade">Atendimento depois</Label>
          <Select value={form.modalidade} onValueChange={(m) => setForm({ ...form, modalidade: m as Modalidade })}>
            <SelectTrigger id="paciente-modalidade">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PREFERENCIA) as Modalidade[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {PREFERENCIA[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="paciente-procura">O que te traz? (opcional)</Label>
        <Textarea
          id="paciente-procura"
          value={form.oQueProcura}
          maxLength={MAX_OQUE_PROCURA}
          rows={3}
          onChange={(e) => setForm({ ...form, oQueProcura: e.target.value })}
          placeholder="Ex.: o trabalho tem me tirado o sono e quero entender o que está acontecendo."
        />
        <p className="flex justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {form.noMural
              ? "Com o mural ligado, as psicólogas do VozInterior leem isto. Conte apenas o que quiser."
              : "Só a psicóloga para quem você pedir horário lê isto. Conte apenas o que quiser."}
          </span>
          <span className="tabular-nums">
            {form.oQueProcura.length}/{MAX_OQUE_PROCURA}
          </span>
        </p>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-secondary/40 px-4 py-3 text-sm">
        <input
          type="checkbox"
          checked={form.noMural}
          onChange={(e) => setForm({ ...form, noMural: e.target.checked })}
          className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
        />
        <span>
          <span className="font-medium text-foreground">Aparecer para psicólogas</span>
          <span className="block text-muted-foreground">
            As psicólogas veem seu primeiro nome, idade, cidade e o que te traz, e podem te convidar para uma primeira conversa.
            Seu sobrenome, e-mail e telefone não aparecem. Dá para desligar quando quiser.
          </span>
        </span>
      </label>
      <Button type="submit" disabled={salvar.isPending}>
        {salvar.isPending ? "Salvando..." : "Salvar perfil"}
      </Button>
    </form>
  );
}

const COR_DO_STATUS: Record<StatusDoPedido, string> = {
  pendente: "bg-amber-100 text-amber-900",
  aceito: "bg-primary/10 text-primary",
  recusado: "bg-muted text-muted-foreground",
  cancelado: "bg-muted text-muted-foreground",
  expirado: "bg-muted text-muted-foreground",
};

/** Os pedidos do paciente: o que espera resposta pode ser cancelado. */
export function MeusPedidos() {
  const utils = trpc.useUtils();
  const { data } = trpc.conhecer.minhaSituacao.useQuery();
  const cancelar = trpc.conhecer.cancelarMeuPedido.useMutation({
    onSuccess: () => {
      void utils.conhecer.minhaSituacao.invalidate();
      void utils.conhecer.perfil.invalidate();
      toast.success("Pedido cancelado. O horário ficou livre de novo.");
    },
    onError: (e) => toast.error(e.message),
  });
  const pedidos = data?.pedidos ?? [];
  if (!pedidos.length) return null;

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {pedidos.slice(0, 5).map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <div className="min-w-0">
            <Link href={`/psicologas/${p.therapistId}`} className="font-medium text-foreground hover:underline">
              {p.nome || "Psicóloga"}
            </Link>
            <p className="text-muted-foreground">
              {primeiraMaiuscula(FORMATO_DIA_E_HORA.format(new Date(p.inicio)))} · {p.duracao} min
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", COR_DO_STATUS[p.status])}>
              {ROTULO_DO_STATUS[p.status]}
            </span>
            {p.status === "aceito" && (
              <Button size="sm" variant="ghost" asChild>
                <Link href="/consultas">Ver em Consultas</Link>
              </Button>
            )}
            {p.status === "pendente" && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                disabled={cancelar.isPending}
                onClick={() => cancelar.mutate({ id: p.id })}
              >
                Cancelar
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
