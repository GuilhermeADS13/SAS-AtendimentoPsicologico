/**
 * Endereço da sala de videochamada de uma consulta.
 *
 * Vivia duplicado na Agenda e no Dashboard (`roomUrlFor` e `urlDaSala`, idênticos
 * por coincidência). Duas cópias do mesmo formato é o tipo de coisa que diverge
 * em silêncio: bastaria uma mudar para o botão "Entrar" de uma das telas levar a
 * uma sala vazia, sem erro nenhum. Fica num lugar só.
 */

/**
 * Nome da sala = `apt<id>-<roomToken>`. O token aleatório torna o link impossível
 * de adivinhar (o modelo Zoom/Meet); antes era `sala-apt<id>`, sequencial.
 * Consultas antigas sem token caem no formato legado — só a sala nova é segura.
 */
export const nomeDaSala = (appointmentId: number, roomToken: string | null) =>
  roomToken ? `apt${appointmentId}-${roomToken}` : `sala-apt${appointmentId}`;

/**
 * Os ids vão na query (`?apt=&pat=`), que a VideoCallDynamic usa para o auto-save
 * das anotações.
 */
export const urlDaSala = (appointmentId: number, patientId: number, roomToken: string | null) =>
  `/videocall/${nomeDaSala(appointmentId, roomToken)}?apt=${appointmentId}&pat=${patientId}`;
