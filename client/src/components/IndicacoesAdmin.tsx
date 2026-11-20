import { formatarData } from "@shared/datas";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Suporte: quem criou conta por link de indicação (server/indicacao.ts). Quando a indicada
 * pagou, o suporte lança 1 mês grátis para ela e para quem indicou (regra de 17/11).
 */
export function IndicacoesAdmin() {
  const { data, isLoading } = trpc.admin.indicacoes.useQuery();

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">Indicações</h2>
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Quem criou conta pelo link de uma colega. Quando a indicada pagar, as duas ganham 1 mês grátis.
          </p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : data === null ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">Não deu para ler os cadastros agora. Tente de novo mais tarde.</p>
          ) : !data?.length ? (
            <p className="text-sm text-muted-foreground">Ninguém criou conta por link de indicação ainda.</p>
          ) : (
            <ul className="divide-y">
              {data.map((i) => (
                <li key={`${i.email}-${String(i.criadaEm)}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {i.nome || "Sem nome"} <span className="font-normal text-muted-foreground">· {i.email ?? "sem e-mail"}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Conta criada em {formatarData(i.criadaEm)} · indicada por{" "}
                      {i.quemIndicou ? (i.quemIndicou.nome ?? `conta ${i.quemIndicou.id}`) : `“${i.origem}”`}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      i.pagou ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {i.pagou ? "Pagou: lançar o mês" : i.aprovada ? "Aprovada, sem pagamento" : "Ainda sem CRP aprovado"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
