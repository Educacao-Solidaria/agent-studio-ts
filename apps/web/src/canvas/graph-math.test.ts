import { describe, expect, it } from "vitest";
import { ExecutionGraph } from "../../../../src/graph/executionGraph.ts";
import { type Graph, graphEdge, graphNode, randomDag, seeded } from "../test/graph-gen.ts";
import { refuseConnection } from "./connection-rules.ts";

/**
 * Kahn de referência, o mais simples possível (pilha em vez de fila: a ordem sai diferente da do
 * ExecutionGraph, e por isso o teste compara validade, não igualdade). Devolve a ordem, ou null se
 * sobrar nó com entrada (ciclo). Aresta para nó inexistente não conta, como no do Luan.
 */
function kahn({ nodes, edges }: Graph): string[] | null {
  const indegree = new Map(nodes.map(({ id }) => [id, 0]));
  const next = new Map(nodes.map(({ id }) => [id, [] as string[]]));
  for (const { source, target } of edges) {
    if (!indegree.has(source) || !indegree.has(target)) continue;
    next.get(source)?.push(target);
    indegree.set(target, (indegree.get(target) ?? 0) + 1);
  }
  const ready = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
  const order: string[] = [];
  for (let id = ready.pop(); id !== undefined; id = ready.pop()) {
    order.push(id);
    for (const target of next.get(id) ?? []) {
      const degree = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, degree);
      if (degree === 0) ready.push(target);
    }
  }
  return order.length === indegree.size ? order : null;
}

/** Cada nó uma vez só, e toda aresta (entre nós que existem) da esquerda para a direita. */
function isTopological(order: string[], { nodes, edges }: Graph) {
  const at = new Map(order.map((id, i) => [id, i]));
  const ids = new Set(nodes.map(({ id }) => id));
  if (order.length !== ids.size || at.size !== ids.size) return false;
  return edges.every(({ source, target }) => {
    if (!ids.has(source) || !ids.has(target)) return true;
    return (at.get(source) ?? Infinity) < (at.get(target) ?? -Infinity);
  });
}

/** Os grafos aleatórios das sementes 1..count: até 60 nós e densidade até 0,3. */
function* dags(count: number) {
  for (let seed = 1; seed <= count; seed++) {
    const random = seeded(seed);
    yield { seed, random, ...randomDag(random, 1 + Math.floor(random() * 60), random() * 0.3) };
  }
}

const roots = ({ nodes, edges }: Graph) =>
  nodes.filter(({ id }) => !edges.some((edge) => edge.target === id)).map(({ id }) => id);

describe("gerador de grafos com semente", () => {
  it("a mesma semente dá o mesmo grafo; outra semente, outro; e a ordem escondida vale", () => {
    const [a, b, c] = [1, 1, 2].map((seed) => randomDag(seeded(seed), 40, 0.2));
    expect(a).toEqual(b);
    expect(c?.edges).not.toEqual(a?.edges);
    if (a) expect(isTopological(a.order, a)).toBe(true);
    // E o verificador consegue recusar: a ordem ao contrário quebra as arestas.
    if (a) expect(isTopological([...a.order].reverse(), a)).toBe(false);
  });
});

describe("ExecutionGraph do Luan × Kahn de referência", () => {
  it("200 DAGs aleatórios: sem ciclo, ordem topológica válida com todos os nós, raízes certas", () => {
    for (const { seed, ...graph } of dags(200)) {
      const exec = new ExecutionGraph(graph.nodes, graph.edges);
      expect(kahn(graph), `semente ${seed}`).not.toBeNull();
      expect(exec.detectCycle(), `semente ${seed}`).toBe(false);
      expect(isTopological(exec.getTopologicalOrder(), graph), `semente ${seed}`).toBe(true);
      const found = exec.getRootNodes().map(({ id }) => id);
      expect(found.sort(), `semente ${seed}`).toEqual(roots(graph).sort());
    }
  });

  it("uma aresta para trás na ordem fecha ciclo: os dois acusam, a ordem lança, validate explica", () => {
    for (const { seed, random, nodes, edges, order } of dags(200)) {
      if (order.length < 2) continue;
      const to = Math.floor(random() * (order.length - 1));
      const from = to + 1 + Math.floor(random() * (order.length - 1 - to));
      // Volta de um nó para outro que vem antes dele, depois de garantir o caminho de ida.
      const [early, late] = [order[to] as string, order[from] as string];
      const cyclic = { nodes, edges: [...edges, graphEdge(early, late), graphEdge(late, early)] };
      const exec = new ExecutionGraph(cyclic.nodes, cyclic.edges);
      expect(kahn(cyclic), `semente ${seed}`).toBeNull();
      expect(exec.detectCycle(), `semente ${seed}`).toBe(true);
      expect(() => exec.getTopologicalOrder()).toThrow(/contem ciclos/);
      expect(exec.validate().errors).toContain(
        "O grafo de execucao contem ciclos direcionados (deve ser um DAG)",
      );
    }
  });

  it("bordas: vazio, um nó, laço no próprio nó, aresta repetida, aresta solta e id repetido", () => {
    const of = (nodes: string[], edges: Array<[string, string]>) =>
      new ExecutionGraph(
        nodes.map(graphNode),
        edges.map(([s, t]) => graphEdge(s, t)),
      );
    expect(of([], []).getTopologicalOrder()).toEqual([]);
    expect(of(["a"], []).getTopologicalOrder()).toEqual(["a"]);
    expect(of(["a"], [["a", "a"]]).detectCycle()).toBe(true);
    // Aresta repetida conta duas vezes na entrada e sai duas vezes: segue um DAG.
    expect(
      of(
        ["a", "b"],
        [
          ["a", "b"],
          ["a", "b"],
        ],
      ).getTopologicalOrder(),
    ).toEqual(["a", "b"]);
    const loose = of(["a"], [["a", "fantasma"]]);
    expect([loose.detectCycle(), loose.validate().valid]).toEqual([false, false]);
    expect(of(["a", "a", "b"], [["a", "b"]]).getTopologicalOrder()).toEqual(["a", "b"]);
  });
});

