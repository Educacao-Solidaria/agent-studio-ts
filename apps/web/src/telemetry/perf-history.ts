import { useSyncExternalStore } from "react";
import type { PerfSample } from "./perf-samples.ts";

/**
 * Quantas respostas o histórico guarda. Os gráficos de linha mostram as últimas `PERF_WINDOW`
 * (30) e o export leva todas as guardadas; as mais antigas saem da memória, por mais longa que
 * seja a sessão.
 */
export const PERF_HISTORY_LIMIT = 1000;

/** Hit × miss das respostas com dado de cache (`cached` do `metadata`); as sem ele não entram. */
export type CacheCounts = { hits: number; misses: number };

// Resposta sem o dado de cache devolve a MESMA conta: objeto igual, a pizza não refaz nada.
function tally(counts: CacheCounts, { cached }: PerfSample): CacheCounts {
  if (cached === true) return { ...counts, hits: counts.hits + 1 };
  if (cached === false) return { ...counts, misses: counts.misses + 1 };
  return counts;
}

/** A conta de uma lista de amostras, com a mesma regra do histórico. */
export const cacheCounts = (samples: readonly PerfSample[]) =>
  samples.reduce(tally, { hits: 0, misses: 0 });

export type PerfHistorySnapshot = {
  /** As guardadas, da mais antiga à mais nova. */
  samples: readonly PerfSample[];
  /** Da sessão inteira: a resposta que sai da memória continua na conta da pizza. */
  cache: CacheCounts;
};

/**
 * Histórico de desempenho das respostas com teto de memória: um buffer circular com as `limit`
 * mais recentes. Inserir é O(1) — cheio, a nova ocupa a vaga da mais antiga, sem copiar nem
 * deslocar nada — e a conta de hit × miss é somada na entrada, então a poda não muda a pizza.
 * `limit` 0 guarda só a conta; limite que não é inteiro ≥ 0 (NaN, infinito) é erro.
 */
export function createPerfHistory(limit = PERF_HISTORY_LIMIT) {
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError(`limite inválido: ${limit}`);
  const ring: PerfSample[] = [];
  let oldest = 0; // com o buffer cheio, a vaga da mais antiga — a próxima entra nela
  let cache: CacheCounts = { hits: 0, misses: 0 };
  let current: PerfHistorySnapshot | undefined;
  const listeners = new Set<() => void>();
  return {
    push(sample: PerfSample) {
      if (ring.length < limit) ring.push(sample);
      else if (limit > 0) {
        ring[oldest] = sample;
        oldest = (oldest + 1) % limit;
      }
      cache = tally(cache, sample);
      current = undefined;
      for (const listener of listeners) listener();
    },
    // ponytail: a foto é montada quando alguém lê, uma vez por mudança (com o React assinando, a
    // cada resposta: ele relê no aviso), e copia até `limit` referências (~1 µs com 1000). Com
    // limite de outra ordem, entregue aos gráficos só a janela e copie o resto no export.
    /** A foto atual: a MESMA até a próxima inserção (o `useSyncExternalStore` exige). */
    snapshot(): PerfHistorySnapshot {
      current ??= { samples: ring.slice(oldest).concat(ring.slice(0, oldest)), cache };
      return current;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type PerfHistory = ReturnType<typeof createPerfHistory>;

/**
 * A foto do histórico; o componente renderiza de novo só quando entra resposta. O host cria o
 * histórico uma vez (`useState(() => createPerfHistory())`) e chama `push` no fim de cada uma.
 */
export function usePerfHistory(history: PerfHistory): PerfHistorySnapshot {
  // A mesma foto no servidor (renderToStaticMarkup): o histórico só existe no navegador.
  return useSyncExternalStore(history.subscribe, history.snapshot, history.snapshot);
}
