import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chart } from "chart.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setMediaQuery } from "../test/browser-mocks.ts";
import { fakeCanvas2d } from "../test/canvas.ts";
import { PERF_WINDOW, PerfCharts } from "./perf-charts.tsx";
import type { PerfSample } from "./perf-samples.ts";
import { loadChartKit } from "./use-chart.tsx";

const sample = (i: number, extra?: Partial<PerfSample>): PerfSample => ({
  ...{ at: Date.UTC(2026, 9, 21, 15, 0, i), model: "m", ttftMs: 100 + i, tps: 40 + i },
  ...{ estimated: false, ...extra },
});
const samples = (n: number) => Array.from({ length: n }, (_, i) => sample(i));
// O Chart.js de verdade (contexto 2D falso): cada canvas do painel e o gráfico dele.
const charts = () => [...document.querySelectorAll("canvas")].map((c) => Chart.getChart(c));
const mounted = () => waitFor(() => expect(charts().filter(Boolean)).toHaveLength(2));

beforeEach(fakeCanvas2d);
afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.documentElement.style.removeProperty("--primary");
});

describe("PerfCharts", () => {
  it("um gráfico por série, atualizado a cada resposta sem remontar, só com a janela", async () => {
    const { rerender } = render(<PerfCharts samples={[]} />);
    expect(screen.getByText("Sem respostas ainda.")).toBeTruthy(); // e nenhum gráfico
    rerender(<PerfCharts samples={samples(3)} />);
    await mounted();
    const before = charts();
    const gap = sample(99, { ttftMs: undefined, tps: undefined });
    rerender(<PerfCharts samples={[...samples(PERF_WINDOW + 4), gap]} />);
    const [ttft, tps] = charts();
    expect([ttft, tps].map((chart, i) => chart === before[i])).toEqual([true, true]);
    expect(ttft?.data.labels).toHaveLength(PERF_WINDOW);
    expect(ttft?.data.datasets[0]?.data.slice(0, 2)).toEqual([105, 106]);
    expect(tps?.data.datasets[0]?.data.slice(-2)).toEqual([73, null]); // sem medida = buraco, não 0
    screen.getByRole("img", { name: "Tokens por segundo nas últimas 30 respostas" }); // ou lança
  });

  it("relê o visual com o painel aberto: reduced-motion e cores do tema", async () => {
    render(<PerfCharts samples={samples(2)} />);
    await mounted();
    expect(charts()[0]?.options.animation).toMatchObject({ duration: 300 });
    act(() => setMediaQuery("(prefers-reduced-motion: reduce)", true));
    expect(charts().map((chart) => chart?.options.animation)).toEqual([false, false]);
    const color = "oklch(0.68 0.17 265)";
    document.documentElement.style.setProperty("--primary", color);
    document.documentElement.dataset.theme = "dark";
    // Hover com a mesma cor: o Chart.js não sabe clarear oklch sozinho.
    const expected = { borderColor: color, pointHoverBackgroundColor: color };
    await waitFor(() => expect(charts()[1]?.data.datasets[0]).toMatchObject(expected));
  });

  it("tabela com os mesmos dados, aberta pelo botão", async () => {
    const stopped = { estimated: true, ttftMs: undefined, tps: undefined };
    render(
      <PerfCharts samples={[sample(0), sample(1, stopped), sample(2, { estimated: true })]} />,
    );
    const table = screen.getByRole("table", { hidden: true });
    const toggle = screen.getByRole("button", { name: "Ver os dados em tabela" });
    expect([table.hidden, toggle.getAttribute("aria-expanded")]).toEqual([true, "false"]);
    await userEvent.click(toggle);
    expect([table.hidden, toggle.getAttribute("aria-expanded")]).toEqual([false, "true"]);
    const rows = [...table.querySelectorAll("tbody tr")].map((row) => row.textContent ?? "");
    const cells = rows.map((row) => row.replace(/\s/g, " ").replace(/^[\d:]+/, "")); // sem a hora
    expect(cells).toEqual(["m100 ms40", "m——", "m102 ms≈ 42"]); // "≈" só com número
    await userEvent.click(toggle);
    expect(table.hidden).toBe(true);
  });

  it("quando o pedaço não carrega (rede, sem canvas 2D), avisa e abre a tabela no lugar", async () => {
    render(<PerfCharts samples={samples(2)} load={() => Promise.reject(new Error("rede"))} />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/dados estão na tabela/);
    expect(screen.getByRole("table").hidden).toBe(false);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull(); // nada de canvas vazio no lugar
  });

  it("desmontar destrói os gráficos", async () => {
    const { unmount } = render(<PerfCharts samples={samples(2)} />);
    await mounted();
    const canvases = [...document.querySelectorAll("canvas")];
    unmount();
    expect(canvases.map((canvas) => Chart.getChart(canvas))).toEqual([undefined, undefined]);
  });

  it("trocar o `load` no meio: o que o anterior entregar depois não vale", async () => {
    let fail = (_: Error) => {};
    const old = new Promise<never>((_, reject) => {
      fail = reject;
    });
    const { rerender } = render(<PerfCharts samples={samples(2)} load={() => old} />);
    rerender(<PerfCharts samples={samples(2)} load={loadChartKit} />);
    await mounted();
    await act(async () => fail(new Error("pedido velho")));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
