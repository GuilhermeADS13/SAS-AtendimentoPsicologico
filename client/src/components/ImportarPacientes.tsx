import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { lerPlanilha } from "@/lib/lerPlanilha";
import { baixarArquivo } from "@/lib/recibo-export";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TrocarDePlanoDialog, ehErroDeLimiteDoPlano } from "@/components/TrocarDePlanoDialog";
import {
  MAX_LINHAS_DA_IMPORTACAO,
  lerPacientes,
  oQueFaltaNasColunas,
  type Campo,
  type LinhaLida,
} from "@shared/importarPacientes";

const ROTULO: Record<Campo, string> = {
  nomeCompleto: "Nome",
  nome: "Nome",
  sobrenome: "Sobrenome",
  email: "E-mail",
  telefone: "Telefone",
  nascimento: "Nascimento",
  cpf: "CPF",
  endereco: "Endereço",
};

/** Modelo em CSV (abre no Excel): só o cabeçalho, para não importar exemplo por engano. */
function baixarModelo() {
  const csv = "﻿Nome;Sobrenome;E-mail;Celular;Data de nascimento;CPF;Endereço\r\n";
  baixarArquivo(new Blob([csv], { type: "text/csv;charset=utf-8" }), "modelo-pacientes.csv");
}

type Lida = { arquivo: string; colunas: Campo[]; falta: string[]; linhas: LinhaLida[] };

/**
 * "Importar planilha" na tela de pacientes: lê o Excel/CSV no navegador, mostra
 * a prévia linha a linha e só grava quando ela confirma (patients.importar).
 */
