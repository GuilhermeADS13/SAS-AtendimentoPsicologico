/**
 * Exporta o prontuário do paciente em PDF ou Word, gerado NO NAVEGADOR.
 *
 * De propósito não passa pelo servidor: o Render free (512 MB) não aguenta gerar
 * documento (o AutoJuri faz com LibreOffice, que aqui derrubaria o container). Os
 * dados já estão carregados na tela do prontuário, então montamos o arquivo aqui
 * e entregamos direto — o arquivo nasce no PC do profissional.
 *
 * As libs (`jspdf`, `docx`) entram por import() dinâmico: só carregam quando o
 * profissional clica em baixar, sem pesar no carregamento do app.
 */
import type { RouterOutputs } from "@/lib/trpc";

type Patient = NonNullable<RouterOutputs["patients"]["get"]>;
type Session = RouterOutputs["sessions"]["getByPatient"][number];
type Documento = RouterOutputs["documents"]["getByPatient"][number];

export type ProntuarioData = {
  patient: Patient;
  sessions: Session[];
  documents: Documento[];
  /** Nome da psicóloga logada, para constar quem emitiu. */
  emitidoPor?: string | null;
};

// ---- Modelo neutro: os dois formatos leem daqui ----
type Campo = { rotulo: string; valor: string };
type SessaoView = { titulo: string; campos: Campo[] };
type Secao =
  | { tipo: "campos"; titulo: string; campos: Campo[] }
  | { tipo: "texto"; titulo: string; texto: string }
  | { tipo: "sessoes"; titulo: string; sessoes: SessaoView[]; vazio: string }
  | { tipo: "lista"; titulo: string; itens: string[]; vazio: string };
type Prontuario = {
  titulo: string;
  paciente: string;
  emitido: string;
  secoes: Secao[];
  rodape: string;
};

// ---- Formatação ----
const traco = "—";

