import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { lembretesEnviados, marcarLembreteEnviado } from "@/lib/lembretesEnviados";
import { formatarHora } from "@shared/datas";
import { consultasDoDia, hojeEmBrasilia, somarDias } from "@shared/lembretesDoDia";

type Consulta = { id: number; patientId: number; scheduledAt: Date | string; status: string; confirmedAt: Date | string | null };

/**
 * Agenda: "Lembretes de amanhã". Junta as consultas do dia numa lista e manda o lembrete
 * de cada paciente pelo WhatsApp com um toque. Abre no aparelho dela, com a mensagem do
 * botão "Avisar no WhatsApp" da consulta; nada sai sozinho. As já enviadas ficam marcadas.
 */
export function LembretesDoDia<T extends Consulta>({
  consultas,
  nomeDoPaciente,
  linkDoLembrete,
}: {
  consultas: T[];
  nomeDoPaciente: (patientId: number) => string;
  linkDoLembrete: (consulta: T) => string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const [quando, setQuando] = useState<"hoje" | "amanha">("amanha");
  const [enviados, setEnviados] = useState<Set<number>>(() => lembretesEnviados());

  const hoje = hojeEmBrasilia();
  const doDia = consultasDoDia(consultas, quando === "hoje" ? hoje : somarDias(hoje, 1));
  // Só conta quem dá para avisar: paciente sem telefone não tem botão de enviar.
  const faltamAmanha = consultasDoDia(consultas, somarDias(hoje, 1)).filter((c) => !enviados.has(c.id) && linkDoLembrete(c)).length;

  const enviar = (c: T, href: string) => {
    window.open(href, "_blank", "noopener");
    marcarLembreteEnviado(c.id);
    setEnviados((atual) => new Set(atual).add(c.id));
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setEnviados(lembretesEnviados());
          setAberto(true);
        }}
        className="border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800 dark:border-green-800 dark:text-green-400"
      >
        <WhatsAppIcon className="mr-2 size-4" />
        Lembretes de amanhã
        {faltamAmanha > 0 && (
          <span className="ml-2 rounded-full bg-green-600 px-2 py-0.5 text-xs font-semibold text-white tabular-nums">{faltamAmanha}</span>
        )}
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Lembretes pelo WhatsApp</DialogTitle>
            <DialogDescription>
              Toque em “Enviar” em cada paciente: o WhatsApp abre com a mensagem pronta e o link da sala, você confere e envia.
              Depois, volte aqui para o próximo.
            </DialogDescription>
          </DialogHeader>

          <div className="inline-flex w-fit rounded-xl border border-border bg-card p-1" role="group" aria-label="Dia">
            {(
              [
                { valor: "hoje", rotulo: "Hoje" },
                { valor: "amanha", rotulo: "Amanhã" },
              ] as const
            ).map((o) => (
              <button
                key={o.valor}
                type="button"
                onClick={() => setQuando(o.valor)}
                aria-pressed={quando === o.valor}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                  quando === o.valor ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.rotulo}
              </button>
            ))}
          </div>

          {doDia.length === 0 ? (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">
              Nenhuma consulta marcada para {quando === "hoje" ? "hoje" : "amanhã"}.
            </p>
          ) : (
            <ul className="space-y-2">
              {doDia.map((c) => {
                const href = linkDoLembrete(c);
                const foi = enviados.has(c.id);
                return (
                  <li key={c.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <span className="w-12 shrink-0 font-semibold tabular-nums text-foreground">{formatarHora(c.scheduledAt)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{nomeDoPaciente(c.patientId)}</p>
                      {c.confirmedAt && <p className="text-xs text-primary">Presença confirmada</p>}
                    </div>
                    {!href ? (
                      <span className="shrink-0 text-xs text-muted-foreground">Sem telefone</span>
                    ) : foi ? (
                      <Button variant="ghost" size="sm" className="h-9 shrink-0 text-primary" onClick={() => enviar(c, href)} title="Enviar de novo">
                        <CheckCircle2 className="mr-1.5 size-4" />
                        Enviado
                      </Button>
                    ) : (
                      <Button size="sm" className="h-9 shrink-0 bg-green-600 text-white hover:bg-green-700" onClick={() => enviar(c, href)}>
                        <WhatsAppIcon className="mr-1.5 size-4" />
                        Enviar
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">
            “Enviado” fica marcado neste aparelho por 3 dias. O lembrete por e-mail da véspera continua saindo sozinho para quem
            não desligou esse aviso.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
