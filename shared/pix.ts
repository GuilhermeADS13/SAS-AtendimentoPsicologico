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