describe("validador do canvas (PR 27) × referência", () => {
  it("em DAG aleatório, recusa como ciclo exatamente as ligações que fechariam um ciclo", () => {
    for (const { seed, random, ...graph } of dags(100)) {
      for (let attempt = 0; attempt < 30 && graph.nodes.length > 1; attempt++) {
        const pick = () => `n${Math.floor(random() * graph.nodes.length)}`;
        const [source, target] = [pick(), pick()];
        if (source === target) continue;
        const link = graphEdge(source, target);
        const repeated = graph.edges.some((edge) => edge.id === link.id);
        const closes = kahn({ ...graph, edges: [...graph.edges, link] }) === null;
        const expected = repeated ? "duplicate" : closes ? "cycle" : null;
        const reason = refuseConnection(link, graph)?.reason ?? null;
        expect(reason, `semente ${seed}: ${source} → ${target}`).toBe(expected);
      }
    }
  });

  it("grafo montado só com ligações que o canvas aceita é sempre um DAG para o ExecutionGraph", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const random = seeded(seed);
      const nodes = Array.from({ length: 2 + Math.floor(random() * 30) }, (_, i) =>
        graphNode(`n${i}`),
      );
      const graph: Graph = { nodes, edges: [] };
      for (let attempt = 0; attempt < 120; attempt++) {
        const [s, t] = [0, 0].map(() => `n${Math.floor(random() * nodes.length)}`);
        const link = graphEdge(s as string, t as string);
        if (refuseConnection(link, graph) === null) graph.edges.push(link);
      }
      const exec = new ExecutionGraph(graph.nodes, graph.edges);
      expect(exec.validate(), `semente ${seed}`).toEqual({ valid: true, errors: [] });
      expect(isTopological(exec.getTopologicalOrder(), graph), `semente ${seed}`).toBe(true);
    }
  });
});

describe("grafos grandes", () => {
  const ids = Array.from({ length: 10_000 }, (_, i) => `n${i}`);

  it("cadeia de 10.000 nós: a ordem é a cadeia, e fechá-la é ciclo nos dois, sem estourar a pilha", () => {
    const chain: Graph = {
      nodes: ids.map(graphNode),
      edges: ids.slice(1).map((id, i) => graphEdge(`n${i}`, id)),
    };
    const exec = new ExecutionGraph(chain.nodes, chain.edges);
    expect(exec.getTopologicalOrder()).toEqual(ids);
    expect(exec.getRootNodes().map(({ id }) => id)).toEqual(["n0"]);
    const back = graphEdge("n9999", "n0");
    expect(refuseConnection(back, chain)?.reason).toBe("cycle");
    expect(new ExecutionGraph(chain.nodes, [...chain.edges, back]).detectCycle()).toBe(true);
    expect(kahn({ ...chain, edges: [...chain.edges, back] })).toBeNull();
  });

  it("leque de 10.000 raízes num só destino: ordem válida e as 10.000 raízes", () => {
    const fan: Graph = {
      nodes: [...ids.map(graphNode), graphNode("destino")],
      edges: ids.map((id) => graphEdge(id, "destino")),
    };
    const exec = new ExecutionGraph(fan.nodes, fan.edges);
    const order = exec.getTopologicalOrder();
    expect([order.length, order.at(-1)]).toEqual([10_001, "destino"]);
    expect(exec.getRootNodes()).toHaveLength(10_000);
  });
});
