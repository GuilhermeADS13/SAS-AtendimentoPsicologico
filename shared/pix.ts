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
