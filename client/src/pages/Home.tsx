import { useAuth } from "@/_core/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Calendar, FileText, Users, Video, Lock, Clock } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Home() {
  const { isAuthenticated } = useAuth();
  const { isTherapist } = useRole();
  const [, setLocation] = useLocation();

  // Redireciona autenticados conforme o papel (efeito, nunca durante o render).
  useEffect(() => {
    if (isAuthenticated) setLocation(isTherapist ? "/dashboard" : "/consultas");
  }, [isAuthenticated, isTherapist, setLocation]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">BC</span>
            </div>
            <span className="font-semibold text-foreground">Beatriz Chagas</span>
          </div>
          <Button
            onClick={() => setLocation("/login")}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            Entrar
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-5xl md:text-6xl font-bold text-foreground leading-tight">
            Atendimento Psicológico <br />
            <span className="text-primary">Online Profissional</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Plataforma completa para gestão de consultas, prontuários e videochamadas. 
            Acolhimento e profissionalismo em cada detalhe.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            onClick={() => setLocation("/login")}
            size="lg"
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            Começar Agora <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-primary text-primary hover:bg-primary/10"
          >
            Saiba Mais
          </Button>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-20 space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-4xl font-bold text-foreground">Funcionalidades Principais</h2>
          <p className="text-lg text-muted-foreground">Tudo que você precisa para gerenciar seu atendimento</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Feature 1 */}
          <Card className="border-border hover:border-primary/50 transition-colors">
            <CardContent className="pt-6 space-y-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Video className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-lg">Videochamadas</h3>
                <p className="text-muted-foreground">
                  Consultas em tempo real com qualidade profissional, controle de câmera e microfone
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Feature 2 */}
          <Card className="border-border hover:border-primary/50 transition-colors">
            <CardContent className="pt-6 space-y-4">
              <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center">
                <FileText className="w-6 h-6 text-secondary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-lg">Prontuários</h3>
                <p className="text-muted-foreground">
                  Gestão completa de prontuários com histórico clínico e evolução do paciente
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Feature 3 */}
          <Card className="border-border hover:border-primary/50 transition-colors">
            <CardContent className="pt-6 space-y-4">
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-lg">Agendamentos</h3>
                <p className="text-muted-foreground">
                  Calendário inteligente com lembretes automáticos para pacientes
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Feature 4 */}
          <Card className="border-border hover:border-primary/50 transition-colors">
            <CardContent className="pt-6 space-y-4">
              <div className="w-12 h-12 rounded-lg bg-destructive/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-lg">Gestão de Pacientes</h3>
                <p className="text-muted-foreground">
                  Cadastro completo com histórico, contatos e dados de emergência
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Feature 5 */}
          <Card className="border-border hover:border-primary/50 transition-colors">
            <CardContent className="pt-6 space-y-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-lg">Segurança</h3>
                <p className="text-muted-foreground">
                  Armazenamento seguro de documentos e criptografia de dados sensíveis
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Feature 6 */}
          <Card className="border-border hover:border-primary/50 transition-colors">
            <CardContent className="pt-6 space-y-4">
              <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center">
                <Clock className="w-6 h-6 text-secondary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-lg">Lembretes</h3>
                <p className="text-muted-foreground">
                  Notificações automáticas por e-mail para pacientes e psicóloga
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <Card className="bg-gradient-to-r from-primary/20 to-secondary/20 border-primary/30">
          <CardContent className="pt-12 pb-12 text-center space-y-6">
            <h2 className="text-3xl font-bold text-foreground">
              Pronto para começar?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Acesse a plataforma com sua conta e comece a gerenciar seus atendimentos de forma profissional e segura.
            </p>
            <Button
              onClick={() => setLocation("/login")}
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Acessar Plataforma <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background/50">
        <div className="container mx-auto px-4 py-8 text-center text-muted-foreground">
          <p>&copy; 2026 Beatriz Chagas - Psicologia. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
