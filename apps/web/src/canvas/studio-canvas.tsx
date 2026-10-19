import {
  type AriaLabelConfig,
  addEdge,
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  MiniMap,
  MiniMapNode,
  type MiniMapNodeProps,
  Panel,
  ReactFlow,
  type ReactFlowState,
  useEdgesState,
  useKeyPress,
  useNodesState,
  useReactFlow,
  useStore,
  type XYPosition,
} from "@xyflow/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn.ts";
import { CanvasToolbar } from "./canvas-toolbar.tsx";
import { refusalMessage, refuseConnection } from "./connection-rules.ts";
import type { StudioEdge, StudioNode } from "./domain.ts";
import {
  edgeAriaLabel,
  FIT_VIEW,
  STATE_COLORS,
  type StudioFlowNode,
  toFlowEdge,
  toFlowNode,
} from "./flow.ts";
import { FlowEdge } from "./flow-edge.tsx";
import { NodeDrawer, sameDrawerProps } from "./node-drawer.tsx";
import { NodePalette } from "./node-palette.tsx";
import {
  createStatusStore,
  type ExecutionSource,
  StatusProvider,
  useLiveStatus,
} from "./node-status.ts";
import { nodeTypes } from "./node-types.ts";
import { duplicateSelection, selectAll } from "./selection.ts";
import { keyHint, SHORTCUTS, useShortcuts } from "./shortcuts.ts";
import { useFlowHistory } from "./use-flow-history.ts";

/** Zoom de 10% (um fluxo grande inteiro na tela) a 200% (ler o detalhe de um nó). */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 2;

// Constantes de módulo: o React Flow compara as props a cada render, e um objeto novo
// reprocessaria a configuração em todo frame de arraste.
/** Toda aresta, inclusive a criada ao conectar portas, é desenhada pela FlowEdge. */
const EDGE_TYPES = { flow: FlowEdge };
const DEFAULT_EDGE = { type: "flow" };
/** Apagar e mover a vista são do React Flow, com as teclas do mapa de atalhos. */
const DELETE_KEYS = [...SHORTCUTS.remove.keys];
const PAN_KEY = SHORTCUTS.pan.keys[0];
/**
 * Textos de acessibilidade em pt-BR (o padrão é inglês). Com o teclado ligado o React Flow lê
 * `keyboardDisabled` (o nome é invertido na biblioteca); `default` só vale com ele desligado.
 */
const ARIA_LABELS: Partial<AriaLabelConfig> = {
  "node.a11yDescription.keyboardDisabled": `Enter ou Espaço seleciona o nó; depois, as setas o movem. Delete remove, ${keyHint("duplicate")} duplica, ${keyHint("undo")} desfaz e Esc cancela a seleção.`,
  "node.a11yDescription.ariaLiveMessage": ({ x, y }) => `Nó movido para x ${x}, y ${y}.`,
  "edge.a11yDescription.default":
    "Enter ou Espaço seleciona a conexão. Delete remove e Esc cancela a seleção.",
  "controls.ariaLabel": "Controles de zoom",
  "controls.zoomIn.ariaLabel": "Aproximar",
  "controls.zoomOut.ariaLabel": "Afastar",
  "controls.fitView.ariaLabel": "Enquadrar o fluxo",
  "minimap.ariaLabel": "Mini-mapa do fluxo",
};

const miniMapColor = (node: StudioFlowNode) => STATE_COLORS[node.data.state];

// O canvas renderiza a cada quadro de arraste (os nós vivem aqui). Barra, paleta e painel não
// dependem da posição dos nós: com props estáveis, o memo os deixa parados durante o arraste.
const Toolbar = memo(CanvasToolbar);
const Palette = memo(NodePalette);
const Drawer = memo(NodeDrawer, sameDrawerProps);

/** Nó do mini-mapa com a cor da execução ao vivo; antes dela, a do contrato (`miniMapColor`). */
function MiniMapStatusNode(props: MiniMapNodeProps) {
  const live = useLiveStatus(props.id);
  return <MiniMapNode {...props} color={live ? STATE_COLORS[live.state] : props.color} />;
}

/**
 * Visão aérea e zoom. Mini-mapa: arrastar move a vista, a roda aproxima e um clique centraliza
 * ali mantendo o zoom (sem `zoom`, o setCenter do React Flow pularia para o máximo). Os
 * controles reenquadram como a abertura; o botão de travar do React Flow fica de fora.
 */
function CanvasNavigation() {
  const { setCenter, getZoom } = useReactFlow();
  return (
    <>
      <MiniMap
        pannable
        zoomable
        nodeColor={miniMapColor}
        nodeComponent={MiniMapStatusNode}
        onClick={(_, { x, y }) => void setCenter(x, y, { zoom: getZoom() })}
      />
      <Controls showInteractive={false} fitViewOptions={FIT_VIEW} />
    </>
  );
}

export type StudioCanvasProps = {
  /** Fluxo inicial; depois da montagem o estado é do canvas (mudar a prop não recarrega). */
  initialNodes?: StudioNode[];
  initialEdges?: StudioEdge[];
  /** Transições ao vivo (a `NodeStateMachine` do Luan); sem elas, vale o `state` de cada nó. */
  execution?: ExecutionSource;
  className?: string;
};

/** O porquê da recusa enquanto a ligação em arraste está sobre uma porta que não a aceita. */
function refusalNow({ connection, nodes, edges }: ReactFlowState): string {
  if (!connection.inProgress || connection.isValid !== false || !connection.toHandle) return "";
  const { fromHandle, toHandle } = connection;
  if (fromHandle.type === toHandle.type)
    return "Ligue uma saída (direita) a uma entrada (esquerda).";
  const [out, into] =
    fromHandle.type === "source" ? [fromHandle, toHandle] : [toHandle, fromHandle];
  const link = {
    source: out.nodeId,
    sourceHandle: out.id,
    target: into.nodeId,
    targetHandle: into.id,
  };
  const refusal = refuseConnection(link, { nodes, edges });
  return refusal ? refusalMessage(refusal) : "";
}

