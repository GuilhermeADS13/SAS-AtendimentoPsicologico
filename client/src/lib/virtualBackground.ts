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

  // `let`: a câmera TROCA de tamanho quando o celular gira (480x640 vira 640x480).
  let w = video.videoWidth || 640;
  let h = video.videoHeight || 480;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const pessoaCanvas = document.createElement("canvas");
  pessoaCanvas.width = w;
  pessoaCanvas.height = h;
  const pessoaCtx = pessoaCanvas.getContext("2d")!;

  // Canvas da máscara, no tamanho em que ela vem; é esticado para o frame na hora
  // de recortar, então mascara e vídeo não precisam ter o mesmo tamanho.
  const mascaraCanvas = document.createElement("canvas");
  const mascaraCtx = mascaraCanvas.getContext("2d")!;
  let mascaraImg: ImageData | null = null;

  /**
   * Acompanha a mudança de tamanho da câmera.
   *
   * Era fixo, medido uma vez na abertura. Ao girar o celular a câmera devolve o
   * quadro deitado, a máscara vem no tamanho NOVO e os canvas continuavam no
   * antigo — escrever a máscara por índice embaralhava a imagem em faixas
   * horizontais (o "filtro bugado no modo horizontal").
   */
  const ajustarTamanho = () => {
    const nw = video.videoWidth || w;
    const nh = video.videoHeight || h;
    if (nw === w && nh === h) return;
    w = nw;
    h = nh;
    canvas.width = w;
    canvas.height = h;
    pessoaCanvas.width = w;
    pessoaCanvas.height = h;
  };

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
    const mascara = resultado.confidenceMasks?.[0];
    const confianca = mascara?.getAsFloat32Array();
    if (!mascara || !confianca) return;
    ajustarTamanho();

    // A máscara vira o ALPHA de um canvas do tamanho dela.
    const mw = mascara.width;
    const mh = mascara.height;
    if (mascaraCanvas.width !== mw || mascaraCanvas.height !== mh || !mascaraImg) {
      mascaraCanvas.width = mw;
      mascaraCanvas.height = mh;
      mascaraImg = mascaraCtx.createImageData(mw, mh);
    }
    const alpha = mascaraImg.data;
    for (let i = 0; i < confianca.length; i++) {
      alpha[i * 4 + 3] = confianca[i] * 255;
    }
    mascaraCtx.putImageData(mascaraImg, 0, 0);

    // Recorta a pessoa: desenha o quadro e apaga o que a máscara não cobre. O
    // `drawImage` ESTICA a máscara para o tamanho do quadro — por isso os dois
    // podem ter tamanhos diferentes sem embaralhar nada. Também é mais leve que
    // ler o quadro inteiro com getImageData a cada frame, como era antes.
    pessoaCtx.globalCompositeOperation = "source-over";
    pessoaCtx.clearRect(0, 0, w, h);
    pessoaCtx.drawImage(video, 0, 0, w, h);
    pessoaCtx.globalCompositeOperation = "destination-in";
    pessoaCtx.drawImage(mascaraCanvas, 0, 0, w, h);
    pessoaCtx.globalCompositeOperation = "source-over";

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
