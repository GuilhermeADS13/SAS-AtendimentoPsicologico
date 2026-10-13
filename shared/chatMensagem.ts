import { idDoGif } from "./gif";

/**
 * Editar e apagar para todos, com os prazos do WhatsApp. Valem só para as
 * PRÓPRIAS mensagens. A regra mora aqui para o servidor (que é quem garante) e a
 * tela (que só mostra a opção quando ela vale) nunca discordarem.
 */
export const PRAZO_PARA_EDITAR_MS = 15 * 60_000;
export const PRAZO_PARA_APAGAR_MS = 2 * 24 * 60 * 60_000;

type Mensagem = {
  senderUserId: number;
  content: string | null;
  fileKey: string | null;
  createdAt: Date | string;
  deletedAt: Date | string | null;
};

const idade = (m: Mensagem, agora: Date) => agora.getTime() - new Date(m.createdAt).getTime();

/** Editar: só texto (anexo e GIF não têm o que editar), até 15 minutos. */
export function podeEditar(m: Mensagem, usuarioId: number, agora = new Date()): boolean {
  return (
    m.senderUserId === usuarioId &&
    !m.deletedAt &&
    !m.fileKey &&
    !!m.content &&
    !idDoGif(m.content) &&
    idade(m, agora) <= PRAZO_PARA_EDITAR_MS
  );
}

/** Apagar para todos: qualquer mensagem própria, até 2 dias. */
export function podeApagar(m: Mensagem, usuarioId: number, agora = new Date()): boolean {
  return m.senderUserId === usuarioId && !m.deletedAt && idade(m, agora) <= PRAZO_PARA_APAGAR_MS;
}
