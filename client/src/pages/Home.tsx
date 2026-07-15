import { useAuth } from "@/_core/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { LogoLockup, LogoMark, APP_NAME } from "@/components/Logo";
import {
  ArrowRight,
  Calendar,
  FileText,
  Users,
  Video,
  Lock,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

const FEATURES = [
  {
    icon: Video,
    title: "Videochamadas",
    description:
      "Consulta em tempo real no navegador, sem instalar nada. O prontuário fica ao lado, só para você.",
  },
  {
    icon: FileText,
    title: "Prontuários",
    description:
      "Histórico clínico, evolução por sessão e documentos anexados — organizados por paciente.",
  },
  {
    icon: Calendar,
    title: "Agendamentos",
    description:
      "Marque a consulta e o paciente recebe o link da sala. Ele confirma presença por e-mail.",
  },
  {
    icon: Users,
    title: "Gestão de Pacientes",
    description:
      "O paciente mantém os próprios dados de contato. Você vê sempre a versão atualizada.",
  },
  {
    icon: Lock,
    title: "Segurança",
    description:
      "Documentos em armazenamento privado, com link temporário. Só você acessa os prontuários.",
  },
  {
    icon: Clock,
    title: "Lembretes",
    description:
      "E-mail automático para o paciente antes da consulta e aviso para você a cada agendamento.",
  },
];

export default function Home() {
  const { isAuthenticated } = useAuth();
  const { isTherapist } = useRole();
  const [, setLocation] = useLocation();

  // Redireciona autenticados conforme o papel (efeito, nunca durante o render).
  useEffect(() => {
    if (isAuthenticated) setLocation(isTherapist ? "/dashboard" : "/consultas");
  }, [isAuthenticated, isTherapist, setLocation]);

  const verFuncionalidades = () => {
    document
      .getElementById("funcionalidades")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 bg-background/85 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <LogoLockup markClassName="w-8 h-8" />
          <Button onClick={() => setLocation("/login")} size="sm">
            Entrar
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Brilho suave atrás do título, no verde da marca. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 h-[420px] bg-[radial-gradient(ellipse_at_top,_var(--brand-sand)_0%,_transparent_65%)] opacity-40"
        />
        <div className="container relative mx-auto px-6 pt-20 pb-24 text-center">
          <LogoMark className="w-20 h-20 mx-auto mb-8" />

          <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-[1.1] tracking-tight max-w-3xl mx-auto text-balance">
            O consultório online da{" "}
            <span className="text-primary">psicologia moderna</span>
          </h1>

          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed text-pretty">
            Agendamento, prontuário e videochamada no mesmo lugar. Você cuida do
            paciente; a plataforma cuida do resto.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={() => setLocation("/login")} size="lg" className="gap-2">
              Começar agora
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button onClick={verFuncionalidades} size="lg" variant="outline">
              Saiba mais
            </Button>
          </div>

          <p className="mt-8 inline-flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Acesso profissional só após verificação do CRP
          </p>
        </div>
      </section>

      {/* Funcionalidades */}
      <section
        id="funcionalidades"
        className="scroll-mt-16 border-t border-border bg-secondary/40"
      >
        <div className="container mx-auto px-6 py-24">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
              Tudo em um lugar só
            </h2>
            <p className="mt-4 text-lg text-muted-foreground text-pretty">
              Sem alternar entre agenda, planilha e aplicativo de vídeo.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="group rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5"
              >
                <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center transition-colors group-hover:bg-primary/15">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="mt-5 font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-6 py-24">
        <div className="rounded-2xl bg-primary px-6 py-16 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground tracking-tight">
            Pronto para começar?
          </h2>
          <p className="mt-4 text-lg text-primary-foreground/80 max-w-xl mx-auto text-pretty">
            Crie sua conta e comece a atender hoje mesmo.
          </p>
          <Button
            onClick={() => setLocation("/login")}
            size="lg"
            variant="secondary"
            className="mt-8 gap-2"
          >
            Acessar plataforma
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="container mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <LogoLockup markClassName="w-6 h-6" />
          <p className="text-sm text-muted-foreground">
            &copy; 2026 {APP_NAME}. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
