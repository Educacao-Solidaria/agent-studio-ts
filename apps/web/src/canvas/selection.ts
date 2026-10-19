import { addEdge } from "@xyflow/react";
import { edgeAriaLabel, nextNodeId, type StudioFlowEdge, type StudioFlowNode } from "./flow.ts";

/** Quanto a cópia anda em x e y: perto do original, sem cobri-lo. */
export const DUPLICATE_OFFSET = 40;

/** Tudo selecionado; quem já estava selecionado fica com o mesmo objeto. */
export const selectAll = <T extends { selected?: boolean }>(items: T[]) =>
  items.map((item) => (item.selected ? item : { ...item, selected: true }));

const unselect = <T extends { selected?: boolean }>(items: T[]) =>
  items.map((item) => (item.selected ? { ...item, selected: false } : item));

/**
 * Cópia dos nós selecionados: id novo, deslocada, ociosa (a cópia ainda não executou) e
 * selecionada no lugar do original — outro Ctrl+D copia a cópia. Das arestas, vêm só as
 * internas à seleção (as duas pontas copiadas), religadas às cópias: a ligação com um nó de
 * fora não é copiada, porque a cópia é um ramo novo, não uma segunda entrada no mesmo nó.
 * Sem nó selecionado devolve os mesmos arrays (nada muda, nada entra no histórico).
 */
export function duplicateSelection(nodes: StudioFlowNode[], edges: StudioFlowEdge[]) {
  const taken = new Set(nodes.map((node) => node.id));
  const copyOf = new Map<string, string>();
  const copies = nodes.flatMap((node): StudioFlowNode[] => {
    if (!node.selected) return [];
    const id = nextNodeId(node.type, taken);
    taken.add(id);
    copyOf.set(node.id, id);
    const { x, y } = node.position;
    const position = { x: x + DUPLICATE_OFFSET, y: y + DUPLICATE_OFFSET };
    return [
      { ...node, id, position, dragging: false, data: { state: "idle", config: node.data.config } },
    ];
  });
  if (copies.length === 0) return { nodes, edges };

  let nextEdges = unselect(edges);
  for (const edge of edges) {
    const [source, target] = [copyOf.get(edge.source), copyOf.get(edge.target)];
    if (!source || !target) continue;
    // Sem id: o addEdge gera um no formato do React Flow, como numa ligação feita à mão.
    const { sourceHandle = null, targetHandle = null } = edge;
    const link = { source, target, sourceHandle, targetHandle, data: { active: false } };
    nextEdges = addEdge({ ...link, ariaLabel: edgeAriaLabel(source, target) }, nextEdges);
  }
  return { nodes: [...unselect(nodes), ...copies], edges: nextEdges };
}
