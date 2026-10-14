/**
 * O que pode ir para o bucket `documents` (anexos do chat, documentos do
 * prontuário, modelo de prontuário). A MESMA lista está gravada no bucket
 * (migração 0034): a tela recusa antes de enviar, com mensagem clara, e o
 * Supabase recusa quem tentar subir direto pela API, pulando a tela.
 *
 * De fora, de propósito: HTML e SVG (carregam código e abririam no domínio do
 * Storage), executáveis, compactados (.zip escondem qualquer coisa) e o genérico
 * application/octet-stream (é o tipo que um .exe renomeado recebe).
 */
export const TIPOS_DE_ARQUIVO_PERMITIDOS = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/rtf",
  "text/rtf",
  "text/plain",
  "text/csv",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
] as const;

/** 20 MB — o mesmo teto que o chat já mostrava. */
export const TAMANHO_MAXIMO_DE_ARQUIVO = 20 * 1024 * 1024;

/** null se pode enviar; senão, a frase para a pessoa. */
export function problemaNoArquivo(arquivo: { type: string; size: number }): string | null {
  if (arquivo.size > TAMANHO_MAXIMO_DE_ARQUIVO) return "Arquivo muito grande (máximo 20 MB).";
  const tipo = arquivo.type.split(";")[0].trim().toLowerCase();
  if (!(TIPOS_DE_ARQUIVO_PERMITIDOS as readonly string[]).includes(tipo)) {
    return "Tipo de arquivo não aceito. Envie PDF, imagem (JPG, PNG), documento do Word/Excel/PowerPoint, texto ou áudio.";
  }
  return null;
}
