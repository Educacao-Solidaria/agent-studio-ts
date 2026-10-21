import { Chart, type ChartConfiguration } from "chart.js";
import { describe, expect, it } from "vitest";
import { fakeCanvas2d } from "../test/canvas.ts";
import { mountChart } from "./chart-kit.ts";
import { loadChartKit } from "./use-chart.tsx";

const line = (data: number[], options = {}): ChartConfiguration => ({
  ...{ type: "line", options },
  data: { labels: data.map(String), datasets: [{ data }] },
});

describe("chart-kit", () => {
  it("registra só as peças dos gráficos de linha e de pizza", () => {
    expect(Chart.registry.getController("line")).toBeDefined();
    expect(Chart.registry.getController("pie")).toBeDefined();
    expect(Chart.registry.getElement("arc")).toBeDefined();
    // `doughnut` entra junto: o Chart.js registra a classe-mãe do `PieController` (mesmo código).
    for (const type of ["bar", "radar", "polarArea", "scatter"]) {
      expect(() => Chart.registry.getController(type)).toThrow(/not a registered/);
    }
    expect(() => Chart.registry.getScale("time")).toThrow(/not a registered/);
  });

  it("atualiza o MESMO gráfico: a série guarda a identidade e as opções trocam", () => {
    fakeCanvas2d();
    const canvas = document.createElement("canvas");
    const handle = mountChart(canvas, line([1, 2]));
    const chart = Chart.getChart(canvas);
    const series = chart?.getDatasetMeta(0); // série nova = pontos redesenhados do zero
    handle.update(line([1, 2, 3], { animation: false }));
    expect(chart?.getDatasetMeta(0)).toBe(series);
    expect([chart?.data.datasets[0]?.data, chart?.options.animation]).toEqual([[1, 2, 3], false]);
    handle.destroy();
    expect(Chart.getChart(canvas)).toBeUndefined();
  });

  it("sem canvas 2D o carregamento falha, em vez de um gráfico morto", async () => {
    await expect(loadChartKit()).rejects.toThrow("canvas 2D"); // o jsdom não tem contexto 2D
  });
});
