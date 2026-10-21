import { describe, expect, it } from "vitest";
import type { TtftState } from "../chat/ttft.tsx";
import { perfSample } from "./perf-samples.ts";

const done = (ms: number): TtftState => ({ status: "done", ms });
const of = (ttft: TtftState, durationMs: number, completionTokens = 50, estimated = false) =>
  perfSample({ at: 1000, model: "m", ttft, usage: { completionTokens, estimated }, durationMs });

describe("perfSample", () => {
  it("mede a taxa do primeiro token ao fim da resposta", () => {
    // 50 tokens entre o 1º token (200 ms) e o fim (1200 ms): 50 por segundo, não 50/1,2.
    const expected = { at: 1000, model: "m", ttftMs: 200, tps: 50, estimated: false };
    expect(of(done(200), 1200)).toEqual(expected);
    expect(of(done(0), 500, 0, true)).toMatchObject({ ttftMs: 0, tps: 0, estimated: true });
  });

  it("sem primeiro token não há TTFT nem taxa", () => {
    const waiting: TtftState = { status: "waiting", since: 0 };
    for (const ttft of [{ status: "stopped" }, { status: "idle" }, waiting] as TtftState[]) {
      expect(of(ttft, 900)).toMatchObject({ ttftMs: undefined, tps: undefined });
    }
  });

  it("duração degenerada não vira Infinity nem NaN", () => {
    // Um pedaço só (fim = 1º token), relógio fora de ordem e duração inválida.
    for (const durationMs of [200, 150, Number.NaN]) {
      expect(of(done(200), durationMs)).toMatchObject({ ttftMs: 200, tps: undefined });
    }
  });
});
