import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  uploadDocumentFile,
  getDocumentSignedUrl,
  removeDocumentFile,
} from "@/lib/supabase";
import { exportProntuarioPDF, exportProntuarioDOCX, exportTclePDF } from "@/lib/prontuario-export";
import { formatarData, formatarDataHora, formatarNascimento } from "@shared/datas";
import {
  ANAMNESE_CAMPOS,
  TCLE_CAMPOS,
  SOAP_CAMPOS,
  MODELOS_INTERNOS,
  agruparCampos,
  type CampoProntuario,
  type AnamneseData,
  type TcleData,
} from "@shared/prontuario";
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
import { ArrowLeft, FileText, Calendar, MessageSquare, Pencil, Plus, Upload, Download, Trash2, FileDown, Loader2, Wallet, CheckCircle2, ClipboardList, FileSignature, Save } from "lucide-react";
import { formatarBRL } from "@shared/dinheiro";

// Renderiza um formulário de campos agrupados (anamnese, TCLE) a partir da
// configuração única de shared/prontuario.ts — sem repetir a lista de campos.
function CamposEditaveis({
  campos,
  valores,
  onChange,
}: {
  campos: readonly CampoProntuario[];
  valores: Record<string, string>;
  onChange: (chave: string, valor: string) => void;
}) {
  return (
    <div className="space-y-6">
      {agruparCampos(campos).map(({ grupo, campos }) => (
        <div key={grupo} className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">{grupo}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {campos.map((campo) => (
              <div
                key={campo.chave}
                className={campo.multilinha ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}
              >
                <Label htmlFor={`campo-${campo.chave}`}>{campo.rotulo}</Label>
                {campo.multilinha ? (
                  <Textarea
                    id={`campo-${campo.chave}`}
                    rows={3}
                    value={valores[campo.chave] ?? ""}
                    onChange={(e) => onChange(campo.chave, e.target.value)}
                    placeholder={campo.ajuda}
                  />
                ) : (
                  <Input
                    id={`campo-${campo.chave}`}
                    value={valores[campo.chave] ?? ""}
                    onChange={(e) => onChange(campo.chave, e.target.value)}
                    placeholder={campo.ajuda}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Converte Date | string | null para o formato do <input type="date"> (YYYY-MM-DD).
function toDateInput(value: unknown): string {
  if (!value) return "";
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** true se a data de nascimento ("YYYY-MM-DD") indica menor de 18 anos. */
function ehMenorDeIdade(dataNascimento: string): boolean {
  if (!dataNascimento) return false;
  const nasc = new Date(dataNascimento);
  if (Number.isNaN(nasc.getTime())) return false;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade < 18;
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
    guardianName: "",
    guardianConsent: false,
    // Prontuário CFP
    initialDemand: "",
    therapeuticGoals: "",
    dischargeSummary: "",
    discharged: false,
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
      guardianName: patient.guardianName ?? "",
      guardianConsent: Boolean(patient.guardianConsentAt),
      initialDemand: patient.initialDemand ?? "",
      therapeuticGoals: patient.therapeuticGoals ?? "",
      dischargeSummary: patient.dischargeSummary ?? "",
      discharged: Boolean(patient.dischargedAt),
    });
    setAnamnese((patient.anamnesis as Record<string, string> | null) ?? {});
    setTcle((patient.tcle as Record<string, string> | null) ?? {});
    setTcleSigned(Boolean(patient.tcleSignedAt));
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

  // Anamnese e TCLE têm formulários próprios (abas), salvos sem fechar o diálogo
  // de edição. Reusam patients.update, que aceita salvar só esses campos.
  const [anamnese, setAnamnese] = useState<Record<string, string>>({});
  const [tcle, setTcle] = useState<Record<string, string>>({});
  const [tcleSigned, setTcleSigned] = useState(false);

  const salvarProntuario = trpc.patients.update.useMutation({
    onSuccess: () => {
      utils.patients.get.invalidate({ id: patientId });
      toast.success("Prontuário atualizado.");
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar"),
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
      // Responsável legal é dado administrativo gerido pela psicóloga (como o
      // contato de emergência): vai sempre, mesmo quando o paciente tem conta.
      guardianName: form.guardianName,
      guardianConsent: form.guardianConsent,
      // Prontuário CFP — dados clínicos da psicóloga, vão sempre.
      initialDemand: form.initialDemand,
      therapeuticGoals: form.therapeuticGoals,
      dischargeSummary: form.dischargeSummary,
      discharged: form.discharged,
    });
  };

  const salvarAnamnese = () =>
    salvarProntuario.mutate({ id: patientId, anamnesis: anamnese as AnamneseData });
  const salvarTcle = () =>
    salvarProntuario.mutate({ id: patientId, tcle: tcle as TcleData, tcleSigned });
  const baixarTcle = async () => {
    try {
      await exportTclePDF({ patient: patient!, terms: tcle as TcleData, emitidoPor: user?.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar o TCLE");
    }
  };

  // Sessões reais do paciente (evolução clínica).
  const { data: patientSessions = [] } = trpc.sessions.getByPatient.useQuery(
    { patientId },
    { enabled: patientId > 0 },
  );
  const [isSessionOpen, setIsSessionOpen] = useState(false);
  const sessionFormVazio = {
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
    mood: "",
    clinicalNotes: "",
  };
  const [sessionForm, setSessionForm] = useState(sessionFormVazio);
  const createSession = trpc.sessions.create.useMutation({
    onSuccess: () => {
      utils.sessions.getByPatient.invalidate({ patientId });
      setSessionForm(sessionFormVazio);
      setIsSessionOpen(false);
      toast.success("Sessão registrada!");
    },
    onError: (e) => toast.error(e.message || "Erro ao registrar sessão"),
  });
  const handleSaveSession = () => {
    const preenchido = [
      sessionForm.subjective,
      sessionForm.objective,
      sessionForm.assessment,
      sessionForm.plan,
      sessionForm.clinicalNotes,
    ].some((v) => v.trim());
    if (!preenchido) {
      toast.error("Preencha ao menos o Subjetivo (S) ou o resumo da sessão.");
      return;
    }
    createSession.mutate({
      patientId,
      // clinicalNotes segue no contrato (obrigatório): mandamos o resumo, que
      // pode ficar vazio quando a evolução está toda no SOAP.
      clinicalNotes: sessionForm.clinicalNotes,
      mood: sessionForm.mood || undefined,
      subjective: sessionForm.subjective || undefined,
      objective: sessionForm.objective || undefined,
      assessment: sessionForm.assessment || undefined,
      plan: sessionForm.plan || undefined,
    });
  };

  // Modelos de anotação do psicólogo — botões que inserem o modelo no "Resumo"
  // da sessão (os modelos são texto livre; o SOAP tem os campos próprios).
  const noteTemplatesQuery = trpc.noteTemplates.list.useQuery();
  const noteTemplates = noteTemplatesQuery.data ?? [];
  const inserirModeloSessao = (corpo: string) =>
    setSessionForm((f) => ({
      ...f,
      clinicalNotes: (f.clinicalNotes.trim() ? f.clinicalNotes.replace(/\s*$/, "") + "\n\n" : "") + corpo,
    }));

  // Documentos reais (metadados no banco + arquivo no Supabase Storage).
  const documentsQuery = trpc.documents.getByPatient.useQuery(
    { patientId },
    { enabled: patientId > 0 },
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const createDocument = trpc.documents.create.useMutation();
  const indexDocument = trpc.documents.indexContent.useMutation();
  const deleteDocument = trpc.documents.delete.useMutation();

  // Pagamentos DESTE paciente. appointments.list traz todas as consultas da
  // psicóloga; filtramos por este paciente. "Falta pagar" = pendentes que não
  // foram canceladas/faltadas; cobrar por consulta que não houve não faz sentido.
  const { data: todasConsultas = [] } = trpc.appointments.list.useQuery();
  const consultasDoPaciente = todasConsultas.filter((a) => a.patientId === patientId);
  const ativa = (a: (typeof todasConsultas)[number]) =>
    a.status !== "cancelled" && a.status !== "no_show";
  const faltaPagar = consultasDoPaciente
    .filter((a) => !a.paid && ativa(a))
    .reduce((soma, a) => soma + (a.price ?? 0), 0);
  const jaPago = consultasDoPaciente
    .filter((a) => a.paid)
    .reduce((soma, a) => soma + (a.price ?? 0), 0);
  const temPagamentos = consultasDoPaciente.some((a) => (a.price ?? 0) > 0 || a.paid);

  const setPayment = trpc.appointments.setPayment.useMutation({
    onSuccess: () => {
      utils.appointments.list.invalidate();
      toast.success("Pagamento atualizado.");
    },
    onError: (e) => toast.error(e.message || "Não foi possível atualizar"),
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fileKey = await uploadDocumentFile(patientId, file);
      const created = await createDocument.mutateAsync({
        patientId,
        fileName: file.name,
        fileKey,
        fileUrl: fileKey,
        fileType: file.type || "application/octet-stream",
        fileSize: file.size,
        documentType: "other",
      });
      if (created.documentId) {
        try {
          const indexed = await indexDocument.mutateAsync({ documentId: created.documentId });
          toast.success(`Documento enviado para indexação (${indexed.status}).`);
        } catch {
          toast.success("Documento enviado; a indexação foi colocada na fila para processamento.");
        }
      } else {
        toast.success("Documento enviado!");
      }
      await documentsQuery.refetch();
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

  // Rótulo e cor por status. "pending" = cadastrado pela psicóloga, aguardando o
  // paciente criar a conta (antes caía no genérico e aparecia como "Arquivado").
  const statusInfo = {
    active: { label: "Ativo", cor: "text-green-600" },
    pending: { label: "Aguardando cadastro", cor: "text-amber-600" },
    inactive: { label: "Inativo", cor: "text-muted-foreground" },
    archived: { label: "Arquivado", cor: "text-muted-foreground" },
  }[patient.status] ?? { label: patient.status, cor: "text-foreground" };

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
              <p className={`text-lg font-semibold ${statusInfo.cor}`}>{statusInfo.label}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-sm text-muted-foreground">Total de Sessões</p>
              <p className="text-lg font-semibold text-foreground">{patientSessions.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Situação de pagamento — visível de cara. Só aparece se houver valor
            lançado; sem preço nas consultas, não polui a tela. */}
        {temPagamentos && (
          <Card className={faltaPagar > 0 ? "border-yellow-300" : "border-primary/30"}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Wallet
                  className={`w-5 h-5 shrink-0 ${
                    faltaPagar > 0 ? "text-yellow-600" : "text-primary"
                  }`}
                />
                <div>
                  {faltaPagar > 0 ? (
                    <p className="font-semibold text-foreground">
                      Falta pagar:{" "}
                      <span className="text-yellow-700">{formatarBRL(faltaPagar)}</span>
                    </p>
                  ) : (
                    <p className="font-semibold text-foreground">Pagamentos em dia</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Já pago: {formatarBRL(jaPago)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-3 lg:grid-cols-6">
            <TabsTrigger value="info">Informações</TabsTrigger>
            <TabsTrigger value="anamnese">Anamnese</TabsTrigger>
            <TabsTrigger value="sessions">Sessões</TabsTrigger>
            <TabsTrigger value="documents">Documentos</TabsTrigger>
            <TabsTrigger value="tcle">TCLE</TabsTrigger>
            <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
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

            {/* Plano clínico (Resolução CFP 001/2009): demanda inicial,
                objetivos/plano terapêutico e encerramento. Editável no botão
                "Editar dados clínicos". */}
            <Card>
              <CardHeader>
                <CardTitle>Plano clínico</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Campos do prontuário exigidos pela Resolução CFP nº 001/2009.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Demanda inicial</p>
                  <p className="text-foreground whitespace-pre-wrap">
                    {patient.initialDemand || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Objetivos e plano terapêutico</p>
                  <p className="text-foreground whitespace-pre-wrap">
                    {patient.therapeuticGoals || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Encerramento / alta
                    {patient.dischargedAt ? ` · ${formatarData(patient.dischargedAt)}` : ""}
                  </p>
                  <p className="text-foreground whitespace-pre-wrap">
                    {patient.dischargeSummary || (patient.dischargedAt ? "Encerrado." : "Em acompanhamento.")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Anamnese Tab — ficha estruturada da 1ª sessão */}
          <TabsContent value="anamnese" className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Ficha de Anamnese</h2>
                <p className="text-sm text-muted-foreground">
                  Levantamento da 1ª sessão. Salve quando quiser — pode completar aos poucos.
                </p>
              </div>
              <Button
                onClick={salvarAnamnese}
                disabled={salvarProntuario.isPending}
                className="bg-primary hover:bg-primary/90 shrink-0"
              >
                <Save className="w-4 h-4 mr-2" />
                {salvarProntuario.isPending ? "Salvando..." : "Salvar anamnese"}
              </Button>
            </div>
            <Card>
              <CardContent className="pt-6">
                <CamposEditaveis
                  campos={ANAMNESE_CAMPOS}
                  valores={anamnese}
                  onChange={(chave, valor) => setAnamnese((a) => ({ ...a, [chave]: valor }))}
                />
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
                            {formatarDataHora(session.startedAt)}
                          </span>
                        </div>
                        {session.mood ? (
                          <span className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded-full">
                            Humor: {session.mood}
                          </span>
                        ) : null}
                      </div>
                      {session.clinicalNotes ? (
                        <p className="text-sm text-foreground whitespace-pre-wrap">
                          {session.clinicalNotes}
                        </p>
                      ) : null}
                      {/* Evolução SOAP (quando registrada). */}
                      {SOAP_CAMPOS.map((campo) => {
                        const valor = session[campo.chave as keyof typeof session] as string | null;
                        return valor ? (
                          <p key={campo.chave} className="text-sm text-muted-foreground whitespace-pre-wrap">
                            <span className="font-medium text-foreground">{campo.rotulo}:</span>{" "}
                            {valor}
                          </p>
                        ) : null;
                      })}
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
                            {formatarData(doc.createdAt)} ·{" "}
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

          {/* TCLE Tab — termo de consentimento livre e esclarecido */}
          <TabsContent value="tcle" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Termo de Consentimento (TCLE)</h2>
                <p className="text-sm text-muted-foreground">
                  Termos do contrato terapêutico. Gere o PDF para o paciente assinar.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={baixarTcle}>
                  <FileDown className="w-4 h-4 mr-2" />
                  Gerar TCLE (PDF)
                </Button>
                <Button
                  onClick={salvarTcle}
                  disabled={salvarProntuario.isPending}
                  className="bg-primary hover:bg-primary/90"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {salvarProntuario.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
            <Card>
              <CardContent className="space-y-6 pt-6">
                <CamposEditaveis
                  campos={TCLE_CAMPOS}
                  valores={tcle}
                  onChange={(chave, valor) => setTcle((t) => ({ ...t, [chave]: valor }))}
                />
                <label className="flex items-start gap-2 border-t pt-4 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tcleSigned}
                    onChange={(e) => setTcleSigned(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="text-muted-foreground">
                    Termo assinado pelo paciente.
                    {patient.tcleSignedAt ? ` Registrado em ${formatarData(patient.tcleSignedAt)}.` : ""}
                  </span>
                </label>
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <FileSignature className="mt-0.5 h-4 w-4 shrink-0" />
                  Salve os termos antes de gerar o PDF para que apareçam preenchidos no documento.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pagamentos deste paciente */}
          <TabsContent value="pagamentos" className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-foreground">Pagamentos</h2>
              <span className="text-sm">
                {faltaPagar > 0 ? (
                  <>
                    Falta{" "}
                    <strong className="text-yellow-700">{formatarBRL(faltaPagar)}</strong>
                  </>
                ) : (
                  <span className="text-muted-foreground">Em dia</span>
                )}
              </span>
            </div>

            {consultasDoPaciente.filter(ativa).length === 0 ? (
              <Card>
                <CardContent className="text-muted-foreground">
                  Nenhuma consulta com valor para acompanhar ainda. O valor é lançado ao
                  agendar (em Agendamentos).
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {[...consultasDoPaciente]
                  .filter(ativa)
                  .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt))
                  .map((a) => (
                    <Card key={a.id}>
                      <CardContent className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div>
                            <p className="font-medium text-foreground">
                              {formatarData(a.scheduledAt)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatarBRL(a.price)}
                            </p>
                          </div>
                        </div>
                        {/* Clicável: alterna pago/pendente na hora. */}
                        <button
                          onClick={() =>
                            setPayment.mutate({ id: a.id, paid: !a.paid })
                          }
                          disabled={setPayment.isPending}
                          title="Clique para alternar pago/pendente"
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                            a.paid
                              ? "bg-green-100 text-green-800 hover:bg-green-200"
                              : "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                          }`}
                        >
                          {a.paid && <CheckCircle2 className="w-3 h-3" />}
                          {a.paid ? "Pago" : "Pendente"}
                        </button>
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
            {ehMenorDeIdade(form.dateOfBirth) && (
              <div className="space-y-3 rounded-md border border-amber-300/70 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                  Paciente menor de idade — a LGPD (art. 14) exige o consentimento de um
                  responsável legal para tratar os dados.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="guardianName">Responsável legal</Label>
                  <Input
                    id="guardianName"
                    placeholder="Nome do pai, mãe ou responsável"
                    value={form.guardianName}
                    onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
                  />
                </div>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.guardianConsent}
                    onChange={(e) => setForm({ ...form, guardianConsent: e.target.checked })}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="text-muted-foreground">
                    Confirmo que obtive o consentimento do responsável legal para tratar os
                    dados deste paciente menor de idade.
                  </span>
                </label>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="medicalHistory">Histórico Médico</Label>
              <Textarea
                id="medicalHistory"
                rows={4}
                value={form.medicalHistory}
                onChange={(e) => setForm({ ...form, medicalHistory: e.target.value })}
              />
            </div>

            {/* Plano clínico (Resolução CFP 001/2009). */}
            <div className="space-y-4 rounded-md border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs font-medium text-foreground">Plano clínico (CFP)</p>
              <div className="space-y-2">
                <Label htmlFor="initialDemand">Demanda inicial</Label>
                <Textarea
                  id="initialDemand"
                  rows={3}
                  value={form.initialDemand}
                  onChange={(e) => setForm({ ...form, initialDemand: e.target.value })}
                  placeholder="Queixa, motivo da busca e hipóteses iniciais."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="therapeuticGoals">Objetivos e plano terapêutico</Label>
                <Textarea
                  id="therapeuticGoals"
                  rows={3}
                  value={form.therapeuticGoals}
                  onChange={(e) => setForm({ ...form, therapeuticGoals: e.target.value })}
                  placeholder="O que se pretende alcançar com as intervenções."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dischargeSummary">Encerramento / alta e encaminhamentos</Label>
                <Textarea
                  id="dischargeSummary"
                  rows={3}
                  value={form.dischargeSummary}
                  onChange={(e) => setForm({ ...form, dischargeSummary: e.target.value })}
                  placeholder="Motivo e conduta da alta, interrupção ou encaminhamento."
                />
              </div>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.discharged}
                  onChange={(e) => setForm({ ...form, discharged: e.target.checked })}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span className="text-muted-foreground">
                  Registrar encerramento/alta (grava a data de hoje).
                  {patient.dischargedAt ? ` Encerrado em ${formatarData(patient.dischargedAt)}.` : ""}
                </span>
              </label>
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
            <p className="text-sm text-muted-foreground">
              Evolução no método SOAP. Preencha o que fizer sentido — o resumo é opcional.
            </p>
            {SOAP_CAMPOS.map((campo) => (
              <div key={campo.chave} className="space-y-2">
                <Label htmlFor={`soap-${campo.chave}`}>{campo.rotulo}</Label>
                <Textarea
                  id={`soap-${campo.chave}`}
                  rows={3}
                  value={sessionForm[campo.chave as "subjective" | "objective" | "assessment" | "plan"]}
                  onChange={(e) => setSessionForm({ ...sessionForm, [campo.chave]: e.target.value })}
                  placeholder={campo.ajuda}
                />
              </div>
            ))}
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
              <Label htmlFor="clinicalNotes">Resumo / observações (opcional)</Label>
              {/* Modelos: inserem no resumo (internos + os do psicólogo). */}
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-xs text-muted-foreground mr-1">Modelos:</span>
                {MODELOS_INTERNOS.map((m) => (
                  <Button key={m.nome} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => inserirModeloSessao(m.corpo)}>
                    {m.nome}
                  </Button>
                ))}
                {noteTemplates.map((t) => (
                  <Button key={t.id} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => inserirModeloSessao(t.corpo)}>
                    {t.nome}
                  </Button>
                ))}
              </div>
              <Textarea
                id="clinicalNotes"
                rows={4}
                value={sessionForm.clinicalNotes}
                onChange={(e) => setSessionForm({ ...sessionForm, clinicalNotes: e.target.value })}
                placeholder="Um resumo livre da sessão, ou use um modelo acima."
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
