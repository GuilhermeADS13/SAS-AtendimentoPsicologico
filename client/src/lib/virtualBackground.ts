import type { ImageSegmenter, ImageSegmenterResult } from "@mediapipe/tasks-vision";

/**
 * Fundo virtual da videochamada: troca o fundo real da pessoa por uma imagem,
 * usando segmentação (MediaPipe Selfie Segmentation) frame a frame num canvas.
 *
 * Roda 100% no navegador (nada no servidor). O WASM e o modelo vêm de CDN e só
 * são baixados quando alguém ATIVA um fundo — então não pesam no bundle nem na
 * chamada de quem não usa. Por processar cada frame, é oferecido só no desktop.
 */

// O WASM tem de casar com a versão do pacote (@mediapipe/tasks-vision).
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
// Modelo "selfie" (pessoa x fundo). É um arquivo à parte, independente da versão.
const MODELO_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

let segmenterPromise: Promise<ImageSegmenter> | null = null;

// Carrega o segmentador uma vez (compartilhado). O @mediapipe/tasks-vision entra
// por import() DINÂMICO: vira um chunk à parte, baixado só quando alguém ativa um
// fundo — assim não pesa no bundle de quem nunca usa. Em falha, zera para permitir
// nova tentativa.
function getSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const vision = await import("@mediapipe/tasks-vision");
      const resolver = await vision.FilesetResolver.forVisionTasks(WASM_URL);
      return vision.ImageSegmenter.createFromOptions(resolver, {
        baseOptions: { modelAssetPath: MODELO_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    })().catch((e) => {
      segmenterPromise = null;
      throw e;
    });
  }
  return segmenterPromise;
}

/** Carrega uma imagem de fundo (URL do /public). */
export function carregarImagemFundo(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Falha ao carregar o fundo ${url}`));
    img.src = url;
  });
}

export type ControleFundo = {
  /** Trilha de vídeo processada (canvas) — vai no lugar da câmera via replaceTrack. */
  readonly trilha: MediaStreamTrack;
  /** Stream do canvas (para mostrar no preview local). */
  readonly stream: MediaStream;
  /** Troca a imagem de fundo em tempo real, sem recriar o pipeline. */
  definirImagem(img: HTMLImageElement): void;
  /** Para o loop e libera a trilha do canvas (NÃO para a câmera de origem). */
  parar(): void;
};

/**
 * Inicia o pipeline de fundo virtual. Recebe a stream da câmera e a imagem
 * inicial, e devolve uma stream de canvas com a pessoa recortada sobre o fundo.
 */
export async function iniciarFundoVirtual(
  camera: MediaStream,
  imagemInicial: HTMLImageElement,
): Promise<ControleFundo> {
  const segmenter = await getSegmenter();

  const video = document.createElement("video");
  video.srcObject = camera;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (!video.videoWidth) {
    await new Promise<void>((res) => {
      video.onloadedmetadata = () => res();
    });
  }

  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Canvas do frame da câmera (lido a cada quadro) e da pessoa recortada.
  const frameCanvas = document.createElement("canvas");
  frameCanvas.width = w;
  frameCanvas.height = h;
  const frameCtx = frameCanvas.getContext("2d", { willReadFrequently: true })!;

  const pessoaCanvas = document.createElement("canvas");
  pessoaCanvas.width = w;
  pessoaCanvas.height = h;
  const pessoaCtx = pessoaCanvas.getContext("2d")!;

  let imagem = imagemInicial;
  let parado = false;
  let ultimo = -1;

  // Desenha o fundo cobrindo o canvas (como object-fit: cover).
  const desenharFundo = (img: HTMLImageElement) => {
    const r = Math.max(w / img.width, h / img.height);
    const iw = img.width * r;
    const ih = img.height * r;
    ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
  };

  const aoSegmentar = (resultado: ImageSegmenterResult) => {
    if (parado) return;
    const mascara = resultado.confidenceMasks?.[0]?.getAsFloat32Array();
    if (!mascara) return;
    // Recorta a pessoa: usa a confiança como canal alpha do frame da câmera.
    frameCtx.drawImage(video, 0, 0, w, h);
    const frame = frameCtx.getImageData(0, 0, w, h);
    const dados = frame.data;
    for (let i = 0; i < mascara.length; i++) {
      dados[i * 4 + 3] = mascara[i] * 255;
    }
    pessoaCtx.putImageData(frame, 0, 0);
    // Compõe: fundo por baixo, pessoa por cima.
    ctx.clearRect(0, 0, w, h);
    desenharFundo(imagem);
    ctx.drawImage(pessoaCanvas, 0, 0);
  };

  const loop = () => {
    if (parado) return;
    const agora = performance.now();
    // ~30fps: não vale segmentar a 60.
    if (video.readyState >= 2 && agora - ultimo >= 33) {
      ultimo = agora;
      segmenter.segmentForVideo(video, agora, aoSegmentar);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const stream = canvas.captureStream(30);
  const trilha = stream.getVideoTracks()[0];

  return {
    trilha,
    stream,
    definirImagem: (img) => {
      imagem = img;
    },
    parar: () => {
      parado = true;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}
