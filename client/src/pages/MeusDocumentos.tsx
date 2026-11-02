import { FileText } from "lucide-react";
import { AcoesDoDocumento } from "@/components/AcoesDoDocumento";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { formatarData } from "@shared/datas";
import { rotuloDoTipo } from "@shared/documentosDoPaciente";

/** Área do paciente: só o que a psicóloga compartilhou com ele. */
export default function MeusDocumentos() {
  const utils = trpc.useUtils();
  const { data: documentos = [], isLoading } = trpc.me.documentos.useQuery();

  return (
    <DashboardLayout>
      <div className="max-w-3xl space-y-6" data-tour="meus-documentos">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Meus documentos</h1>
          <p className="text-muted-foreground">
            Laudos, pareceres, atestados e outros documentos que a sua psicóloga compartilhou com você.
          </p>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : documentos.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground">
              <FileText className="mb-2 size-5" />
              Nenhum documento por aqui ainda. Quando a sua psicóloga compartilhar um, ele aparece nesta página.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {documentos.map((doc) => (
              <Card key={doc.id}>
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText className="size-5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{rotuloDoTipo(doc.tipo)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {doc.fileName}
                        {doc.compartilhadoEm ? ` · ${formatarData(doc.compartilhadoEm)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <AcoesDoDocumento
                      doc={doc}
                      obterUrl={async (baixar) => (await utils.me.urlDoDocumento.fetch({ id: doc.id, baixar })).url}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
