import { useEffect, useRef, type ReactNode } from "react";

/**
 * Profundidade "3D" sem biblioteca: a Luma inclina seguindo o ponteiro em todo o
 * cartão onde está (a <section> mais próxima) e flutua de leve. Duas camadas de
 * propósito — a flutuação anima `transform` e a inclinação também; no mesmo
 * elemento uma apagaria a outra. Com "reduzir movimento" ligado, fica parada.
 * (WebGL de verdade pediria o three.js, ~600 KB, e um modelo 3D da coruja que
 * não existe — decisão de 2026-10-27.)
 */
export function LumaFlutuante({ children }: { children: ReactNode }) {
  const inclina = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = inclina.current;
    const area = el?.closest("section");
    if (!el || !area) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const mover = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      // Distância do centro da coruja, limitada: o cartão é largo e a inclinação não pode exagerar.
      const x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 2)));
      const y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height * 2)));
      el.style.setProperty("--ry", `${(x * 22).toFixed(1)}deg`);
      el.style.setProperty("--rx", `${(-y * 22).toFixed(1)}deg`);
    };
    const soltar = () => {
      el.style.setProperty("--ry", "0deg");
      el.style.setProperty("--rx", "0deg");
    };
    area.addEventListener("pointermove", mover);
    area.addEventListener("pointerleave", soltar);
    return () => {
      area.removeEventListener("pointermove", mover);
      area.removeEventListener("pointerleave", soltar);
    };
  }, []);
  return (
    <div className="[perspective:700px] motion-safe:animate-[luma-flutuar_6s_ease-in-out_infinite]">
      <div
        ref={inclina}
        className="transition-transform duration-300 ease-out drop-shadow-[0_12px_14px_rgba(0,0,0,0.28)] [transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))]"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * A Luma "cresce" junto com o plano (tema VozInterior: a voz que ganha força).
 *
 * - Sussurro: uma corujinha com uma onda pequena, quase um sussurro.
 * - Voz: a coruja com três ondas — falando com firmeza.
 * - Coro: três corujas juntas, a clínica inteira.
 *
 * A coruja é o mesmo PNG da Luma (/luma-owl.png). O rosto dele é TRANSPARENTE,
 * então ela vai sempre num medalhão branco — sobre o cartão verde, sem o
 * medalhão, o rosto ficaria verde. As ondas usam `currentColor`: brancas no
 * cartão verde, verdes nos cartões claros.
 */
export function LumaDoPlano({
  plano,
  className = "h-20 w-28",
  titulo,
}: {
  plano: string;
  className?: string;
  /** Texto para leitor de tela; sem ele a imagem é decorativa. */
  titulo?: string;
}) {
  const decorativa = !titulo;
  return (
    <svg
      viewBox="0 0 160 120"
      className={`shrink-0 overflow-visible ${className}`}
      role={decorativa ? undefined : "img"}
      aria-hidden={decorativa ? true : undefined}
      aria-label={titulo}
    >
      {plano === "unlimited" ? <Coro /> : plano === "max" ? <Voz /> : <Sussurro />}
    </svg>
  );
}

/** Medalhão branco + a coruja da Luma, centrado em (cx, cy) com raio r. */
function Coruja({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const lado = r * 1.5;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="white" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={1.5} />
      <image href="/luma-owl.png" x={cx - lado / 2} y={cy - lado / 2 + r * 0.04} width={lado} height={lado} />
    </g>
  );
}

/** Arcos de som saindo para a direita, de (x, y). */
function Ondas({ x, y, quantas, abertura }: { x: number; y: number; quantas: number; abertura: number }) {
  return (
    <g fill="none" stroke="currentColor" strokeLinecap="round">
      {Array.from({ length: quantas }, (_, i) => {
        const raio = 12 + i * 13;
        const meio = (abertura * Math.PI) / 180 / 2;
        const x1 = x + raio * Math.cos(-meio);
        const y1 = y + raio * Math.sin(-meio);
        const x2 = x + raio * Math.cos(meio);
        const y2 = y + raio * Math.sin(meio);
        return (
          <path
            key={i}
            d={`M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${raio} ${raio} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`}
            strokeWidth={6 - i * 0.9}
            strokeOpacity={1 - i * 0.2}
          />
        );
      })}
    </g>
  );
}

function Sussurro() {
  return (
    <g>
      <Coruja cx={62} cy={64} r={36} />
      {/* Uma onda só, pequena e fraca: um sussurro. */}
      <g opacity={0.7}>
        <Ondas x={98} y={64} quantas={1} abertura={70} />
      </g>
      <circle cx={126} cy={50} r={3.5} fill="currentColor" opacity={0.5} />
      <circle cx={135} cy={40} r={2.6} fill="currentColor" opacity={0.35} />
    </g>
  );
}

function Voz() {
  return (
    <g>
      <Coruja cx={56} cy={60} r={42} />
      {/* Três ondas abertas: a voz firme. */}
      <Ondas x={98} y={60} quantas={3} abertura={95} />
    </g>
  );
}

function Coro() {
  return (
    <g>
      {/* Duas atrás, uma na frente: muitas vozes juntas. */}
      <Coruja cx={34} cy={72} r={27} />
      <Coruja cx={126} cy={72} r={27} />
      <Coruja cx={80} cy={58} r={38} />
      <g opacity={0.8}>
        <path d="M 64 14 q 16 -11 32 0" fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" />
        <path d="M 54 5 q 26 -16 52 0" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeOpacity={0.6} />
      </g>
    </g>
  );
}
