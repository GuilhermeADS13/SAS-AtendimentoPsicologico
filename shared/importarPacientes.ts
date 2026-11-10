/**
 * Importar pacientes de uma planilha (Excel ou CSV), 2026-11-10.
 *
 * A planilha de cada psicóloga é de um jeito: o cabeçalho é reconhecido pelo nome
 * ("Nome", "E-mail", "Celular", "Data de nascimento"...), sem ordem fixa. Cada
 * linha vira um paciente ou um motivo claro de ficar de fora. O e-mail é
 * obrigatório porque é ele que liga a ficha à conta que o paciente cria.
 * O que vier errado e for opcional (telefone, nascimento, CPF) não barra a
 * linha: o campo fica em branco e a prévia avisa.
 */
import { cpfValido, soDigitosDoCpf } from "./recibo";
import { mascaraTelefone, soDigitos, telefoneValido } from "./telefone";
import { nascimentoValido } from "./datas";

export const MAX_LINHAS_DA_IMPORTACAO = 500;

export type Campo = "nomeCompleto" | "nome" | "sobrenome" | "email" | "telefone" | "nascimento" | "cpf" | "endereco";

/** Valor de uma célula: texto, número (data do Excel vem como número) ou vazio. */
export type Celula = string | number | null;

export type PacienteDaPlanilha = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  /** AAAA-MM-DD */
  dateOfBirth?: string;
  /** Só os dígitos. */
  cpf?: string;
  address?: string;
};

export type LinhaLida = {
  /** Número da linha na planilha (o cabeçalho é a 1). */
  linha: number;
  paciente: PacienteDaPlanilha | null;
  /** Por que a linha ficou de fora (quando `paciente` é null). */
  erro?: string;
  /** Campos opcionais que vieram errados e ficaram em branco. */
  avisos: string[];
};

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Do mais específico ao mais geral: "nome completo" antes de "nome".
const SINONIMOS: [Campo, RegExp][] = [
  ["sobrenome", /^(sobrenome|ultimo nome|apelido de familia)$/],
  ["nomeCompleto", /^(nome completo|nome do paciente|paciente|cliente|nome e sobrenome)$/],
  ["nome", /^(nome|primeiro nome)$/],
  ["email", /^(e ?mail|email do paciente|correio eletronico)$/],
  ["telefone", /^(telefone|celular|whats ?app|whats|fone|contato|tel|telefone celular|numero)$/],
  ["nascimento", /^(data de nascimento|nascimento|data nascimento|data nasc|dt nasc|dn|aniversario)$/],
  ["cpf", /^(cpf|cpf do paciente)$/],
  ["endereco", /^(endereco|endereco completo|residencia)$/],
];

/** Coluna de cada campo reconhecido no cabeçalho (índice), ou ausente. */
export function mapearColunas(cabecalho: Celula[]): Partial<Record<Campo, number>> {
  const mapa: Partial<Record<Campo, number>> = {};
  cabecalho.forEach((celula, i) => {
    const titulo = semAcento(String(celula ?? ""));
    if (!titulo) return;
    for (const [campo, padrao] of SINONIMOS) {
      if (padrao.test(titulo) && mapa[campo] === undefined) {
        mapa[campo] = i;
        return;
      }
    }
  });
  // "Nome" sozinho, sem coluna de sobrenome, é o nome completo.
  if (mapa.nome !== undefined && mapa.sobrenome === undefined && mapa.nomeCompleto === undefined) {
    mapa.nomeCompleto = mapa.nome;
    delete mapa.nome;
  }
  return mapa;
}

/** O que falta no cabeçalho para dar para importar (vazio = dá). */
export function oQueFaltaNasColunas(mapa: Partial<Record<Campo, number>>): string[] {
  const falta: string[] = [];
  if (mapa.nomeCompleto === undefined && mapa.nome === undefined) falta.push("uma coluna “Nome”");
  if (mapa.email === undefined) falta.push("uma coluna “E-mail”");
  return falta;
}

/**
 * CSV como o Excel brasileiro salva: separador ";" (ou "," / tab, conforme a
 * primeira linha), aspas para campos com separador ou quebra de linha.
 */
