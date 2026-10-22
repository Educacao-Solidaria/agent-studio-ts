import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { act, render, screen, waitFor } from "@testing-library/react";
import { Chart } from "chart.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeCanvas2d } from "../test/canvas.ts";
import { CachePie } from "./cache-pie.tsx";
import { PERF_WINDOW, PerfCharts } from "./perf-charts.tsx";
import {
  createPerfHistory,
  PERF_HISTORY_LIMIT,
  type PerfHistory,
  usePerfHistory,
} from "./perf-history.ts";
import type { PerfSample } from "./perf-samples.ts";

// Um terço hit, um terço miss, um terço sem `metadata`; a cada 7 uma parou antes do 1º token.
const sample = (i: number, model = "m"): PerfSample => ({
  ...{ at: i, model, ttftMs: i % 7 ? 100 + i : undefined, tps: 40 + (i % 9) },
  ...{ estimated: false, cached: [true, false, undefined][i % 3] },
});
const ats = (history: PerfHistory) => history.snapshot().samples.map((s) => s.at);
const pushAll = (history: PerfHistory, from: number, to: number) => {
  for (let i = from; i < to; i++) history.push(sample(i));
};

describe("createPerfHistory", () => {
  it("guarda as últimas `limit` em ordem; cheio, a nova ocupa a vaga da mais antiga", () => {
    for (const limit of [1, 3]) {
      const history = createPerfHistory(limit);
      expect(ats(history)).toEqual([]);
      pushAll(history, 0, limit);
      expect(ats(history)).toEqual([...Array(limit).keys()]);
      pushAll(history, limit, 8); // dá a volta no buffer mais de uma vez
      expect(ats(history)).toEqual([...Array(limit).keys()].map((i) => 8 - limit + i));
    }
  });

  it("a foto é a mesma até a próxima resposta; a conta da sessão sobrevive à poda", () => {
    const history = createPerfHistory(2);
    const empty = history.snapshot();
    expect(history.snapshot()).toBe(empty);
    history.push(sample(0)); // hit
    const first = history.snapshot();
    expect([first === empty, first.cache]).toEqual([false, { hits: 1, misses: 0 }]);
    history.push(sample(2)); // sem dado de cache: a mesma conta, a pizza não refaz nada
    expect(history.snapshot().cache).toBe(first.cache);
    for (const i of [4, 7]) history.push(sample(i)); // dois miss: a 0, o único hit, sai da memória
    expect(ats(history)).toEqual([4, 7]);
    expect(history.snapshot().cache).toEqual({ hits: 1, misses: 2 });
  });

  it("limite 0 guarda só a conta; limite fora de inteiro ≥ 0 é erro, nunca sem teto", () => {
    const history = createPerfHistory(0);
    pushAll(history, 0, 3);
    expect(history.snapshot()).toEqual({ samples: [], cache: { hits: 1, misses: 1 } });
    for (const limit of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createPerfHistory(limit)).toThrow(RangeError);
    }
    expect(PERF_HISTORY_LIMIT).toBeGreaterThanOrEqual(PERF_WINDOW); // a poda nunca corta a janela
  });

  it("avisa quem assina a cada resposta, até cancelar a assinatura", () => {
    const history = createPerfHistory();
    const listener = vi.fn();
    const unsubscribe = history.subscribe(listener);
    pushAll(history, 0, 2);
    unsubscribe();
    pushAll(history, 2, 3);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("teto de memória: 200 mil respostas ocupam o mesmo que as primeiras mil", () => {
    // gc() sem a flag na linha de comando: liga a flag e pega a função num contexto novo do V8.
    setFlagsFromString("--expose-gc");
    const gc = runInNewContext("gc") as () => void;
    const heap = () => {
      gc();
      return process.memoryUsage().heapUsed;
    };
    const history = createPerfHistory();
    // Modelo com texto próprio por resposta: num array sem poda, as 199 mil a mais ocupam ~30 MB
    // (medido aqui); com a poda, a diferença fica em dezenas de kB.
    const fill = (from: number, to: number) => {
      for (let i = from; i < to; i++) {
        history.push(sample(i, `modelo-${i}`));
        if (i % 1000 === 0) history.snapshot(); // o React lendo a foto no caminho
      }
    };
    fill(0, PERF_HISTORY_LIMIT);
    const base = heap();
    fill(PERF_HISTORY_LIMIT, 200_000);
    const grown = heap() - base;
    // O histórico é usado DEPOIS da medida: sem isso o V8 o soltaria antes do gc() e o teste
    // passaria mesmo sem poda.
    expect(ats(history)).toEqual([...Array(PERF_HISTORY_LIMIT).keys()].map((i) => 199_000 + i));
    expect(grown).toBeLessThan(1_000_000);
  });
});

// O Chart.js de verdade (contexto 2D falso): cada canvas do painel e o gráfico dele.
const charts = () => [...document.querySelectorAll("canvas")].map((c) => Chart.getChart(c));
const series = (chart?: Chart) => chart?.data.datasets[0]?.data;

function Panel({ history }: { history: PerfHistory }) {
  const { samples, cache } = usePerfHistory(history);
  return (
    <>
      <PerfCharts samples={samples} />
      <CachePie counts={cache} />
    </>
  );
}

describe("usePerfHistory com os gráficos", () => {
  beforeEach(fakeCanvas2d);

  it("depois da poda, linhas e pizza mostram o mesmo que a sessão inteira, ao vivo", async () => {
    const all = Array.from({ length: 2_500 }, (_, i) => sample(i));
    const history = createPerfHistory(50); // 2.450 já saíram da memória
    for (const item of all) history.push(item);
    render(<Panel history={history} />);
    await waitFor(() => expect(charts().filter(Boolean)).toHaveLength(3));
    const lines = () => {
      const recent = all.slice(-PERF_WINDOW);
      const [ttft, tps] = charts();
      expect(series(ttft)).toEqual(recent.map((s) => s.ttftMs ?? null)); // buraco, não zero
      expect(series(tps)).toEqual(recent.map((s) => s.tps ?? null));
    };
    lines();
    expect(series(charts()[2])).toEqual([834, 833]); // de 2.500: 834 hits, 833 misses
    screen.getByRole("img", { name: "50% das respostas vieram do cache (834 de 1.667)" });
    const before = charts();
    const arrive = (item: PerfSample) => {
      all.push(item);
      act(() => history.push(item));
      lines();
    };
    arrive(sample(2_500)); // miss
    expect(charts().map((chart, i) => chart === before[i])).toEqual([true, true, true]);
    expect(series(charts()[2])).toEqual([834, 834]);
    const pieUpdate = vi.spyOn(charts()[2] as Chart, "update");
    arrive(sample(2_501)); // sem dado de cache: as linhas andam e a pizza nem redesenha
    expect(pieUpdate).not.toHaveBeenCalled();
  });
});
