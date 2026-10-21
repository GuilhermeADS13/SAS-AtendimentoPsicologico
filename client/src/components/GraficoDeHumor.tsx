import { useEffect, useRef, useState } from "react";
import { formatarData } from "@shared/datas";
import { faixasDeFase, rotuloDaFase, type Fase } from "@shared/evolucao";

export type PontoDeHumor = { numero: number; moodScore: number | null; startedAt: Date | string; fase: Fase | null };

const ALTURA = 220;
const MARGEM = { topo: 26, direita: 14, baixo: 30, esquerda: 30 };

/**
 * Humor (0–10) ao longo das sessões, com as fases do tratamento como faixas de
 * fundo ROTULADAS. A fase vai por texto, não por cor: com quatro fases nenhuma
 * paleta passa no teste de daltonismo (validado), e uma série só não precisa de
 * cor para ser lida. Sem biblioteca de gráfico: SVG medido no próprio container,
 * para o texto não esticar.
 */
export function GraficoDeHumor({ pontos }: { pontos: readonly PontoDeHumor[] }) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(600);
  const [foco, setFoco] = useState<number | null>(null);

  useEffect(() => {
    const el = caixaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => setLargura(Math.max(260, Math.round(el.getBoundingClientRect().width) - 2)) /* - borda */);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const ordenados = [...pontos].sort((a, b) => a.numero - b.numero);
  const comNota = ordenados.filter((p): p is PontoDeHumor & { moodScore: number } => p.moodScore !== null);
  if (ordenados.length === 0) return null;

  const primeiro = ordenados[0].numero;
  const ultimo = ordenados[ordenados.length - 1].numero;
  const areaL = largura - MARGEM.esquerda - MARGEM.direita;
  const areaA = ALTURA - MARGEM.topo - MARGEM.baixo;
  // Meia sessão de folga nas pontas, para as faixas de fase terem largura.
  const x = (n: number) => MARGEM.esquerda + ((n - primeiro + 0.5) / (ultimo - primeiro + 1)) * areaL;
  const y = (v: number) => MARGEM.topo + (1 - v / 10) * areaA;
  const faixas = faixasDeFase(ordenados);
  const linha = comNota.map((p, i) => `${i ? "L" : "M"}${x(p.numero).toFixed(1)},${y(p.moodScore).toFixed(1)}`).join(" ");
  // Rótulos do eixo X: no celular, só alguns números de sessão.
  const passo = Math.max(1, Math.ceil(ordenados.length / Math.max(2, Math.floor(areaL / 44))));
  const focado = comNota.find((p) => p.numero === foco) ?? null;

  return (
    <div ref={caixaRef} className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Humor ao longo das sessões</h3>
        <p className="text-xs text-muted-foreground">0 = muito mal · 10 = muito bem</p>
      </div>

      {comNota.length < 2 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {comNota.length === 0
            ? "Dê uma nota de humor às sessões (em \"Classificar\", no cartão) para ver o gráfico."
            : "Falta pouco: com a nota de humor em 2 sessões, o gráfico aparece aqui."}
        </p>
      ) : (
        <div className="relative rounded-lg border border-border bg-card">
          <svg
            width={largura}
            height={ALTURA}
            viewBox={`0 0 ${largura} ${ALTURA}`}
            role="img"
            aria-label={`Humor em ${comNota.length} sessões: começou em ${comNota[0].moodScore} e está em ${comNota[comNota.length - 1].moodScore} na última.`}
            className="block max-w-full"
          >
            {/* Faixas de fase, alternando o tom, com o nome escrito. */}
            {faixas.map((f, i) => {
              const x0 = x(f.de - 0.5);
              const x1 = x(f.ate + 0.5);
              return (
                <g key={`${f.fase}-${f.de}`}>
                  <rect x={x0} y={MARGEM.topo} width={x1 - x0} height={areaA} className={i % 2 ? "fill-transparent" : "fill-muted/70"} />
                  {/* Troca de fase: linha tracejada (só o tom de fundo era sutil demais). */}
                  {i > 0 && (
                    <line x1={x0} x2={x0} y1={MARGEM.topo - 4} y2={MARGEM.topo + areaA} className="stroke-muted-foreground/50" strokeDasharray="4 3" strokeWidth={1} />
                  )}
                  {x1 - x0 > 56 && (
                    <text x={x0 + 6} y={MARGEM.topo - 8} className="fill-muted-foreground text-[11px] font-medium">
                      {rotuloDaFase(f.fase)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Grade recessiva em 0, 5 e 10. */}
            {[0, 5, 10].map((v) => (
              <g key={v}>
                <line x1={MARGEM.esquerda} x2={largura - MARGEM.direita} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} />
                <text x={MARGEM.esquerda - 8} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                  {v}
                </text>
              </g>
            ))}

            {/* Número da sessão no eixo X. */}
            {ordenados
              .filter((_, i) => i % passo === 0 || i === ordenados.length - 1)
              .map((p) => (
                <text key={p.numero} x={x(p.numero)} y={ALTURA - 10} textAnchor="middle" className="fill-muted-foreground text-[11px] tabular-nums">
                  {p.numero}
                </text>
              ))}

            <path d={linha} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            {comNota.map((p) => (
              <g key={p.numero}>
                {/* Ponto com anel da cor do fundo, para não se fundir com a linha. */}
                <circle cx={x(p.numero)} cy={y(p.moodScore)} r={foco === p.numero ? 6 : 4.5} className="fill-primary stroke-card" strokeWidth={2} />
                {/* Alvo de toque maior que o ponto. */}
                <circle
                  cx={x(p.numero)}
                  cy={y(p.moodScore)}
                  r={14}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`Sessão ${p.numero}, ${formatarData(p.startedAt)}: humor ${p.moodScore}`}
                  onMouseEnter={() => setFoco(p.numero)}
                  onMouseLeave={() => setFoco(null)}
                  onFocus={() => setFoco(p.numero)}
                  onBlur={() => setFoco(null)}
                  onClick={() => setFoco(p.numero)}
                  className="cursor-pointer outline-none"
                />
              </g>
            ))}
          </svg>

          {focado && (
            <div
              role="status"
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
              style={{
                left: Math.min(Math.max(x(focado.numero), 70), largura - 70),
                top: y(focado.moodScore) - 10,
              }}
            >
              <p className="font-semibold">Sessão {focado.numero} · {formatarData(focado.startedAt)}</p>
              <p className="tabular-nums">Humor {focado.moodScore}/10</p>
              {focado.fase && <p className="text-muted-foreground">{rotuloDaFase(focado.fase)}</p>}
            </div>
          )}

          {/* A mesma informação em tabela, para leitor de tela. */}
          <table className="sr-only">
            <caption>Humor por sessão</caption>
            <thead>
              <tr>
                <th>Sessão</th>
                <th>Data</th>
                <th>Humor</th>
                <th>Fase</th>
              </tr>
            </thead>
            <tbody>
              {comNota.map((p) => (
                <tr key={p.numero}>
                  <td>{p.numero}</td>
                  <td>{formatarData(p.startedAt)}</td>
                  <td>{p.moodScore}</td>
                  <td>{rotuloDaFase(p.fase) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