/**
 * Aviso do porquê de uma ligação recusada, enquanto o arraste está sobre a porta de destino. O
 * seletor do store devolve o próprio texto: o aviso renderiza quando o texto muda, não a cada
 * movimento do mouse. A região `status` fica sempre na árvore de acessibilidade (vazia, sem
 * tamanho): região que aparece já com o texto, em vez de mudar de texto, muitos leitores de tela
 * não anunciam.
 */
const ConnectionFeedback = memo(function ConnectionFeedback() {
  const message = useStore(refusalNow);
  return (
    <Panel position="top-center">
      <p
        role="status"
        className={cn(
          message && "rounded-md border border-danger bg-surface px-3 py-1.5 text-danger text-sm",
        )}
      >
        {message}
      </p>
    </Panel>
  );
});

/**
 * Canvas infinito do estúdio: pan sem limite (arrastar o fundo ou Espaço + arrastar), zoom
 * por roda, pinça ou controles entre MIN_ZOOM e MAX_ZOOM, e enquadramento inicial de todos os
 * nós. O duplo clique no fundo é da paleta de nós, não do zoom. O estado (posições, medidas,
 * seleção, arestas) fica no React Flow.
 */
export function StudioCanvas({
  initialNodes = [],
  initialEdges = [],
  execution,
  className,
}: StudioCanvasProps) {
  // Execução fora do estado do React Flow: uma transição renderiza só o nó (e as arestas e o
  // ponto do mini-mapa) dela, nunca o canvas inteiro.
  const [statuses] = useState(createStatusStore);
  useEffect(() => execution?.subscribeDetailed(statuses.apply), [execution, statuses]);
  const [startNodes] = useState(() => initialNodes.map(toFlowNode));
  const [startEdges] = useState(() => initialEdges.map(toFlowEdge));
  const [nodes, setNodes, onNodesChange] = useNodesState(startNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(startEdges);
  const history = useFlowHistory(nodes, edges, setNodes, setEdges);
  useShortcuts({
    undo: history.undo,
    redo: history.redo,
    selectAll: () => {
      setNodes(selectAll);
      setEdges(selectAll);
    },
    duplicate: () => {
      const next = duplicateSelection(nodes, edges);
      setNodes(next.nodes);
      setEdges(next.edges);
    },
  });
  // Espaço segurado: arrastar move a vista mesmo sobre um nó (nó arrastável é `nopan`).
  const panning = useKeyPress(PAN_KEY);
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
  // Recusa no arraste: o React Flow nem chama o onConnect, e a linha e a porta ficam vermelhas.
  // O grafo vem por ref: uma função nova a cada quadro de arraste seria mais uma atualização do
  // store do React Flow (e mais uma rodada de todos os seletores dele) por quadro.
  const graph = useRef({ nodes, edges });
  useEffect(() => {
    graph.current = { nodes, edges };
  });
  const isValidConnection = useCallback(
    (link: Edge | Connection) => refuseConnection(link, graph.current) === null,
    [],
  );
  const selected = nodes.filter((node) => node.selected);
  const editing = selected.length === 1 ? selected[0] : undefined; // um nó por vez
  const saveConfig = useCallback(
    (id: string, config: Record<string, unknown>) =>
      setNodes((all) => all.map((n) => (n.id === id ? { ...n, data: { ...n.data, config } } : n))),
    [setNodes],
  );
  const root = useRef<HTMLDivElement>(null);
  // Ponto da tela onde a paleta insere o nó; null = paleta fechada.
  const [insertAt, setInsertAt] = useState<XYPosition | null>(null);
  const openPaletteAtCenter = useCallback(() => {
    const box = root.current?.querySelector(".react-flow")?.getBoundingClientRect();
    setInsertAt(
      box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: 0, y: 0 },
    );
  }, []);
  const closePalette = useCallback(() => setInsertAt(null), []);
  const closeDrawer = useCallback(
    (id: string) => {
      setNodes((current) => current.map((node) => ({ ...node, selected: false })));
      // O foco volta ao nó no canvas: quem fechou pelo teclado continua de onde abriu.
      const elements = root.current?.querySelectorAll<HTMLElement>(".react-flow__node") ?? [];
      [...elements].find((element) => element.dataset.id === id)?.focus();
    },
    [setNodes],
  );

  return (
    <StatusProvider value={statuses}>
      <div ref={root} className={cn("flex size-full", className)}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={EDGE_TYPES}
          defaultEdgeOptions={DEFAULT_EDGE}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          fitView
          fitViewOptions={FIT_VIEW}
          deleteKeyCode={DELETE_KEYS}
          panActivationKeyCode={PAN_KEY}
          nodesDraggable={!panning}
          zoomOnDoubleClick={false}
          onDoubleClick={(event) => {
            const onPane = (event.target as Element).classList.contains("react-flow__pane");
            if (onPane) setInsertAt({ x: event.clientX, y: event.clientY });
          }}
          ariaLabelConfig={ARIA_LABELS}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} />
          <CanvasNavigation />
          <Toolbar onAddNode={openPaletteAtCenter} {...history} />
          <Palette at={insertAt} onClose={closePalette} />
          <ConnectionFeedback />
        </ReactFlow>
        <Drawer node={editing} onSave={saveConfig} onClose={closeDrawer} />
      </div>
    </StatusProvider>
  );
}
