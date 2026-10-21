import type { ChartConfiguration } from "chart.js";
import { useMemo } from "react";
import { cn } from "../lib/cn.ts";
import { formatNumber } from "../lib/format.ts";
import type { ChartLook } from "./chart-kit.ts";
import type { PerfSample } from "./perf-samples.ts";
import { ChartCanvas, type ChartKit, useChartKit, useChartLook } from "./use-chart.tsx";

export type Slice = { name: string; count: number; percent: number };

/**
 * Hit × miss das respostas com dado de cache (`cached` do `metadata`); as sem `metadata` não
 * entram. Porcentagem inteira, e a de miss é o que falta para 100 (arredondar as duas pode dar
 * 101%). Nenhuma resposta com o dado = `undefined`: estado vazio, nada de 0/0.
 */
export function cacheSlices(samples: readonly PerfSample[]): [Slice, Slice] | undefined {
  const hits = samples.filter((sample) => sample.cached === true).length;
  const misses = samples.filter((sample) => sample.cached === false).length;
  if (!hits && !misses) return undefined;
  const share = Math.round((hits / (hits + misses)) * 100);
  return [
    { name: "Hit (cache)", count: hits, percent: share },
    { name: "Miss (modelo)", count: misses, percent: 100 - share },
  ];
}

const plural = (count: number) => (count === 1 ? "resposta" : "respostas");
const percent = (slice: Slice) => formatNumber(slice.percent / 100, { style: "percent" });
const describe = (slice: Slice) => `${percent(slice)} · ${slice.count} ${plural(slice.count)}`;

/** A pizza no tema atual; sem animação com `prefers-reduced-motion`. */
export function pieConfig(slices: [Slice, Slice], look: ChartLook): ChartConfiguration<"pie"> {
  // Hover com as mesmas cores: o Chart.js clareia a fatia sozinho, mas não entende oklch.
  const fill = {
    backgroundColor: [look.success, look.text],
    hoverBackgroundColor: [look.success, look.text],
  };
  const edge = { borderColor: look.background, hoverBorderColor: look.background };
  return {
    type: "pie",
    data: {
      labels: slices.map((slice) => slice.name),
      datasets: [{ data: slices.map((slice) => slice.count), ...fill, ...edge }],
    },
    options: {
      animation: look.reducedMotion ? false : { duration: 300 },
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: { label: (item) => describe(slices[item.dataIndex] ?? slices[0]) },
        },
      },
    },
  };
}

const SWATCHES = ["bg-success", "bg-muted-foreground"];
export type CachePieProps = { samples: readonly PerfSample[]; load?: () => Promise<ChartKit> };

/**
 * Quanto das respostas o cache semântico serviu sem chamar o modelo. A cor nunca vai sozinha: a
 * legenda diz nome, porcentagem e contagem de cada fatia (e fica mesmo se o gráfico não carregar).
 */
export function CachePie({ samples, load }: CachePieProps) {
  const slices = useMemo(() => cacheSlices(samples), [samples]);
  const { kit, failed } = useChartKit(load, slices !== undefined);
  const look = useChartLook();
  const config = useMemo(() => slices && pieConfig(slices, look), [slices, look]);
  if (!slices || !config) {
    return <p className="text-muted-foreground text-sm">Sem respostas com dado de cache ainda.</p>;
  }
  const [hit, miss] = slices;
  const label = `${percent(hit)} das respostas vieram do cache (${hit.count} de ${hit.count + miss.count})`;
  return (
    <figure className="grid gap-2 text-sm">
      <figcaption className="font-medium">Cache semântico: hit × miss</figcaption>
      {failed ? (
        <p role="alert" className="text-danger">
          Não foi possível carregar o gráfico. Os números estão na legenda.
        </p>
      ) : (
        <ChartCanvas kit={kit} config={config} label={label} />
      )}
      <ul className="grid gap-1">
        {slices.map((slice, i) => (
          <li key={slice.name} className="flex items-center gap-2">
            <span aria-hidden="true" className={cn("size-3 rounded-sm", SWATCHES[i])} />
            {slice.name}: {describe(slice)}
          </li>
        ))}
      </ul>
    </figure>
  );
}
