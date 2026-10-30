/**
 * O relógio da videochamada: conta para TRÁS a partir da duração da consulta e,
 * no zero, marca que o tempo acabou. Sem duração cadastrada, não há para onde
 * contar, então mostra o tempo decorrido.
 */
export function tempoDaSessao(decorridoSeg: number, duracaoMin: number | null | undefined): { texto: string; esgotado: boolean } {
  const total = duracaoMin && duracaoMin > 0 ? duracaoMin * 60 : null;
  const segundos = total === null ? decorridoSeg : Math.max(0, total - decorridoSeg);
  const texto = `${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(segundos % 60).padStart(2, "0")}`;
  return { texto, esgotado: total !== null && decorridoSeg >= total };
}
