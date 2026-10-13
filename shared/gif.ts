/**
 * GIFs das Mensagens.
 *
 * O GIF vai na mensagem como uma marca no texto — `[gif:ID]` — e não como anexo:
 * não precisa de coluna nova no banco nem de upload. O ID é do GIPHY, e a imagem
 * chega SEMPRE pelo nosso servidor (`/api/gif/ID`): o navegador do paciente nunca
 * fala com o GIPHY, então o GIPHY não vê quem é a pessoa.
 */

/** IDs do GIPHY: letras e números. Qualquer outra coisa é recusada (evita SSRF). */
export const ID_DE_GIF = /^[A-Za-z0-9]{5,40}$/;

const MARCA = /^\[gif:([A-Za-z0-9]{5,40})\]$/;

export const marcaDeGif = (id: string) => `[gif:${id}]`;

/** O ID do GIF, se a mensagem for um GIF; null se for texto comum. */
export function idDoGif(conteudo: string | null | undefined): string | null {
  const m = conteudo?.trim().match(MARCA);
  return m ? m[1] : null;
}

/** De onde a tela carrega a imagem: o nosso servidor, nunca o GIPHY direto. */
export const urlDoGif = (id: string) => `/api/gif/${id}`;
