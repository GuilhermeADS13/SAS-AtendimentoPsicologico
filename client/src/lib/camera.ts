/**
 * Constraints da câmera na videochamada (lobby e sala).
 *
 * Com `video: true` o navegador abre a câmera no padrão dele — no Chrome,
 * 640×480 —, e o rosto chegava borrado mesmo com rede boa. Pedimos 720p a 30
 * quadros como IDEAL (não `exact`/`min`): câmera que não chega lá entrega o
 * máximo que tem, em vez de falhar o getUserMedia.
 */
export function videoDaCamera(deviceId?: string): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  };
}
