import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import PatientProfile from "./PatientProfile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarUpload } from "@/components/AvatarUpload";
import { getAvatarSignedUrl } from "@/lib/supabase";
import { maskCrp } from "@shared/crp";
import { iniciais } from "@/lib/iniciais";
import { UserRound, BadgeCheck, Eye, X } from "lucide-react";

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

  if (!isTherapist) {
    return (
      <DashboardLayout>
        <PatientProfile />
      </DashboardLayout>
    );
  }

  return <TherapistProfile />;
}

const BIO_MAX = 600;

// Opções de público atendido (conjunto fixo, na ordem etária + arranjos).
const PUBLICOS = ["Crianças", "Adolescentes", "Adultos", "Idosos", "Casais", "Famílias"];

/** Perfil profissional da psicóloga (CRP, especialidades, bio). */
function TherapistProfile() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: therapist, isLoading } = trpc.therapists.me.useQuery();

  const [form, setForm] = useState({
    crp: "",
    specialties: "",
    bio: "",
    photoKey: "",
    formacao: "",
    publicoAtendido: "",
  });
  // Campo de digitação das especialidades (o valor confirmado vira etiqueta).
  const [novaEsp, setNovaEsp] = useState("");
  // Foto para a prévia. O bucket é privado → URL assinada; atualiza junto do
  // photoKey (inclusive logo após enviar uma foto nova, que já subiu ao Storage).
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!therapist) return;
    setForm({
      crp: therapist.crp ?? "",
      specialties: therapist.specialties ?? "",
      bio: therapist.bio ?? "",
      photoKey: therapist.photoKey ?? "",
      formacao: therapist.formacao ?? "",
      publicoAtendido: therapist.publicoAtendido ?? "",
    });
  }, [therapist]);

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

  const upsert = trpc.therapists.upsert.useMutation({
    onSuccess: () => {
      utils.therapists.me.invalidate();
      setNovaEsp("");
      toast.success("Perfil salvo com sucesso!");
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar o perfil"),
  });

  // Especialidades: guardadas como texto separado por vírgula (não muda o banco),
  // exibidas e editadas como etiquetas.
  const especialidades = form.specialties
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const addEsp = (valor: string) => {
    const v = valor.trim().replace(/,/g, "");
    if (!v) return;
    // Não duplica (ignora maiúsc./minúsc.).
    if (especialidades.some((e) => e.toLowerCase() === v.toLowerCase())) {
      setNovaEsp("");
      return;
    }
    setForm((f) => ({ ...f, specialties: [...especialidades, v].join(", ") }));
    setNovaEsp("");
  };
  const removeEsp = (esp: string) => {
    setForm((f) => ({
      ...f,
      specialties: especialidades.filter((e) => e !== esp).join(", "),
    }));
  };

  // Público atendido: conjunto fixo, guardado como texto separado por vírgula
  // (igual às especialidades). Alterna ao clicar na etiqueta.
  const publicos = form.publicoAtendido
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const togglePublico = (p: string) => {
    const novo = publicos.includes(p)
      ? publicos.filter((x) => x !== p)
      : [...publicos, p];
    setForm((f) => ({ ...f, publicoAtendido: novo.join(", ") }));
  };

  const handleSave = () => {
    if (!form.crp.trim()) {
      toast.error("Informe o CRP.");
      return;
    }
    // Não perder uma especialidade digitada mas ainda não confirmada com Enter.
    const extra = novaEsp.trim().replace(/,/g, "");
    const specialties =
      extra && !especialidades.some((e) => e.toLowerCase() === extra.toLowerCase())
        ? [...especialidades, extra].join(", ")
        : form.specialties;

    upsert.mutate({
      crp: form.crp,
      specialties: specialties || undefined,
      bio: form.bio || undefined,
      photoKey: form.photoKey,
      formacao: form.formacao || undefined,
      publicoAtendido: form.publicoAtendido || undefined,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Perfil Profissional</h1>
          <p className="text-muted-foreground">
            Dados que aparecem para os pacientes e no seu prontuário.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 items-start">
          {/* ---- Formulário ---- */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="w-5 h-5 text-primary" />
                {user?.name || "Psicóloga"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {isLoading ? (
                <p className="text-muted-foreground">Carregando...</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Foto</Label>
                    <AvatarUpload
                      value={form.photoKey}
                      onChange={(photoKey) => setForm({ ...form, photoKey })}
                      fallback={iniciais(user?.name)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="crp">CRP (Conselho Regional de Psicologia) *</Label>
                    <Input
                      id="crp"
                      value={form.crp}
                      onChange={(e) => setForm({ ...form, crp: maskCrp(e.target.value) })}
                      placeholder="Ex.: 06/123456"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={9}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="esp">Especialidades</Label>
                    {especialidades.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {especialidades.map((e) => (
                          <span
                            key={e}
                            className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full"
                          >
                            {e}
                            <button
                              type="button"
                              onClick={() => removeEsp(e)}
                              aria-label={`Remover ${e}`}
                              className="hover:text-primary/60"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
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
                    <p className="text-xs text-muted-foreground">
                      Uma por vez — Enter ou vírgula adiciona a etiqueta.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Público atendido</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {PUBLICOS.map((p) => {
                        const ativo = publicos.includes(p);
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => togglePublico(p)}
                            aria-pressed={ativo}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                              ativo
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
                            }`}
                          >
                            {p}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Clique para marcar quem você atende.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="formacao">Formação</Label>
                    <Textarea
                      id="formacao"
                      rows={3}
                      value={form.formacao}
                      maxLength={400}
                      onChange={(e) => setForm({ ...form, formacao: e.target.value })}
                      placeholder="Ex.: Graduação em Psicologia — USP&#10;Especialização em Terapia Cognitivo-Comportamental"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bio">Bio / Apresentação</Label>
                    <Textarea
                      id="bio"
                      rows={5}
                      value={form.bio}
                      maxLength={BIO_MAX}
                      onChange={(e) => setForm({ ...form, bio: e.target.value })}
                      placeholder="Conte um pouco sobre sua abordagem e experiência..."
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {form.bio.length}/{BIO_MAX}
                    </p>
                  </div>

                  <Button
                    onClick={handleSave}
                    disabled={upsert.isPending}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {upsert.isPending ? "Salvando..." : "Salvar Perfil"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* ---- Prévia: como o paciente vê (mesma tela de "Minha Psicóloga") ---- */}
          <div className="space-y-2 lg:sticky lg:top-20">
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Como o paciente vê
            </p>
            <Card className="border-primary/20 bg-primary/[0.02]">
              <CardContent className="space-y-4">
                <div className="flex items-start gap-4">
                  <Avatar className="h-20 w-20 border">
                    {fotoUrl ? <AvatarImage src={fotoUrl} alt={user?.name ?? ""} /> : null}
                    <AvatarFallback className="text-lg">
                      {iniciais(user?.name) || <UserRound className="w-7 h-7" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 space-y-1">
                    <h2 className="text-xl font-bold text-foreground">
                      {user?.name || "Sua psicóloga"}
                    </h2>
                    <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <BadgeCheck className="w-4 h-4 text-primary" />
                      {form.crp ? `CRP ${form.crp}` : "CRP —"}
                    </p>
                  </div>
                </div>

                {especialidades.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
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

                {publicos.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-foreground text-sm mb-1">Atende</h3>
                    <p className="text-sm text-muted-foreground">{publicos.join(" · ")}</p>
                  </div>
                )}

                {form.formacao.trim() && (
                  <div>
                    <h3 className="font-semibold text-foreground text-sm mb-1">Formação</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {form.formacao}
                    </p>
                  </div>
                )}

                <div>
                  <h3 className="font-semibold text-foreground text-sm mb-1">Sobre</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {form.bio || (
                      <span className="italic">Sua apresentação aparecerá aqui.</span>
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