export function ImportarPacientes({ className }: { className?: string }) {
  const utils = trpc.useUtils();
  const [aberto, setAberto] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [lida, setLida] = useState<Lida | null>(null);
  const [planoCheio, setPlanoCheio] = useState(false);
  const importar = trpc.patients.importar.useMutation();

  const prontas = lida?.linhas.filter((l) => l.paciente) ?? [];
  const fora = lida?.linhas.filter((l) => !l.paciente) ?? [];
  const comAviso = prontas.filter((l) => l.avisos.length);

  const escolher = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setLendo(true);
    try {
      const { linhas, linhaDoCabecalho } = await lerPlanilha(arquivo);
      const r = lerPacientes(linhas, linhaDoCabecalho);
      const colunas = Array.from(new Set((Object.keys(r.colunas) as Campo[]).map((c) => (c === "nome" ? "nomeCompleto" : c))));
      setLida({ arquivo: arquivo.name, colunas, falta: oQueFaltaNasColunas(r.colunas), linhas: r.linhas });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para ler a planilha.");
    } finally {
      setLendo(false);
    }
  };

  const confirmar = async () => {
    try {
      const r = await importar.mutateAsync({ pacientes: prontas.map((l) => l.paciente!) });
      await utils.patients.list.invalidate();
      const repetidos = r.jaCadastrados.length;
      toast.success(
        r.criados
          ? `${r.criados} ${r.criados === 1 ? "paciente cadastrado" : "pacientes cadastrados"}${repetidos ? `; ${repetidos} já tinha${repetidos === 1 ? "" : "m"} ficha` : ""}.`
          : "Todos os pacientes da planilha já tinham ficha.",
      );
      fechar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não deu para importar.";
      if (ehErroDeLimiteDoPlano(msg)) setPlanoCheio(true);
      toast.error(msg, { duration: 10_000 });
    }
  };

  const fechar = () => {
    setAberto(false);
    setLida(null);
  };

  const demais = prontas.length > MAX_LINHAS_DA_IMPORTACAO;

  return (
    <>
      <Button variant="outline" className={`bg-card ${className ?? ""}`} onClick={() => setAberto(true)} data-tour="importar-pacientes">
        <FileSpreadsheet className="size-4" />
        <span className="truncate">Importar planilha</span>
      </Button>

      <Dialog open={aberto} onOpenChange={(o) => (o ? setAberto(true) : !importar.isPending && fechar())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar pacientes de uma planilha</DialogTitle>
            <DialogDescription>
              Traga a lista que você já tem no Excel ou em CSV. Cada paciente entra como “aguardando cadastro”, igual ao
              cadastro manual, e ninguém recebe e-mail.
            </DialogDescription>
          </DialogHeader>

          {!lida ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 text-sm text-foreground">
                <p className="font-medium">A primeira linha precisa ter os títulos das colunas.</p>
                <p className="mt-1 text-muted-foreground">
                  Obrigatórios: <strong className="text-foreground">Nome</strong> e{" "}
                  <strong className="text-foreground">E-mail</strong>. Se tiver, também entram Sobrenome, Celular, Data de
                  nascimento, CPF e Endereço. A ordem das colunas não importa.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <label
                  className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-within:ring-2 focus-within:ring-ring ${
                    lendo ? "pointer-events-none opacity-60" : "hover:bg-primary/90"
                  }`}
                >
                  <FileSpreadsheet className="size-4" aria-hidden />
                  {lendo ? "Lendo a planilha..." : "Escolher planilha (.xlsx ou .csv)"}
                  <input
                    type="file"
                    accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                    className="sr-only"
                    onChange={(e) => {
                      void escolher(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <Button variant="outline" onClick={baixarModelo}>
                  <Download className="mr-2 size-4" />
                  Baixar modelo
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{lida.arquivo}</span>
                {lida.colunas.length > 0 && <> · colunas lidas: {lida.colunas.map((c) => ROTULO[c]).join(", ")}</>}
              </p>

              {lida.falta.length > 0 ? (
                <p className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                  <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    Não achei {lida.falta.join(" nem ")} na primeira linha. Confira os títulos (ou use o modelo) e escolha a
                    planilha de novo.
                  </span>
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="rounded-lg border p-2">
                      <p className="text-xl font-semibold tabular-nums text-foreground">{prontas.length}</p>
                      <p className="text-muted-foreground">prontos</p>
                    </div>
                    <div className="rounded-lg border p-2">
                      <p className="text-xl font-semibold tabular-nums text-amber-700">{comAviso.length}</p>
                      <p className="text-muted-foreground">com aviso</p>
                    </div>
                    <div className="rounded-lg border p-2">
                      <p className="text-xl font-semibold tabular-nums text-red-700">{fora.length}</p>
                      <p className="text-muted-foreground">ficam de fora</p>
                    </div>
                  </div>

                  {demais && (
                    <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                      São {prontas.length} pacientes; dá para importar até {MAX_LINHAS_DA_IMPORTACAO} de cada vez. Divida a
                      planilha em partes.
                    </p>
                  )}

                  <div className="max-h-[40vh] overflow-auto rounded-lg border">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">Linha</th>
                          <th className="px-3 py-2 font-medium">Paciente</th>
                          <th className="px-3 py-2 font-medium">Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lida.linhas.map((l) => (
                          <tr key={l.linha} className="border-t align-top">
                            <td className="px-3 py-2 tabular-nums text-muted-foreground">{l.linha}</td>
                            <td className="px-3 py-2">
                              {l.paciente ? (
                                <>
                                  <p className="font-medium text-foreground">
                                    {l.paciente.firstName} {l.paciente.lastName}
                                  </p>
                                  <p className="break-all text-xs text-muted-foreground">{l.paciente.email}</p>
                                </>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {!l.paciente ? (
                                <span className="inline-flex items-center gap-1 text-red-700">
                                  <XCircle className="size-3.5 shrink-0" aria-hidden /> Fica de fora: {l.erro}
                                </span>
                              ) : l.avisos.length ? (
                                <span className="inline-flex items-start gap-1 text-amber-700">
                                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                                  Entra, mas {l.avisos.join("; ")} (fica em branco)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-green-700">
                                  <CheckCircle2 className="size-3.5 shrink-0" aria-hidden /> Pronto
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Quem já tem ficha com o mesmo e-mail não é cadastrado de novo.
                  </p>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            {lida && (
              <Button variant="outline" onClick={() => setLida(null)} disabled={importar.isPending}>
                Escolher outra planilha
              </Button>
            )}
            {lida && !lida.falta.length && (
              <Button onClick={() => void confirmar()} disabled={importar.isPending || prontas.length === 0 || demais}>
                {importar.isPending
                  ? "Cadastrando..."
                  : `Cadastrar ${prontas.length} ${prontas.length === 1 ? "paciente" : "pacientes"}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TrocarDePlanoDialog aberto={planoCheio} aoFechar={() => setPlanoCheio(false)} aoTrocar={() => void confirmar()} />
    </>
  );
}
