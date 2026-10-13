/**
 * Busca de texto "como no WhatsApp": a cada letra digitada, sem diferenciar
 * maiúscula/minúscula nem acento ("sessao" acha "Sessão"), e devolvendo os
 * trechos para destacar dentro da mensagem.
 *
 * O WhatsApp Web faz igual: tira os diacríticos (NFKD + remoção das marcas),
 * passa para minúsculas, exige que TODOS os termos digitados apareçam e marca
 * cada ocorrência no texto original.
 */

const MARCAS = /[̀-ͯ]/g;

/**
 * Tira acento e caixa SEM mudar o comprimento: cada caractere vira exatamente um.
 * É o que deixa usar a posição achada no texto dobrado para recortar o original.
 */
export function dobrar(texto: string): string {
  let saida = "";
  for (const c of texto.split("")) {
    const d = c.normalize("NFD").replace(MARCAS, "").toLowerCase();
    saida += d.length === 1 ? d : c;
  }
  return saida;
}

/** Os termos da busca, já dobrados e sem repetição. */
export function termosDaBusca(busca: string): string[] {
  return Array.from(new Set(dobrar(busca).split(/\s+/).filter(Boolean)));
}

/** A mensagem só entra no resultado se tiver TODOS os termos. */
export function contemTodos(texto: string, termos: string[]): boolean {
  if (termos.length === 0) return true;
  const t = dobrar(texto);
  return termos.every((termo) => t.includes(termo));
}

export type Trecho = { texto: string; destaque: boolean };

/** Corta o texto original em trechos, marcando cada ocorrência dos termos. */
export function trechosDestacados(texto: string, termos: string[]): Trecho[] {
  if (termos.length === 0 || !texto) return [{ texto, destaque: false }];
  const t = dobrar(texto);

  const faixas: [number, number][] = [];
  for (const termo of termos) {
    for (let i = t.indexOf(termo); i !== -1; i = t.indexOf(termo, i + 1)) {
      faixas.push([i, i + termo.length]);
    }
  }
  if (faixas.length === 0) return [{ texto, destaque: false }];

  // Termos que se sobrepõem ("ana" e "nat" em "natana") viram um destaque só.
  faixas.sort((a, b) => a[0] - b[0]);
  const unidas: [number, number][] = [];
  for (const f of faixas) {
    const ultima = unidas[unidas.length - 1];
    if (ultima && f[0] <= ultima[1]) ultima[1] = Math.max(ultima[1], f[1]);
    else unidas.push([f[0], f[1]]);
  }

  const trechos: Trecho[] = [];
  let pos = 0;
  for (const [ini, fim] of unidas) {
    if (ini > pos) trechos.push({ texto: texto.slice(pos, ini), destaque: false });
    trechos.push({ texto: texto.slice(ini, fim), destaque: true });
    pos = fim;
  }
  if (pos < texto.length) trechos.push({ texto: texto.slice(pos), destaque: false });
  return trechos;
}