function data(v: unknown): string {
  if (!v) return traco;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? traco : d.toLocaleDateString("pt-BR");
}
function dataHora(d: Date): string {
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function tamanho(bytes: number): string {
  if (!bytes) return traco;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function statusLabel(s: string): string {
  return { active: "Ativo", inactive: "Inativo", archived: "Arquivado", pending: "Pendente" }[s] ?? s;
}
function nomeArquivo(base: string, ext: string): string {
  const limpo = base.replace(/[^\w\s.-]+/g, "").replace(/\s+/g, " ").trim();
  const hoje = new Date().toISOString().slice(0, 10);
  return `Prontuario - ${limpo} - ${hoje}.${ext}`;
}

/** Monta o modelo do documento a partir dos dados do prontuário. */
function montar(dados: ProntuarioData): Prontuario {
  const { patient: p, sessions, documents, emitidoPor } = dados;
  const nome = `${p.firstName} ${p.lastName}`.trim();

  const sessoes: SessaoView[] = [...sessions]
    .sort((a, b) => +new Date(a.startedAt) - +new Date(b.startedAt))
    .map((s) => {
      const campos: Campo[] = [];
      if (s.mood) campos.push({ rotulo: "Humor / estado", valor: s.mood });
      campos.push({ rotulo: "Anotações clínicas", valor: s.clinicalNotes || traco });
      if (s.treatment) campos.push({ rotulo: "Tratamento / conduta", valor: s.treatment });
      if (s.nextSteps) campos.push({ rotulo: "Próximos passos", valor: s.nextSteps });
      return { titulo: dataHora(new Date(s.startedAt)), campos };
    });

  const anexos = documents.map(
    (d) => `${d.fileName} · ${data(d.createdAt)} · ${tamanho(d.fileSize)}`,
  );

  return {
    titulo: "VozInterior — Prontuário",
    paciente: nome,
    emitido: `Emitido por ${emitidoPor || traco} em ${dataHora(new Date())}`,
    secoes: [
      {
        tipo: "campos",
        titulo: "Dados pessoais",
        campos: [
          { rotulo: "Nome", valor: nome },
          { rotulo: "E-mail", valor: p.email || traco },
          { rotulo: "Telefone", valor: p.phone || traco },
          { rotulo: "Nascimento", valor: data(p.dateOfBirth) },
          { rotulo: "Endereço", valor: p.address || traco },
          { rotulo: "Status", valor: statusLabel(p.status) },
        ],
      },
      {
        tipo: "campos",
        titulo: "Contato de emergência",
        campos: [
          { rotulo: "Nome", valor: p.emergencyContact || traco },
          { rotulo: "Telefone", valor: p.emergencyPhone || traco },
        ],
      },
      { tipo: "texto", titulo: "Histórico médico", texto: p.medicalHistory || traco },
      {
        tipo: "sessoes",
        titulo: "Evolução clínica",
        sessoes,
        vazio: "Nenhuma sessão registrada.",
      },
      {
        tipo: "lista",
        titulo: "Documentos anexados",
        itens: anexos,
        vazio: "Nenhum documento anexado.",
      },
    ],
    rodape: "Cópia gerada em " + data(new Date()) + ". Documento sob guarda do profissional.",
  };
}

function baixar(blob: Blob, arquivo: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoga depois do tick para o download iniciar antes de a URL sumir.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function nomePaciente(dados: ProntuarioData): string {
  return `${dados.patient.firstName} ${dados.patient.lastName}`.trim();
}

// ================= PDF (jsPDF) =================
/** Monta o Blob do PDF (sem tocar no DOM — testável em Node). */
export async function buildProntuarioPdfBlob(dados: ProntuarioData): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const m = montar(dados);

  const margem = 48;
  const larguraPag = doc.internal.pageSize.getWidth();
  const alturaPag = doc.internal.pageSize.getHeight();
  const maxW = larguraPag - margem * 2;
  let y = margem;

  const garantir = (espaco: number) => {
    if (y + espaco > alturaPag - margem) {
      doc.addPage();
      y = margem;
    }
  };
  const texto = (t: string, size: number, estilo: "normal" | "bold" | "italic", cor = 40) => {
    doc.setFont("helvetica", estilo);
    doc.setFontSize(size);
    doc.setTextColor(cor);
    const linhas = doc.splitTextToSize(t, maxW);
    const lh = size * 1.35;
    for (const linha of linhas) {
      garantir(lh);
      doc.text(linha, margem, y);
      y += lh;
    }
  };

  texto(m.titulo, 18, "bold", 33);
  texto(m.paciente, 14, "bold", 33);
  texto(m.emitido, 9, "italic", 110);
  y += 8;

  for (const secao of m.secoes) {
    garantir(40);
    y += 6;
    texto(secao.titulo, 13, "bold", 33);
    y += 2;
    if (secao.tipo === "campos") {
      for (const c of secao.campos) texto(`${c.rotulo}: ${c.valor}`, 10, "normal");
    } else if (secao.tipo === "texto") {
      texto(secao.texto, 10, "normal");
    } else if (secao.tipo === "sessoes") {
      if (!secao.sessoes.length) texto(secao.vazio, 10, "italic", 110);
      for (const s of secao.sessoes) {
        garantir(30);
        y += 4;
        texto(s.titulo, 11, "bold", 60);
        for (const c of s.campos) {
          texto(c.rotulo, 9, "bold", 90);
          texto(c.valor, 10, "normal");
        }
      }
    } else if (secao.tipo === "lista") {
      if (!secao.itens.length) texto(secao.vazio, 10, "italic", 110);
      for (const it of secao.itens) texto(`• ${it}`, 10, "normal");
    }
  }

  y += 12;
  texto(m.rodape, 8, "italic", 130);

  // arraybuffer + Blob manual em vez de output("blob"): funciona igual no
  // navegador e em Node (o teste de verificação roda em Node).
  const ab = doc.output("arraybuffer");
  return new Blob([ab], { type: "application/pdf" });
}

export async function exportProntuarioPDF(dados: ProntuarioData): Promise<void> {
  const blob = await buildProntuarioPdfBlob(dados);
  baixar(blob, nomeArquivo(nomePaciente(dados), "pdf"));
}

// ================= Word (docx) =================
/** Monta o Blob do .docx (sem tocar no DOM — testável em Node). */
export async function buildProntuarioDocxBlob(dados: ProntuarioData): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
  const m = montar(dados);

  const filhos: InstanceType<typeof Paragraph>[] = [];
  const P = (runs: InstanceType<typeof TextRun>[], opts: object = {}) =>
    filhos.push(new Paragraph({ children: runs, ...opts }));
  const run = (text: string, o: object = {}) => new TextRun({ text, ...o });

  P([run(m.titulo, { bold: true, size: 32 })], { spacing: { after: 60 } });
  P([run(m.paciente, { bold: true, size: 26 })]);
  P([run(m.emitido, { italics: true, size: 16, color: "6B7280" })], { spacing: { after: 200 } });

  for (const secao of m.secoes) {
    P([run(secao.titulo, { bold: true, size: 24, color: "215756" })], {
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 80 },
    });
    if (secao.tipo === "campos") {
      for (const c of secao.campos)
        P([run(`${c.rotulo}: `, { bold: true }), run(c.valor)]);
    } else if (secao.tipo === "texto") {
      for (const par of secao.texto.split(/\n+/)) P([run(par)]);
    } else if (secao.tipo === "sessoes") {
      if (!secao.sessoes.length) P([run(secao.vazio, { italics: true, color: "6B7280" })]);
      for (const s of secao.sessoes) {
        P([run(s.titulo, { bold: true, size: 22, color: "374151" })], {
          spacing: { before: 120, after: 40 },
        });
        for (const c of s.campos) {
          P([run(c.rotulo, { bold: true, size: 18, color: "6B7280" })]);
          for (const par of c.valor.split(/\n+/)) P([run(par)]);
        }
      }
    } else if (secao.tipo === "lista") {
      if (!secao.itens.length) P([run(secao.vazio, { italics: true, color: "6B7280" })]);
      for (const it of secao.itens) P([run(it)], { bullet: { level: 0 } });
    }
  }

  P([run(m.rodape, { italics: true, size: 16, color: "9CA3AF" })], {
    spacing: { before: 240 },
  });

  const doc = new Document({ sections: [{ children: filhos }] });
  return Packer.toBlob(doc);
}

export async function exportProntuarioDOCX(dados: ProntuarioData): Promise<void> {
  const blob = await buildProntuarioDocxBlob(dados);
  baixar(blob, nomeArquivo(nomePaciente(dados), "docx"));
}
