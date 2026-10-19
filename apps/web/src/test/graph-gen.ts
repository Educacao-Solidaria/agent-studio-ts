import type { StudioEdge, StudioNode } from "../canvas/domain.ts";

/** Grafo no formato do contrato do Luan, que o ExecutionGraph e o validador do canvas leem. */
export type Graph = { nodes: StudioNode[]; edges: StudioEdge[] };

/**
 * PRNG mulberry32: a mesma semente dá a mesma sequência, então um teste que falha com uma semente
 * falha igual na próxima rodada (e a semente vai na mensagem do erro).
 */
export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Nó "custom" (entrada e saída `any`): o validador só olha a topologia, não os tipos de dado. */
export const graphNode = (id: string): StudioNode => ({
  id,
  type: "custom",
  position: { x: 0, y: 0 },
  state: "idle",
  data: {},
});

export const graphEdge = (source: string, target: string): StudioEdge => ({
  id: `${source}-${target}`,
  source,
  sourceHandle: "out",
  target,
  targetHandle: "in",
});

/**
 * DAG aleatório com `size` nós: uma ordem escondida (os ids embaralhados) e arestas só para a
 * frente nela, cada par com probabilidade `density`. A ordem volta junto, para o teste fechar
 * ciclos de propósito (uma aresta para trás nela).
 */
export function randomDag(random: () => number, size: number, density: number) {
  const ids = Array.from({ length: size }, (_, i) => `n${i}`);
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j] as string, order[i] as string];
  }
  const edges: StudioEdge[] = [];
  order.forEach((source, i) => {
    for (const target of order.slice(i + 1))
      if (random() < density) edges.push(graphEdge(source, target));
  });
  return { nodes: ids.map(graphNode), edges, order };
}
