import type { ReactNode } from "react";
import { BadgeCheck, CalendarDays, GraduationCap, MessageSquare, UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { iniciais } from "@/lib/iniciais";
import { cn } from "@/lib/utils";

export type DadosCartaoPsicologa = {
  nome: string;
  crp: string;
  fotoUrl: string | null;
  especialidades: string[];
  publicos: string[];
  formacao: string;
  bio: string;
};

/** "Ansiedade, Luto" → ["Ansiedade", "Luto"] (o banco guarda texto separado por vírgula). */
export function listaDeTexto(texto: string | null | undefined): string[] {
  return (texto ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * O cartão de apresentação da psicóloga, como o PACIENTE vê em "Minha Psicóloga".
 *
 * É o MESMO componente na tela do paciente e na prévia do Perfil Profissional:
 * antes eram dois trechos de JSX parecidos, e a prévia podia mostrar uma coisa
 * enquanto o paciente via outra.
 *
 * `previa` mostra os espaços vazios com um texto de exemplo (para a psicóloga
 * saber onde cada campo aparece); na tela do paciente, seção vazia some.
 */
export function CartaoPsicologa({
  dados,
  acoes,
  previa = false,
  className,
}: {
  dados: DadosCartaoPsicologa;
  /** Botões do paciente (mensagem, consultas). Na prévia aparecem inertes. */
  acoes?: ReactNode;
  previa?: boolean;
  className?: string;
}) {
  const formacao = dados.formacao
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean);

  const mostrarAtende = dados.publicos.length > 0 || previa;
  const mostrarFormacao = formacao.length > 0 || previa;
  const mostrarSobre = dados.bio.trim().length > 0 || previa;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04)]",
        className,
      )}
    >
      {/* Faixa de capa com a cor da marca */}
      <div aria-hidden className="relative h-24 overflow-hidden bg-gradient-to-br from-primary to-[var(--brand-soft)] sm:h-28">
        <span className="absolute -right-10 -top-14 size-44 rounded-full bg-white/[0.08]" />
        <span className="absolute -bottom-20 right-24 size-36 rounded-full bg-white/[0.06]" />
        <span className="absolute -left-8 top-6 size-20 rounded-full bg-white/[0.05]" />
      </div>

      {/* Container query: na prévia (coluna estreita) os botões vão para baixo do
          nome; na tela do paciente (larga) ficam à direita da foto. */}
      <div className="@container px-5 pb-5 sm:px-6">
        <div className="grid gap-3 @xl:grid-cols-[1fr_auto]">
          <Avatar className="-mt-12 size-24 shrink-0 border-4 border-card shadow-sm @xl:col-start-1 @xl:row-start-1 @xl:-mt-14 @xl:size-28">
            {dados.fotoUrl ? <AvatarImage src={dados.fotoUrl} alt={dados.nome} className="object-cover" /> : null}
            <AvatarFallback className="bg-accent text-2xl font-semibold text-accent-foreground">
              {iniciais(dados.nome) || <UserRound className="size-8" />}
            </AvatarFallback>
          </Avatar>

          <div className="space-y-2 @xl:col-span-2 @xl:row-start-2">
            <h2 className="text-xl font-semibold tracking-tight text-foreground @xl:text-2xl">
              {dados.nome || "Sua psicóloga"}
            </h2>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <BadgeCheck className="size-3.5" />
              {dados.crp ? `CRP ${dados.crp}` : "CRP a informar"}
            </p>
          </div>

          {acoes ? (
            <div
              className={cn(
                "flex flex-wrap gap-2 @xl:col-start-2 @xl:row-start-1 @xl:self-end @xl:pb-1",
                previa && "pointer-events-none select-none",
              )}
              {...(previa ? { inert: true, "aria-hidden": true } : {})}
            >
              {acoes}
            </div>
          ) : null}
        </div>

        {dados.especialidades.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Especialidades">
            {dados.especialidades.map((esp) => (
              <li key={esp} className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
                {esp}
              </li>
            ))}
          </ul>
        ) : previa ? (
          <p className="mt-4 text-sm italic text-muted-foreground">Suas especialidades aparecem aqui.</p>
        ) : null}
      </div>

      {(mostrarAtende || mostrarFormacao || mostrarSobre) && (
        <div className="divide-y border-t">
          {mostrarAtende && (
            <Secao titulo="Atende">
              {dados.publicos.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {dados.publicos.map((p) => (
                    <li key={p} className="rounded-full border px-3 py-1 text-xs font-medium text-foreground">
                      {p}
                    </li>
                  ))}
                </ul>
              ) : (
                <Vazio>Marque quem você atende.</Vazio>
              )}
            </Secao>
          )}

          {mostrarFormacao && (
            <Secao titulo="Formação">
              {formacao.length > 0 ? (
                <ul className="space-y-2">
                  {formacao.map((linha, i) => (
                    <li key={`${i}-${linha}`} className="flex gap-2.5 text-sm text-muted-foreground">
                      <GraduationCap className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span className="leading-relaxed">{linha}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Vazio>Sua formação aparece aqui, um item por linha.</Vazio>
              )}
            </Secao>
          )}

          {mostrarSobre && (
            <Secao titulo="Sobre">
              {dados.bio.trim() ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{dados.bio}</p>
              ) : (
                <Vazio>Sua apresentação aparece aqui.</Vazio>
              )}
            </Secao>
          )}
        </div>
      )}
    </article>
  );
}

/** Os botões do paciente no cartão. Os mesmos na prévia do Perfil (lá, inertes). */
export function AcoesDoPaciente({
  onMensagem,
  onConsultas,
}: {
  onMensagem?: () => void;
  onConsultas?: () => void;
}) {
  return (
    <>
      <Button size="sm" onClick={onMensagem} tabIndex={onMensagem ? undefined : -1}>
        <MessageSquare className="size-4" />
        Enviar mensagem
      </Button>
      <Button size="sm" variant="outline" onClick={onConsultas} tabIndex={onConsultas ? undefined : -1}>
        <CalendarDays className="size-4" />
        Minhas consultas
      </Button>
    </>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="px-5 py-4 sm:px-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      {children}
    </section>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="text-sm italic text-muted-foreground/80">{children}</p>;
}
