import type { Consumption } from "../chat/token-counter.tsx";
import type { TtftState } from "../chat/ttft.tsx";

/** Uma resposta terminada, do jeito que os gráficos a enxergam. */
export type PerfSample = {
  /** `Date.now()` no fim da resposta. */
  at: number;
  model: string;
  /** Vazio quando a resposta parou antes do primeiro token. */
  ttftMs?: number;
  /** Tokens de saída por segundo, do primeiro token ao fim; vazio quando não dá para medir. */
  tps?: number;
  /** Saída contada pelo texto (sem o uso real do gateway): a taxa é estimativa. */
  estimated: boolean;
};

/**
 * A amostra de uma resposta a partir do que o chat já mede: o TTFT do `useTtft`, os tokens de
 * saída do `consumption` (contador de tokens) e `durationMs`, do envio ao fim, no mesmo relógio
 * do TTFT (`performance.now()`). O painel de chat guarda as amostras e passa aos gráficos.
 */
export function perfSample(input: {
  at: number;
  model: string;
  ttft: TtftState;
  usage: Pick<Consumption, "completionTokens" | "estimated">;
  durationMs: number;
}): PerfSample {
  const ttftMs = input.ttft.status === "done" ? input.ttft.ms : undefined;
  // Parada antes do 1º token, um pedaço só ou duração inválida (NaN, menor que o TTFT): sem taxa.
  const generationMs = ttftMs === undefined ? Number.NaN : input.durationMs - ttftMs;
  const tps = generationMs > 0 ? (input.usage.completionTokens * 1000) / generationMs : undefined;
  return { at: input.at, model: input.model, ttftMs, tps, estimated: input.usage.estimated };
}
