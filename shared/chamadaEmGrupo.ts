/**
 * Chamada em grupo (terapia de casal; pais separados + criança).
 *
 * A chamada é em MALHA: cada pessoa se conecta direto com cada uma das outras,
 * sem servidor de mídia (custo zero; o vídeo nunca passa pelo servidor). O
 * preço é que cada um envia o próprio vídeo para N-1 pessoas — por isso o teto
 * de 4 (a psicóloga + 3), que a internet de casa aguenta.
 */

/** Pessoas na mesma sala, contando a psicóloga. */
export const MAX_PESSOAS_NA_CHAMADA = 4;
/** Pacientes além do principal: 4 - psicóloga - paciente principal. */
export const MAX_PARTICIPANTES_EXTRAS = MAX_PESSOAS_NA_CHAMADA - 2;

/**
 * Por que NÃO dá para adicionar este paciente como participante (null = pode).
 * `extras` = quantos participantes extras a consulta já tem.
 */
export function motivoParaRecusarParticipante(p: { ehPrincipal: boolean; jaParticipa: boolean; extras: number }): string | null {
  if (p.ehPrincipal) return "Este paciente já é o paciente principal da consulta.";
  if (p.jaParticipa) return "Este paciente já participa desta consulta.";
  if (p.extras >= MAX_PARTICIPANTES_EXTRAS) {
    return `A chamada aceita até ${MAX_PESSOAS_NA_CHAMADA} pessoas: você e mais ${MAX_PESSOAS_NA_CHAMADA - 1}.`;
  }
  return null;
}

/** Teto de envio de vídeo da câmera numa chamada a dois (ver WebRTCCall). */
export const TETO_VIDEO_BPS = 2_500_000;
/** Abaixo disso o vídeo fica ruim demais; melhor reduzir a resolução. */
const PISO_VIDEO_BPS = 450_000;

/**
 * Teto de envio da câmera PARA CADA pessoa, quando a chamada tem `pessoas`.
 *
 * Ideia do Discord (simulcast_rate_allocator / send_side_bandwidth_estimation,
 * vistos no binário dele): a banda de envio é UMA e é repartida. Na malha, a
 * mesma câmera vai para N-1 pessoas; sem dividir, 3 envios de 2,5 Mbps (7,5
 * Mbps de subida) derrubam a internet de casa e a chamada inteira trava.
 */
export function tetoDeVideoPorPessoa(pessoas: number): number {
  const destinos = Math.max(1, pessoas - 1);
  return Math.max(PISO_VIDEO_BPS, Math.round(TETO_VIDEO_BPS / destinos));
}

/**
 * Quanto reduzir a resolução enviada (scaleResolutionDownBy). Com a banda
 * repartida, mandar 720p para 3 pessoas só gera blocos; 1,5x (≈480p) com 3
 * destinos fica nítido no quadro menor da grade.
 */
export function reducaoDeResolucao(pessoas: number): number {
  return pessoas >= 4 ? 1.5 : 1;
}
