import { act, render, screen, waitFor } from "@testing-library/react";
import { Chart } from "chart.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setMediaQuery } from "../test/browser-mocks.ts";
import { fakeCanvas2d } from "../test/canvas.ts";
import { CachePie, cacheSlices } from "./cache-pie.tsx";
import { cacheCounts } from "./perf-history.ts";
import { loadChartKit } from "./use-chart.tsx";

// A conta de respostas com este `cached` (a mesma regra do histórico).
const answers = (...cached: (boolean | undefined)[]) =>
  cacheCounts(cached.map((value, at) => ({ at, model: "m", estimated: false, cached: value })));
const chart = () => Chart.getChart(document.querySelector("canvas") as HTMLCanvasElement);
const legend = () =>
  [...document.querySelectorAll("li")].map((li) => li.textContent?.replace(/\s/g, " "));

beforeEach(fakeCanvas2d);

describe("cacheSlices", () => {
  it("conta só as respostas com o dado; as porcentagens somam 100", () => {
    const [hit, miss] = cacheSlices(answers(true, false, undefined, true)) ?? [];
    expect([hit?.count, hit?.percent, miss?.count, miss?.percent]).toEqual([2, 67, 1, 33]);
    // 1 de 8 = 12,5%: arredondar as duas daria 13% + 88% = 101%.
    const eighth = cacheSlices(answers(true, ...Array<boolean>(7).fill(false)));
    expect(eighth?.map((slice) => slice.percent)).toEqual([13, 87]);
    expect(cacheSlices(answers(true, true))?.map((slice) => slice.percent)).toEqual([100, 0]);
  });

  it("nenhuma resposta com o dado: vazio, sem dividir por zero", () => {
    expect(cacheSlices(answers())).toBeUndefined();
    expect(cacheSlices(answers(undefined, undefined))).toBeUndefined();
  });
});

describe("CachePie", () => {
  it("pizza com hit e miss na cor do tema, legenda com nome, porcentagem e contagem", async () => {
    document.documentElement.style.setProperty("--success", "oklch(0.6 0.15 150)");
    const { rerender } = render(<CachePie counts={answers(true, false, true, undefined)} />);
    expect(legend()).toEqual(["Hit (cache): 67% · 2 respostas", "Miss (modelo): 33% · 1 resposta"]);
    await waitFor(() => expect(chart()).toBeDefined());
    const pie = chart();
    const fill = ["oklch(0.6 0.15 150)", ""]; // o jsdom não carrega o CSS: só o token posto à mão
    expect(pie?.data.datasets[0]).toMatchObject({ data: [2, 1], backgroundColor: fill });
    expect(pie?.data.datasets[0]).toMatchObject({ hoverBackgroundColor: fill });
    screen.getByRole("img", { name: "67% das respostas vieram do cache (2 de 3)" }); // ou lança
    rerender(<CachePie counts={answers(true, false, true, undefined, true)} />);
    expect(chart()).toBe(pie); // atualiza, não remonta
    expect(pie?.data.datasets[0]?.data).toEqual([3, 1]);
    document.documentElement.style.removeProperty("--success");
  });

  it("reduced-motion desliga a animação", async () => {
    render(<CachePie counts={answers(true, false)} />);
    await waitFor(() => expect(chart()).toBeDefined());
    expect(chart()?.options.animation).toMatchObject({ duration: 300 });
    act(() => setMediaQuery("(prefers-reduced-motion: reduce)", true));
    expect(chart()?.options.animation).toBe(false);
  });

  it("a conta da sessão passa de mil: milhar separado na legenda e no rótulo", () => {
    render(<CachePie counts={{ hits: 1500, misses: 500 }} load={() => new Promise(() => {})} />);
    expect(legend()).toEqual([
      "Hit (cache): 75% · 1.500 respostas",
      "Miss (modelo): 25% · 500 respostas",
    ]);
    screen.getByRole("img", { name: "75% das respostas vieram do cache (1.500 de 2.000)" });
  });

  it("sem dado de cache: aviso no lugar da pizza", () => {
    const load = vi.fn(loadChartKit);
    render(<CachePie counts={answers(undefined)} load={load} />);
    expect(screen.getByText("Sem respostas com dado de cache ainda.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(load).not.toHaveBeenCalled(); // sem dado, o Chart.js nem baixa
  });

  it("se o gráfico não carrega, avisa e a legenda continua com os números", async () => {
    render(
      <CachePie counts={answers(true, false)} load={() => Promise.reject(new Error("rede"))} />,
    );
    expect((await screen.findByRole("alert")).textContent).toMatch(/números estão na legenda/);
    expect(screen.queryByRole("img")).toBeNull();
    expect(legend()).toEqual(["Hit (cache): 50% · 1 resposta", "Miss (modelo): 50% · 1 resposta"]);
  });
});
