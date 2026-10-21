import type { ChartConfiguration } from "chart.js";
import { useId, useMemo, useState } from "react";
import { Button } from "../components/ui/button.tsx";
import { formatNumber } from "../lib/format.ts";
import type { ChartLook } from "./chart-kit.ts";
import type { PerfSample } from "./perf-samples.ts";
import { ChartCanvas, type ChartKit, useChartKit, useChartLook } from "./use-chart.tsx";

/** Quantas respostas os gráficos mostram (as mais recentes). */
export const PERF_WINDOW = 30;

type Format = (value: number) => string;
const time = new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium" });
const formatMs: Format = (value) =>
  formatNumber(value, { style: "unit", unit: "millisecond", maximumFractionDigits: 0 });
const formatRate: Format = (value) => formatNumber(value, { maximumFractionDigits: 1 });

/** Uma série no tempo com as cores do tema; sem animação com `prefers-reduced-motion`. */
export function lineConfig(
  labels: string[],
  values: (number | undefined)[],
  look: ChartLook,
  format: Format,
): ChartConfiguration<"line"> {
  const ticks = { color: look.text };
  const grid = { color: look.grid };
  // Cor de hover explícita: o Chart.js clareia a cor da série sozinho, mas não entende oklch.
  const color = { borderColor: look.line, backgroundColor: look.line };
  const hover = { pointHoverBorderColor: look.line, pointHoverBackgroundColor: look.line };
  return {
    type: "line",
    // Resposta sem medida vira buraco na linha, não zero.
    data: { labels, datasets: [{ data: values.map((v) => v ?? null), ...color, ...hover }] },
    options: {
      animation: look.reducedMotion ? false : { duration: 300 },
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false }, // tooltip da coluna sob o cursor
      scales: {
        x: { grid, ticks: { ...ticks, maxRotation: 0, autoSkipPadding: 16 } },
        y: { grid, beginAtZero: true, ticks: { ...ticks, callback: (v) => format(Number(v)) } },
      },
      plugins: { tooltip: { callbacks: { label: (item) => format(item.parsed.y ?? Number.NaN) } } },
    },
  };
}

export type PerfChartsProps = { samples: readonly PerfSample[]; load?: () => Promise<ChartKit> };

/** TTFT e tokens/s das últimas respostas, um gráfico cada (unidades diferentes não dividem eixo);
 * a tabela com os mesmos dados é a alternativa acessível e aparece sozinha se o gráfico falhar. */
export function PerfCharts({ samples, load }: PerfChartsProps) {
  const { kit, failed } = useChartKit(load);
  const look = useChartLook();
  const [table, setTable] = useState(false);
  const tableId = useId();
  const shown = useMemo(() => samples.slice(-PERF_WINDOW), [samples]);
  const charts = useMemo(() => {
    const labels = shown.map((sample) => time.format(sample.at));
    return [
      { title: "Tempo até o primeiro token", values: shown.map((s) => s.ttftMs), format: formatMs },
      { title: "Tokens por segundo", values: shown.map((s) => s.tps), format: formatRate },
    ].map((chart) => ({ ...chart, config: lineConfig(labels, chart.values, look, chart.format) }));
  }, [shown, look]);

  if (!shown.length) return <p className="text-muted-foreground text-sm">Sem respostas ainda.</p>;
  const label = (title: string) => `${title} nas últimas ${shown.length} respostas`;
  return (
    <section aria-label="Desempenho das últimas respostas" className="grid gap-3 text-sm">
      {failed ? (
        <p role="alert" className="text-danger">
          Não foi possível carregar os gráficos. Os dados estão na tabela abaixo.
        </p>
      ) : (
        <>
          {charts.map(({ title, config }) => (
            <figure key={title} className="grid gap-1">
              <figcaption className="font-medium">{title}</figcaption>
              <ChartCanvas kit={kit} config={config} label={label(title)} />
            </figure>
          ))}
          <Button
            variant="secondary"
            size="sm"
            className="justify-self-start"
            aria-expanded={table}
            aria-controls={tableId}
            onClick={() => setTable(!table)}
          >
            Ver os dados em tabela
          </Button>
        </>
      )}
      <table
        id={tableId}
        hidden={!table && !failed}
        className="text-xs tabular-nums [&_td]:pr-4 [&_th]:pr-4 [&_th]:text-left [&_th]:font-medium"
      >
        <caption className="text-left text-muted-foreground">{label("Dados")}</caption>
        <thead>
          <tr>
            <th scope="col">Hora</th>
            <th scope="col">Modelo</th>
            <th scope="col">Primeiro token</th>
            <th scope="col">Tokens/s</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((sample, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: linha só de texto; a hora pode repetir
            <tr key={i}>
              <td>{time.format(sample.at)}</td>
              <td>{sample.model}</td>
              <td>{formatMs(sample.ttftMs ?? Number.NaN)}</td>
              <td>{`${sample.estimated && sample.tps !== undefined ? "≈ " : ""}${formatRate(sample.tps ?? Number.NaN)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
