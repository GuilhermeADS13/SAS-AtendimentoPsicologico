/**
 * "Pix copia e cola" (BR Code, padrão EMV do Banco Central) com o VALOR embutido.
 *
 * O código da conta é estático e sem valor (campo 54 ausente): quem paga digita.
 * Aqui o valor da mensalidade de cada psicóloga entra no campo 54 — o Pix estático
 * aceita valor fixo — e o CRC16 do fim (campo 63) é recalculado, senão o app do
 * banco recusa o código.
 */

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), o que o BR Code usa. */
export function crc16Pix(texto: string): string {
  let crc = 0xffff;
  const bytes = new TextEncoder().encode(texto);
  for (let b = 0; b < bytes.length; b++) {
    crc ^= bytes[b] << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

type Campo = { id: string; valor: string };

function lerCampos(codigo: string): Campo[] {
  const campos: Campo[] = [];
  for (let i = 0; i < codigo.length; ) {
    const id = codigo.slice(i, i + 2);
    const tamanho = Number(codigo.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !Number.isInteger(tamanho)) throw new Error("Código Pix inválido.");
    campos.push({ id, valor: codigo.slice(i + 4, i + 4 + tamanho) });
    i += 4 + tamanho;
  }
  return campos;
}

const montar = (campos: Campo[]) =>
  campos.map((c) => `${c.id}${String(c.valor.length).padStart(2, "0")}${c.valor}`).join("");

/**
 * Tipos de chave Pix que a psicóloga cadastra para receber dos pacientes. CPF e
 * CNPJ juntos (o número de dígitos diz qual é); celular separado do CPF porque os
 * dois têm 11 dígitos.
 */
export const TIPOS_DE_CHAVE_PIX = ["cpf_cnpj", "celular", "email", "aleatoria"] as const;
export type TipoChavePix = (typeof TIPOS_DE_CHAVE_PIX)[number];

/** A chave no formato do DICT, ou null se não é uma chave válida daquele tipo. */
export function normalizarChavePix(tipo: TipoChavePix, valor: string): string | null {
  const v = valor.trim();
  const digitos = v.replace(/\D/g, "");
  switch (tipo) {
    case "cpf_cnpj":
      return digitos.length === 11 || digitos.length === 14 ? digitos : null;
    case "celular": {
      // Aceita com ou sem o 55; o DICT guarda "+55" + DDD + número.
      const nacional = digitos.length === 13 && digitos.startsWith("55") ? digitos.slice(2) : digitos;
      return /^[1-9][1-9]9\d{8}$/.test(nacional) ? `+55${nacional}` : null;
    }
    case "email": {
      const e = v.toLowerCase();
      return e.length <= 77 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
    }
    case "aleatoria": {
      const a = v.toLowerCase();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(a) ? a : null;
    }
  }
}

/**
 * Palpite do tipo de uma chave que a pessoa colou ou digitou (ex.: colou o
 * celular no campo do "copia e cola"). Só um palpite: os botões de tipo ficam à
 * vista para ela corrigir. 11 dígitos podem ser CPF ou celular — com pontos é
 * CPF; com parênteses, "+" ou no formato DDD + 9 é celular.
 */
export function palpiteDoTipoDeChave(valor: string): TipoChavePix | null {
  const v = valor.trim();
  if (!v) return null;
  if (v.includes("@")) return "email";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return "aleatoria";
  const digitos = v.replace(/\D/g, "");
  if (digitos.length === 14) return "cpf_cnpj";
  if (/[()+]/.test(v) || digitos.length === 13) return "celular";
  if (digitos.length === 11) return !v.includes(".") && /^[1-9][1-9]9/.test(digitos) ? "celular" : "cpf_cnpj";
  return null;
}

/** Nome/cidade no BR Code: sem acento (os apps de banco erram com acento) e no tamanho máximo. */
function textoPix(texto: string, max: number): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .,-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/**
 * "Pix copia e cola" estático e sem valor, a partir da chave da psicóloga. O
 * valor de cada consulta entra depois, com pixComValor.
 */
export function montarPixEstatico({ chave, nome, cidade }: { chave: string; nome: string; cidade: string }): string {
  const conta = montar([
    { id: "00", valor: "br.gov.bcb.pix" },
    { id: "01", valor: chave },
  ]);
  const campos: Campo[] = [
    { id: "00", valor: "01" },
    { id: "26", valor: conta },
    { id: "52", valor: "0000" },
    { id: "53", valor: "986" },
    { id: "58", valor: "BR" },
    { id: "59", valor: textoPix(nome, 25) || "PSICOLOGA" },
    { id: "60", valor: textoPix(cidade, 15) || "BRASIL" },
    { id: "62", valor: montar([{ id: "05", valor: "***" }]) },
  ];
  const semCrc = `${montar(campos)}6304`;
  return semCrc + crc16Pix(semCrc);
}

/**
 * Lê o "Pix copia e cola" que a psicóloga colou (gerado no app do banco dela) e
 * tira a chave e a cidade — o resto o sistema remonta com montarPixEstatico,
 * e o valor de cada consulta entra com pixComValor. Assim não precisa de coluna
 * nova: fica igual a quem digitou a chave.
 *
 * Recusa o Pix DINÂMICO (cobrança com link, campo 26/25): nele o valor e o
 * vencimento vêm do servidor do banco e não dá para trocar.
 */
export function lerPixCopiaECola(codigo: string): { tipo: TipoChavePix; chave: string; cidade: string } {
  const texto = codigo.replace(/[\r\n]/g, "").trim();
  if (!texto.startsWith("000201") || !/6304[0-9A-Fa-f]{4}$/.test(texto)) {
    throw new Error("Isso não parece um Pix copia e cola. Copie o código inteiro no app do banco e cole de novo.");
  }
  if (crc16Pix(texto.slice(0, -4)) !== texto.slice(-4).toUpperCase()) {
    throw new Error("O código veio incompleto ou alterado. Copie de novo no app do banco e cole aqui.");
  }
  let campos: Campo[];
  try {
    campos = lerCampos(texto);
  } catch {
    throw new Error("Não consegui ler esse código Pix. Copie de novo no app do banco e cole aqui.");
  }
  // A conta Pix fica num dos campos 26 a 51, marcada pelo identificador br.gov.bcb.pix.
  let conta: Campo[] | undefined;
  for (const c of campos) {
    const id = Number(c.id);
    if (id < 26 || id > 51) continue;
    try {
      const sub = lerCampos(c.valor);
      if (sub.find((s) => s.id === "00")?.valor.toLowerCase() === "br.gov.bcb.pix") {
        conta = sub;
        break;
      }
    } catch {
      /* outro arranjo de pagamento: segue procurando */
    }
  }
  if (!conta) throw new Error("Esse código não é de Pix. Use o Pix copia e cola do app do seu banco.");
  if (conta.some((s) => s.id === "25")) {
    throw new Error(
      "Esse é um Pix de cobrança (dinâmico), que não deixa trocar o valor. No app do banco, use a opção de receber com a sua chave Pix (QR estático).",
    );
  }
  const bruta = conta.find((s) => s.id === "01")?.valor.trim() ?? "";
  const tipo: TipoChavePix = bruta.includes("@")
    ? "email"
    : bruta.startsWith("+")
      ? "celular"
      : /^[0-9a-f-]{36}$/i.test(bruta)
        ? "aleatoria"
        : "cpf_cnpj";
  const chave = normalizarChavePix(tipo, bruta);
  if (!chave) throw new Error("Não encontrei uma chave Pix válida nesse código. Confira no app do banco.");
  const cidade = campos.find((c) => c.id === "60")?.valor.trim() || "BRASIL";
  return { tipo, chave, cidade };
}

/** O código com o valor (em centavos) no campo 54 e o CRC refeito. */
export function pixComValor(codigo: string, centavos: number): string {
  const campos = lerCampos(codigo.trim()).filter((c) => c.id !== "54" && c.id !== "63");
  const valor = { id: "54", valor: (centavos / 100).toFixed(2) };
  // Os campos vão em ordem crescente de ID: o 54 entra logo depois do 53 (moeda).
  const posicao = campos.findIndex((c) => Number(c.id) > 54);
  campos.splice(posicao === -1 ? campos.length : posicao, 0, valor);
  const semCrc = `${montar(campos)}6304`;
  return semCrc + crc16Pix(semCrc);
}
