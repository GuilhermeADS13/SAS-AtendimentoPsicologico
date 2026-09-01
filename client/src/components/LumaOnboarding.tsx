import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LumaOwlIcon } from "./Logo";
import { Calendar, Video, Wallet, Users, Stethoscope, CircleHelp, type LucideIcon } from "lucide-react";

/**
 * Tour de boas-vindas da Luma na PRIMEIRA vez que a pessoa entra (paciente ou
 * psicóloga). Passo a passo curto apresentando cada área do sistema. Depois disso
 * não reaparece — "já viu" fica no localStorage por conta/dispositivo. Dúvidas
 * seguintes vão para a Luma normalmente.
 *
 * Para rever depois, qualquer tela pode disparar `window.dispatchEvent(new
 * Event(OPEN_ONBOARDING_EVENT))` (ex.: um botão na Ajuda).
 */

export const OPEN_ONBOARDING_EVENT = "luma:onboarding";
const LS_PREFIX = "luma-onboarding-v1:";

type Role = "therapist" | "patient";
type Step = { icon: LucideIcon | null; title: string; body: string };

const therapistSteps: Step[] = [
  { icon: null, title: "Oi, eu sou a Luma 🦉", body: "Vou te apresentar o VozInterior em alguns passos rápidos. Pode pular quando quiser." },
  { icon: Users, title: "Pacientes", body: "Aqui você cadastra e vê seus pacientes. Use o botão “Novo Paciente” para adicionar alguém." },
  { icon: Calendar, title: "Agendamentos", body: "Sua agenda: marque, remarque e cancele consultas, e acompanhe o status e o valor de cada uma." },
  { icon: Video, title: "Videochamada", body: "A sala de vídeo abre a partir de um agendamento — no horário, é só entrar. O prontuário fica ao lado durante a sessão." },
  { icon: Wallet, title: "Financeiro", body: "Um resumo dos pagamentos: quem está pago e quem está pendente." },
  { icon: null, title: "Conte comigo", body: "Fale comigo em linguagem natural (ex.: “marque a Ana quinta às 14h”) ou tire dúvidas de como usar o sistema. A página “Ajuda” também traz o passo a passo." },
];

const patientSteps: Step[] = [
  { icon: null, title: "Oi, eu sou a Luma 🦉", body: "Vou te mostrar o VozInterior rapidinho. Pode pular quando quiser." },
  { icon: Calendar, title: "Minhas Consultas", body: "Veja suas consultas agendadas e entre na sala pelo botão da consulta, no horário combinado." },
  { icon: Video, title: "Videochamada", body: "No horário, você entra pela sua lista de consultas. Dá para testar câmera e microfone antes de entrar." },
  { icon: Stethoscope, title: "Minha Psicóloga", body: "Aqui ficam os dados da sua psicóloga, para você ter à mão quando precisar." },
  { icon: null, title: "Conte comigo", body: "Ficou com dúvida de como usar o sistema? É só me perguntar. A página “Ajuda” também tem o passo a passo. Boas-vindas! 💜" },
];

export default function LumaOnboarding({ role, userId }: { role: Role; userId?: number | string }) {
  const key = userId != null ? `${LS_PREFIX}${userId}` : null;
  const steps = role === "therapist" ? therapistSteps : patientSteps;
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const jaViu = useCallback(() => {
    if (!key) return true;
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return true; // sem localStorage (modo privado): não insiste
    }
  }, [key]);

  const marcarVisto = useCallback(() => {
    if (!key) return;
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* modo privado — só não persiste */
    }
  }, [key]);

  // Primeira vez: abre sozinho.
  useEffect(() => {
    if (key && !jaViu()) {
      setIndex(0);
      setOpen(true);
    }
  }, [key, jaViu]);

  // Rever depois: qualquer tela dispara o evento (ex.: botão na Ajuda).
  useEffect(() => {
    const abrir = () => {
      setIndex(0);
      setOpen(true);
    };
    window.addEventListener(OPEN_ONBOARDING_EVENT, abrir);
    return () => window.removeEventListener(OPEN_ONBOARDING_EVENT, abrir);
  }, []);

  const fechar = () => {
    marcarVisto();
    setOpen(false);
  };
  const proximo = () => {
    if (index < steps.length - 1) setIndex(i => i + 1);
    else fechar();
  };
  const anterior = () => setIndex(i => Math.max(0, i - 1));

  const step = steps[index];
  const Icone = step.icon;
  const ultimo = index === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) fechar(); }}>
      <DialogContent className="max-w-md">
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {Icone ? <Icone className="h-7 w-7" /> : <LumaOwlIcon className="h-8 w-8" />}
          </div>
          <div className="space-y-2">
            <DialogTitle className="text-xl font-semibold text-foreground">{step.title}</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
              {step.body}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-1.5 pt-1" aria-hidden="true">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
              />
            ))}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={fechar}>
            {ultimo ? "Fechar" : "Pular"}
          </Button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <Button variant="outline" size="sm" onClick={anterior}>
                Anterior
              </Button>
            )}
            <Button size="sm" onClick={proximo}>
              {ultimo ? "Concluir" : "Próximo"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
