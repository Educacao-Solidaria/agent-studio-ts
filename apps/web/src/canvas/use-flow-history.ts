import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import type { StudioFlowEdge, StudioFlowNode } from "./flow.ts";
import { createHistory, record, redo, undo } from "./history.ts";

/** O grafo como o desfazer guarda: os nós e as arestas do React Flow, por referência. */
type FlowSnapshot = { nodes: StudioFlowNode[]; edges: StudioFlowEdge[] };

// O que conta como mudança: posição, config e ligações. Seleção, medida, arraste e estado de
// execução ficam de fora: mudam o tempo todo sem ser ação de quem edita.
const sameNode = (a: StudioFlowNode, b: StudioFlowNode) =>
  a.id === b.id &&
  a.type === b.type &&
  a.data.config === b.data.config &&
  a.position.x === b.position.x &&
  a.position.y === b.position.y;
const sameEdge = (a: StudioFlowEdge, b: StudioFlowEdge) =>
  a.id === b.id &&
  a.source === b.source &&
  a.sourceHandle === b.sourceHandle &&
  a.target === b.target &&
  a.targetHandle === b.targetHandle;
const sameList = <T>(a: T[], b: T[], same: (x: T, y: T) => boolean) =>
  a.length === b.length && a.every((item, i) => same(item, b[i] as T));

const sameGraph = (a: FlowSnapshot, b: FlowSnapshot) =>
  sameList(a.nodes, b.nodes, sameNode) && sameList(a.edges, b.edges, sameEdge);

/** O nó volta como no snapshot, mas com a seleção, a medida e a execução de agora. */
function restoreNodes(snapshot: StudioFlowNode[], live: StudioFlowNode[]) {
  const now = new Map(live.map((node) => [node.id, node]));
  return snapshot.map((node) => {
    const current = now.get(node.id);
    if (!current) return { ...node, selected: false };
    const { selected, measured, data } = current;
    return { ...node, selected, measured, data: { ...data, config: node.data.config } };
  });
}

function restoreEdges(snapshot: StudioFlowEdge[], live: StudioFlowEdge[]) {
  const now = new Map(live.map((edge) => [edge.id, edge]));
  return snapshot.map((edge) => {
    const current = now.get(edge.id);
    return { ...edge, selected: current?.selected ?? false, data: current?.data ?? edge.data };
  });
}

/**
 * Desfazer e refazer do canvas. Toda mudança que chega ao estado vira uma entrada, venha de
 * onde vier (ligar portas, apagar, salvar o painel); o que muda no mesmo evento — o nó e as
 * arestas dele, ao apagar — chega no mesmo render e vira uma entrada só. O arraste entra uma
 * vez, quando termina, e durante ele desfazer não faz nada.
 */
export function useFlowHistory(
  nodes: StudioFlowNode[],
  edges: StudioFlowEdge[],
  setNodes: Dispatch<SetStateAction<StudioFlowNode[]>>,
  setEdges: Dispatch<SetStateAction<StudioFlowEdge[]>>,
) {
  const [history, setHistory] = useState(() => createHistory<FlowSnapshot>({ nodes, edges }));
  // Cópia síncrona para os comandos: dois Ctrl+Z antes do próximo render andam dois passos.
  const latest = useRef(history);
  const dragging = nodes.some((node) => node.dragging);

  useEffect(() => {
    if (dragging) return;
    const current = { nodes, edges };
    if (sameGraph(latest.current.present, current)) {
      // Sem entrada nova, mas o presente vira o objeto de agora: leva a medida (`measured`)
      // que o React Flow acabou de calcular, e o nó que o desfazer restaurar volta visível.
      latest.current = { ...latest.current, present: current };
      return;
    }
    latest.current = record(latest.current, current);
    setHistory(latest.current);
  }, [nodes, edges, dragging]);

  const step = (move: typeof undo) => {
    const next = move(latest.current);
    if (dragging || next === latest.current) return;
    latest.current = next;
    setHistory(next);
    setNodes((live) => restoreNodes(next.present.nodes, live));
    setEdges((live) => restoreEdges(next.present.edges, live));
  };

  return {
    undo: () => step(undo),
    redo: () => step(redo),
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
