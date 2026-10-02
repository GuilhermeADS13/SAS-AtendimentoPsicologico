/**
 * Posse de arquivos no bucket privado `documents`.
 *
 * O upload é feito pelo navegador, e a RLS do bucket só deixa cada pessoa gravar
 * na própria pasta (`<uid do Supabase>/...`). Mas o servidor LÊ com a service role,
 * que fura a RLS. Então todo `fileKey` que chega do cliente e depois é baixado ou
 * assinado pelo servidor precisa ser conferido aqui — senão bastava mandar o
 * caminho de um arquivo de outra pessoa para o servidor entregá-lo (IDOR).
 */

/** uid do Supabase a partir do openId (`sb:<uuid>`); null para contas de outra origem. */
export function uidSupabase(openId: string | null | undefined): string | null {
  if (!openId?.startsWith("sb:")) return null;
  const uid = openId.slice(3).trim();
  return uid || null;
}

/**
 * O arquivo está na pasta `<uid>/<subpasta>/` de quem é dono do `openId`?
 * Exige exatamente um nome de arquivo depois da subpasta e recusa segmento `.`/`..`,
 * barra dupla, barra invertida ou caminho começando com barra.
 */
export function chavePertenceAoUsuario(
  fileKey: string | null | undefined,
  openId: string | null | undefined,
  subpasta: string,
): boolean {
  const uid = uidSupabase(openId);
  if (!uid || !fileKey || !subpasta) return false;
  if (fileKey.includes("\\")) return false;
  // Exatamente três segmentos: <uid>/<subpasta>/<arquivo>. Um nome como
  // "laudo..final.pdf" é legítimo (o upload só troca caracteres fora de [\w.-]);
  // o que se recusa é SEGMENTO "." ou "..", vazio, ou barra a mais.
  const segmentos = fileKey.split("/");
  if (segmentos.length !== 3) return false;
  const [dono, pasta, nome] = segmentos;
  if (dono !== uid || pasta !== subpasta) return false;
  return nome.length > 0 && nome !== "." && nome !== "..";
}
