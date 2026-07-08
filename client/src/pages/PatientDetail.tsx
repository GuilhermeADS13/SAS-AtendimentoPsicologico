import { useState } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, FileText, Calendar, MessageSquare } from "lucide-react";

export default function PatientDetail() {
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");

  // Mock data - em produção viria do banco de dados
  const patient = {
    id: 1,
    firstName: "Maria",
    lastName: "Silva",
    email: "maria@example.com",
    phone: "(81) 99999-1111",
    dateOfBirth: "1990-05-15",
    address: "Rua Exemplo, 123 - Recife, PE",
    medicalHistory: "Ansiedade, depressão leve",
    status: "active",
  };

  const sessions = [
    {
      id: 1,
      date: "2026-07-07",
      time: "15:00",
      notes: "Sessão focada em técnicas de relaxamento",
      mood: "Melhorado",
    },
    {
      id: 2,
      date: "2026-06-30",
      time: "14:30",
      notes: "Discussão sobre situações de estresse no trabalho",
      mood: "Ansioso",
    },
  ];

  const documents = [
    {
      id: 1,
      name: "Prescrição - Junho 2026",
      type: "prescription",
      date: "2026-06-15",
    },
    {
      id: 2,
      name: "Relatório Psicológico",
      type: "report",
      date: "2026-06-01",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => setLocation("/records")}
            className="p-0"
          >
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-foreground">
              {patient.firstName} {patient.lastName}
            </h1>
            <p className="text-muted-foreground">{patient.email}</p>
          </div>
        </div>

        {/* Patient Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Telefone</p>
              <p className="text-lg font-semibold text-foreground">
                {patient.phone}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Data de Nascimento</p>
              <p className="text-lg font-semibold text-foreground">
                {new Date(patient.dateOfBirth).toLocaleDateString("pt-BR")}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="text-lg font-semibold text-green-600">Ativo</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total de Sessões</p>
              <p className="text-lg font-semibold text-foreground">
                {sessions.length}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="sessions" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="sessions">Sessões</TabsTrigger>
            <TabsTrigger value="documents">Documentos</TabsTrigger>
            <TabsTrigger value="info">Informações</TabsTrigger>
          </TabsList>

          {/* Sessions Tab */}
          <TabsContent value="sessions" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-foreground">
                Histórico de Sessões
              </h2>
              <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary hover:bg-primary/90">
                    <Plus className="w-4 h-4 mr-2" />
                    Nova Sessão
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Registrar Nova Sessão</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Anotações Clínicas
                      </label>
                      <Textarea
                        value={sessionNotes}
                        onChange={(e) => setSessionNotes(e.target.value)}
                        placeholder="Descreva os pontos principais da sessão..."
                        rows={6}
                      />
                    </div>
                    <Button className="w-full bg-primary hover:bg-primary/90">
                      Salvar Sessão
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-3">
              {sessions.map((session) => (
                <Card key={session.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-primary" />
                          <span className="font-semibold text-foreground">
                            {new Date(session.date).toLocaleDateString(
                              "pt-BR"
                            )}{" "}
                            às {session.time}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {session.notes}
                        </p>
                        <div className="flex items-center gap-2 pt-2">
                          <MessageSquare className="w-4 h-4 text-secondary" />
                          <span className="text-sm text-foreground">
                            Humor: {session.mood}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Documentos</h2>
            <div className="space-y-3">
              {documents.map((doc) => (
                <Card key={doc.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-primary" />
                        <div>
                          <p className="font-semibold text-foreground">
                            {doc.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(doc.date).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        Download
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Info Tab */}
          <TabsContent value="info" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Informações Pessoais</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Endereço</p>
                  <p className="text-foreground">{patient.address}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Histórico Médico
                  </p>
                  <p className="text-foreground">{patient.medicalHistory}</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
