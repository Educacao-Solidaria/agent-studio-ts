import {
  ArcElement,
  CategoryScale,
  Chart,
  type ChartConfiguration,
  LinearScale,
  LineController,
  LineElement,
  PieController,
  PointElement,
  Tooltip,
} from "chart.js";

// Só as peças que os gráficos usam: o resto do Chart.js fica fora do pedaço (tree-shaking).
Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip);
Chart.register(PieController, ArcElement);

export type ChartHandle = { update: (config: ChartConfiguration) => void; destroy: () => void };
/** O visual do tema que o canvas não lê do CSS: cores (tokens crus) e `prefers-reduced-motion`. */
export type ChartLook = { reducedMotion: boolean } & Record<
  "line" | "text" | "grid" | "success" | "background",
  string
>;

/** Desenha `config` no canvas (o `loadChartKit` já conferiu que há canvas 2D). */
export function mountChart(canvas: HTMLCanvasElement, config: ChartConfiguration): ChartHandle {
  const chart = new Chart(canvas, config);
  return {
    update(next) {
      // Os MESMOS objetos de série (o Chart.js casa a série pela identidade): os pontos andam do
      // valor anterior em vez de o gráfico ser redesenhado do zero a cada resposta.
      const { data } = chart;
      data.labels = next.data.labels;
      data.datasets = next.data.datasets.map((set, i) =>
        Object.assign(data.datasets[i] ?? {}, set),
      );
      chart.options = next.options ?? {};
      chart.update();
    },
    destroy: () => chart.destroy(),
  };
}