export function lerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const primeira = t.slice(0, t.search(/\r?\n|$/));
  const contar = (sep: string) => primeira.split(sep).length;
  const sep = [";", ",", "\t"].reduce((melhor, s) => (contar(s) > contar(melhor) ? s : melhor), ";");

  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"' && campo === "") aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo !== "" || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

/** Excel guarda data como número de dias desde 30/12/1899. */
function dataDoExcel(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 80000) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** "05/03/1990", "5/3/90", "1990-03-05" ou número do Excel -> "1990-03-05"; null se não der. */
export function lerNascimento(valor: Celula, agora = new Date()): string | null {
  if (typeof valor === "number") return dataDoExcel(valor);
  const v = String(valor ?? "").trim();
  if (!v) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(v);
  if (m) {
    let ano = Number(m[3]);
    // "90" -> 1990, "05" -> 2005: o século que não cai no futuro.
    if (m[3].length === 2) ano += ano + 2000 > agora.getFullYear() ? 1900 : 2000;
    return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  if (/^\d+(\.\d+)?$/.test(v)) return dataDoExcel(Number(v));
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const texto = (c: Celula | undefined) => (c === null || c === undefined ? "" : String(c)).replace(/\s+/g, " ").trim();

/**
 * Linhas da planilha (a primeira é o cabeçalho) -> pacientes, com o motivo de
 * cada linha que ficou de fora. Linhas totalmente vazias são ignoradas.
 */
export function lerPacientes(linhas: Celula[][], linhaDoCabecalho = 1, agora = new Date()): { colunas: Partial<Record<Campo, number>>; linhas: LinhaLida[] } {
  const [cabecalho = [], ...dados] = linhas;
  const colunas = mapearColunas(cabecalho);
  const vistos = new Set<string>();
  const lidas: LinhaLida[] = [];

  dados.forEach((celulas, i) => {
    const linha = linhaDoCabecalho + i + 1;
    if (celulas.every((c) => texto(c) === "")) return;
    const pega = (campo: Campo) => (colunas[campo] === undefined ? "" : texto(celulas[colunas[campo]!]));
    const avisos: string[] = [];

    let firstName = pega("nome");
    let lastName = pega("sobrenome");
    if (colunas.nomeCompleto !== undefined) {
      const completo = pega("nomeCompleto");
      const espaco = completo.indexOf(" ");
      firstName = espaco < 0 ? completo : completo.slice(0, espaco);
      lastName = espaco < 0 ? "" : completo.slice(espaco + 1);
    }
    firstName = firstName.slice(0, 128);
    lastName = lastName.slice(0, 128);
    const email = pega("email").toLowerCase();

    const fora = (erro: string) => lidas.push({ linha, paciente: null, erro, avisos: [] });
    if (!firstName) return fora("sem nome");
    if (!email) return fora("sem e-mail");
    if (!EMAIL.test(email) || email.length > 320) return fora(`e-mail inválido (${email})`);
    if (vistos.has(email)) return fora("e-mail repetido na planilha");
    vistos.add(email);

    const paciente: PacienteDaPlanilha = { firstName, lastName, email };

    const tel = pega("telefone");
    if (tel) {
      let d = soDigitos(tel);
      if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
      if (telefoneValido(d)) paciente.phone = mascaraTelefone(d);
      else avisos.push("telefone sem DDD ou incompleto");
    }

    const celulaNascimento = colunas.nascimento === undefined ? null : celulas[colunas.nascimento] ?? null;
    if (texto(celulaNascimento)) {
      const data = lerNascimento(celulaNascimento, agora);
      if (data && nascimentoValido(data, agora)) paciente.dateOfBirth = data;
      else avisos.push("data de nascimento inválida");
    }

    const cpf = pega("cpf");
    if (cpf) {
      // O Excel come o zero da frente de CPF guardado como número.
      const d = soDigitosDoCpf(cpf).padStart(11, "0");
      if (cpfValido(d)) paciente.cpf = d;
      else avisos.push("CPF inválido");
    }

    const endereco = pega("endereco");
    if (endereco) paciente.address = endereco.slice(0, 300);

    lidas.push({ linha, paciente, avisos });
  });

  return { colunas, linhas: lidas };
}
