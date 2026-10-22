import type * as Dagre from "@dagrejs/dagre";
import { retryImport } from "../lib/retry-import.ts";
import type { StudioFlowEdge, StudioFlowNode } from "./flow.ts";

/** Tamanho de um nó ainda sem medida: o DefaultNode tem `min-w-44` (176 px). */
export const FALLBACK_SIZE = { width: 176, height: 64 };

/** Da esquerda para a direita, como as portas (entradas à esquerda, saídas à direita). */
const GRAPH = { rankdir: "LR", nodesep: 40, ranksep: 96 } as const;

/** O dagre vem sob demanda, num chunk à parte: só quem clica em Organizar o baixa. */
export const loadDagre = retryImport(() => import("@dagrejs/dagre"));

const sizeOf = ({ measured }: StudioFlowNode) => ({
  // `||`: medida 0 (ou NaN) é nó ainda não desenhado, não um nó de tamanho zero.
  width: measured?.width || FALLBACK_SIZE.width,
  height: measured?.height || FALLBACK_SIZE.height,
});

/**
 * O fluxo organizado pelo dagre, pelo tamanho medido de cada nó. Nó sem ligação entra numa
 * coluna como os outros, sem sobrepor; ciclo não trava (o dagre inverte uma aresta para
 * ranquear); aresta com ponta fora da lista é ignorada. O dagre devolve o centro do nó e o
 * React Flow posiciona pelo canto superior esquerdo.
 */
export function layoutNodes(
  dagre: typeof Dagre,
  nodes: StudioFlowNode[],
  edges: StudioFlowEdge[],
): StudioFlowNode[] {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph(GRAPH);
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) graph.setNode(node.id, sizeOf(node));
  for (const { id, source, target } of edges) {
    if (graph.hasNode(source) && graph.hasNode(target)) graph.setEdge(source, target, {}, id);
  }
  dagre.layout(graph);
  return nodes.map((node) => {
    const { x = 0, y = 0, width, height } = graph.node(node.id);
    return { ...node, position: { x: Math.round(x - width / 2), y: Math.round(y - height / 2) } };
  });
}
