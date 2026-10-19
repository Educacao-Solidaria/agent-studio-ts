import {
  type AriaLabelConfig,
  addEdge,
  Background,
  BackgroundVariant,
  type Connection,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useCallback, useState } from "react";
import { cn } from "../lib/cn.ts";
import type { StudioEdge, StudioNode } from "./domain.ts";
import { edgeAriaLabel, toFlowEdge, toFlowNode } from "./flow.ts";
import { FlowEdge } from "./flow-edge.tsx";
import { nodeTypes } from "./node-types.ts";

/** Zoom de 10% (um fluxo grande inteiro na tela) a 200% (ler o detalhe de um nó). */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 2;

// Constantes de módulo: o React Flow compara as props a cada render, e um objeto novo
// reprocessaria a configuração em todo frame de arraste.
/** Enquadra todos os nós na abertura, sem ampliar um fluxo pequeno além de 100%. */
const FIT_VIEW = { padding: 0.2, maxZoom: 1 };
/** Toda aresta, inclusive a criada ao conectar portas, é desenhada pela FlowEdge. */
const EDGE_TYPES = { flow: FlowEdge };
const DEFAULT_EDGE = { type: "flow" };
/** O padrão do React Flow é só Backspace; a descrição acessível promete Delete também. */
const DELETE_KEYS = ["Backspace", "Delete"];
/**
 * Textos de acessibilidade em pt-BR (o padrão é inglês). Com o teclado ligado o React Flow lê
 * `keyboardDisabled` (o nome é invertido na biblioteca); `default` só vale com ele desligado.
 */
const ARIA_LABELS: Partial<AriaLabelConfig> = {
  "node.a11yDescription.keyboardDisabled":
    "Enter ou Espaço seleciona o nó; depois, as setas o movem. Delete remove e Esc cancela a seleção.",
  "node.a11yDescription.ariaLiveMessage": ({ x, y }) => `Nó movido para x ${x}, y ${y}.`,
  "edge.a11yDescription.default":
    "Enter ou Espaço seleciona a conexão. Delete remove e Esc cancela a seleção.",
  "handle.ariaLabel": "Porta de conexão",
};

export type StudioCanvasProps = {
  /** Fluxo inicial; depois da montagem o estado é do canvas (mudar a prop não recarrega). */
  initialNodes?: StudioNode[];
  initialEdges?: StudioEdge[];
  className?: string;
};

/**
 * Canvas infinito do estúdio: pan sem limite (arrastar o fundo ou Espaço + arrastar), zoom
 * por roda, pinça ou duplo clique entre MIN_ZOOM e MAX_ZOOM, e enquadramento inicial de
 * todos os nós. O estado (posições, medidas, seleção, arestas) fica no React Flow.
 */
export function StudioCanvas({
  initialNodes = [],
  initialEdges = [],
  className,
}: StudioCanvasProps) {
  const [startNodes] = useState(() => initialNodes.map(toFlowNode));
  const [startEdges] = useState(() => initialEdges.map(toFlowEdge));
  const [nodes, , onNodesChange] = useNodesState(startNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(startEdges);
  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((current) =>
        addEdge(
          { ...connection, ariaLabel: edgeAriaLabel(connection.source, connection.target) },
          current,
        ),
      ),
    [setEdges],
  );

  return (
    <div className={cn("size-full", className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={EDGE_TYPES}
        defaultEdgeOptions={DEFAULT_EDGE}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        fitView
        fitViewOptions={FIT_VIEW}
        deleteKeyCode={DELETE_KEYS}
        ariaLabelConfig={ARIA_LABELS}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} />
      </ReactFlow>
    </div>
  );
}
