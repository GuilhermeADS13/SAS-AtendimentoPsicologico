import DashboardLayout from "@/components/DashboardLayout";
import { SeuPlano } from "@/components/SeuPlano";

/**
 * Aba própria da assinatura da psicóloga (antes era um cartão em Configurações):
 * plano, valor, situação do teste/Pix, dia de vencimento e o pagamento. É para cá
 * que levam o aviso de vencimento do topo e o e-mail "seu plano vence".
 */
export default function Assinatura() {
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Assinatura</h1>
          <p className="text-muted-foreground">
            Seu plano, quanto você paga e até quando está liberada. O valor acompanha o número de
            pacientes, e o pagamento é por Pix.
          </p>
        </div>
        <SeuPlano />
      </div>
    </DashboardLayout>
  );
}
