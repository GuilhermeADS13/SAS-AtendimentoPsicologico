import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Video, VideoOff, Mic, MicOff, Loader2, AlertCircle, Volume2 } from "lucide-react";

const LS = { mic: "sas-video-mic", cam: "sas-video-cam", spk: "sas-video-spk" };
const readLS = (k: string) => {
  try {
    return localStorage.getItem(k) || "";
  } catch {
    return "";
  }
};
const writeLS = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

/**
 * Tela de preparação antes de entrar na videochamada: escolher e testar
 * microfone, câmera e alto-falante (com preview, medidor de nível do microfone e
 * teste de som). Ao entrar, o stream do preview é liberado — o Daily/MiroTalk
 * pede o seu próprio dentro do iframe. Serve também de sala de espera leve.
 */
export default function VideoCallLobby({
  title,
  subtitle,
  onJoin,
}: {
  title: string;
  subtitle?: string;
  onJoin: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  const [status, setStatus] = useState<"loading" | "ok" | "denied">("loading");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState<string>(() => readLS(LS.mic));
  const [camId, setCamId] = useState<string>(() => readLS(LS.cam));
  const [spkId, setSpkId] = useState<string>(() => readLS(LS.spk));
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [level, setLevel] = useState(0);

  const stopMeter = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  };

  const startMeter = (stream: MediaStream) => {
    stopMeter();
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
        setLevel(avg);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* sem medidor */
    }
  };

  const start = useCallback(
    async (mic: string, cam: string) => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: cam ? { deviceId: { exact: cam } } : true,
          audio: mic ? { deviceId: { exact: mic } } : true,
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        const vt = stream.getVideoTracks()[0];
        if (vt) vt.enabled = camOn;
        const at = stream.getAudioTracks()[0];
        if (at) at.enabled = micOn;
        startMeter(stream);
        setDevices(await navigator.mediaDevices.enumerateDevices());
        setStatus("ok");
      } catch {
        setStatus("denied");
      }
    },
    [camOn, micOn],
  );

  useEffect(() => {
    start(micId, camId);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      stopMeter();
    };
    // só na montagem; trocas de dispositivo chamam start() manualmente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeMic = (id: string) => {
    setMicId(id);
    writeLS(LS.mic, id);
    start(id, camId);
  };
  const changeCam = (id: string) => {
    setCamId(id);
    writeLS(LS.cam, id);
    start(micId, id);
  };
  const changeSpk = (id: string) => {
    setSpkId(id);
    writeLS(LS.spk, id);
  };

  const toggleMic = () => {
    const t = streamRef.current?.getAudioTracks()[0];
    if (t) {
      t.enabled = !t.enabled;
      setMicOn(t.enabled);
    }
  };
  const toggleCam = () => {
    const t = streamRef.current?.getVideoTracks()[0];
    if (t) {
      t.enabled = !t.enabled;
      setCamOn(t.enabled);
    }
  };

  const testSpeaker = async () => {
    try {
      const ctx = new AudioContext();
      await (ctx as unknown as { setSinkId?: (id: string) => Promise<void> })
        .setSinkId?.(spkId)
        .catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.08;
      osc.frequency.value = 440;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close().catch(() => {});
      }, 450);
    } catch {
      /* ignore */
    }
  };

  const enter = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    stopMeter();
    onJoin();
  };

  const mics = devices.filter((d) => d.kind === "audioinput" && d.deviceId);
  const cams = devices.filter((d) => d.kind === "videoinput" && d.deviceId);
  const spks = devices.filter((d) => d.kind === "audiooutput" && d.deviceId);
  const nome = (d: MediaDeviceInfo, i: number, pref: string) => d.label || `${pref} ${i + 1}`;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 py-4 sm:py-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      </div>

      <Card className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {status === "denied" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-white">
            <AlertCircle className="h-6 w-6" />
            Não foi possível acessar câmera/microfone. Verifique as permissões do navegador — você ainda pode entrar.
          </div>
        )}
        {status === "ok" && !camOn && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <VideoOff className="h-8 w-8 opacity-80" />
          </div>
        )}
      </Card>

      {/* Liga/desliga rápido */}
      <div className="flex items-center justify-center gap-2">
        <Button variant={micOn ? "outline" : "destructive"} size="icon" onClick={toggleMic} disabled={status !== "ok"} title="Microfone" aria-label="Alternar microfone">
          {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </Button>
        <Button variant={camOn ? "outline" : "destructive"} size="icon" onClick={toggleCam} disabled={status !== "ok"} title="Câmera" aria-label="Alternar câmera">
          {camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
        </Button>
      </div>

      {/* Seleção de dispositivos */}
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        {/* Microfone + medidor de nível */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs"><Mic className="h-3.5 w-3.5" /> Microfone</Label>
          <Select value={micId || (mics[0]?.deviceId ?? "")} onValueChange={changeMic} disabled={mics.length === 0}>
            <SelectTrigger aria-label="Selecionar microfone"><SelectValue placeholder="Microfone padrão" /></SelectTrigger>
            <SelectContent>
              {mics.map((d, i) => <SelectItem key={d.deviceId} value={d.deviceId}>{nome(d, i, "Microfone")}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="h-1.5 w-full overflow-hidden rounded bg-muted" aria-label="Nível do microfone">
            <div className="h-full rounded bg-green-500 transition-[width] duration-75" style={{ width: `${Math.min(100, Math.round(level * 160))}%` }} />
          </div>
          <p className="text-[11px] text-muted-foreground">Fale algo — a barra deve se mexer.</p>
        </div>

        {/* Câmera */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs"><Video className="h-3.5 w-3.5" /> Câmera</Label>
          <Select value={camId || (cams[0]?.deviceId ?? "")} onValueChange={changeCam} disabled={cams.length === 0}>
            <SelectTrigger aria-label="Selecionar câmera"><SelectValue placeholder="Câmera padrão" /></SelectTrigger>
            <SelectContent>
              {cams.map((d, i) => <SelectItem key={d.deviceId} value={d.deviceId}>{nome(d, i, "Câmera")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Alto-falante (quando o navegador permite escolher a saída) */}
        {spks.length > 0 && (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs"><Volume2 className="h-3.5 w-3.5" /> Alto-falante (áudio)</Label>
            <div className="flex gap-2">
              <Select value={spkId || (spks[0]?.deviceId ?? "")} onValueChange={changeSpk}>
                <SelectTrigger aria-label="Selecionar alto-falante"><SelectValue placeholder="Saída padrão" /></SelectTrigger>
                <SelectContent>
                  {spks.map((d, i) => <SelectItem key={d.deviceId} value={d.deviceId}>{nome(d, i, "Saída")}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={testSpeaker} className="shrink-0">Testar som</Button>
            </div>
          </div>
        )}
      </div>

      <Button size="lg" className="w-full" onClick={enter}>
        Entrar na chamada
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Dentro da chamada você também pode trocar câmera/microfone nas configurações.
      </p>
    </div>
  );
}
