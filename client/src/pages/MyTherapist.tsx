import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarSignedUrl } from "@/lib/supabase";
import { iniciais } from "@/lib/iniciais";
import { ArrowLeft, BadgeCheck, UserRound } from "lucide-react";

/** Perfil da psicóloga, para o paciente conhecer quem vai atendê-lo. */
export default function MyTherapist() {
  const [, setLocation] = useLocation();
  const { data: psi, isLoading } = trpc.me.therapist.useQuery();
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  // Bucket privado: a foto exige URL assinada, mesmo sendo a do perfil público.
  useEffect(() => {
    let ativo = true;
    if (!psi?.photoKey) {
      setFotoUrl(null);
      return;
    }
    getAvatarSignedUrl(psi.photoKey).then((url) => {
      if (ativo) setFotoUrl(url);
    });
    return () => {
      ativo = false;
    };
  }, [psi?.photoKey]);

  const especialidades = (psi?.specialties ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl">
        <Button
          variant="ghost"
          onClick={() => setLocation("/consultas")}
          className="p-0 h-auto text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Minhas Consultas
        </Button>

        {isLoading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : !psi ? (
          <Card>
            <CardContent className="text-muted-foreground">
              <UserRound className="w-5 h-5 mb-2" />
              Complete seu cadastro para ver a psicóloga que vai te atender.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent>
                <div className="flex items-start gap-5">
                  <Avatar className="h-24 w-24 border">
                    {fotoUrl ? <AvatarImage src={fotoUrl} alt={psi.nome ?? ""} /> : null}
                    <AvatarFallback className="text-xl">
                      {iniciais(psi.nome) || <UserRound className="w-8 h-8" />}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 space-y-2">
                    <div>
                      <h1 className="text-2xl font-bold text-foreground">
                        {psi.nome || "Sua psicóloga"}
                      </h1>
                      <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <BadgeCheck className="w-4 h-4 text-primary" />
                        CRP {psi.crp}
                      </p>
                    </div>

                    {especialidades.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {especialidades.map((e) => (
                          <span
                            key={e}
                            className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full"
                          >
                            {e}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {(psi.publicoAtendido?.trim() || psi.formacao?.trim()) && (
              <Card>
                <CardContent className="space-y-4">
                  {psi.publicoAtendido?.trim() && (
                    <div>
                      <h2 className="font-semibold text-foreground mb-1">Atende</h2>
                      <p className="text-muted-foreground">
                        {psi.publicoAtendido
                          .split(",")
                          .map((p) => p.trim())
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  )}
                  {psi.formacao?.trim() && (
                    <div>
                      <h2 className="font-semibold text-foreground mb-1">Formação</h2>
                      <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {psi.formacao}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {psi.bio && (
              <Card>
                <CardContent>
                  <h2 className="font-semibold text-foreground mb-2">Sobre</h2>
                  <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {psi.bio}
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
