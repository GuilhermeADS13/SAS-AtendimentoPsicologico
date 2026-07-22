import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  uploadDocumentFile,
  getDocumentSignedUrl,
  removeDocumentFile,
} from "@/lib/supabase";
import { exportProntuarioPDF, exportProntuarioDOCX } from "@/lib/prontuario-export";
import { formatarNascimento } from "@shared/datas";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, FileText, Calendar, MessageSquare, Pencil, Plus, Upload, Download, Trash2, FileDown, Loader2 } from "lucide-react";

// Converte Date | string | null para o formato do <input type="date"> (YYYY-MM-DD).
function toDateInput(value: unknown): string {
  if (!value) return "";
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export default function PatientDetail() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const patientId = Number(params.id);
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const [baixando, setBaixando] = useState<null | "pdf" | "docx">(null);

  const { data: patient, isLoading } = trpc.patients.get.useQuery(
    { id: patientId },
    { enabled: patientId > 0 },
  );

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    address: "",
    medicalHistory: "",
    emergencyContact: "",
    emergencyPhone: "",
  });

  // Preenche o formulário quando o paciente carrega.
  useEffect(() => {
    if (!patient) return;
    setForm({
      firstName: patient.firstName ?? "",
      lastName: patient.lastName ?? "",
      email: patient.email ?? "",
      phone: patient.phone ?? "",
      dateOfBirth: toDateInput(patient.dateOfBirth),
      address: patient.address ?? "",
      medicalHistory: patient.medicalHistory ?? "",
      emergencyContact: patient.emergencyContact ?? "",
      emergencyPhone: patient.emergencyPhone ?? "",
    });
  }, [patient]);

  const updatePatient = trpc.patients.update.useMutation({
    onSuccess: () => {
      utils.patients.get.invalidate({ id: patientId });
      utils.patients.list.invalidate();
      setIsEditOpen(false);
      toast.success("Dados do paciente atualizados!");
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar alterações"),
  });

  const handleSave = () => {
    // Paciente com conta: manda só o que é da psicóloga. Reenviar os dados
    // pessoais gravaria por cima do que ele mantém no "Meu Cadastro".
    const pessoais = patient?.userId
      ? {}
      : {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          dateOfBirth: form.dateOfBirth || undefined,
          address: form.address,
        };

    updatePatient.mutate({
      id: patientId,
      ...pessoais,
      medicalHistory: form.medicalHistory,
      emergencyContact: form.emergencyContact,
      emergencyPhone: form.emergencyPhone,
    });
  };

  // Sessões reais do paciente (evolução clínica).
  const { data: patientSessions = [] } = trpc.sessions.getByPatient.useQuery(
    { patientId },
    { enabled: patientId > 0 },
  );
  const [isSessionOpen, setIsSessionOpen] = useState(false);
  const [sessionForm, setSessionForm] = useState({
    clinicalNotes: "",
    mood: "",
    treatment: "",
    nextSteps: "",
  });
  const createSession = trpc.sessions.create.useMutation({
    onSuccess: () => {
      utils.sessions.getByPatient.invalidate({ patientId });
      setSessionForm({ clinicalNotes: "", mood: "", treatment: "", nextSteps: "" });
      setIsSessionOpen(false);
      toast.success("Sessão registrada!");
    },
    onError: (e) => toast.error(e.message || "Erro ao registrar sessão"),
  });
  const handleSaveSession = () => {
    if (!sessionForm.clinicalNotes.trim()) {
      toast.error("Descreva as anotações clínicas.");
      return;
    }
    createSession.mutate({
      patientId,
      clinicalNotes: sessionForm.clinicalNotes,
      mood: sessionForm.mood || undefined,
      treatment: sessionForm.treatment || undefined,
      nextSteps: sessionForm.nextSteps || undefined,
    });
  };

  // Documentos reais (metadados no banco + arquivo no Supabase Storage).
  const documentsQuery = trpc.documents.getByPatient.useQuery(
    { patientId },
    { enabled: patientId > 0 },
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const createDocument = trpc.documents.create.useMutation();
  const deleteDocument = trpc.documents.delete.useMutation();

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fileKey = await uploadDocumentFile(patientId, file);
      await createDocument.mutateAsync({
        patientId,
        fileName: file.name,
        fileKey,
        fileUrl: fileKey,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        documentType: "other",
      });
      await documentsQuery.refetch();
      toast.success("Documento enviado!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = async (fileKey: string) => {
    const url = await getDocumentSignedUrl(fileKey);
    if (url) window.open(url, "_blank", "noopener");
    else toast.error("Não foi possível gerar o link do documento.");
  };

  const handleDeleteDoc = async (id: number, fileKey: string) => {
    try {
      await deleteDocument.mutateAsync({ id });
      // O metadado é a fonte da verdade — apagado ele, o documento já sumiu do
      // prontuário. Remover o arquivo do Storage é melhor-esforço: se falhar,
      // sobra um órfão (some depois), mas não é motivo para mostrar erro nem
      // deixar a lista inconsistente com um "Falha" sobre algo que já foi feito.
      await removeDocumentFile(fileKey).catch((e) =>
        console.warn("Arquivo órfão no Storage (metadado já removido):", e),
      );
      await documentsQuery.refetch();
      toast.success("Documento removido.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover");
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Carregando prontuário...</p>
      </DashboardLayout>
    );
  }

  if (!patient) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Button variant="ghost" onClick={() => setLocation("/records")} className="p-0">
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <p className="text-muted-foreground">
            Paciente não encontrado (ou você não tem acesso a ele).
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const statusLabel =
    patient.status === "active" ? "Ativo" : patient.status === "inactive" ? "Inativo" : "Arquivado";

  // Com conta vinculada, os dados pessoais vêm do "Meu Cadastro" do paciente e
  // chegam aqui sozinhos — editar por fora só criaria divergência (foi o que
  // aconteceu com o endereço). Sem conta, ninguém mais mantém: a psicóloga edita.
  const vinculado = !!patient.userId;

  // Baixa o prontuário no formato escolhido. Gera no navegador (ver
  // prontuario-export.ts): a cópia sai direto para o PC do profissional.
  const baixarProntuario = async (formato: "pdf" | "docx") => {
    setBaixando(formato);
    try {
      const dados = {
        patient,
        sessions: patientSessions,
        documents: documentsQuery.data ?? [],
        emitidoPor: user?.name,
      };
      if (formato === "pdf") await exportProntuarioPDF(dados);
      else await exportProntuarioDOCX(dados);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar o prontuário");
    } finally {
      setBaixando(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => setLocation("/records")} className="p-0">
              <ArrowLeft className="w-6 h-6" />
            </Button>
            <div className="space-y-1">
              <h1 className="text-3xl font-bold text-foreground">
                {patient.firstName} {patient.lastName}
              </h1>
              <p className="text-muted-foreground">{patient.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={!!baixando}>
                  {baixando ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileDown className="w-4 h-4 mr-2" />
                  )}
                  Baixar prontuário
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => baixarProntuario("pdf")}>
                  <FileText className="w-4 h-4 mr-2" />
                  PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => baixarProntuario("docx")}>
                  <FileText className="w-4 h-4 mr-2" />
                  Word (.docx)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setIsEditOpen(true)} className="bg-primary hover:bg-primary/90">
              <Pencil className="w-4 h-4 mr-2" />
              {vinculado ? "Editar dados clínicos" : "Editar dados"}
            </Button>
          </div>
        </div>

        {/* Patient Info cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent>
              <p className="text-sm text-muted-foreground">Telefone</p>
              <p className="text-lg font-semibold text-foreground">{patient.phone || "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-sm text-muted-foreground">Data de Nascimento</p>
              <p className="text-lg font-semibold text-foreground">
                {patient.dateOfBirth
                  ? formatarNascimento(patient.dateOfBirth)
                  : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="text-lg font-semibold text-green-600">{statusLabel}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-sm text-muted-foreground">Total de Sessões</p>
              <p className="text-lg font-semibold text-foreground">{patientSessions.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="info">Informações</TabsTrigger>
            <TabsTrigger value="sessions">Sessões</TabsTrigger>
            <TabsTrigger value="documents">Documentos</TabsTrigger>
          </TabsList>

          {/* Info Tab */}
          <TabsContent value="info" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Informações Pessoais</CardTitle>
                {vinculado && (
                  <p className="text-sm text-muted-foreground">
                    Mantidas pelo próprio paciente — atualizam aqui automaticamente.
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Endereço</p>
                  <p className="text-foreground">{patient.address || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Contato de Emergência</p>
                  <p className="text-foreground">
                    {patient.emergencyContact || "—"}
                    {patient.emergencyPhone ? ` · ${patient.emergencyPhone}` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Histórico Médico</p>
                  <p className="text-foreground whitespace-pre-wrap">
                    {patient.medicalHistory || "—"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sessions Tab — registro e evolução clínica */}
          <TabsContent value="sessions" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-foreground">Histórico de Sessões</h2>
              <Button onClick={() => setIsSessionOpen(true)} className="bg-primary hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-2" />
                Nova Sessão
              </Button>
            </div>

            {patientSessions.length === 0 ? (
              <Card>
                <CardContent className="text-muted-foreground">
                  <MessageSquare className="w-5 h-5 mb-2" />
                  Nenhuma sessão registrada ainda. Clique em "Nova Sessão" para
                  registrar a evolução clínica.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {patientSessions.map((session) => (
                  <Card key={session.id}>
                    <CardContent className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-primary" />
                          <span className="font-semibold text-foreground">
                            {new Date(session.startedAt).toLocaleString("pt-BR")}
                          </span>
                        </div>
                        {session.mood ? (
                          <span className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded-full">
                            Humor: {session.mood}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {session.clinicalNotes}
                      </p>
                      {session.treatment ? (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Tratamento:</span>{" "}
                          {session.treatment}
                        </p>
                      ) : null}
                      {session.nextSteps ? (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Próximos passos:</span>{" "}
                          {session.nextSteps}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Documents Tab — upload/lista via Supabase Storage */}
          <TabsContent value="documents" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-foreground">Documentos</h2>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="bg-primary hover:bg-primary/90"
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? "Enviando..." : "Enviar documento"}
              </Button>
            </div>

            {(documentsQuery.data?.length ?? 0) === 0 ? (
              <Card>
                <CardContent className="text-muted-foreground">
                  <FileText className="w-5 h-5 mb-2" />
                  Nenhum documento enviado ainda (laudos, receitas, anexos).
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {documentsQuery.data?.map((doc) => (
                  <Card key={doc.id}>
                    <CardContent className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-5 h-5 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{doc.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(doc.createdAt).toLocaleDateString("pt-BR")} ·{" "}
                            {Math.max(1, Math.round(doc.fileSize / 1024))} KB
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(doc.fileKey)}
                          title="Baixar"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteDoc(doc.id, doc.fileKey)}
                          className="text-destructive hover:bg-destructive/10"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog de edição */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {vinculado ? "Editar dados clínicos" : "Editar dados do paciente"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {vinculado ? (
              <p className="text-sm text-muted-foreground rounded-md bg-muted p-3">
                Nome, e-mail, telefone, nascimento e endereço são mantidos pelo
                próprio paciente em "Meu Cadastro" e atualizam aqui sozinhos.
                Abaixo ficam os dados que são seus.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">Nome</Label>
                    <Input
                      id="firstName"
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Sobrenome</Label>
                    <Input
                      id="lastName"
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Data de Nascimento</Label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Endereço</Label>
                  <Input
                    id="address"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="emergencyContact">Contato de Emergência</Label>
                <Input
                  id="emergencyContact"
                  value={form.emergencyContact}
                  onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emergencyPhone">Telefone de Emergência</Label>
                <Input
                  id="emergencyPhone"
                  value={form.emergencyPhone}
                  onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="medicalHistory">Histórico Médico</Label>
              <Textarea
                id="medicalHistory"
                rows={4}
                value={form.medicalHistory}
                onChange={(e) => setForm({ ...form, medicalHistory: e.target.value })}
              />
            </div>
            <Button
              onClick={handleSave}
              disabled={updatePatient.isPending}
              className="w-full bg-primary hover:bg-primary/90"
            >
              {updatePatient.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de nova sessão */}
      <Dialog open={isSessionOpen} onOpenChange={setIsSessionOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Nova Sessão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clinicalNotes">Anotações Clínicas *</Label>
              <Textarea
                id="clinicalNotes"
                rows={6}
                value={sessionForm.clinicalNotes}
                onChange={(e) => setSessionForm({ ...sessionForm, clinicalNotes: e.target.value })}
                placeholder="Descreva os pontos principais da sessão, a evolução do paciente..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mood">Humor / Estado</Label>
              <Input
                id="mood"
                value={sessionForm.mood}
                onChange={(e) => setSessionForm({ ...sessionForm, mood: e.target.value })}
                placeholder="Ex.: Ansioso, Melhorado, Estável..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="treatment">Tratamento / Conduta</Label>
              <Textarea
                id="treatment"
                rows={3}
                value={sessionForm.treatment}
                onChange={(e) => setSessionForm({ ...sessionForm, treatment: e.target.value })}
                placeholder="Técnicas aplicadas, orientações..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nextSteps">Próximos Passos</Label>
              <Textarea
                id="nextSteps"
                rows={2}
                value={sessionForm.nextSteps}
                onChange={(e) => setSessionForm({ ...sessionForm, nextSteps: e.target.value })}
                placeholder="Plano para a próxima sessão..."
              />
            </div>
            <Button
              onClick={handleSaveSession}
              disabled={createSession.isPending}
              className="w-full bg-primary hover:bg-primary/90"
            >
              {createSession.isPending ? "Salvando..." : "Salvar Sessão"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
