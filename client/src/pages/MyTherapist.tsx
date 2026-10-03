import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AcoesDoPaciente, CartaoPsicologa, listaDeTexto } from "@/components/CartaoPsicologa";
import { getAvatarSignedUrl } from "@/lib/supabase";
import { ArrowLeft, UserRound } from "lucide-react";

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

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-3xl space-y-4 pb-8 sm:pt-2">
        <Button
          variant="ghost"
          onClick={() => setLocation("/consultas")}
          className="h-auto p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          <ArrowLeft className="mr-2 size-4" />
          Minhas Consultas
        </Button>

        {isLoading ? (
          <Skeleton className="h-96 w-full rounded-2xl" />
        ) : !psi ? (
          <div className="flex flex-col items-center rounded-2xl border bg-card px-6 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UserRound className="size-6" />
            </span>
            <p className="mt-4 font-medium text-foreground">Ainda não há uma psicóloga vinculada</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Complete seu cadastro para ver quem vai te atender.
            </p>
            <Button className="mt-5" onClick={() => setLocation("/configuracoes")}>
              Completar cadastro
            </Button>
          </div>
        ) : (
          <div data-tour="psicologa">
            {/* Mesmo cartão da prévia no Perfil Profissional da psicóloga */}
            <CartaoPsicologa
              dados={{
                nome: psi.nome ?? "",
                crp: psi.crp,
                fotoUrl,
                especialidades: listaDeTexto(psi.specialties),
                publicos: listaDeTexto(psi.publicoAtendido),
                formacao: psi.formacao ?? "",
                bio: psi.bio ?? "",
              }}
              acoes={
                <AcoesDoPaciente
                  onMensagem={() => setLocation("/mensagens")}
                  onConsultas={() => setLocation("/consultas")}
                />
              }
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
