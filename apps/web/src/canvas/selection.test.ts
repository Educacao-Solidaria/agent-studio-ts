import { describe, expect, it } from "vitest";
import type { StudioNode } from "./domain.ts";
import { nextNodeId, type StudioFlowNode, toFlowEdge, toFlowNode } from "./flow.ts";
import { DUPLICATE_OFFSET, duplicateSelection, selectAll } from "./selection.ts";

const node = (id: string, type: StudioNode["type"], selected = false): StudioFlowNode => ({
  ...toFlowNode({ id, type, position: { x: 10, y: 20 }, state: "error", error: "x", data: { id } }),
  selected,
});
const link = (source: string, sourceHandle: string, target: string) =>
  toFlowEdge({ id: `${source}-${target}`, source, sourceHandle, target, targetHandle: "query" });

describe("duplicateSelection", () => {
  it("copia os selecionados: id novo, deslocada, ociosa e selecionada no lugar do original", () => {
    const nodes = [
      node("prompt", "prompt", true),
      node("cache", "cache", true),
      node("rag", "rag"),
    ];
    const edges = [
      { ...link("prompt", "prompt", "cache"), selected: true },
      link("prompt", "prompt", "rag"),
    ];
    const next = duplicateSelection(nodes, edges);

    expect(next.nodes.map((n) => [n.id, n.selected ?? false])).toEqual([
      ["prompt", false],
      ["cache", false],
      ["rag", false],
      ["prompt-2", true],
      ["cache-2", true],
    ]);
    const copy = next.nodes[3];
    expect(copy?.position).toEqual({ x: 10 + DUPLICATE_OFFSET, y: 20 + DUPLICATE_OFFSET });
    expect(copy?.data).toEqual({ state: "idle", config: { id: "prompt" } });
    // Só a aresta interna (prompt → cache) vem, religada às cópias; a que vai ao rag, não.
    const ends = next.edges.map((e) => [e.source, e.sourceHandle, e.target, e.targetHandle]);
    expect(ends).toEqual([
      ["prompt", "prompt", "cache", "query"],
      ["prompt", "prompt", "rag", "query"],
      ["prompt-2", "prompt", "cache-2", "query"],
    ]);
    expect(next.edges.some((e) => e.selected)).toBe(false);
    expect(next.edges[2]?.ariaLabel).toBe("Conexão de prompt-2 para cache-2");
    expect(new Set(next.edges.map((e) => e.id)).size).toBe(3);
  });

  it("duplicar a cópia segue para o próximo id livre", () => {
    const once = duplicateSelection([node("rag", "rag", true)], []);
    expect(duplicateSelection(once.nodes, once.edges).nodes.map((n) => n.id)).toEqual([
      "rag",
      "rag-2",
      "rag-3",
    ]);
  });

  it("sem nó selecionado (ou sem nó) devolve os mesmos arrays", () => {
    const nodes = [node("rag", "rag")];
    const edges = [{ ...link("rag", "context", "rag"), selected: true }];
    const next = duplicateSelection(nodes, edges);
    expect(next.nodes).toBe(nodes);
    expect(next.edges).toBe(edges);
    const empty = duplicateSelection([], []);
    expect(empty).toEqual({ nodes: [], edges: [] });
  });
});

describe("selectAll e nextNodeId", () => {
  it("seleciona tudo e mantém o objeto de quem já estava selecionado", () => {
    const [a, b] = [node("a", "rag", true), node("b", "rag")];
    const all = selectAll([a, b]);
    expect(all[0]).toBe(a);
    expect(all.map((n) => n.selected)).toEqual([true, true]);
    expect(selectAll([])).toEqual([]);
  });

  it("usa o tipo como id quando livre, senão o primeiro sufixo livre", () => {
    expect(nextNodeId("rag", new Set())).toBe("rag");
    expect(nextNodeId("rag", new Set(["rag", "rag-2", "rag-4"]))).toBe("rag-3");
  });
});
