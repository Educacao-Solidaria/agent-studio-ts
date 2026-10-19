import * as dagre from "@dagrejs/dagre";
import { describe, expect, it } from "vitest";
import { FALLBACK_SIZE, layoutNodes } from "./auto-layout.ts";
import type { NodeType } from "./domain.ts";
import { type StudioFlowNode, toFlowEdge, toFlowNode } from "./flow.ts";

const SIZE = { width: 160, height: 56 };
const node = (id: string, type: NodeType = "custom", measured: typeof SIZE | undefined = SIZE) => ({
  ...toFlowNode({ id, type, position: { x: 0, y: 0 }, state: "idle", data: {} }),
  measured,
});
const edge = (source: string, target: string) =>
  toFlowEdge({ id: `${source}-${target}`, source, target });

/** Algum par se sobrepõe? Caixa = posição + medida (ou o tamanho padrão, sem medida). */
function overlapping(nodes: StudioFlowNode[]) {
  const all = nodes.map(({ position: { x, y }, measured }) => ({
    x,
    y,
    w: measured?.width ?? FALLBACK_SIZE.width,
    h: measured?.height ?? FALLBACK_SIZE.height,
  }));
  const apart = (a: (typeof all)[0], b: (typeof all)[0]) =>
    a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
  return all.some((a, i) => all.slice(i + 1).some((b) => !apart(a, b)));
}

describe("layoutNodes", () => {
  it("ordena da esquerda para a direita pelas ligações, sem sobrepor", () => {
    const nodes = ["prompt", "cache", "rag", "gateway"].map((id) => node(id, id as NodeType));
    const edges = [
      edge("prompt", "cache"),
      edge("prompt", "rag"),
      edge("cache", "gateway"),
      edge("rag", "gateway"),
    ];
    const x = Object.fromEntries(layoutNodes(dagre, nodes, edges).map((n) => [n.id, n.position.x]));

    expect(x.prompt).toBeLessThan(x.cache as number);
    expect(x.cache).toBe(x.rag); // mesma coluna
    expect(x.rag).toBeLessThan(x.gateway as number);
    expect(overlapping(nodes)).toBe(true); // controle: todos em (0, 0) se sobrepõem
    expect(overlapping(layoutNodes(dagre, nodes, edges))).toBe(false);
  });

  it("nó sem ligação, ciclo e aresta para nó inexistente não sobrepõem nem travam", () => {
    const nodes = [node("a"), node("b"), node("c"), node("solto"), node("outro-solto")];
    const edges = [edge("a", "b"), edge("b", "c"), edge("c", "a"), edge("a", "fantasma")];
    const laid = layoutNodes(dagre, nodes, edges);

    expect(laid.map((n) => n.id)).toEqual(nodes.map((n) => n.id));
    for (const { position } of laid) {
      expect(Number.isFinite(position.x) && Number.isFinite(position.y)).toBe(true);
    }
    expect(overlapping(laid)).toBe(false);
  });

  it("usa a medida do nó, e o tamanho padrão quando ainda não foi medido", () => {
    const wide = { width: 400, height: 56 };
    const nodes = [node("a", "custom", wide), node("b", "custom", undefined)];
    const laid = layoutNodes(dagre, nodes, [edge("a", "b")]);
    const [a, b] = laid.map((n) => n.position.x);
    expect((b ?? 0) - (a ?? 0)).toBeGreaterThanOrEqual(wide.width);
    expect(overlapping(laid)).toBe(false);
  });

  it("mantém o resto do nó e devolve vazio para fluxo vazio", () => {
    const original = { ...node("a"), selected: true };
    const [laid] = layoutNodes(dagre, [original], []);
    expect(laid).toEqual({ ...original, position: laid?.position });
    expect(layoutNodes(dagre, [], [])).toEqual([]);
  });
});
